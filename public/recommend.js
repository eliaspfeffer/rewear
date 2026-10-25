export const styles = ['Casual', 'Minimal', 'Streetwear', 'Smart Casual', 'Sporty', 'Vintage'];
export const colors = [
  { name: 'Creme', hex: '#e8dfcf', family: 'neutral' },
  { name: 'Beige', hex: '#bda88a', family: 'earth' },
  { name: 'Schwarz', hex: '#292b2b', family: 'neutral' },
  { name: 'Weiß', hex: '#f4f1e9', family: 'neutral' },
  { name: 'Braun', hex: '#725144', family: 'earth' },
  { name: 'Oliv', hex: '#73785b', family: 'earth' },
  { name: 'Blau', hex: '#48617d', family: 'blue' },
  { name: 'Bordeaux', hex: '#843a4d', family: 'red' },
  { name: 'Grau', hex: '#939390', family: 'neutral' },
];
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
export function closestColor(hex) {
  const [r, g, b] = rgb(hex);
  return colors.reduce((best, c) => {
    const q = rgb(c.hex);
    const distance = Math.hypot(r - q[0], g - q[1], b - q[2]);
    return distance < best.distance ? { ...c, distance } : best;
  }, { distance: Infinity });
}
export function explainMatch(product, outfit) {
  const common = product.styles.filter(s => outfit.styles.includes(s));
  const palette = outfit.palette.map(closestColor);
  const same = palette.find(c => c.name === product.color);
  const related = palette.find(c => c.family === product.family);
  const neutral = product.family === 'neutral';
  const colorScore = same ? 3 : related ? 2 : neutral ? 1 : 0;
  const colorReason = same ? `${product.color} greift eine Farbe deines Looks auf.` : related ? `${product.color} ergänzt die ${product.family === 'earth' ? 'warmen Naturtöne' : 'Farbfamilie'} deines Looks.` : neutral ? `Der neutrale Farbton lässt sich leicht mit deiner Palette kombinieren.` : `${product.color} setzt einen bewussten Farbkontrast.`;
  return { score: common.length * 4 + colorScore, common, colorReason, styleReason: common.length ? `${common[0]} verbindet dieses Teil mit deinem Outfit.` : 'Ein neuer Stil-Akzent für deinen Look.', label: common.length && colorScore ? 'Passt zu deinem Look' : common.length ? 'Dein Stil, neu kombiniert' : 'Eine neue Idee für dich' };
}
export function getRecommendations(products, outfit, { budget = 50, category = 'Alle', query = '', sort = 'match', favorites = null } = {}) {
  const needle = query.trim().toLocaleLowerCase('de');
  return products.filter(p => p.price <= budget && (category === 'Alle' || p.category === category) && (!favorites || favorites.includes(p.id)) && (!needle || `${p.name} ${p.brand} ${p.color} ${p.category} ${p.styles.join(' ')}`.toLocaleLowerCase('de').includes(needle)))
    .map(p => ({ ...p, match: explainMatch(p, outfit) }))
    .sort((a, b) => sort === 'price' ? a.price - b.price : sort === 'price-desc' ? b.price - a.price : b.match.score - a.match.score || a.order - b.order);
}
