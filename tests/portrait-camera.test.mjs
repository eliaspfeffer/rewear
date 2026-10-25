import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortraitCamera, cameraError } from '../public/portrait-camera.js';

function fixture(getUserMedia) {
  const track={readyState:'live',stop(){this.readyState='ended';}};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
  const video={srcObject:null,videoWidth:1920,videoHeight:1080,readyState:2,pause(){},async play(){}};
  const camera=createPortraitCamera(video,{getUserMedia:getUserMedia|| (async constraints=>{assert.equal(constraints.audio,false);return stream;})});
  return {track,stream,video,camera};
}
test('camera requests video only, releases all tracks and detaches preview on stop',async()=>{
  const {camera,track,video,stream}=fixture();
  assert.equal(await camera.start(),true);assert.equal(video.srcObject,stream);
  camera.stop();assert.equal(track.readyState,'ended');assert.equal(video.srcObject,null);
  camera.stop();
});
test('a permission response after closing cannot reactivate the camera',async()=>{
  let resolve;
  const {camera,stream,track,video}=fixture(()=>new Promise(r=>{resolve=r;}));
  const pending=camera.start();camera.stop();resolve(stream);
  assert.equal(await pending,false);assert.equal(track.readyState,'ended');assert.equal(video.srcObject,null);
});
test('playback failure releases the camera and permission errors have useful guidance',async()=>{
  const {camera,track,video}=fixture();
  video.play=async()=>{throw new Error('play failed');};
  await assert.rejects(camera.start(),/play failed/);assert.equal(track.readyState,'ended');assert.equal(video.srcObject,null);
  assert.match(cameraError({name:'NotAllowedError'}),/Website-Einstellungen/);
  assert.match(cameraError({name:'NotFoundError'}),/Keine Kamera/);
});
test('capture uses a bounded JPEG in memory, clears canvas and ignores cancelled captures',async()=>{
  const {camera,video}=fixture();await camera.start();
  const photo=new Blob(['test'],{type:'image/jpeg'});let finish;
  const canvas={width:0,height:0,getContext:()=>({drawImage:(source,x,y,w,h)=>{assert.equal(source,video);assert.equal(w,1600);assert.equal(h,900);}}),toBlob:(done,type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.92);finish=done;}};
  const capture=camera.capture(()=>canvas);finish(photo);assert.equal(await capture,photo);assert.equal(canvas.width,0);
  const cancelled=camera.capture(()=>canvas);camera.stop();finish(photo);assert.equal(await cancelled,null);
  await assert.rejects(camera.capture(()=>canvas),/noch nicht bereit/);
});
