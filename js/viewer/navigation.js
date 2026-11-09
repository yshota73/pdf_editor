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
const ZMIN=.25, ZMAX=4;
const clampZ=z=>Math.min(ZMAX,Math.max(ZMIN,z));

/* 画面上の点(client座標)が、どのページのどの位置にあたるかを記録する */
function zoomAnchor(cx,cy){
  const r=viewBox.getBoundingClientRect();
  if(cx==null){cx=r.left+viewBox.clientWidth/2; cy=r.top+viewBox.clientHeight/2;}
  const vx=cx-r.left, vy=cy-r.top, x=viewBox.scrollLeft+vx, y=viewBox.scrollTop+vy;
  let d=null;
  for(const el of pageEls.values()){ if(!d||el.offsetTop<=y) d=el; else break; }
  if(!d) return null;
  return {pid:+d.dataset.pid, fx:(x-d.offsetLeft)/d.offsetWidth, fy:(y-d.offsetTop)/d.offsetHeight, vx, vy, x, y};
}
function restoreAnchor(a){
  const d=a&&pageEls.get(a.pid); if(!d) return;
  viewBox.scrollLeft=d.offsetLeft+a.fx*d.offsetWidth-a.vx;
  viewBox.scrollTop=d.offsetTop+a.fy*d.offsetHeight-a.vy;
}
/* 倍率を確定して描き直す。anchor の点が画面上で動かないようにスクロールを合わせる */
function applyZoom(z,anchor){
  z=clampZ(z); endPreview();
  const a=anchor||zoomAnchor();
  S.zoom=z; buildPages(); restoreAnchor(a); updateUI();
}

/* ---- なめらかなズーム: 操作中は CSS の拡大縮小で即座に見せ、止まったら高精細に描き直す ---- */
let zg=null;   // {f, anchor, timer, raf}
function previewZoom(f,anchor){
  pagesBox.style.transformOrigin=`${anchor.x}px ${anchor.y}px`;
  pagesBox.style.transform=`scale(${f})`;
}
function endPreview(){
  if(!zg) return;
  clearTimeout(zg.timer); cancelAnimationFrame(zg.raf);
  pagesBox.style.transform=''; pagesBox.style.transformOrigin='';
  zg=null;
}
function beginGesture(cx,cy){
  if(zg&&zg.anim){const t=zg.target; endPreview(); applyZoom(t);}   // ボタンのアニメ中なら先に確定
  if(!zg){const anchor=zoomAnchor(cx,cy); if(!anchor) return null; zg={f:1,anchor};}
  return zg;
}
function setGestureScale(f){
  if(!zg) return;
  zg.f=clampZ(S.zoom*f)/S.zoom; previewZoom(zg.f,zg.anchor);
}
function commitGesture(){
  if(!zg) return;
  const {f,anchor}=zg; endPreview();
  if(Math.abs(f-1)>.001) applyZoom(S.zoom*f,anchor);
}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
/* ボタン・選択肢からの倍率変更をアニメーションで行う */
function animateZoom(z){
  if(!hasDoc()) return;
  z=clampZ(z);
  if(zg) commitGesture();
  if(reduceMotion.matches||Math.abs(z/S.zoom-1)<.001){applyZoom(z);return;}
  const anchor=zoomAnchor(); if(!anchor){applyZoom(z);return;}
  const to=z/S.zoom, t0=performance.now(), dur=180;
  zg={f:1,anchor,anim:true,target:z};
  const step=now=>{
    if(!zg||!zg.anim) return;
    const t=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-t,3);
    zg.f=Math.exp(Math.log(to)*e); previewZoom(zg.f,anchor);
    if(t<1) zg.raf=requestAnimationFrame(step);
    else{endPreview(); applyZoom(z,anchor);}
  };
  zg.raf=requestAnimationFrame(step);
  zg.timer=setTimeout(()=>{ if(zg&&zg.anim){endPreview(); applyZoom(z,anchor);} },dur+200);   // 描画フレームが来ない場合の保険
}

/* Ctrl+ホイール / トラックパッドのピンチ */
viewBox.addEventListener('wheel',e=>{
  if(!(e.ctrlKey||e.metaKey)||!hasDoc()) return;
  e.preventDefault();
  if(!beginGesture(e.clientX,e.clientY)) return;
  const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);
  setGestureScale(zg.f*Math.exp(-Math.max(-150,Math.min(150,dy))*.002));
  clearTimeout(zg.timer); zg.timer=setTimeout(commitGesture,160);
},{passive:false});

/* タッチの2本指ピンチ */
let pinch=null;
const tDist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
viewBox.addEventListener('touchstart',e=>{
  if(e.touches.length!==2||!hasDoc()) return;
  const t=e.touches, cx=(t[0].clientX+t[1].clientX)/2, cy=(t[0].clientY+t[1].clientY)/2;
  if(!beginGesture(cx,cy)) return;
  pinch={d0:tDist(t),f0:zg.f}; e.preventDefault();
},{passive:false});
viewBox.addEventListener('touchmove',e=>{
  if(!pinch||e.touches.length<2) return;
  e.preventDefault(); setGestureScale(pinch.f0*tDist(e.touches)/pinch.d0);
},{passive:false});
const endPinch=e=>{ if(pinch&&e.touches.length<2){pinch=null; commitGesture();} };
viewBox.addEventListener('touchend',endPinch); viewBox.addEventListener('touchcancel',endPinch);

/* Safari のトラックパッドピンチ */
let gsF=1;
viewBox.addEventListener('gesturestart',e=>{ if(!hasDoc()) return; e.preventDefault(); if(beginGesture(e.clientX,e.clientY)) gsF=zg.f; });
viewBox.addEventListener('gesturechange',e=>{ if(!zg) return; e.preventDefault(); setGestureScale(gsF*e.scale); });
viewBox.addEventListener('gestureend',e=>{ if(!zg) return; e.preventDefault(); commitGesture(); });
