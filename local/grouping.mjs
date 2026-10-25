export function distance(a,b) {
  if (!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length||!a.length) return Infinity;
  let sum=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))return Infinity;sum+=(a[i]-b[i])**2;}return Math.sqrt(sum);
}
export function hashDistance(a,b) {
  if(!/^[a-f\d]{16}$/i.test(a||'')||!/^[a-f\d]{16}$/i.test(b||''))return 64;
  let bits=BigInt('0x'+a)^BigInt('0x'+b),count=0;while(bits){count++;bits&=bits-1n;}return count;
}
const rgb=hex=>/^#[a-f\d]{6}$/i.test(hex||'')?hex.slice(1).match(/.{2}/g).map(v=>parseInt(v,16)/255):null;
export function colorDistance(a,b){const x=rgb(a),y=rgb(b);return x&&y?Math.hypot(...x.map((v,i)=>v-y[i])):Infinity;}
export function sameGarmentCandidate(a,b) {
  // shortcut: a photo cannot prove garment identity; only near-identical crops group automatically.
  return a.source!==b.source&&a.kind===b.kind&&a.label===b.label&&colorDistance(a.palette?.[0],b.palette?.[0])<0.13&&hashDistance(a.hash,b.hash)<=6&&distance(a.feature,b.feature)<0.10;
}
export function similarGarment(a,b){return a.kind===b.kind&&colorDistance(a.palette?.[0],b.palette?.[0])<0.3&&distance(a.feature,b.feature)<0.55;}
export function splitMember(groups,groupId,memberId){
  const group=groups.find(g=>g.id===groupId);
  if(!group||group.members.length<2||!group.members.includes(memberId))throw new Error('Dieses Foto kann hier nicht getrennt werden.');
  group.members=group.members.filter(id=>id!==memberId);
  let id=memberId;while(groups.some(g=>g.id===id))id='split-'+id;
  const separated={id,members:[memberId],name:group.name};groups.push(separated);return separated;
}
export function mergeGroups(groups,fromId,toId){
  const from=groups.find(g=>g.id===fromId),to=groups.find(g=>g.id===toId);
  if(!from||!to||fromId===toId)throw new Error('Bitte zwei unterschiedliche vorhandene Teile wählen.');
  to.members=[...new Set([...to.members,...from.members])];return groups.filter(g=>g!==from);
}
