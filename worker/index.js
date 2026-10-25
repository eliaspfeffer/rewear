import assets from '../.openai/local/assets.mjs';
import { handleAPI } from './catalog.js';

const modelAssets = {
  '/vendor/vision/face_landmarker.task':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  '/vendor/vision/wasm/vision_wasm_internal.wasm':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_internal.wasm',
  '/vendor/vision/wasm/vision_wasm_nosimd_internal.wasm':'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/vision_wasm_nosimd_internal.wasm',
};
export default {
  async fetch(request) {
    const api = await handleAPI(request); if (api) return api;
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    const path = new URL(request.url).pathname;
    if (modelAssets[path]) {
      const response = await fetch(modelAssets[path], {cf:{cacheTtl:86400,cacheEverything:true}});
      if (!response.ok) return new Response('Analysemodell gerade nicht verfügbar.',{status:502});
      return new Response(request.method==='HEAD'?null:response.body,{headers:{'content-type':path.endsWith('.wasm')?'application/wasm':'application/octet-stream','cache-control':'private, max-age=86400','x-content-type-options':'nosniff'}});
    }
    const asset = assets[path === '/' ? '/index.html' : path];
    if (!asset) return new Response('Not found',{status:404});
    const data = asset.binary ? Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)) : asset.data;
    return new Response(request.method==='HEAD'?null:data,{headers:{'content-type':asset.type,'cache-control':path === '/' || /\.(?:js|css|html|mjs)$/.test(path) ? 'private, no-cache' : 'private, max-age=86400','x-content-type-options':'nosniff'}});
  }
};
