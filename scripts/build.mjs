import { readdir, readFile, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
const assets = {};
async function walk(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (!/\.(?:wasm|task|map)$/.test(file)) {
      const key='/'+path.relative('public',file).split(path.sep).join('/'),type=types[path.extname(file)]||'application/octet-stream';
      const binary=!/\.(?:html|js|mjs|css|svg|json)$/.test(file),bytes=await readFile(file);
      assets[key]={type,binary,data:bytes.toString(binary?'base64':'utf8')};
    }
  }
}
await walk('public');
await mkdir('.openai/local',{recursive:true});await writeFile('.openai/local/assets.mjs','export default '+JSON.stringify(assets)+';\n');
await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log(`Built Sites Worker with ${Object.keys(assets).length} embedded assets; model binaries are served through fixed, cached upstreams.`);
