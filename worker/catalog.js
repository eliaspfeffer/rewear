import { detectFit } from '../public/style-engine.js';

export const shops = {
  zara: { name: 'Zara', host: 'www.zara.com', collection: '/de/de/herren-t-shirts-basics-l856.html', product: /^\/de\/de\/[a-z0-9-]+-p\d+\.html$/i },
  decathlon: { name: 'Decathlon', host: 'www.decathlon.de', collection: '/alle-sportarten-a-z/fitness/t-shirt-fitness-herren', product: /^\/p\/[a-z0-9-]+\/(?:\d+\/(?:c\d+)*m\d+|_\/R-p-\d+)\/?$/i },
  teeshoppen: { name: 'TeeShoppen', host: 'teeshoppen.de', collection: '/collections/tiefe-ausschnitt-t-shirts-herren', product: /^\/products\/[a-z0-9-]+\/?$/i },
  gymshark: { name: 'Gymshark', host: 'de.gymshark.com', collection: '/collections/muscle-fit-shirts/mens', product: /^\/products\/[a-z0-9-]+\/?$/i },
  hm: { name: 'H&M', host: 'www2.hm.com', collection: '/de_de/herren/produkte/t-shirts-tanktops/kurzarm.html', product: /^\/de_de\/productpage\.\d+\.html$/ },
  uniqlo: { name: 'UNIQLO', host: 'www.uniqlo.com', collection: '/de/de/men/tops/t-shirts', product: /^\/de\/de\/products\/E\d+-\d+\/\d+\/?$/ },
};
export function allowedProductURL(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Bitte füge einen vollständigen HTTPS-Produktlink ein.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Bitte nutze einen normalen HTTPS-Produktlink ohne Zugangsdaten.');
  const entry = Object.entries(shops).find(([,s]) => s.host === url.hostname && s.product.test(url.pathname));
  if (!entry) throw new Error('Direkter Import unterstützt aktuell Zara DE, Decathlon DE, TeeShoppen, Gymshark DE, H&M DE und UNIQLO DE. Deine Marke kannst du unabhängig davon im Profil merken.');
  // Zara uses v1 for the selected color. Drop tracking, but preserve this identity.
  const variant = entry[0] === 'zara' && /^\d{1,15}$/.test(url.searchParams.get('v1') || '') ? url.searchParams.get('v1') : null;
  url.hash = ''; url.search = ''; if (variant) url.searchParams.set('v1', variant);
  return { url, key: entry[0], shop: entry[1] };
}
const plain = text => String(text || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g, ' ').trim();
function flattenLD(value, depth = 0) {
  if (depth > 6 || !value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(v => flattenLD(v, depth + 1));
  return [value, ...flattenLD(value['@graph'], depth + 1)];
}
export function structuredProducts(html) {
  const result = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { result.push(...flattenLD(JSON.parse(match[1])).filter(x => ['Product','ProductGroup'].some(t => (Array.isArray(x['@type']) ? x['@type'] : [x['@type']]).includes(t)))); } catch { /* Ignore unrelated malformed structured-data scripts. */ }
  }
  return result;
}
const colorNames = [
  ['Bordeaux', '#843a4d', 'red', /bordeaux|burgunder|burgundy|wine|weinrot/i],
  ['Oliv', '#73785b', 'earth', /armeegr|army|olive|oliv|khaki/i],
  ['Schwarz', '#292b2b', 'neutral', /schwarz|black/i],
  ['Weiß', '#f4f1e9', 'neutral', /weiß|weiss|white/i],
  ['Creme', '#e8dfcf', 'neutral', /creme|cream|ivory|off.white/i],
  ['Beige', '#bda88a', 'earth', /beige|sand|taupe/i],
  ['Braun', '#725144', 'earth', /braun|brown|espresso/i],
  ['Blau', '#48617d', 'blue', /blau|blue|navy|marine/i],
  ['Grau', '#939390', 'neutral', /grau|grey|gray|marl/i],
  ['Grün', '#486b59', 'earth', /grün|grun|green/i],
  ['Rosa', '#be8f9f', 'red', /rosa|pink|rose/i],
];
export function productFromLD(product, sourceURL, shop, checkedAt = new Date().toISOString()) {
  const source = allowedProductURL(sourceURL).url;
  const variants = Array.isArray(product.hasVariant) ? product.hasVariant : [product];
  let offers = variants.flatMap(v => (Array.isArray(v.offers) ? v.offers : [v.offers]).filter(Boolean).map(o => ({ ...o.priceSpecification, ...o, size: plain(v.size || ''), variantName: plain(v.name), variantImage: v.image, variantColor: v.color }))).filter(o => {
    if (!o.url) return true;
    try {
      const target = allowedProductURL(new URL(o.url,source).href).url;
      return target.pathname === source.pathname && (!source.search || target.search === source.search);
    } catch { return false; }
  });
  if (shop.host === 'www.zara.com' && !source.search && offers[0]?.url) {
    try {
      source.search = allowedProductURL(new URL(offers[0].url,source).href).url.search;
      offers = offers.filter(o => !o.url || allowedProductURL(new URL(o.url,source).href).url.search === source.search);
    } catch { return null; }
  }
  const priced = offers.filter(o => String(o.priceCurrency).toUpperCase() === 'EUR' && Number.isFinite(Number(o.price ?? o.lowPrice)) && Number(o.price ?? o.lowPrice) > 0);
  if (!priced.length) return null;
  const stock = priced.filter(o => /InStock|LimitedAvailability|PreOrder/i.test(o.availability || ''));
  const chosen = (stock.length ? stock : priced).sort((a,b) => Number(a.price ?? a.lowPrice) - Number(b.price ?? b.lowPrice))[0];
  const knownStock = priced.some(o => /InStock|OutOfStock|SoldOut|LimitedAvailability|PreOrder/i.test(o.availability || ''));
  const images = chosen.variantImage || product.image;
  const image = typeof images === 'string' ? images : Array.isArray(images) ? images[0] : images?.url;
  if (typeof image !== 'string' || !/^https:\/\//.test(image)) return null;
  const name = plain(product.name).slice(0, 120), description = plain(product.description).slice(0, 1500);
  const color = colorNames.find(([, , , pattern]) => pattern.test(chosen.variantColor || '')) || colorNames.find(([, , , pattern]) => pattern.test(name)) || ['Farbe im Shop', '#939390', 'neutral'];
  const fit = detectFit(`${name} ${description}`);
  const id = `shop-${source.hostname.replace(/[^a-z0-9]/g,'')}-${source.pathname.split('/').filter(Boolean).at(-1).replace(/[^a-z0-9-]/gi,'').slice(0,90)}${source.searchParams.has('v1') ? '-v1-' + source.searchParams.get('v1') : ''}`;
  const sizes = [...new Set(stock.map(o => o.size).filter(Boolean))].slice(0,20);
  const body = name.toLowerCase();
  const category = /hose|jeans|pants|trouser/.test(body) ? 'Hosen' : /jacke|jacket|overshirt|hoodie|sweatshirt/.test(body) ? 'Layering' : 'Oberteile';
  return { id, name, brand: shop.name, price: Number(chosen.price ?? chosen.lowPrice), priceFrom: new Set((stock.length?stock:priced).map(o=>Number(o.price??o.lowPrice))).size>1, currency: 'EUR', image, category, color: color[0], hex: color[1], family: color[2], styles: /sport|train|gym|drymove|seamless/i.test(name+' '+description) ? ['Sporty','Casual'] : ['Casual','Minimal'], fit: fit.label, description, material: description.match(/\d+\s*%\s*(?:Bio-)?(?:Baumwolle|Polyester|cotton)/i)?.[0] || 'Material im Shop prüfen', audience: 'Herren', url: source.href, source: source.href, checkedAt, priceStatus: 'checked', available: knownStock ? stock.length > 0 : null, sizes, order: 100, pack: /pack|paket|\d+\s*(?:stück|stk)/i.test(name) };
}
export function productLinks(html, baseURL, shopKey, fit = 'athletic') {
  const candidates = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const target = allowedProductURL(new URL(match[1].replace(/&amp;/g,'&'), baseURL).href);
      if (target.key !== shopKey) continue;
      const label = plain(match[2]);
      if (/paket|pack|\d+\s*(?:stück|stk)/i.test(label+' '+target.url.pathname)) continue;
      const priority = fit === 'athletic' && /muscle|athletic|slim/i.test(label+' '+target.url.pathname) ? 2 : 0;
      candidates.push({ url: target.url.href, priority });
    } catch { /* Collection navigation and other domains are not product imports. */ }
  }
  return [...new Map(candidates.sort((a,b)=>b.priority-a.priority).map(c=>[c.url,c])).values()].slice(0,8).map(c=>c.url);
}
async function htmlFor(url, shop, redirects = 0) {
  if (url.hostname !== shop.host || url.protocol !== 'https:' || redirects > 2) throw new Error('Der Shop hat auf eine nicht unterstützte Adresse weitergeleitet.');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/html,application/xhtml+xml' } });
  if ([301,302,303,307,308].includes(response.status)) {
    const location = response.headers.get('location'); if (!location) throw new Error('Der Shop hat keine gültige Weiterleitung geliefert.');
    return htmlFor(new URL(location,url),shop,redirects+1);
  }
  if (!response.ok) throw new Error(response.status === 429 ? 'Der Shop begrenzt gerade die Abfragen. Bitte später erneut versuchen.' : response.status === 403 ? 'Der Shop blockiert den automatischen Abruf. Der direkte Shop-Link funktioniert unabhängig davon.' : `Der Shop antwortet gerade nicht wie erwartet (${response.status}).`);
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  for (;;) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > 2_500_000) { await reader.cancel(); throw new Error('Die Shop-Seite ist zu groß für diesen Abruf.'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
const cache = new Map();
export async function importProduct(input) {
  const { url, shop } = allowedProductURL(input), previous = cache.get(url.href);
  if (previous && Date.now() - previous.at < 10 * 60_000) return previous.product;
  const html = await htmlFor(url, shop);
  const group = structuredProducts(html).sort((a,b) => (b['@type'] === 'ProductGroup') - (a['@type'] === 'ProductGroup'));
  const product = group.map(p => productFromLD(p, url.href, shop)).find(Boolean);
  if (!product) throw new Error('Dieser Shop liefert gerade keine lesbaren Produktdaten mit EUR-Preis. Der Link bleibt als Inspiration gespeichert.');
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(url.href, {at:Date.now(),product}); return product;
}
export async function discoverProducts(key, fit) {
  const shop = shops[key]; if (!shop) throw new Error('Für diese Marke ist noch keine direkte Shop-Abfrage verfügbar.');
  const collectionURL = new URL(shop.collection, `https://${shop.host}`);
  const html = await htmlFor(collectionURL,shop);
  const links = productLinks(html,collectionURL.href,key,fit);
  if (!links.length) throw new Error('Der Shop liefert gerade keine lesbare Produktliste. Vorhandene Treffer bleiben erhalten.');
  const products = [], errors = [];
  // Keep public retailer requests bounded; do not retry blocked or throttled calls.
  for (let i=0;i<links.length;i+=2) {
    const batch = await Promise.allSettled(links.slice(i,i+2).map(importProduct));
    for (const item of batch) { if (item.status === 'fulfilled') products.push(item.value); else errors.push(item.reason.message); }
    if (errors.some(e=>/begrenzt|blockiert/.test(e))) break;
  }
  if (!products.length) throw new Error(errors[0] || 'Keine aktuellen Produktdaten erhalten.');
  return { products, partial: errors.length > 0, message: errors.length ? 'Einige Produktseiten konnten nicht gelesen werden.' : null };
}
export async function handleAPI(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  if (request.method !== 'GET') return json({error:'Diese Aktion unterstützt nur lesende Anfragen.'},405);
  try {
    if (url.pathname === '/api/product') return json({product:await importProduct(url.searchParams.get('url') || '')});
    if (url.pathname === '/api/discover') return json(await discoverProducts(url.searchParams.get('shop'),url.searchParams.get('fit')));
    return json({error:'Unbekannte Funktion.'},404);
  } catch(error) { return json({error: error.name === 'TimeoutError' ? 'Der Shop braucht zu lange. Versuche es später erneut.' : error.message},422); }
}
