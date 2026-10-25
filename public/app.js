import { sampleOutfits, products as baseProducts } from './data.js';
import { styles, colors, closestColor, explainMatch, getRecommendations } from './recommend.js';
import { rankProducts, fitFor, preferenceReasons } from './style-engine.js';
import { createExperience, readCatalogCache, mergeCatalog } from './experience.js';
import { createLocalWardrobe } from './local-wardrobe.js';

let products = mergeCatalog(baseProducts, readCatalogCache());
let experience, localWardrobe;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iconPaths = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  hanger: '<path d="M10 6a2 2 0 1 1 4 0c0 1.3-2 1.7-2 3v2L3 16a1.5 1.5 0 0 0 .7 2.8h16.6A1.5 1.5 0 0 0 21 16l-9-5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  flower: '<path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z"/><path d="m3 3 2 2m14 14 2 2M3 21l2-2M19 5l2-2"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 1 1 4.2 2c-1 .7-1.7 1-1.7 2.5m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  wallet: '<path d="M20 8V5a1 1 0 0 0-1-1H5a3 3 0 0 0 0 6h16v9a1 1 0 0 1-1 1H5a3 3 0 0 1-3-3V7m19 6h-5v4h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16m-6-5 2-2 2 2m4-5 2 2 2-2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m-10 0 1 15h12l1-15M10 10v7m4-7v7"/>',
  cards: '<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7 2 8l3 13a2 2 0 0 0 2 1l5-1m-1-12 2 2 3-4"/>',
  sliders: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--paper)"/><circle cx="15" cy="17" r="3" fill="var(--paper)"/>',
  shirt: '<path d="m8 3-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01M6.5 15h.01"/>',
  face: '<path d="M5 10V7a7 7 0 0 1 14 0v3m-14 0v4a7 7 0 0 0 14 0v-4M8 10h.01M16 10h.01M9 16a4 4 0 0 0 6 0M3 3H1v4m20-4h2v4M1 17v4h3m19-4v4h-3"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12m-11-12 5-5m-5 5 5 5"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.flower}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = svg(el.dataset.icon)); }
const storageKey = 'rewear-v1';
let stored = {};
try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Corrupt storage starts with the sample collection. */ }
const validOutfit = o => o && typeof o.id === 'string' && typeof o.name === 'string' && o.name.length <= 40 && typeof o.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(o.image) && Array.isArray(o.styles) && o.styles.length > 0 && o.styles.every(s => styles.includes(s)) && Array.isArray(o.palette) && o.palette.length === 3 && o.palette.every(c => /^#[a-f\d]{6}$/i.test(c));
let userOutfits = Array.isArray(stored.outfits) ? stored.outfits.filter(validOutfit).slice(0, 15) : [];
let favorites = Array.isArray(stored.favorites) ? stored.favorites.filter(id => products.some(p => p.id === id)) : [];
let budget = typeof stored.budget === 'number' && stored.budget >= 5 && stored.budget <= 100 ? stored.budget : 50;
let selectedId = typeof stored.selectedId === 'string' ? stored.selectedId : sampleOutfits[0].id;
const validLocalOutfit=o=>/^http:\/\/127\.0\.0\.1:417[45]$/.test(location.origin)&&o?.local&&typeof o.id==='string'&&typeof o.name==='string'&&o.name.length<=40&&/^\/api\/local\/images\/[a-f\d]{64}-\d+-(top|bottom)\.jpg$/.test(o.image)&&Array.isArray(o.palette)&&o.palette.length===3&&o.palette.every(c=>/^#[a-f\d]{6}$/i.test(c));
let localOutfit=validLocalOutfit(stored.localOutfit)?{...stored.localOutfit,styles:['Casual']}:null;
let category = 'Alle', query = '', sort = 'match', view = 'entdecken', activeProductId = null;
let toastTimer, undoAction = null, draftImage = null, draftPalette = ['#e8dfcf', '#bda88a', '#292b2b'];
let imageRevision = 0;
const allOutfits = () => [...(localOutfit?[localOutfit]:[]), ...userOutfits, ...sampleOutfits];
const selectedOutfit = () => allOutfits().find(o => o.id === selectedId) || allOutfits()[0];

function persist(next = {}) {
  const state = { outfits: userOutfits, favorites, budget, selectedId, localOutfit, ...next };
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch { notify('Speicher voll. Entferne ein Outfit oder versuche einen anderen Browser.'); return false; }
}
function notify(message, undo = null) {
  clearTimeout(toastTimer); $('#toast-text').textContent = message; $('#toast').hidden = false;
  undoAction = undo; $('#toast-undo').hidden = !undo;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoAction = null; }, undo ? 12000 : 4500);
}
function paletteHTML(palette) { return palette.map(hex => `<span class="swatch" style="--color:${esc(hex)}" title="${closestColor(hex).name}"></span>`).join(''); }
function outfitCard(o) {
  return `<button class="outfit-card ${o.id === selectedOutfit().id ? 'selected' : ''}" data-outfit="${esc(o.id)}" aria-pressed="${o.id === selectedOutfit().id}"><img src="${esc(o.image)}" alt="" loading="lazy"><span><strong>${esc(o.name)}</strong><small>${o.sample ? 'Beispiel-Look' : 'Dein Outfit'} · ${esc(o.styles[0])}</small><span class="swatches" aria-label="Outfit-Farben">${paletteHTML(o.palette)}</span></span>${o.id === selectedOutfit().id ? `<span class="selected-check">${svg('check')}</span>` : ''}</button>`;
}
function renderOutfits() {
  const outfits = allOutfits();
  $('#outfit-count').textContent = outfits.length;
  $('#outfit-rail').innerHTML = outfits.map(outfitCard).join('') + `<button class="outfit-card add-outfit-card" data-action="upload">${svg('plus')}<span>Dein Outfit</span></button>`;
  $('#outfit-hint').textContent = userOutfits.length ? 'Wähle den Look, den du ergänzen möchtest.' : 'Wähle ein Beispiel oder lade dein eigenes Outfit hoch.';
  $('#wardrobe-grid').innerHTML = outfits.map(o => `<article class="wardrobe-card"><img class="wardrobe-photo" src="${esc(o.image)}" alt="${esc(o.name)}" loading="lazy">${o.local ? '<span class="sample-badge">Apple Fotos · lokal</span>' : o.sample ? '<span class="sample-badge">Beispiel-Outfit</span>' : `<button class="icon-button delete-outfit" data-delete="${esc(o.id)}" aria-label="${esc(o.name)} löschen">${svg('trash')}</button>`}<h2>${esc(o.name)}</h2><p>${esc(o.styles.join(' · '))}</p><div class="swatches" aria-label="Outfit-Farben">${paletteHTML(o.palette)}</div><button class="button ${o.id === selectedOutfit().id ? 'primary' : 'secondary'}" data-discover="${esc(o.id)}">Passende Teile entdecken ${svg('arrow-right')}</button></article>`).join('') + `<button class="wardrobe-upload" data-action="upload">${svg('plus')}<strong>Dein nächster Look.</strong><small>Lade ein Foto hoch und mach deinen Kleiderschrank zum Ausgangspunkt.</small></button>`;
}
function productCard(p) {
  const saved = favorites.includes(p.id);
  const fit = fitFor(p);
  return `<article class="product-card" data-product-card="${esc(p.id)}"><button class="product-image-button" data-product="${esc(p.id)}" aria-label="${esc(p.name)} ansehen"><img src="${esc(p.image)}" alt="${esc(p.name)} in ${esc(p.color)}" loading="lazy"><span class="view-product">${svg('compare')}Mit Outfit vergleichen</span></button><button class="save-product" data-save="${esc(p.id)}" aria-label="${esc(p.name)} ${saved ? 'aus Merkliste entfernen' : 'merken'}" aria-pressed="${saved}">${svg('heart')}</button>${p.priceStatus==='checked'?'<span class="product-badge">Shop-Preis geprüft</span>':p.original?'<span class="product-badge">Preisreferenz</span>':''}<div class="product-info"><p class="product-brand">${esc(p.brand)}</p><button class="product-name" data-product="${esc(p.id)}">${esc(p.name)}</button><div class="product-color"><span class="swatch" style="--color:${esc(p.hex)}"></span>${esc(p.color)} · ${esc(p.audience || 'Herren')}</div><div class="product-fit">${esc(fit.label)}</div><div class="price-row"><span class="${p.original ? 'sale-price' : ''}">${p.priceFrom?'ab ':''}${money(p.price)}</span>${p.original ? `<del>${money(p.original)}</del>` : ''}</div><p class="price-status">${p.priceStatus==='checked'?`Shop-Abruf ${esc(new Date(p.checkedAt).toLocaleDateString('de-DE'))}`:'Preisreferenz · Stand 25.10.2026'}${p.pack?' · Paketpreis':''}</p><div class="match-line">${svg('check')}<span>${esc(p.match.label)}</span></div></div></article>`;
}
function renderProducts() {
  const outfit = selectedOutfit();
  const filtered = rankProducts(products, outfit, { budget, category, query, sort, favorites: view === 'merkliste' ? favorites : null, ...(experience?.options() || {}) });
  $('#saved-count').textContent = favorites.length;
  $('#result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'Teil' : 'Teile'} ${view === 'merkliste' ? 'gemerkt' : 'für dich'}`;
  $('#product-grid').innerHTML = filtered.map(productCard).join('');
  $('#empty-state').hidden = filtered.length > 0;
  const noSaved = view === 'merkliste' && !favorites.length;
  const noBrands = experience?.options().brandsOnly && !experience.getProfile().brands.length;
  $('#empty-state h3').textContent = noSaved ? 'Platz für deine Lieblingsteile.' : 'Noch kein passendes Teil dabei.';
  $('#empty-state p').textContent = noSaved ? 'Tippe auf ein Herz, um ein Teil hier für später zu merken.' : 'Versuche eine andere Kategorie, einen anderen Suchbegriff oder ein höheres Budget.';
  $('#empty-state button').textContent = noSaved ? 'Lieblingsteile entdecken' : 'Filter zurücksetzen';
  $('#empty-state button').dataset.action = 'reset-filters';
  if(noBrands){$('#empty-state h3').textContent='Welche Marken magst du?';$('#empty-state p').textContent='Wähle zuerst eine Lieblingsmarke in deinem Stilprofil.';$('#empty-state button').textContent='Lieblingsmarken wählen';$('#empty-state button').dataset.action='profile';}
  $('#recommendation-context').textContent = view === 'merkliste' ? `Deine Favoriten · passend zu „${outfit.name}“` : `Für „${outfit.name}“ · ${outfit.sample ? 'Beispiel-Outfit' : 'dein Outfit'} · nach Stil & Farben`;
  $$('.category-filters button').forEach(b => { b.classList.toggle('active', b.dataset.category === category); b.setAttribute('aria-pressed', b.dataset.category === category); });
  $('#budget-label').textContent = `${budget} €`; $('#budget-range').value = budget; $('#budget-output').textContent = `${budget} €`;
  $$('.budget-presets button').forEach(b => b.classList.toggle('active', Number(b.dataset.budget) === budget));
}
function renderView() {
  view = ['swipe','profil','entdecken', 'outfits', 'merkliste'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'swipe';
  const headings = { swipe:['Swipe deinen Stil.','Links weiter. Rechts gefällt & merken.'],profil:['Dein Stil. Deine Spielregeln.','Farbpalette, Lieblingsmarken und der Schnitt, in dem du dich wohlfühlst.'],entdecken: ['Guter Stil. Kleines Budget.', 'Neue Lieblingsteile, die zu dem passen, was du schon liebst.'], outfits: ['Dein Stil fängt bei dir an.', 'Deine Lieblingslooks. Der Ausgangspunkt für neue Kombinationen.'], merkliste: ['Für später. Für dich.', 'Deine gemerkten Teile, an einem Ort.'] };
  document.body.dataset.view = view; $('#page-title').textContent = headings[view][0]; $('#page-subtitle').textContent = headings[view][1];
  $('#breadcrumb').textContent = { swipe:'Dein persönlicher Style-Swipe',profil:'Dein Stilprofil',entdecken: 'Dein persönlicher Style-Guide', outfits: 'Dein Kleiderschrank', merkliste: 'Deine Merkliste' }[view];
  $$('[data-nav]').forEach(a => { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#hero').hidden = view !== 'entdecken'; $('#outfit-section').hidden = view !== 'entdecken';
  $('#wardrobe-view').hidden = view !== 'outfits'; $('#discover-section').hidden = !['entdecken','merkliste'].includes(view);
  $('#swipe-view').hidden = view !== 'swipe'; $('#profile-view').hidden = view !== 'profil';
  const profileAction=['swipe','profil'].includes(view); $('#page-action').dataset.action=profileAction?'profile':'upload';$('#page-action').innerHTML=profileAction?`${svg('sliders')}Mein Stilprofil`:`${svg('plus')}Outfit hinzufügen`;$('#page-action').hidden=view==='profil'||view==='outfits';
  if(/^http:\/\/127\.0\.0\.1:417[45]$/.test(location.origin)){const button=$('#hero button');button.dataset.action='local-wardrobe';button.innerHTML=`${svg('hanger')}Deine Klamotten ansehen`;}
  $('#products-title').textContent = view === 'merkliste' ? 'Deine guten Funde.' : 'Kleine Ergänzung. Großer Unterschied.';
  renderOutfits(); renderProducts(); experience?.show(view);if(view==='outfits')localWardrobe?.refresh();
}
function selectOutfit(id, navigate = false) {
  selectedId = id; persist(); renderOutfits(); renderProducts(); experience?.refresh();
  if (navigate) { location.hash = 'entdecken'; setTimeout(() => $('#discover-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }
}
function toggleFavorite(id) {
  const restoreGridFocus = document.activeElement?.classList.contains('save-product');
  const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  if (!persist({ favorites: next })) return;
  const saved = next.includes(id); favorites = next; renderProducts();
  if (restoreGridFocus) ($('#product-grid').querySelector(`[data-save="${id}"]`) || $('#product-grid .save-product') || $('[data-nav=merkliste]')).focus({ preventScroll: true });
  if ($('#product-dialog').open && activeProductId === id) updateDetailFavorite();
  notify(saved ? 'Dein Fund ist auf der Merkliste.' : 'Von der Merkliste entfernt.');
}
function updateDetailFavorite() {
  const b = $('#detail-save'); if (!b) return;
  b.innerHTML = `${svg('heart')}${favorites.includes(activeProductId) ? 'Gemerkt' : 'Merken'}`;
  b.setAttribute('aria-pressed', favorites.includes(activeProductId));
}
function showProduct(id) {
  const p = products.find(p => p.id === id); if (!p) return;
  activeProductId = id;
  const outfit = selectedOutfit(), match = explainMatch(p, outfit);
  const personal = preferenceReasons(p, experience.getProfile(), experience.options().votes);
  $('#product-detail').innerHTML = `<div class="comparison"><figure><img src="${esc(outfit.image)}" alt="${esc(outfit.name)}"><figcaption>${outfit.sample ? 'Beispiel-Look' : 'Dein Look'}: ${esc(outfit.name)}</figcaption></figure><figure><img src="${esc(p.image)}" alt="${esc(p.name)}"><figcaption>Deine mögliche Ergänzung</figcaption></figure></div><div class="detail-layout"><div class="detail-title"><p class="product-brand">${esc(p.brand)} · ${esc(p.audience)}</p><h2 id="product-detail-title">${esc(p.name)}</h2><div class="price-row"><span class="${p.original ? 'sale-price' : ''}">${p.priceFrom?'ab ':''}${money(p.price)}</span>${p.original ? `<del>${money(p.original)}</del>` : ''}</div><div class="detail-specs"><span>${esc(p.color)} · ${esc(fitFor(p).label)}</span><span>${esc(p.material)}</span>${Array.isArray(p.sizes)&&p.sizes.length?`<span>Beim Abruf verfügbare Größen: ${p.sizes.map(esc).join(', ')}</span>`:''}</div><div class="detail-actions"><a class="button primary" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${p.categoryLink ? 'Im Shop finden' : 'Zum Shop'} ${svg('arrow-up-right')}</a><button class="button secondary" id="detail-save" data-save="${p.id}"></button></div><p class="detail-price-note">${p.priceStatus==='checked'?`Shop-Abruf: ${esc(new Date(p.checkedAt).toLocaleString('de-DE'))}. Beim Abruf ${p.available===true?'bestellbar':'Bestand unklar'}.`:'Preisreferenz · Recherche vom 25.10.2026.'} Preis, Größe und Versand vor dem Kauf im Shop prüfen. ${p.categoryLink ? 'Der Link öffnet die passende Shop-Kategorie.' : ''}</p></div><div class="match-explanation"><h3>${svg('check')}Warum dieses Teil?</h3>${personal.reasons.map(reason=>`<p>${esc(reason)}</p>`).join('')}<p>${esc(match.styleReason)}</p><p>${esc(match.colorReason)}</p><div class="swatches">${paletteHTML(outfit.palette)}<span style="margin:0 4px">+</span>${paletteHTML([p.hex])}</div><p class="match-disclaimer">Deine Palette + die Produktfarbe. Empfehlungen nach Stil-Tags und Farbnähe; keine virtuelle Anprobe.</p></div></div>`;
  updateDetailFavorite(); $('#product-dialog').showModal();
}
function showInfo(kind) {
  const content = {
    help: `<h2 id="info-title">Dein Stil. Weitergedacht.</h2><p>Mehr Möglichkeiten mit dem, was du schon gern trägst.</p><ol><li><strong>Ein Outfit als Ausgangspunkt.</strong>Lade ein Foto hoch oder probiere einen Beispiel-Look aus.</li><li><strong>Du gibst die Richtung vor.</strong>Wähle Stil-Tags, prüfe die Farben und lege dein Budget pro Teil fest.</li><li><strong>Finde die passende Ergänzung.</strong>Vergleiche ein Teil neben deinem Outfit. Wir erklären, welche Farben und Stil-Tags zusammenpassen.</li></ol><p>Dein Stilprofil, dein gewähltes Outfit und deine Swipes ordnen die Vorschläge. Die lokale Gesichtserkennung liefert eine vorläufige Farbpalette. Schnitte werden aus Shop-Texten gelesen. Über die Shop-Abfrage kannst du weitere Teile mit aktuellem Preis ergänzen.</p><button class="button primary" data-action="info-upload">Mein Outfit hinzufügen ${svg('plus')}</button>`,
    privacy: `<h2 id="info-title">Dein Kleiderschrank bleibt bei dir.</h2><p>Deine Outfit-Fotos, Stil-Tags, dein Budget und deine Merkliste werden nur im lokalen Speicher dieses Browsers abgelegt. Dafür brauchst du keinen Account.</p><p>Die Farbanalyse und Gesichtserkennung laufen auf deinem Gerät. Ein Selfie wird nicht dauerhaft gespeichert. Es bleiben nur Farbwerte und die gewählte Palette in deinem Browser. Das Analysemodell wird über unseren Server von Google und jsDelivr geladen. Wir laden deine Bilder nicht zu einem KI-Anbieter oder einem Shop hoch. Für eine Shop-Suche werden nur Marke beziehungsweise der öffentliche Produktlink an unseren Server übergeben. Das Gesichtsfoto und deine Farbstichproben werden dabei nicht übertragen. Ein Shop-Link öffnet die öffentliche Produktseite.</p><p>Der lokale Apple-Fotos-Begleiter speichert Arbeitskopien, Kleidungs-Ausschnitte, Porträtausschnitte für die Farbanalyse und Zuordnungen ausschließlich im REWEAR-Ordner auf diesem Mac. Die Online-Seite kann diese Daten nicht lesen. Körperpositionen und Kleidungsmerkmale werden mit Apple Vision lokal analysiert; mehrere Personen erfordern eine eigene Zuordnung.</p><p>Wenn du Browserdaten löschst, gehen deine gespeicherten Outfits und Favoriten verloren. Ein anderes Gerät hat keinen Zugriff auf diese Daten.</p><p>Die Beispielbilder sind Inspiration, keine Fotos von dir. Quellen: Unsplash sowie die verlinkten Shops. Die App lädt Bilder und Schriftarten vom eigenen Server.</p>`,
    sources: `<h2 id="info-title">Gute Funde. Klare Preise.</h2><p>Die Startauswahl basiert auf öffentlich recherchierten Preisreferenzen vom 25. Oktober 2026. Neu abgerufene Shop-Treffer zeigen stattdessen ihren tatsächlichen Abrufzeitpunkt sowie verfügbare Größen, soweit diese vom Shop geliefert werden. Die Quellen können ältere oder reduzierte Angebote zeigen; eine Abfrage erfolgt nur auf deinen Klick und wird für höchstens zehn Minuten aus dem Cache beantwortet. Nicht lesbare oder blockierende Shops werden als solche angezeigt.</p><p>Größe, Farbe, Versandkosten und Verfügbarkeit können abweichen. Entscheidend ist das Angebot im Shop. Der Budgetfilter bezieht sich auf den hinterlegten Artikelpreis ohne Versand.</p><ul class="source-list">${[['UNIQLO · T-Shirts','https://www.uniqlo.com/de/de/men/tops/t-shirts'],['UNIQLO · Mini-Schultertasche','https://www.uniqlo.com/de/de/women/accessories/bags'],['H&M · Twill-Overshirt','https://www2.hm.com/de_de/productpage.1282179002.html'],['H&M · Straight Jeans','https://www2.hm.com/de_de/productpage.1008549006.html'],['H&M · Sneaker','https://www2.hm.com/de_de/productpage.1119476001.html']].map(([name,url]) => `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a><time datetime="2026-10-25">25.10.2026</time></li>`).join('')}</ul><p>Keine gesponserten Platzierungen und keine Affiliate-Links.</p>`
  };
  $('#info-content').innerHTML = content[kind]; $('#info-dialog').showModal();
}
function renderPaletteEditor() {
  $('#palette-editor').innerHTML = draftPalette.map((hex, i) => `<label><input type="color" value="${hex}" data-palette-index="${i}" aria-label="Outfit-Farbe ${i + 1} ändern"><span>${closestColor(hex).name}</span></label>`).join('');
}
function openUpload() {
  imageRevision++; draftImage = null; draftPalette = ['#e8dfcf', '#bda88a', '#292b2b'];
  $('#outfit-form').reset(); $('#upload-placeholder').hidden = false; $('#upload-preview').hidden = true;
  $('#upload-preview').replaceChildren(); $('#upload-error').hidden = true; $('#save-outfit').disabled = true;
  $('#save-outfit').innerHTML = `Outfit speichern ${svg('arrow-right')}`;
  $('#style-options').innerHTML = styles.map((style, i) => `<label><input type="checkbox" name="style" value="${style}" ${i === 0 ? 'checked' : ''}><span>${style}</span></label>`).join('');
  renderPaletteEditor(); $('#upload-dialog').showModal();
}
function uploadError(message) { $('#upload-error').textContent = message; $('#upload-error').hidden = false; }
async function processPhoto(file) {
  if (!file) return;
  const revision = ++imageRevision;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { uploadError('Dieses Dateiformat geht noch nicht. Wähle ein JPG, PNG oder WebP.'); return; }
  if (file.size > 10 * 1024 * 1024) { uploadError('Dein Foto ist größer als 10 MB. Wähle bitte eine kleinere Datei.'); return; }
  $('#save-outfit').disabled = true; $('#save-outfit').textContent = 'Foto wird vorbereitet …'; $('#upload-error').hidden = true;
  try {
    const image = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: 900, resizeQuality: 'high' });
    if (image.width * image.height > 30000000) { image.close(); throw new Error('image-size'); }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 900 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#faf9f6'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const result = canvas.toDataURL('image/jpeg', .82);
    const tiny = document.createElement('canvas'); tiny.width = 40; tiny.height = 40;
    const c = tiny.getContext('2d', { willReadFrequently: true });
    c.drawImage(canvas, canvas.width * .15, canvas.height * .1, canvas.width * .7, canvas.height * .8, 0, 0, 40, 40);
    const pixels = c.getImageData(0, 0, 40, 40).data, buckets = {};
    for (let i = 0; i < pixels.length; i += 4) {
      const hex = '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(n => n.toString(16).padStart(2, '0')).join('');
      const color = closestColor(hex); buckets[color.name] = (buckets[color.name] || 0) + 1;
    }
    if (revision !== imageRevision || !$('#upload-dialog').open) return;
    const ranked = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => colors.find(c => c.name === name).hex);
    draftPalette = [...ranked, ...['#e8dfcf', '#bda88a', '#292b2b']].slice(0, 3); draftImage = result;
    const preview = new Image(); preview.src = result; preview.alt = 'Vorschau deines neuen Outfits'; $('#upload-preview').replaceChildren(preview); $('#upload-preview').hidden = false; $('#upload-placeholder').hidden = true;
    if (!$('#outfit-name').value) $('#outfit-name').value = 'Mein neuer Look';
    renderPaletteEditor(); $('#save-outfit').disabled = false;
  } catch { if (revision === imageRevision) { draftImage = null; uploadError('Das Foto konnte nicht gelesen werden. Versuch ein anderes JPG, PNG oder WebP.'); } }
  finally { if (revision === imageRevision) $('#save-outfit').innerHTML = `Outfit speichern ${svg('arrow-right')}`; }
}
function deleteOutfit(id) {
  const removed = userOutfits.find(o => o.id === id); if (!removed) return;
  const index = userOutfits.indexOf(removed), next = userOutfits.filter(o => o.id !== id), oldSelected = selectedId;
  const newSelected = selectedId === id ? (next[0]?.id || sampleOutfits[0].id) : selectedId;
  if (!persist({ outfits: next, selectedId: newSelected })) return;
  userOutfits = next; selectedId = newSelected; renderOutfits(); renderProducts();
  notify('Outfit entfernt.', () => { const restored = [...userOutfits]; restored.splice(index, 0, removed); if (persist({ outfits: restored, selectedId: oldSelected })) { userOutfits = restored; selectedId = oldSelected; renderOutfits(); renderProducts(); notify('Dein Outfit ist wieder da.'); } });
}
function resetFilters() {
  category = 'Alle'; query = ''; sort = 'match'; budget = 50; experience?.resetFilters(); $('#search').value = ''; $('#sort').value = 'match'; persist(); renderProducts();
  if (view === 'merkliste' && !favorites.length) location.hash = 'entdecken';
}

document.addEventListener('click', event => {
  const b = event.target.closest('button,[data-discover]'); if (!b) return;
  if (b.dataset.close) { $(`#${b.dataset.close}`).close(); return; }
  if (b.dataset.outfit) return selectOutfit(b.dataset.outfit);
  if (b.dataset.discover) return selectOutfit(b.dataset.discover, true);
  if (b.dataset.product) return showProduct(b.dataset.product);
  if (b.dataset.save) return toggleFavorite(b.dataset.save);
  if (b.dataset.delete) return deleteOutfit(b.dataset.delete);
  if (b.dataset.category) { category = b.dataset.category; renderProducts(); return; }
  if (b.dataset.budget) { $('#budget-range').value = b.dataset.budget; $('#budget-output').textContent = `${b.dataset.budget} €`; $$('.budget-presets button').forEach(x => x.classList.toggle('active', x === b)); return; }
  switch (b.dataset.action) {
    case 'local-wardrobe': location.hash='outfits'; break;
    case 'upload': openUpload(); break;
    case 'profile': location.hash = 'profil'; break;
    case 'help': case 'privacy': case 'sources': showInfo(b.dataset.action); break;
    case 'info-upload': $('#info-dialog').close(); openUpload(); break;
    case 'search': $('#search-row').hidden = !$('#search-row').hidden; b.setAttribute('aria-expanded', !$('#search-row').hidden); if (!$('#search-row').hidden) $('#search').focus(); break;
    case 'close-search': $('#search-row').hidden = true; query = ''; $('#search').value = ''; $('.search-toggle').setAttribute('aria-expanded', false); renderProducts(); $('.search-toggle').focus(); break;
    case 'apply-budget': { const nextBudget = Number($('#budget-range').value); if (persist({ budget: nextBudget })) { budget = nextBudget; renderProducts(); } $('#budget-popover').hidePopover(); experience?.refresh(); break; }
    case 'reset-filters': resetFilters(); break;
    case 'dismiss-toast': $('#toast').hidden = true; break;
  }
});
$('#sort').addEventListener('change', e => { sort = e.target.value; renderProducts(); });
$('#search').addEventListener('input', e => { query = e.target.value; renderProducts(); });
$('#search').addEventListener('keydown', e => { if (e.key === 'Escape') $('[data-action=close-search]').click(); });
$('#budget-range').addEventListener('input', e => { $('#budget-output').textContent = `${e.target.value} €`; $$('.budget-presets button').forEach(b => b.classList.toggle('active', b.dataset.budget === e.target.value)); });
$('#upload-zone').addEventListener('click', () => $('#photo-input').click());
$('#photo-input').addEventListener('change', e => processPhoto(e.target.files[0]));
$('#upload-zone').addEventListener('dragover', e => { e.preventDefault(); $('#upload-zone').classList.add('dragging'); });
$('#upload-zone').addEventListener('dragleave', () => $('#upload-zone').classList.remove('dragging'));
$('#upload-zone').addEventListener('drop', e => { e.preventDefault(); $('#upload-zone').classList.remove('dragging'); processPhoto(e.dataTransfer.files[0]); });
$('#palette-editor').addEventListener('input', e => { if (e.target.dataset.paletteIndex !== undefined) { draftPalette[Number(e.target.dataset.paletteIndex)] = e.target.value; e.target.nextElementSibling.textContent = closestColor(e.target.value).name; } });
$('#outfit-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!draftImage) return uploadError('Wähle zuerst ein Outfit-Foto aus.');
  const name = $('#outfit-name').value.trim(), chosen = $$('input[name=style]:checked').map(x => x.value);
  if (!name) return uploadError('Gib deinem Look noch einen Namen.');
  if (!chosen.length) return uploadError('Wähle mindestens einen Stil aus.');
  if (userOutfits.length >= 15) return uploadError('Du hast 15 Outfits gespeichert. Entferne zuerst ein älteres Outfit.');
  const outfit = { id: crypto.randomUUID(), name, image: draftImage, palette: [...draftPalette], styles: chosen, sample: false };
  const next = [outfit, ...userOutfits];
  if (!persist({ outfits: next, selectedId: outfit.id })) return uploadError('Nicht genug lokaler Speicher. Entferne ein altes Outfit und versuch es erneut.');
  userOutfits = next; selectedId = outfit.id; $('#upload-dialog').close(); category = 'Alle'; query = ''; $('#search').value = ''; renderOutfits(); renderProducts();
  location.hash = 'entdecken'; notify('Dein Look ist bereit. Entdecke passende Teile.');
  $('#discover-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#toast-undo').addEventListener('click', () => { if (undoAction) { const undo = undoAction; undoAction = null; undo(); } });
$$('dialog').forEach(dialog => {
  dialog.addEventListener('click', e => { if (e.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); });
  dialog.addEventListener('close', () => {
    if (dialog.id === 'upload-dialog') imageRevision++;
    if (dialog.id === 'product-dialog') $('#product-grid').querySelector(`[data-product="${activeProductId}"]`)?.focus({ preventScroll: true });
  });
});
window.addEventListener('hashchange', () => { category = 'Alle'; query = ''; $('#search').value = ''; renderView(); window.scrollTo({ top: 0, behavior: 'instant' }); });
experience = createExperience({ esc, svg, money, notify, getProducts:()=>products, setProducts:next=>{products=next;}, getBudget:()=>budget, getOutfit:selectedOutfit, getFavorites:()=>favorites, setFavorites:next=>{if(!persist({favorites:next}))return false;favorites=next;renderProducts();if($('#product-dialog').open)updateDetailFavorite();return true;}, renderProducts, openProduct:showProduct });
localWardrobe=createLocalWardrobe({esc,svg,notify,hasColor:()=>!!experience.getProfile().color,applyLocalPalette:color=>experience.applyLocalPalette(color),useGarment:outfit=>{if(!validLocalOutfit(outfit))return;if(!persist({localOutfit:outfit,selectedId:outfit.id}))return;localOutfit=outfit;selectOutfit(outfit.id,true);}});
hydrateIcons(); renderView();
