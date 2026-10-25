import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecommendations, explainMatch, closestColor } from '../public/recommend.js';
import { products, sampleOutfits } from '../public/data.js';
const outfit = sampleOutfits[0];
test('budget boundary and category both constrain recommendations', () => {
  const list = getRecommendations(products, outfit, { budget: 14.9, category: 'Oberteile' });
  assert.ok(list.length > 0);
  assert.ok(list.every(p => p.price <= 14.9 && p.category === 'Oberteile'));
  assert.ok(list.some(p => p.price === 14.9));
  assert.equal(getRecommendations(products, outfit, { budget: 5 }).length, 0);
});
test('a matching palette and style ranks above an unrelated style', () => {
  const exact = { ...products[0], styles: ['Casual'], color: 'Creme', family: 'neutral' };
  const other = { ...products[0], styles: ['Sporty'], color: 'Blau', family: 'blue' };
  assert.ok(explainMatch(exact, outfit).score > explainMatch(other, outfit).score);
  assert.match(explainMatch(exact, outfit).colorReason, /greift eine Farbe/);
});
test('changing the outfit changes style matching', () => {
  const tee = products.find(p => p.id === 'u-dry');
  const sporty = { ...outfit, styles: ['Sporty'], palette: ['#48617d'] };
  const smart = { ...outfit, styles: ['Smart Casual'], palette: ['#843a4d'] };
  assert.ok(explainMatch(tee, sporty).score > explainMatch(tee, smart).score);
});
test('search, ascending prices and favorites compose correctly', () => {
  const list = getRecommendations(products, outfit, { query: '  uniqlo ', sort: 'price', favorites: ['u-tee', 'u-dry'] });
  assert.deepEqual(list.map(p => p.id), ['u-dry', 'u-tee']);
  assert.equal(getRecommendations(products, outfit, { favorites: [] }).length, 0);
  assert.equal(getRecommendations(products, outfit, { query: '<script>' }).length, 0);
});
test('palette detection selects the closest named swatch', () => {
  assert.equal(closestColor('#e8dfcf').name, 'Creme');
  assert.equal(closestColor('#000000').name, 'Schwarz');
});
