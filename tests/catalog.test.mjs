import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedProductURL, shops, structuredProducts, productFromLD, productLinks, handleAPI } from '../worker/catalog.js';
const url='https://teeshoppen.de/products/test-muscle-shirt';
const fixture={ '@type':'ProductGroup',name:'Muscle T-Shirt - Schwarz',description:'Muscle Fit. 100% Baumwolle.',image:['https://cdn.shopify.com/test.jpg'],hasVariant:[{name:'M',size:'M',offers:{price:27,priceCurrency:'EUR',availability:'https://schema.org/OutOfStock'}},{name:'L',size:'L',offers:{price:29,priceCurrency:'EUR',availability:'https://schema.org/InStock'}}] };
test('import allowlist rejects local networks, credentials and disguised domains',()=>{
  for(const value of ['http://127.0.0.1/','https://localhost/products/x','https://teeshoppen.de.evil.test/products/x','https://u:p@teeshoppen.de/products/x','https://teeshoppen.de:8080/products/x','file:///etc/passwd','https://teeshoppen.de/admin'])assert.throws(()=>allowedProductURL(value));
  assert.equal(allowedProductURL(url+'?tracking=1').url.href,url);
});
test('structured data handles graph scripts and chooses an actual available variant price',()=>{
  const html=`<script type="application/ld+json">${JSON.stringify({'@graph':[fixture]})}</script>`;
  const p=productFromLD(structuredProducts(html)[0],url,shops.teeshoppen,'2026-10-25T08:00:00.000Z');
  assert.equal(p.price,29);assert.deepEqual(p.sizes,['L']);assert.equal(p.available,true);assert.equal(p.fit,'Muscle / Athletic Fit');assert.equal(p.priceStatus,'checked');
});
test('unknown stock is not represented as in stock, and USD is not mislabeled as EUR',()=>{
  const p=productFromLD({...fixture,hasVariant:[{offers:{price:30,priceCurrency:'EUR'}}]},url,shops.teeshoppen);
  assert.equal(p.available,null);
  assert.equal(productFromLD({...fixture,hasVariant:[{offers:{price:30,priceCurrency:'USD'}}]},url,shops.teeshoppen),null);
});
test('collection parsing deduplicates, rejects other domains and keeps bundle totals intact',()=>{
  const html='<a href="/products/muscle-shirt">Muscle Shirt</a><a href="/products/muscle-shirt">Same</a><a href="https://evil.test/products/muscle">Other</a><a href="/products/muscle-pack">3 Stück Paket</a>';
  assert.deepEqual(productLinks(html,'https://teeshoppen.de/collections/test','teeshoppen'),['https://teeshoppen.de/products/muscle-shirt']);
  const p=productFromLD({...fixture,name:'3er-Pack Muscle Shirts'},url,shops.teeshoppen);assert.equal(p.price,29);assert.equal(p.pack,true);
});
test('API rejects unsafe imports and mutations without fetching',async()=>{
  const unsafe=await handleAPI(new Request('https://rewear.test/api/product?url=http://127.0.0.1'));
  assert.equal(unsafe.status,422);
  const mutation=await handleAPI(new Request('https://rewear.test/api/product',{method:'POST'}));assert.equal(mutation.status,405);
});
test('Zara retains a numeric color identity and rejects unrelated retailer paths',()=>{
  const zara='https://www.zara.com/de/de/basis-t-shirt-slim-fit--01-p05584401.html?v1=545485807';
  assert.equal(allowedProductURL(zara+'&tracking=1#image').url.href,zara);
  assert.equal(allowedProductURL('https://www.decathlon.de/p/t-shirt-herren-slim-500-schwarz/307305/c378m8543994').key,'decathlon');
  for(const value of ['https://www.zara.com/admin','https://www.zara.com.evil.test/de/de/a-p1.html','https://www.decathlon.de/api/user','https://www.decathlon.de/p/a/307305/c378m8543994/extra'])assert.throws(()=>allowedProductURL(value));
});
test('Zara color, image, sizes and price stay with the selected variant',()=>{
  const base='https://www.zara.com/de/de/basis-t-shirt-slim-fit--01-p05584401.html';
  const variant=(color,id,price,size,stock)=>({name:'Slim Fit T-Shirt',color,image:[`https://static.zara.net/${color}.jpg`],size,offers:{url:base+'?v1='+id,price,priceCurrency:'EUR',availability:'https://schema.org/'+stock}});
  const group={'@type':'ProductGroup',name:'Slim Fit Basic',hasVariant:[variant('Weiß','11',10,'S','InStock'),variant('Schwarz','22',12.95,'M','InStock'),variant('Schwarz','22',12.95,'L','OutOfStock')]};
  const p=productFromLD(group,base+'?v1=22',shops.zara);
  assert.equal(p.price,12.95);assert.equal(p.color,'Schwarz');assert.deepEqual(p.sizes,['M']);assert.equal(p.image,'https://static.zara.net/Schwarz.jpg');assert.equal(p.url,base+'?v1=22');assert.match(p.id,/-v1-22$/);
  const defaultVariant=productFromLD(group,base,shops.zara);assert.equal(defaultVariant.color,'Weiß');assert.equal(defaultVariant.url,base+'?v1=11');
});
test('Decathlon price specifications and product identity prevent mixing color prices',()=>{
  const navy='https://www.decathlon.de/p/t-shirt-herren-slim-500-dunkelblau/307305/c43m8543992';
  const black='https://www.decathlon.de/p/t-shirt-herren-slim-500-schwarz/307305/c378m8543994';
  const p={'@type':'Product',name:'T-Shirt Herren Slim 500 schwarz',image:'https://contents.mediadecathlon.com/test.jpg',offers:{url:black,availability:'https://schema.org/InStock',priceSpecification:{price:9.99,priceCurrency:'EUR'}}};
  const result=productFromLD(p,black,shops.decathlon);assert.equal(result.price,9.99);assert.equal(result.available,true);assert.equal(result.brand,'Decathlon');assert.equal(result.fit,'Slim Fit');
  assert.equal(productFromLD(p,navy,shops.decathlon),null);
  assert.equal(productFromLD({...p,offers:{...p.offers,priceSpecification:{price:9.99,priceCurrency:'USD'}}},black,shops.decathlon),null);
});
