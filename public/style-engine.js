import { getRecommendations, closestColor } from './recommend.js';

export const fitOptions = [
  { id: 'athletic', name: 'Sportlich & körperbetont', short: 'Muscle / Athletic', detail: 'Brust und Oberarme betont, zur Taille schmaler.' },
  { id: 'slim', name: 'Schmal, mit etwas Luft', short: 'Slim Fit', detail: 'Körpernah, ohne Kompressionsgefühl.' },
  { id: 'regular', name: 'Gerade & entspannt', short: 'Regular Fit', detail: 'Ein gerader Schnitt mit Bewegungsfreiheit.' },
  { id: 'relaxed', name: 'Locker & oversized', short: 'Relaxed / Oversized', detail: 'Mehr Volumen und eine weitere Silhouette.' },
];
export const seasons = {
  spring: { name: 'Frühling', description: 'Warm, hell und eher klar.', palette: ['#e7c491', '#759a79', '#d58d78', '#70a8a4', '#f2e6ce', '#986641'] },
  summer: { name: 'Sommer', description: 'Kühl, weich und eher gedämpft.', palette: ['#93a4b9', '#b090a4', '#8e9f96', '#798597', '#d0c6c9', '#61798b'] },
  autumn: { name: 'Herbst', description: 'Warm, erdig und eher gedämpft.', palette: ['#747950', '#a87947', '#974d3d', '#b99d77', '#426b65', '#624638'] },
  winter: { name: 'Winter', description: 'Kühl, kontrastreich und eher klar.', palette: ['#243748', '#8b314c', '#216c62', '#f1f0ed', '#292a30', '#6b5793'] },
};
export function detectFit(text = '') {
  const t = text.toLocaleLowerCase('de');
  if (/muscle[\s-]?fit|muscle\b|athletic[\s-]?fit|athletische? passform|body[\s-]?fit|körperbetont|eng an (armen|ärmeln|brust)/.test(t)) return { id: 'athletic', label: 'Muscle / Athletic Fit', evidence: 'Schnitt aus dem Produkttext' };
  if (/oversiz|boxy|boxfit|relaxed|loose[\s-]?fit|lockere? passform|weit geschnitten/.test(t)) return { id: 'relaxed', label: /oversiz|boxy|boxfit/.test(t) ? 'Oversized / Box Fit' : 'Relaxed Fit', evidence: 'Schnitt aus dem Produkttext' };
  if (/slim[\s-]?fit|slim\b|fitted|schmale? passform|körpernah/.test(t)) return { id: 'slim', label: 'Slim Fit', evidence: 'Schnitt aus dem Produkttext' };
  if (/regular|straight|gerader schnitt|normale? passform/.test(t)) return { id: 'regular', label: 'Regular Fit', evidence: 'Schnitt aus dem Produkttext' };
  return { id: 'unknown', label: 'Schnitt offen', evidence: 'Keine eindeutige Schnittangabe im Produkttext' };
}
export function normalizeBrand(name) { return String(name).trim().replace(/\s+/g, ' ').slice(0, 40); }
export function sameBrand(a, b) { return a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de'); }
export function fitFor(product) {
  const explicit = detectFit(product.fit);
  return explicit.id !== 'unknown' ? explicit : detectFit([product.name, product.description].filter(Boolean).join(' '));
}
export function rgbToLab(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const xyz = [(.4124564 * rgb[0] + .3575761 * rgb[1] + .1804375 * rgb[2]) / .95047, .2126729 * rgb[0] + .7151522 * rgb[1] + .072175 * rgb[2], (.0193339 * rgb[0] + .119192 * rgb[1] + .9503041 * rgb[2]) / 1.08883].map(v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
}
export function colorDistance(a, b) { const x = rgbToLab(a), y = rgbToLab(b); return Math.hypot(...x.map((v, i) => v - y[i])); }
export function seasonFromSamples({ skin, hair, eyes, quality = [] }) {
  const s = rgbToLab(skin), h = rgbToLab(hair), e = rgbToLab(eyes);
  const contrast = Math.max(s[0], h[0], e[0]) - Math.min(s[0], h[0], e[0]);
  // A photo gives a tentative palette, not a calibrated measurement of natural undertone.
  const warmth = s[2] - .85 * s[1];
  const warm = warmth > 5;
  const season = warm ? (contrast < 43 && h[0] > 32 ? 'spring' : 'autumn') : contrast > 48 ? 'winter' : 'summer';
  return { season, skin, hair, eyes, contrast: Math.round(contrast), undertone: Math.abs(warmth - 5) < 4 ? 'neutral' : warm ? 'warm' : 'cool', quality, method: 'local-face-landmarks-v1', analyzedAt: new Date().toISOString() };
}
export function preferenceReasons(product, profile, votes = {}) {
  const fit = fitFor(product), reasons = [];
  let score = 0;
  const favoriteBrand = profile.brands?.some(b => sameBrand(b, product.brand));
  if (favoriteBrand) { score += 12; reasons.push(`${product.brand} ist eine deiner Lieblingsmarken.`); }
  if (fit.id === profile.fit || (profile.fit === 'athletic' && fit.id === 'slim')) { score += fit.id === profile.fit ? 10 : 5; reasons.push(fit.id === 'athletic' ? 'Der körperbetonte Schnitt passt zu deinem Wunsch.' : `${fit.label} passt zu deiner Schnitt-Vorliebe.`); }
  else if (product.category === 'Oberteile' && profile.fit === 'athletic' && fit.id === 'relaxed') score -= 9;
  const palette = seasons[profile.color?.season]?.palette;
  if (palette && product.hex) {
    const distance = Math.min(...palette.map(c => colorDistance(c, product.hex)));
    if (distance < 29) { score += 7 - distance / 10; reasons.push(`${product.color} liegt nah an deiner ${seasons[profile.color.season].name}-Palette.`); }
  }
  let learned = 0, matchingLikes = 0;
  for (const vote of Object.values(votes)) {
    const direction = vote.decision === 'like' ? 1 : -1;
    const similarity = (sameBrand(vote.brand || '', product.brand) ? 2 : 0) + (vote.fit === fit.id && fit.id !== 'unknown' ? 2 : 0) + (vote.family === product.family ? 1 : 0);
    learned += direction * similarity;
    if (direction > 0 && similarity >= 3) matchingLikes++;
  }
  score += Math.max(-12, Math.min(12, learned));
  if (matchingLikes) reasons.push('Ähnlicher Schnitt oder Farbton wie bei deinen Likes.');
  return { score, reasons, fit };
}
export function rankProducts(products, outfit, options = {}) {
  const { profile = {}, votes = {}, fitFilter = 'all', brandsOnly = false, unseen = false } = options;
  const filtered = getRecommendations(products, outfit, options).filter(p =>
    (!unseen || !votes[p.id]) &&
    (!brandsOnly || profile.brands?.some(b => sameBrand(b, p.brand))) &&
    (fitFilter === 'all' || fitFor(p).id === fitFilter) && p.available !== false &&
    (!profile.size || !Array.isArray(p.sizes) || !p.sizes.length || p.sizes.some(s => String(s).replace(/^2XL$/,'XXL') === profile.size))
  ).map(p => {
    const personal = preferenceReasons(p, profile, votes);
    return { ...p, personal, match: { ...p.match, score: p.match.score + personal.score, label: personal.reasons.length ? personal.reasons[0].replace(/\.$/, '') : p.match.label } };
  });
  if (!options.sort || options.sort === 'match') filtered.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return filtered;
}
export function sanitizeProfile(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  const color = v.color && seasons[v.color.season] ? { ...v.color, season: v.color.season } : null;
  return { fit: fitOptions.some(f => f.id === v.fit) ? v.fit : 'athletic', brands: Array.isArray(v.brands) ? [...new Set(v.brands.filter(b => typeof b === 'string').map(normalizeBrand).filter(Boolean))].slice(0, 20) : ['Zara','Decathlon'], size: ['','XS','S','M','L','XL','XXL','3XL'].includes(v.size) ? v.size : '', color };
}
