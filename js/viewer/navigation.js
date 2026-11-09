'use strict';

/* ============================================================
   ナビゲーション・ズーム
   ============================================================ */
function gotoPage(i){
  if(!hasDoc()) return;
  i=Math.max(0,Math.min(S.pages.length-1,i));
  const d=pageEls.get(S.pages[i].id);
  if(d) viewBox.scrollTop=d.offsetTop-14;
  setCur(i);
}
function setCur(i){
  if(i===S.cur&&$('#pgIn').value==String(i+1)) return;
  S.cur=i; updateUI();
  const d=thumbEls.get(S.pages[i]&&S.pages[i].id);
  if(d){const c=thumbsBox; if(d.offsetTop<c.scrollTop||d.offsetTop+d.offsetHeight>c.scrollTop+c.clientHeight) c.scrollTop=d.offsetTop-40;}
}
let scrollRaf=0;
viewBox.addEventListener('scroll',()=>{
  if(scrollRaf) return;
  scrollRaf=requestAnimationFrame(()=>{
    scrollRaf=0; if(!hasDoc()) return;
    const y=viewBox.scrollTop+viewBox.clientHeight*.35; let idx=0;
    S.pages.forEach((pg,i)=>{const d=pageEls.get(pg.id); if(d&&d.offsetTop<=y) idx=i;});
    setCur(idx);
  });
},{passive:true});
function fitZoom(){
  const pg=S.pages[S.cur]||S.pages[0]; if(!pg) return 1;
  const [dw]=dispDims(pg); const avail=Math.max(200,viewBox.clientWidth-48);
  return Math.max(.25,Math.min(2,avail/(dw*96/72)));
}
function applyZoom(z){
  z=Math.min(4,Math.max(.25,z));
  const ratio=viewBox.scrollHeight?viewBox.scrollTop/viewBox.scrollHeight:0;
  S.zoom=z; buildPages(); viewBox.scrollTop=ratio*viewBox.scrollHeight; updateUI();
}
let zT=null,zF=1;
viewBox.addEventListener('wheel',e=>{
  if(!(e.ctrlKey||e.metaKey)||!hasDoc()) return;
  e.preventDefault(); zF*=(e.deltaY<0?1.1:1/1.1);
  clearTimeout(zT); zT=setTimeout(()=>{applyZoom(S.zoom*zF);zF=1;},120);
},{passive:false});
