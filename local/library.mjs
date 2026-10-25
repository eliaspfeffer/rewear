import {mkdir,readFile,writeFile,rename,readdir,stat,lstat,chmod} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {sameGarmentCandidate,similarGarment,splitMember,mergeGroups} from './grouping.mjs';

export const dataRoot=process.env.REWEAR_DATA_DIR||path.join(os.homedir(),'Library/Application Support/REWEAR');
export const inputRoot=path.join(dataRoot,'Apple-Fotos');
const recordsRoot=path.join(dataRoot,'analysis'),imagesRoot=path.join(dataRoot,'crops');
const stateFile=path.join(dataRoot,'library.json');
const binary=path.resolve('.openai/local/ClothingVision');
const readJSON=async(file,fallback)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
let writes=Promise.resolve();
const atomicJSON=(file,value)=>{const text=JSON.stringify(value);writes=writes.catch(()=>{}).then(async()=>{await writeFile(file+'.tmp',text,{mode:0o600});await rename(file+'.tmp',file);});return writes;};
export async function createLibrary(){
  for(const dir of [dataRoot,inputRoot,recordsRoot,imagesRoot]){await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);}
  let state=await readJSON(stateFile,{version:1,groups:[],excluded:[],accepted:[],files:{},running:false});
  state.running=false;let crops=new Map(),portraits=new Map(),busy=false,lastError='',total=0;
  for(const file of await readdir(recordsRoot)){if(!/^[a-f\d]{64}\.json$/.test(file))continue;const record=await readJSON(path.join(recordsRoot,file),null);for(const c of record?.crops||[])crops.set(c.id,c);if(record?.portrait)portraits.set(record.portrait,record.portraitQuality||0);}
  function save(){return atomicJSON(stateFile,state);}
  const active=c=>c&&!state.excluded.includes(c.id)&&(!c.review||state.accepted.includes(c.id));
  function add(c){
    crops.set(c.id,c);if(!active(c)||state.groups.some(g=>g.members.includes(c.id)))return;
    const group=state.groups.find(g=>{const old=crops.get(g.members[0]);return old&&sameGarmentCandidate(old,c);});
    if(group)group.members.push(c.id);else state.groups.push({id:c.id,members:[c.id],name:c.label});
  }
  for(const c of crops.values())add(c);
  function publicCrop(c){return {id:c.id,kind:c.kind,label:c.label,image:'/api/local/images/'+c.image,preview:'/api/local/images/'+c.source+'-source.jpg',palette:c.palette,source:c.source,sourceName:c.sourceName,review:c.review,reason:c.reason,classification:c.classification};}
  async function snapshot(){
    if(!busy)total=(await discover()).length;
    const source=await readJSON(path.join(dataRoot,'source.json'),{});
    const groups=state.groups.map(g=>({...g,members:g.members.map(id=>crops.get(id)).filter(active).map(publicCrop)})).filter(g=>g.members.length);
    const pending=[...crops.values()].filter(c=>c.review&&!state.accepted.includes(c.id)&&!state.excluded.includes(c.id));
    const suggestions=[];
    for(let i=0;i<groups.length&&suggestions.length<12;i++)for(let j=i+1;j<groups.length&&suggestions.length<12;j++){
      if(similarGarment(crops.get(groups[i].members[0].id),crops.get(groups[j].members[0].id)))suggestions.push([groups[i].id,groups[j].id]);
    }
    return {local:true,running:state.running,busy,total,expected:Number.isSafeInteger(source.expected)&&source.expected>0&&source.expected<=100000?source.expected:null,exportFailed:source.exportStatus==='failed',exportError:typeof source.exportError==='string'?source.exportError.slice(0,300):'',processed:Object.keys(state.files).length,groups,pending:pending.slice(0,60).map(publicCrop),pendingCount:pending.length,portraits:[...portraits].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name])=>'/api/local/images/'+name),excluded:state.excluded.length,suggestions,lastError,source:'Geöffnete Personensammlung aus Apple Fotos',unreadable:Object.values(state.files).filter(f=>f.error).length,withoutClothes:Object.values(state.files).filter(f=>f.empty).length};
  }
  async function discover(dir=inputRoot,depth=0){
    if(depth>4)return[];const result=[];
    for(const entry of await readdir(dir,{withFileTypes:true})){
      if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;const full=path.join(dir,entry.name);
      if(entry.isDirectory())result.push(...await discover(full,depth+1));
      else if(entry.isFile()&&/\.(jpe?g|png|heic|heif|tiff?|webp)$/i.test(entry.name))result.push(full);
    }return result.sort();
  }
  function native(file,id){return new Promise((resolve,reject)=>{
    const child=spawn(binary,[file,imagesRoot,id],{stdio:['ignore','pipe','pipe']});let output='',error='';
    const timer=setTimeout(()=>child.kill('SIGKILL'),45000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2_000_000)child.kill('SIGKILL');});child.stderr.on('data',chunk=>{if(error.length<1000)error+=chunk;});
    child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Lokale Vision-Analyse fehlgeschlagen. Das Foto bleibt erhalten.'));try{resolve(JSON.parse(output));}catch{reject(new Error('Die lokale Bildanalyse lieferte kein lesbares Ergebnis.'));}});
  });}
  async function tick(){
    if(!state.running||busy)return;busy=true;
    try{
      const files=await discover();total=files.length;
      for(const file of files){
        if(!state.running)break;
        const details=await stat(file),key=path.relative(inputRoot,file),signature=details.size+':'+details.mtimeMs;
        if(state.files[key]?.signature===signature||Date.now()-details.mtimeMs<2500)continue;
        if(details.size>100_000_000){state.files[key]={signature,error:true};await save();continue;}
        try{
          // Content IDs make repeated exports idempotent, even when Photos renames a file.
          const id=createHash('sha256').update(await readFile(file)).digest('hex');
          let result=await readJSON(path.join(recordsRoot,id+'.json'),null);
          if(!result){const raw=await native(file,id);result={...raw,crops:raw.crops.map(c=>({...c,source:id,sourceName:path.basename(file)}))};await atomicJSON(path.join(recordsRoot,id+'.json'),result);}
          if((await stat(file)).mtimeMs!==details.mtimeMs)continue;
          for(const c of result.crops)add(c);
          if(result.portrait)portraits.set(result.portrait,result.portraitQuality||0);
          state.files[key]={signature,empty:!result.crops.length};lastError='';
        }catch(error){state.files[key]={signature,error:true};lastError=error.message;}
        await save();
      }
    }catch(error){lastError='Der lokale Fotoordner ist nicht lesbar. Prüfe den Zugriff und starte erneut.';state.running=false;}
    finally{busy=false;}
  }
  const timer=setInterval(tick,3000);timer.unref();
  async function action(body){
    if(body.action==='start'){await stat(binary);for(const [key,file] of Object.entries(state.files))if(file.error)delete state.files[key];state.running=true;await save();void tick();}
    else if(body.action==='pause'){state.running=false;await save();}
    else if(body.action==='accept'){const c=crops.get(body.id);if(!c)throw new Error('Dieses Teil wurde nicht gefunden.');state.accepted=[...new Set([...state.accepted,c.id])];state.excluded=state.excluded.filter(id=>id!==c.id);add(c);await save();}
    else if(body.action==='exclude'){if(!crops.has(body.id))throw new Error('Dieses Teil wurde nicht gefunden.');state.excluded=[...new Set([...state.excluded,body.id])];await save();}
    else if(body.action==='restore'){state.excluded=[];for(const c of crops.values())add(c);await save();}
    else if(body.action==='merge'){const from=state.groups.find(g=>g.id===body.from),to=state.groups.find(g=>g.id===body.to);if(!from||!to||crops.get(from.members[0])?.kind!==crops.get(to.members[0])?.kind)throw new Error('Oberteile und Hosen können nicht dasselbe Teil sein.');state.groups=mergeGroups(state.groups,body.from,body.to);await save();}
    else if(body.action==='split'){splitMember(state.groups,body.group,body.id);await save();}
    else if(body.action==='rename'){const g=state.groups.find(g=>g.id===body.id);if(!g||typeof body.name!=='string'||!body.name.trim()||body.name.length>40)throw new Error('Bitte einen Namen mit 1–40 Zeichen wählen.');g.name=body.name.trim();await save();}
    else throw new Error('Unbekannte lokale Aktion.');
    return snapshot();
  }
  async function imageFile(name){
    if(!/^[a-f\d]{64}-(?:\d+-(?:top|bottom)|source|portrait)\.jpg$/.test(name))return null;
    const file=path.join(imagesRoot,name);if((await lstat(file)).isSymbolicLink())return null;return readFile(file);
  }
  await save();total=(await discover()).length;
  return {snapshot,action,imageFile,close:()=>clearInterval(timer)};
}
