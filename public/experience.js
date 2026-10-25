import { fitOptions, seasons, fitFor, rankProducts, sanitizeProfile, normalizeBrand, sameBrand, seasonFromSamples } from './style-engine.js';
import { analyzePortrait } from './color-analysis.js';
import { createPortraitCamera, cameraError } from './portrait-camera.js';

const stateKey = 'rewear-style-v2';
const cacheKey = 'rewear-catalog-v2';
const $ = s => document.querySelector(s);
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u.href : null; } catch { return null; } };
const supportedHosts = ['www.zara.com','www.decathlon.de','teeshoppen.de','de.gymshark.com','www2.hm.com','www.uniqlo.com'];
export function readCatalogCache() {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    return Array.isArray(value) ? value.filter(p => p && typeof p.id === 'string' && /^[a-z0-9-]+$/i.test(p.id) && typeof p.name === 'string' && typeof p.brand === 'string' && Number.isFinite(p.price) && p.price > 0 && safeURL(p.url) && supportedHosts.includes(new URL(p.url).hostname) && safeURL(p.image) && /^#[a-f\d]{6}$/i.test(p.hex) && Array.isArray(p.styles) && p.styles.every(s=>typeof s==='string') && ['Oberteile','Layering','Hosen','Schuhe','Accessoires'].includes(p.category)).slice(0,100) : [];
  } catch { return []; }
}
export function mergeCatalog(current, incoming) {
  const result = [...current];
  for (const item of incoming) {
    const index = result.findIndex(p => p.id === item.id || p.url === item.url);
    if (index < 0) result.push(item);
    else result[index] = { ...result[index], ...item, id: result[index].id };
  }
  return result;
}
export function createExperience(bridge) {
  const { esc, svg, money, notify } = bridge;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(stateKey) || '{}') || {}; } catch { /* Preserve v1 wardrobe data if v2 preferences are unreadable. */ }
  let profile = sanitizeProfile(saved.profile);
  let votes = Object.fromEntries(Object.entries(saved.votes || {}).filter(([id,v]) => /^[a-z0-9-]+$/i.test(id) && v && ['like','dislike'].includes(v.decision) && typeof v.brand === 'string').slice(-500));
  let history = Array.isArray(saved.history) ? saved.history.filter(h=>h&&typeof h.id==='string'&&['like','dislike'].includes(h.decision)).slice(-20) : [];
  let inspirations = Array.isArray(saved.inspirations) ? saved.inspirations.filter(i=>i&&safeURL(i.url)&&typeof i.name==='string').slice(0,12) : [];
  let currentView = 'swipe', currentProduct = null, busy = false, fitFilter = 'all', brandsOnly = false, drag = null, previewURL = null, analysisRevision = 0;
  const knownBrands = ['Zara','Decathlon','H&M','UNIQLO','Gymshark','TeeShoppen','True Classic'];
  const shopPages = {
    zara: 'https://www.zara.com/de/de/herren-t-shirts-basics-l856.html',
    decathlon: 'https://www.decathlon.de/alle-sportarten-a-z/fitness/t-shirt-fitness-herren',
    teeshoppen: 'https://teeshoppen.de/collections/tiefe-ausschnitt-t-shirts-herren',
    gymshark: 'https://de.gymshark.com/collections/muscle-fit-shirts/mens',
    hm: 'https://www2.hm.com/de_de/herren/produkte/t-shirts-tanktops/kurzarm.html',
    uniqlo: 'https://www.uniqlo.com/de/de/men/tops/t-shirts',
  };
  function renderShopLink() {
    const select = $('#discovery-shop'), link = $('#discovery-shop-link');
    link.href = shopPages[select.value];
    link.textContent = `Direkt bei ${select.selectedOptions[0].textContent} stöbern ↗`;
    $('#catalog-status').className = 'source-status';
    $('#catalog-status').textContent = 'Die vorhandene Auswahl zeigt Preisreferenzen mit Quellen. Eine Abfrage ergänzt aktuelle Treffer.';
  }
  $('#discovery-shop').addEventListener('change',renderShopLink);
  renderShopLink();
  function persist(next = {}) {
    try { localStorage.setItem(stateKey,JSON.stringify({profile,votes,history,inspirations,...next})); $('#profile-save-status').textContent = 'Auf diesem Gerät gespeichert.'; return true; }
    catch { notify('Dein Profil konnte nicht gespeichert werden. Der Browser-Speicher ist voll.'); return false; }
  }
  function changeProfile(next) {
    if (!persist({profile:next})) return false;
    profile = next; bridge.renderProducts(); renderSummary(); renderColor(); if (currentView === 'swipe') renderSwipe(); return true;
  }
  function options() { return {profile,votes,fitFilter,brandsOnly}; }
  function renderSummary() {
    const fit = fitOptions.find(f=>f.id===profile.fit);
    $('#swipe-profile-summary').innerHTML = `<a class="profile-pill" href="#profil">${svg('shirt')}${esc(fit.short)}</a>${profile.color ? `<a class="profile-pill color-pill" href="#profil">${esc(seasons[profile.color.season].name)}-Palette</a>` : `<a class="profile-pill" href="#profil">Farbtyp entdecken ${svg('arrow-right')}</a>`}`;
    document.querySelectorAll('.shared-budget').forEach(e=>e.textContent=`${bridge.getBudget()} €`);
    $('#swipe-undo').disabled = !history.length || busy;
    $('#selected-brands').innerHTML = profile.brands.filter(b=>!knownBrands.some(k=>sameBrand(k,b))).map(b=>`<button type="button" data-remove-brand="${esc(b)}" aria-label="${esc(b)} als Lieblingsmarke entfernen">${esc(b)}${svg('x')}</button>`).join('');
    $('#brand-options').innerHTML = knownBrands.map(b=>`<button type="button" data-brand="${esc(b)}" aria-pressed="${profile.brands.some(x=>sameBrand(x,b))}">${esc(b)}${profile.brands.some(x=>sameBrand(x,b))?svg('check'):''}</button>`).join('');
    $('#inspiration-links').innerHTML = inspirations.map((i,index)=>`<div class="inspiration-link"><a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.name)}</a><button class="icon-button" data-remove-inspiration="${index}" aria-label="Inspirationslink entfernen">${svg('x')}</button></div>`).join('');
  }
  function renderColor() {
    const color = profile.color; $('#season-select').value = color?.season || '';
    if (!color) { $('#color-result').innerHTML = ''; $('#portrait-preview').hidden=true;$('#portrait-preview').replaceChildren();$('#portrait-symbol').hidden=false;$('#analysis-status').hidden=true;if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;} return; }
    const season = seasons[color.season], samples = ['skin','hair','eyes'].every(key=>/^#[a-f\d]{6}$/i.test(color[key] || ''));
    $('#color-result').innerHTML = `<div class="color-result"><div class="color-result-heading"><h3>${season.name}</h3><span>${color.method === 'manual' ? 'Von dir gewählt' : 'Foto-Tendenz'}</span></div><p>${season.description} Diese Palette wird bei deinen Vorschlägen mitberücksichtigt.</p><div class="season-palette" aria-label="Deine vorgeschlagenen Kleidungsfarben">${season.palette.map(hex=>`<span style="--color:${hex}" title="${hex}"></span>`).join('')}</div>${samples?`<div class="sample-colors">${[['skin','Haut'],['hair','Haar'],['eyes','Augen']].map(([key,label])=>`<label>${label}<input type="color" data-sample="${key}" value="${esc(color[key])}" aria-label="Erkannte ${label.toLowerCase()}farbe korrigieren"></label>`).join('')}</div><p class="field-help" style="margin-top:10px">Erkannte Farbstichproben. Korrigiere Haar- oder Augenfarbe, falls z. B. Hintergrund oder Pupille erfasst wurden.</p>`:''}${(Array.isArray(color.quality)?color.quality:[]).map(q=>`<p class="analysis-warning">${esc(q)}</p>`).join('')}</div>`;
  }
  function renderProfile() {
    $('#fit-options').innerHTML = fitOptions.map(f=>`<label class="fit-option"><input type="radio" name="preferred-fit" value="${f.id}" ${f.id===profile.fit?'checked':''}><span><strong>${f.name}</strong><small>${f.detail}</small></span></label>`).join('');
    $('#profile-size').value = profile.size; renderSummary(); renderColor();
  }
  function queue() { return rankProducts(bridge.getProducts(),bridge.getOutfit(),{budget:bridge.getBudget(),profile,votes,unseen:true,sort:'match'}); }
  function renderSwipe() {
    if (busy) return;
    const list = queue(); currentProduct = list[0] || null;
    const total = Object.keys(votes).length;
    $('#swipe-counter').textContent = `${total} ${total===1?'Teil':'Teile'} bewertet · ${list.length} offen`;
    $('#swipe-yes').disabled = !currentProduct; $('#swipe-no').disabled = !currentProduct; $('#swipe-undo').disabled = !history.length;
    if (!currentProduct) {
      $('#swipe-deck').innerHTML = `<div class="swipe-complete">${svg('check')}<h2>Du hast einen guten Blick.</h2><p>${bridge.getProducts().some(p=>p.price<=bridge.getBudget())?'Alle passenden Teile dieser Auswahl sind bewertet. Suche neue Shop-Treffer oder sieh dir deine Likes an.':'Unter deinem Budget ist gerade nichts dabei. Erhöhe es oder suche neue Teile.'}</p><a href="#merkliste" class="button primary">Zu deinen Likes ${svg('heart')}</a><button class="text-button" id="restart-swipes">Diese Auswahl noch einmal ansehen</button></div>`;
      $('#swipe-context').innerHTML = `<h2>Dein Geschmack bleibt.</h2><p>Deine Likes findest du auf der Merkliste. Rückgängig stellt den letzten Swipe wieder her.</p><a class="profile-setup-link" href="#profil">Dein Stilprofil anpassen</a>`;
      return;
    }
    const p = currentProduct, fit = fitFor(p), outfit = bridge.getOutfit(), checked = p.priceStatus === 'checked' && p.checkedAt;
    const timestamp = checked ? new Date(p.checkedAt).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : null;
    const sizeKnown = profile.size && p.sizes?.length;
    const listedSize = sizeKnown && p.sizes.some(s=>s.replace(/^2XL$/,'XXL')===profile.size);
    $('#swipe-deck').innerHTML = `<article class="swipe-card" id="active-swipe-card" tabindex="0" aria-label="${esc(p.brand)} ${esc(p.name)}, ${money(p.price)}, ${esc(fit.label)}"><div class="swipe-card-image"><img src="${esc(p.image)}" alt="${esc(p.name)} in ${esc(p.color)}" draggable="false"><span class="card-source-badge">${checked?'Shop-Preis · Abrufstand':'Preisreferenz'}</span><span class="card-fit-badge">${svg('shirt')}${esc(fit.label)}</span><span class="vote-stamp yes">GEFÄLLT MIR</span><span class="vote-stamp no">WEITER</span></div><div class="swipe-card-info"><div class="swipe-brand-row"><span>${esc(p.brand)}</span><span>${esc(p.color)}</span></div><h2>${esc(p.name)}</h2><div class="swipe-card-bottom"><div class="swipe-price">${p.priceFrom?'ab ':''}${money(p.price)}<small>${p.pack?'Paketpreis · ':''}zzgl. möglicher Versandkosten</small></div><button class="text-button" data-swipe-details="${esc(p.id)}">Details & Shop ${svg('arrow-up-right')}</button></div><div class="stock-status ${checked?'':'reference'}">${svg(checked?'check':'info')}<span>${checked ? `${p.available===true?'Beim Abruf bestellbar':'Bestand im Shop prüfen'} · ${timestamp}${sizeKnown?listedSize?` · ${profile.size} gelistet`:` · ${profile.size} nicht gelistet`:p.sizes?.length?` · ${p.sizes.slice(0,7).join(', ')}`:''}` : 'Preis, Größe und Bestand im Shop prüfen'}</span></div></div></article>`;
    const reasons = p.personal.reasons.length ? p.personal.reasons : [p.match.styleReason,p.match.colorReason];
    $('#swipe-context').innerHTML = `<h2>Warum das zu dir passt.</h2><ul class="context-reasons">${reasons.slice(0,3).map(reason=>`<li>${esc(reason)}</li>`).join('')}<li>${money(p.price)} liegt innerhalb deines Budgets.</li></ul><div class="context-outfit"><img src="${esc(outfit.image)}" alt=""><div><strong>${esc(outfit.name)}</strong><small>${outfit.sample?'Beispiel-Outfit':'Dein Outfit'} als Ausgangspunkt</small></div></div>${profile.color?`<div class="context-palette">${seasons[profile.color.season].palette.map(hex=>`<span style="--color:${hex}"></span>`).join('')}</div>`:`<a class="profile-setup-link" href="#profil">Deine Farbpalette entdecken ${svg('arrow-right')}</a>`}<p class="context-fit-note">${fit.evidence}. Der tatsächliche Sitz hängt auch von Marke, Material und Größe ab.</p>${profile.brands.length?`<p class="context-fit-note">Bevorzugt: ${esc(profile.brands.join(', '))}</p>`:'<a class="profile-setup-link" href="#profil">Deine Lieblingsmarken wählen</a>'}`;
  }
  async function vote(decision) {
    if (!currentProduct || busy) return;
    const p = currentProduct, previousFavorite = bridge.getFavorites().includes(p.id), previousVote = votes[p.id] || null;
    const nextVotes = {...votes,[p.id]:{decision,brand:p.brand,fit:fitFor(p).id,family:p.family,at:new Date().toISOString()}};
    const nextHistory = [...history,{id:p.id,decision,previousFavorite,previousVote}].slice(-20);
    if (!persist({votes:nextVotes,history:nextHistory})) return;
    const nextFavorites = decision==='like' ? [...new Set([...bridge.getFavorites(),p.id])] : bridge.getFavorites().filter(id=>id!==p.id);
    if (!bridge.setFavorites(nextFavorites)) { persist(); return; }
    votes = nextVotes; history = nextHistory; busy = true;
    const card = $('#active-swipe-card');
    if (card) { card.style.transform = `translateX(${decision==='like'?120:-120}%) rotate(${decision==='like'?13:-13}deg)`;card.classList.add('is-leaving');card.querySelector(decision==='like'?'.vote-stamp.yes':'.vote-stamp.no').style.opacity='1'; }
    $('#swipe-yes').disabled = true; $('#swipe-no').disabled = true; $('#swipe-undo').disabled = true;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve=>setTimeout(resolve,210));
    busy = false; bridge.renderProducts(); renderSwipe();
  }
  function undoVote() {
    if (busy || !history.length) return;
    const last = history.at(-1), nextVotes = {...votes};
    if (last.previousVote) nextVotes[last.id] = last.previousVote; else delete nextVotes[last.id];
    const nextHistory = history.slice(0,-1);
    if (!persist({votes:nextVotes,history:nextHistory})) return;
    const restoredFavorites = last.previousFavorite ? [...new Set([...bridge.getFavorites(),last.id])] : bridge.getFavorites().filter(id=>id!==last.id);
    if (!bridge.setFavorites(restoredFavorites)) { persist(); return; }
    votes = nextVotes; history = nextHistory; bridge.renderProducts(); renderSwipe(); notify('Letzten Swipe rückgängig gemacht.');
  }
  function applyProducts(incoming) {
    const next = mergeCatalog(bridge.getProducts(),incoming);
    const cache = next.filter(p=>p.priceStatus==='checked'||p.imported).slice(-100);
    try { localStorage.setItem(cacheKey,JSON.stringify(cache)); }
    catch { throw new Error('Die Shop-Treffer konnten nicht gespeichert werden. Bitte entferne zuerst ein älteres Outfit.'); }
    bridge.setProducts(next); bridge.renderProducts(); if(currentView==='swipe')renderSwipe();
    return incoming.map(item=>next.find(p=>p.id===item.id||p.url===item.url));
  }
  async function requestJSON(path) {
    const response = await fetch(path,{signal:AbortSignal.timeout(55000),credentials:'same-origin'});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Die Shop-Abfrage ist gerade nicht verfügbar.'); return data;
  }
  $('#refresh-catalog').addEventListener('click',async()=>{
    const button=$('#refresh-catalog'),status=$('#catalog-status');if(button.disabled)return;
    button.disabled=true;status.className='source-status';status.textContent='Shop-Katalog wird gelesen, anschließend Preise und Größen geprüft …';
    try {
      const data=await requestJSON(`/api/discover?shop=${encodeURIComponent($('#discovery-shop').value)}&fit=${encodeURIComponent(profile.fit)}`);
      applyProducts(data.products);status.className='source-status success';status.textContent=`${data.products.length} Teile mit aktuellem Shop-Preis ergänzt.${data.partial?' Einige Seiten waren nicht lesbar.':''}`;
    }catch(error){status.className='source-status error';status.textContent=error.name==='TimeoutError'?'Der Abruf dauert zu lange. Die bisherige Auswahl bleibt verfügbar.':error.message;}
    finally{button.disabled=false;}
  });
  $('#inspiration-form').addEventListener('submit',async e=>{
    e.preventDefault();const input=$('#inspiration-url'),url=safeURL(input.value),status=$('#import-status'),button=$('#import-product');
    if(!url){status.textContent='Bitte nutze einen HTTPS-Produktlink ohne Zugangsdaten.';status.className='source-status error';return;}
    if(!inspirations.some(i=>i.url===url)){
      const next=[{url,name:new URL(url).hostname+' · '+(new URL(url).pathname.split('/').filter(Boolean).at(-1)||'Produkt')},...inspirations].slice(0,12);
      if(!persist({inspirations:next}))return;inspirations=next;renderSummary();
    }
    button.disabled=true;status.className='source-status';status.textContent='Link gemerkt. Produkttext, EUR-Preis und verfügbare Größen werden gelesen …';
    try {
      const data=await requestJSON('/api/product?url='+encodeURIComponent(url));data.product.imported=true;const product=applyProducts([data.product])[0];
      const brands=profile.brands.some(b=>sameBrand(b,product.brand))?profile.brands:[...profile.brands,product.brand].slice(0,20);
      changeProfile({...profile,brands});
      const nextFavorites=[...new Set([...bridge.getFavorites(),product.id])];bridge.setFavorites(nextFavorites);
      const importedVotes={...votes,[product.id]:{decision:'like',brand:product.brand,fit:fitFor(product).id,family:product.family,at:new Date().toISOString()}};
      if(persist({votes:importedVotes}))votes=importedVotes;
      status.className='source-status success';status.textContent=`${product.name}: ${money(product.price)}, ${fitFor(product).label}. Als Inspiration und auf der Merkliste gespeichert.`;input.value='';
    }catch(error){status.className='source-status error';status.textContent=`Link als Inspiration gespeichert. ${error.name==='TimeoutError'?'Der Shop-Abruf dauert zu lange.':error.message}`;}
    finally{button.disabled=false;}
  });
  async function analyzePhoto(file) {
    const revision=++analysisRevision,status=$('#analysis-status');
    $('#choose-portrait').disabled=$('#open-portrait-camera').disabled=true;
    status.hidden=false;status.className='analysis-status';
    try{
      const result=await analyzePortrait(file,message=>{if(revision===analysisRevision)status.textContent=message;});
      if(revision!==analysisRevision)return;
      if(changeProfile({...profile,color:result})){
        if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(file);
        const img=new Image();img.src=previewURL;img.alt='Dein vorübergehend angezeigtes Analysefoto';$('#portrait-preview').replaceChildren(img);$('#portrait-preview').hidden=false;$('#portrait-symbol').hidden=true;
        status.textContent='Gesicht erkannt. Deine erste Farbtyp-Tendenz ist bereit. Das Foto wird nicht dauerhaft gespeichert.';
      }
    }catch(error){if(revision===analysisRevision){status.className='analysis-status error';status.textContent=/fetch|network|wasm|model|initialize/i.test(error.message)?'Das lokale Analysemodell konnte nicht geladen werden. Prüfe die Verbindung und versuche es noch einmal. Alternativ kannst du deinen Farbtyp unten selbst wählen.':error.message;}}
    finally{if(revision===analysisRevision)$('#choose-portrait').disabled=$('#open-portrait-camera').disabled=false;$('#portrait-input').value='';}
  }
  $('#choose-portrait').addEventListener('click',()=>$('#portrait-input').click());
  $('#portrait-input').addEventListener('change',e=>{
    const file=e.target.files[0];if(file)analyzePhoto(file);
  });
  const cameraDialog=$('#portrait-camera-dialog'),cameraVideo=$('#portrait-camera-video'),shutter=$('#capture-portrait'),cameraStatus=$('#camera-status'),cameraRetry=$('#retry-portrait-camera');
  const camera=createPortraitCamera(cameraVideo);
  let cameraRevision=0;
  function stopCamera(){cameraRevision++;camera.stop();shutter.disabled=true;}
  async function startCamera(){
    const revision=++cameraRevision;
    shutter.disabled=true;cameraRetry.hidden=true;cameraVideo.hidden=true;
    cameraStatus.className='camera-status';cameraStatus.textContent='Kamera wird geöffnet. Erlaube den Zugriff, wenn dein Browser danach fragt.';
    try{
      if(!await camera.start()||revision!==cameraRevision||!cameraDialog.open)return;
      cameraVideo.hidden=false;shutter.disabled=cameraVideo.readyState<2;
      cameraStatus.textContent='Schau gerade in die Kamera. Gesicht und Haare sollten gut sichtbar sein.';
      cameraVideo.srcObject.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{
        if(revision!==cameraRevision)return;
        stopCamera();cameraVideo.hidden=true;cameraRetry.hidden=false;cameraStatus.className='camera-status error';cameraStatus.textContent='Die Kamera wurde unterbrochen. Du kannst sie erneut öffnen.';
      },{once:true}));
    }catch(error){if(revision===cameraRevision&&cameraDialog.open){cameraStatus.className='camera-status error';cameraStatus.textContent=cameraError(error);cameraRetry.hidden=false;}}
  }
  cameraVideo.addEventListener('canplay',()=>{if(cameraDialog.open&&cameraVideo.srcObject)shutter.disabled=false;});
  $('#open-portrait-camera').addEventListener('click',()=>{cameraDialog.showModal();startCamera();});
  cameraRetry.addEventListener('click',startCamera);
  cameraDialog.addEventListener('cancel',stopCamera);
  cameraDialog.addEventListener('close',stopCamera);
  shutter.addEventListener('click',async()=>{
    shutter.disabled=true;
    try{
      const photo=await camera.capture();if(!photo||!cameraDialog.open)return;
      stopCamera();cameraDialog.close();analyzePhoto(photo);
    }catch(error){cameraStatus.className='camera-status error';cameraStatus.textContent=error.message;shutter.disabled=!cameraVideo.srcObject;}
  });
  function closeCamera(){stopCamera();if(cameraDialog.open)cameraDialog.close();}
  window.addEventListener('pagehide',closeCamera);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)closeCamera();});
  $('#season-select').addEventListener('change',e=>changeProfile({...profile,color:e.target.value?{...(profile.color||{}),season:e.target.value,method:'manual'}:null}));
  $('#color-result').addEventListener('input',e=>{const key=e.target.dataset.sample;if(!key||!profile.color)return;const samples={...profile.color,[key]:e.target.value};changeProfile({...profile,color:seasonFromSamples(samples)});});
  $('#fit-options').addEventListener('change',e=>{if(e.target.name==='preferred-fit')changeProfile({...profile,fit:e.target.value});});
  $('#profile-size').addEventListener('change',e=>changeProfile({...profile,size:e.target.value}));
  $('#brand-form').addEventListener('submit',e=>{e.preventDefault();const brand=normalizeBrand($('#brand-name').value);if(!brand)return;if(profile.brands.length>=20)return notify('Du kannst bis zu 20 Lieblingsmarken speichern.');if(!profile.brands.some(b=>sameBrand(b,brand)))changeProfile({...profile,brands:[...profile.brands,brand]});$('#brand-name').value='';renderSummary();});
  $('#profile-view').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.brand){const name=b.dataset.brand;changeProfile({...profile,brands:profile.brands.some(x=>sameBrand(x,name))?profile.brands.filter(x=>!sameBrand(x,name)):[...profile.brands,name].slice(0,20)});}
    if(b.dataset.removeBrand)changeProfile({...profile,brands:profile.brands.filter(x=>!sameBrand(x,b.dataset.removeBrand))});
    if(b.dataset.removeInspiration!==undefined){const next=inspirations.filter((_,i)=>i!==Number(b.dataset.removeInspiration));if(persist({inspirations:next})){inspirations=next;renderSummary();}}
  });
  $('#fit-filter').addEventListener('change',e=>{fitFilter=e.target.value;bridge.renderProducts();});
  $('#brands-only').addEventListener('change',e=>{brandsOnly=e.target.checked;bridge.renderProducts();});
  $('#swipe-no').addEventListener('click',()=>vote('dislike'));$('#swipe-yes').addEventListener('click',()=>vote('like'));$('#swipe-undo').addEventListener('click',undoVote);
  $('#swipe-deck').addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.swipeDetails)bridge.openProduct(b.dataset.swipeDetails);if(b?.id==='restart-swipes'){if(persist({votes:{},history:[]})){votes={};history=[];renderSwipe();notify('Swipe-Auswahl neu gestartet. Deine Merkliste bleibt erhalten.');}}});
  const deck=$('#swipe-deck');
  deck.addEventListener('pointerdown',e=>{if(!currentProduct||busy||e.button!==0||e.target.closest('button,a'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),dx:0,horizontal:false};});
  deck.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.horizontal&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3){drag.horizontal=true;deck.setPointerCapture(e.pointerId);}
    if(!drag.horizontal)return;e.preventDefault();drag.dx=dx;const card=$('#active-swipe-card');if(!card)return;card.classList.add('dragging');card.style.transform=`translateX(${dx}px) rotate(${Math.max(-12,Math.min(12,dx/18))}deg)`;card.querySelector('.vote-stamp.yes').style.opacity=dx>0?Math.min(1,dx/90):0;card.querySelector('.vote-stamp.no').style.opacity=dx<0?Math.min(1,-dx/90):0;
  });
  function finishDrag(e){if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;const card=$('#active-swipe-card');if(card){card.classList.remove('dragging');card.style.transform='';card.querySelectorAll('.vote-stamp').forEach(s=>s.style.opacity=0);}if(e.type!=='pointercancel'&&d.horizontal&&(Math.abs(d.dx)>90||(Math.abs(d.dx)>45&&Math.abs(d.dx)/(performance.now()-d.time)>.55)))vote(d.dx>0?'like':'dislike');}
  deck.addEventListener('pointerup',finishDrag);deck.addEventListener('pointercancel',finishDrag);
  document.addEventListener('keydown',e=>{if(currentView!=='swipe'||document.querySelector('dialog[open]')||document.querySelector(':popover-open')||e.target.closest('input,select,textarea,a,[contenteditable=true]'))return;if(e.key==='ArrowLeft'){e.preventDefault();vote('dislike');}if(e.key==='ArrowRight'){e.preventDefault();vote('like');}});
  renderProfile();
  return {
    options, getProfile:()=>profile, applyLocalPalette:color=>profile.color?false:changeProfile({...profile,color}),
    show(view){currentView=view;if(view!=='profil')closeCamera();if(view==='swipe'){renderSummary();renderSwipe();}if(view==='profil')renderProfile();},
    refresh(){renderSummary();if(currentView==='swipe')renderSwipe();},
    resetFilters(){fitFilter='all';brandsOnly=false;$('#fit-filter').value='all';$('#brands-only').checked=false;},
  };
}
