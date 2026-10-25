import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handleAPI } from '../worker/catalog.js';
const root=path.resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.wasm':'application/wasm','.task':'application/octet-stream','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:4173');
    const api=await handleAPI(new Request(url,{method:req.method}));
    if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(Buffer.from(await api.arrayBuffer()));return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Nicht verfügbar.');}
}).listen(4173,'127.0.0.1',()=>console.log('REWEAR: http://127.0.0.1:4173'));
