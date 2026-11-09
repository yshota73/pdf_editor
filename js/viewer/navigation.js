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
const clampN=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
/* 倍率を f 倍にしたあとの左余白・スクロール位置を求める。
   ページの大きさ・ページ間の余白はどれも倍率に比例するので、確定後の配置を前もって正確に計算できる。
   anchor の点が画面上で動かないようにし、スクロールできる範囲を超える分だけ押し戻す */
function zoomTarget(f,a,center){
  const d=pageEls.get(a.pid);
  const w=parseFloat(d.style.width)*f, cw=colWidth()*f;
  const vw=viewBox.clientWidth, vh=viewBox.clientHeight;
  const off=(cw-w)/2+a.fx*w;                  // ページ列の左端から基準点までの距離
  const free=vw-cw-PADX*2;
  let L,pX=padX,sl;
  if(free>0){ L=PADX+(center?free/2:clampN(a.vx-off-PADX,0,free)); pX=center?null:L; sl=0; }
  else{ const max=cw+PADX*2-vw; L=PADX; sl=center?max/2:clampN(L+off-a.vx,0,max); }
  const st=clampN(a.y*f-a.vy,0,Math.max(0,pagesBox.offsetHeight*f-vh));
  return {L,pX,sl,st};
}
/* 倍率を確定して描き直す */
function applyZoom(z,anchor,center){
  z=clampZ(z); endPreview();
  const a=anchor||zoomAnchor();
  if(!a){S.zoom=z; buildPages(); updateUI(); return;}
  const t=zoomTarget(z/S.zoom,a,center);
  S.zoom=z; padX=t.pX; buildPages();
  viewBox.scrollLeft=t.sl; viewBox.scrollTop=t.st;
  updateUI();
}

/* ---- なめらかなズーム: 操作中は CSS の拡大縮小で即座に見せ、止まったら高精細に描き直す ---- */
let zg=null;   // {f, anchor, timer, raf}
/* 確定後と同じ位置になるよう、拡大縮小と平行移動をまとめてかける */
function previewZoom(f,anchor,center){
  const t=zoomTarget(f,anchor,center), L0=parseFloat(pagesBox.style.paddingLeft)||0;
  const tx=t.L-t.sl-f*L0+viewBox.scrollLeft, ty=viewBox.scrollTop-t.st;
  pagesBox.style.transformOrigin='0 0';
  pagesBox.style.transform=`translate(${tx}px,${ty}px) scale(${f})`;
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
function animateZoom(z,center){
  if(!hasDoc()) return;
  z=clampZ(z);
  if(zg) commitGesture();
  if(reduceMotion.matches||Math.abs(z/S.zoom-1)<.001){applyZoom(z,null,center);return;}
  const anchor=zoomAnchor(); if(!anchor){applyZoom(z,null,center);return;}
  const to=z/S.zoom, t0=performance.now(), dur=180;
  zg={f:1,anchor,anim:true,target:z};
  const step=now=>{
    if(!zg||!zg.anim) return;
    const t=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-t,3);
    zg.f=Math.exp(Math.log(to)*e); previewZoom(zg.f,anchor,center);
    if(t<1) zg.raf=requestAnimationFrame(step);
    else{endPreview(); applyZoom(z,anchor,center);}
  };
  zg.raf=requestAnimationFrame(step);
  zg.timer=setTimeout(()=>{ if(zg&&zg.anim){endPreview(); applyZoom(z,anchor,center);} },dur+200);   // 描画フレームが来ない場合の保険
}

const ZSTEP=1.4;   // ボタン・ホイール1回あたりの倍率

/* Ctrl+ホイール / トラックパッドのピンチ */
viewBox.addEventListener('wheel',e=>{
  if(!hasDoc()) return;
  if(!(e.ctrlKey||e.metaKey)){ wheelPan(e); return; }
  e.preventDefault();
  if(!beginGesture(e.clientX,e.clientY)) return;
  const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1);
  // マウスのホイール1目盛りは一定の倍率、トラックパッドのピンチは指の動きに合わせて連続的に
  const k=(e.deltaMode!==0||Math.abs(dy)>=50)?Math.pow(ZSTEP,-Math.sign(dy)):Math.exp(-dy*.01);
  setGestureScale(zg.f*k);
  clearTimeout(zg.timer); zg.timer=setTimeout(commitGesture,160);
},{passive:false});

/* ---- 資料が画面に収まっているときの左右の移動 ---- */
const fitsX=()=>viewBox.clientWidth-colWidth()-PADX*2>0;
function panX(dx){   // 資料を右へ dx px 動かす（画面の端で止まる）
  const free=viewBox.clientWidth-colWidth()-PADX*2;
  const L=parseFloat(pagesBox.style.paddingLeft)||PADX;
  padX=PADX+clampN(L+dx-PADX,0,free); layoutX();
}
/* 横スクロール（Shift+ホイール・トラックパッドの横スワイプ） */
function wheelPan(e){
  if(zg||!fitsX()) return;   // はみ出しているときは通常の横スクロールに任せる
  const u=e.deltaMode===1?16:e.deltaMode===2?400:1;
  const h=(e.deltaX||(e.shiftKey?e.deltaY:0))*u; if(!h) return;
  e.preventDefault(); panX(-h);
  if(!e.shiftKey) viewBox.scrollTop+=e.deltaY*u;
}
/* 灰色の背景をドラッグして資料を動かす（上下・左右） */
let bgPan=null;
viewBox.addEventListener('pointerdown',e=>{
  if(!hasDoc()||e.pointerType==='touch'||zg) return;
  const mid=e.button===1;
  if(!mid&&(e.button!==0||e.target.closest('.pg,.empty'))) return;
  e.preventDefault(); try{viewBox.setPointerCapture(e.pointerId);}catch(_){}
  bgPan={id:e.pointerId,x:e.clientX,y:e.clientY}; viewBox.classList.add('panning');
});
viewBox.addEventListener('pointermove',e=>{
  if(!bgPan||e.pointerId!==bgPan.id) return;
  const dx=e.clientX-bgPan.x, dy=e.clientY-bgPan.y; bgPan.x=e.clientX; bgPan.y=e.clientY;
  if(fitsX()) panX(dx); else viewBox.scrollLeft-=dx;
  viewBox.scrollTop-=dy;
});
const endBgPan=e=>{ if(bgPan&&e.pointerId===bgPan.id){bgPan=null; viewBox.classList.remove('panning');} };
viewBox.addEventListener('pointerup',endBgPan); viewBox.addEventListener('pointercancel',endBgPan);

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
