import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFit, rankProducts, preferenceReasons, colorDistance, seasonFromSamples, sanitizeProfile } from '../public/style-engine.js';
import { products, sampleOutfits } from '../public/data.js';
const outfit = sampleOutfits[0];
test('cut extraction distinguishes muscle, slim, relaxed and missing evidence',()=>{
  assert.equal(detectFit('Muscle Fit, eng an Armen, Brust und Taille').id,'athletic');
  assert.equal(detectFit('Slim Fit Pima T-Shirt').id,'slim');
  assert.equal(detectFit('Oversized T-Shirt').id,'relaxed');
  assert.equal(detectFit('Stretch cotton jersey').id,'unknown');
});
test('a sport preference promotes athletic cuts and ignores already rated cards',()=>{
  const athletic={...products[0],id:'test-athletic',fit:'Muscle Fit',price:20,order:2};
  const loose={...athletic,id:'test-loose',fit:'Oversized Fit',order:1};
  const ranked=rankProducts([loose,athletic],outfit,{budget:50,profile:{fit:'athletic',brands:[]}});
  assert.equal(ranked[0].id,athletic.id);
  assert.equal(rankProducts([loose,athletic],outfit,{profile:{fit:'athletic'},unseen:true,votes:{'test-athletic':{decision:'like',brand:athletic.brand}}})[0].id,loose.id);
});
test('brand, cut filter, budget and likes combine without leaking rejected cards',()=>{
  const a={...products[0],id:'a',brand:'Favorite',fit:'Muscle Fit',price:15};
  const b={...a,id:'b',brand:'Other',price:10};
  const expensive={...a,id:'c',price:90};
  const list=rankProducts([b,expensive,a],outfit,{budget:30,profile:{fit:'athletic',brands:['favorite']},brandsOnly:true,fitFilter:'athletic'});
  assert.deepEqual(list.map(p=>p.id),['a']);
  assert.deepEqual(rankProducts([a,b],outfit,{profile:{brands:[]},brandsOnly:true}),[]);
});
test('likes affect the ranking of a different product through shared features',()=>{
  const p={...products[0],brand:'Gymshark',fit:'Muscle Fit',family:'neutral'};
  const before=preferenceReasons(p,{fit:'regular',brands:[]},{}).score;
  const after=preferenceReasons(p,{fit:'regular',brands:[]},{one:{decision:'like',brand:'Gymshark',fit:'athletic',family:'neutral'}});
  assert.ok(after.score>before);assert.ok(after.reasons.some(r=>/Likes/.test(r)));
});
test('photo palette is a tentative result and contrast math remains bounded',()=>{
  assert.ok(colorDistance('#ffffff','#000000')>95);assert.equal(colorDistance('#843a4d','#843a4d'),0);
  const result=seasonFromSamples({skin:'#caa086',hair:'#48352c',eyes:'#485953',quality:['Licht prüfen']});
  assert.ok(['spring','summer','autumn','winter'].includes(result.season));assert.equal(result.method,'local-face-landmarks-v1');assert.deepEqual(result.quality,['Licht prüfen']);
  assert.equal(sanitizeProfile({fit:'bogus',brands:[' Gymshark ',{},'']}).fit,'athletic');
});
