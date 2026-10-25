import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
test('local library reports an incomplete Photos export without exposing private paths',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'rewear-test-')),old=process.env.REWEAR_DATA_DIR;
  process.env.REWEAR_DATA_DIR=root;
  let library;
  try{
    const {createLibrary}=await import('../local/library.mjs?fixture');
    await writeFile(path.join(root,'source.json'),JSON.stringify({expected:5,exportStatus:'failed',exportError:'Apple Fotos: 1.005'}));
    library=await createLibrary();const state=await library.snapshot();
    assert.equal(state.expected,5);assert.equal(state.total,0);assert.equal(state.processed,0);assert.equal(state.exportFailed,true);assert.equal(state.exportError,'Apple Fotos: 1.005');assert.equal(JSON.stringify(state).includes(root),false);
    assert.equal(await library.imageFile('../source.json'),null);
  }finally{library?.close();if(old===undefined)delete process.env.REWEAR_DATA_DIR;else process.env.REWEAR_DATA_DIR=old;await rm(root,{recursive:true,force:true});}
});
