'use strict';

/* ============================================================
   ページ操作
   ============================================================ */
function targets(){
  const t=S.pages.filter(p=>S.checked.has(p.id));
  return t.length?t:(S.pages[S.cur]?[S.pages[S.cur]]:[]);
}
function structChanged(){S.sel=null;buildPages();buildThumbs();commit();syncOptions();}
function rotatePages(dir){
  if(!hasDoc()) return;
  targets().forEach(p=>{p.rot=(p.rot+dir*90+360)%360;});
  structChanged();
}
function deletePages(){
  const t=new Set(targets().map(p=>p.id));
  if(t.size>=S.pages.length){toast('すべてのページは削除できません','err');return;}
  S.pages=S.pages.filter(p=>!t.has(p.id)); t.forEach(id=>S.checked.delete(id));
  S.cur=Math.min(S.cur,S.pages.length-1); structChanged(); toast(`${t.size}ページを削除しました（元に戻せます）`);
}
function movePages(dir){
  const t=new Set(targets().map(p=>p.id)); const a=S.pages; const n=a.length;
  if(dir<0){for(let i=1;i<n;i++) if(t.has(a[i].id)&&!t.has(a[i-1].id)){[a[i-1],a[i]]=[a[i],a[i-1]];}}
  else {for(let i=n-2;i>=0;i--) if(t.has(a[i].id)&&!t.has(a[i+1].id)){[a[i+1],a[i]]=[a[i],a[i+1]];}}
  const cid=S.pages[S.cur]&&S.pages[S.cur].id;
  structChanged();
  const ci=S.pages.findIndex(p=>p.id===(targets()[0]||{}).id); if(ci>=0) gotoPage(ci); else if(cid) gotoPage(S.cur);
}
function reorder(dragId,targetId,after){
  if(dragId===targetId) return;
  const group=S.checked.has(dragId)&&S.checked.size>1?S.pages.filter(p=>S.checked.has(p.id)):[pageById(dragId)];
  if(group.some(p=>p.id===targetId)) return;
  const gs=new Set(group.map(p=>p.id)); const rest=S.pages.filter(p=>!gs.has(p.id));
  let ti=rest.findIndex(p=>p.id===targetId); if(after) ti++;
  rest.splice(ti,0,...group); S.pages=rest; structChanged();
}
function insertBlank(){
  const ref=targets(); const last=ref.length?S.pages.indexOf(ref[ref.length-1]):S.pages.length-1;
  const base=S.pages[Math.max(0,last)]||{w:595.28,h:841.89};
  const [w,h]=S.pages[Math.max(0,last)]?[base.w,base.h]:[595.28,841.89];
  const np={id:uid(),src:null,idx:0,w,h,intrinsic:0,rot:0,annots:[]};
  S.pages.splice(last+1,0,np); structChanged(); gotoPage(last+1);
}
function duplicatePages(){
  const t=new Set(targets().map(p=>p.id)); const out=[];
  S.pages.forEach(p=>{out.push(p); if(t.has(p.id)){const c=clone(p);c.id=uid();c.annots.forEach(a=>a.id=uid());out.push(c);}});
  S.pages=out; structChanged();
}
on('#btnRotL','click',()=>rotatePages(-1)); on('#btnRotR','click',()=>rotatePages(1));
on('#btnDel','click',deletePages); on('#btnUp','click',()=>movePages(-1)); on('#btnDown','click',()=>movePages(1));
on('#btnBlank','click',insertBlank); on('#btnDup','click',duplicatePages);
on('#chkAll','change',e=>{S.checked=e.target.checked?new Set(S.pages.map(p=>p.id)):new Set();updateUI();});
