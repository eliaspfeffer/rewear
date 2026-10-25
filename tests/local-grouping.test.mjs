import test from 'node:test';
import assert from 'node:assert/strict';
import {distance,hashDistance,colorDistance,sameGarmentCandidate,similarGarment,splitMember,mergeGroups} from '../local/grouping.mjs';
const crop={id:'a',source:'photo-1',kind:'top',label:'T-Shirt',feature:[0.1,0.2,0.3],palette:['#202020'],hash:'aaaaaaaaaaaaaaaa'};
test('local clothing similarity requires valid garment features and color evidence',()=>{
  assert.equal(distance([0,1],[0,1]),0);assert.equal(distance([NaN],[1]),Infinity);assert.equal(distance([1],[1,2]),Infinity);
  assert.equal(hashDistance('0000000000000000','ffffffffffffffff'),64);assert.equal(hashDistance(crop.hash,crop.hash),0);
  assert.equal(colorDistance('#000000','#000000'),0);assert.ok(colorDistance('#000000','#ffffff')>1.7);
  assert.equal(sameGarmentCandidate(crop,{...crop,source:'photo-2'}),true);
  for(const change of [{source:'photo-1'},{source:'photo-2',kind:'bottom'},{source:'photo-2',palette:['#ffffff']},{source:'photo-2',feature:[1,1,1]},{source:'photo-2',label:'Jacke'}])assert.equal(sameGarmentCandidate(crop,{...crop,...change}),false);
  assert.equal(similarGarment(crop,{...crop,feature:[0.3,0.3,0.3]}),true);
});
test('merging and splitting preserve observations and reject invalid targets',()=>{
  let groups=[{id:'a',name:'Shirt',members:['a','b']},{id:'c',name:'Shirt 2',members:['c']}];
  const separated=splitMember(groups,'a','b');assert.equal(separated.id,'b');assert.deepEqual(groups[0].members,['a']);
  groups=mergeGroups(groups,'b','c');assert.deepEqual(groups.find(g=>g.id==='c').members,['c','b']);
  assert.deepEqual(groups.flatMap(g=>g.members).sort(),['a','b','c']);
  assert.throws(()=>splitMember(groups,'a','a'));assert.throws(()=>mergeGroups(groups,'a','a'));assert.throws(()=>mergeGroups(groups,'missing','a'));
  const original=[{id:'a',name:'Shirt',members:['a','b']}];splitMember(original,'a','a');assert.equal(new Set(original.map(g=>g.id)).size,2);
});
