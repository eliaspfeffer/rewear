import assert from 'node:assert/strict';
import http from 'node:http';
const origin='http://127.0.0.1:4175';
const state=await fetch(origin+'/api/local/state').then(r=>r.json());
assert.equal(state.local,true);
assert.ok(Array.isArray(state.groups));
const serialized=JSON.stringify(state);
assert.equal(serialized.includes('"feature":'),false,'Garment embeddings must not be returned to the browser');
assert.equal(serialized.includes('Library/Application Support'),false,'Filesystem paths stay private');
for(const headers of [{Origin:'https://example.com'},{'Sec-Fetch-Site':'cross-site'}]){
  assert.equal((await fetch(origin+'/api/local/state',{headers})).status,403);
}
assert.equal((await fetch(origin+'/api/local/action',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"pause"}'})).status,403);
assert.equal((await fetch(origin+'/api/local/action',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:'{}'})).status,403);
assert.equal((await fetch(origin+'/api/local/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'rename',id:'missing',name:'invalid'})})).status,422);
assert.equal((await fetch(origin+'/api/local/images/..%2F..%2Fetc%2Fpasswd')).status,404);
await new Promise((resolve,reject)=>{http.get(origin+'/api/local/state',{headers:{Host:'evil.example:4175'}},r=>{r.resume();try{assert.equal(r.statusCode,403);resolve();}catch(e){reject(e);}}).on('error',reject);});
console.log('Local API checks passed: origin, host, bounded writes, path restrictions and private feature redaction.');
