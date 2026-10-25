// Sourced from the linked German product pages, checked manually on 25 October 2026.
// References never claim live stock or available sizes; the shop remains authoritative.
const shared = { category: 'Oberteile', audience: 'Herren', fit: 'Slim Fit', currency: 'EUR', priceStatus: 'reference', referenceAt: '2026-10-25T10:07:34.923005+00:00', available: null, sizes: [] };
const zaraURL = 'https://www.zara.com/de/de/basis-t-shirt-slim-fit--01-p05584401.html';
export const favoriteBrandProducts = [
  ...[
    ['545485813', 'Weiß', '#f4f1e9', 'neutral', 'white'],
    ['545485805', 'Marineblau', '#253b55', 'blue', 'navy'],
    ['545485807', 'Schwarz', '#292b2b', 'neutral', 'black'],
  ].map(([variant, color, hex, family, photo], index) => ({
    ...shared, id: `shop-wwwzaracom-basis-t-shirt-slim-fit--01-p05584401html-v1-${variant}`, order: index - 5,
    name: 'Basic T-Shirt Slim Fit /01', brand: 'Zara', price: 12.95,
    image: `assets/zara-slim-${photo}.jpg`, color, hex, family, styles: ['Casual','Minimal'],
    material: '95 % Baumwolle, 5 % Elastan', description: 'Schmales Basic aus elastischer Baumwolle mit Rundhalsausschnitt und kurzen Ärmeln. Leichter Stoff mit Stretch.',
    url: `${zaraURL}?v1=${variant}`, source: `${zaraURL}?v1=${variant}`,
  })),
  ...[
    ['dunkelblau','c43m8543992', 'Marineblau', '#253b55', 'blue', 7.99, 'navy'],
    ['schwarz','c378m8543994', 'Schwarz', '#292b2b', 'neutral', 9.99, 'black'],
  ].map(([slug, variant, color, hex, family, price, photo], index) => ({
    ...shared, id: `shop-wwwdecathlonde-${variant}`, order: index - 2,
    name: 'DOMYOS Slim T-Shirt 500', brand: 'Decathlon', price,
    image: `assets/decathlon-slim-${photo}.jpg`, color, hex, family, styles: ['Sporty','Casual','Minimal'],
    material: 'Dehnbarer Baumwollmix · Details im Shop', description: 'DOMYOS Slim-Shirt für Training und Alltag. Dehnbares Material für Bewegungsfreiheit, körpernaher Schnitt und Rundhalsausschnitt.',
    url: `https://www.decathlon.de/p/t-shirt-herren-slim-500-${slug}/307305/${variant}`, source: `https://www.decathlon.de/p/t-shirt-herren-slim-500-${slug}/307305/${variant}`,
  })),
];
