import http from 'node:http';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createLibrary,inputRoot} from '../local/library.mjs';
import {handleAPI} from '../worker/catalog.js';
const port=Number(process.env.REWEAR_PORT||4174),origin=`http://127.0.0.1:${port}`,root=path.resolve('public'),binary=path.resolve('.openai/local/ClothingVision');
if(![4174,4175].includes(port))throw new Error('Ungültiger lokaler Port.');
if(process.platform!=='darwin')throw new Error('Die lokale Apple-Fotos-Analyse benötigt macOS.');
await mkdir(path.dirname(binary),{recursive:true});
let compile=true;try{compile=(await stat(binary)).mtimeMs<(await stat('local/ClothingVision.swift')).mtimeMs;}catch{}
if(compile){console.log('Lokale Apple-Vision-Analyse wird vorbereitet …');const result=spawnSync('/usr/bin/swiftc',['-O','local/ClothingVision.swift','-o',binary],{stdio:'inherit'});if(result.status!==0)process.exit(1);}
const library=await createLibrary();
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.wasm':'application/wasm','.task':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Referrer-Policy','no-referrer');
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(req.headers.host!==`127.0.0.1:${port}`)return json({error:'Nur die lokale REWEAR-Seite darf auf diesen Kleiderschrank zugreifen.'},403);
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/local/')&&(req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'))return json({error:'Nur die lokale REWEAR-Seite darf auf diesen Kleiderschrank zugreifen.'},403);
    if(url.pathname==='/api/local/state'&&req.method==='GET')return json(await library.snapshot());
    if(url.pathname==='/api/local/action'&&req.method==='POST'){
      if(req.headers.origin!==origin||!/^application\/json(?:;|$)/.test(req.headers['content-type']||''))return json({error:'Ungültige lokale Anfrage.'},403);
      let text='';for await(const chunk of req){text+=chunk;if(text.length>4000)return json({error:'Anfrage zu groß.'},413);}return json(await library.action(JSON.parse(text)));
    }
    if(url.pathname.startsWith('/api/local/images/')&&req.method==='GET'){const bytes=await library.imageFile(decodeURIComponent(url.pathname.slice('/api/local/images/'.length)));if(!bytes)return json({error:'Bild nicht gefunden.'},404);res.writeHead(200,{'content-type':'image/jpeg'});return res.end(bytes);}
    if(url.pathname.startsWith('/api/local/'))return json({error:'Lokale Aktion nicht verfügbar.'},404);
    if(req.method!=='GET')return json({error:'Methode nicht verfügbar.'},405);
    const api=await handleAPI(new Request(url,{method:'GET'}));if(api){res.writeHead(api.status,Object.fromEntries(api.headers));res.end(Buffer.from(await api.arrayBuffer()));return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return json({error:'Nicht verfügbar.'},403);
    const bytes=await readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
  }catch(error){if(res.headersSent)return res.end();json({error:error.code==='ENOENT'?'Nicht gefunden.':error.message||'Lokale Aktion fehlgeschlagen.'},error.code==='ENOENT'?404:422);}
});
server.listen(port,'127.0.0.1',()=>console.log(`REWEAR lokal: ${origin}/#outfits\nLokaler Apple-Fotos-Ordner: ${inputRoot}\nFotos, Ausschnitte und Merkmale bleiben auf diesem Mac.`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{library.close();server.close(()=>process.exit());});
