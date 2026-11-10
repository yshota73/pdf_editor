'use strict';

/* ============================================================
   ページ表示 (連続スクロール・遅延レンダリング)
   ============================================================ */
let pageEls=new Map();       // pageId -> element
const pagesBox=$('#pages'), viewBox=$('#view');
let rq=Promise.resolve();

const io=new IntersectionObserver(entries=>{
  for(const e of entries){ e.isIntersecting?activate(e.target):deactivate(e.target); }
},{root:viewBox,rootMargin:'900px 0px'});

function makePageEl(pg){
  const px=PXPT(); const [dw,dh]=dispDims(pg);
  const d=document.createElement('div'); d.className='pg'; d.dataset.pid=pg.id;
  d.style.width=dw*px+'px'; d.style.height=dh*px+'px';
  const base=document.createElement('canvas'), ov=document.createElement('canvas'); ov.className='ov';
  d.append(base,ov);
  d._base=base; d._ov=ov; d._key=`${pg.rot}|${S.zoom}`; d._active=false; d._tok=0; d._cs=1;
  ov.addEventListener('pointerdown',ev=>{ if(!fingerBlocked(ev)) onDown(ev,d); });
  ov.addEventListener('pointermove',ev=>{ if(!fingerBlocked(ev)) onMove(ev,d); });
  ov.addEventListener('pointerup',ev=>{ if(!fingerBlocked(ev)) onUp(ev,d); });
  ov.addEventListener('pointercancel',ev=>{ if(!fingerBlocked(ev)) onUp(ev,d); });
  ov.addEventListener('dblclick',ev=>onDbl(ev,d));
  ov.addEventListener('pointerleave',onLeave);
  io.observe(d);
  return d;
}
function killEl(d){io.unobserve(d);deactivate(d);d.remove();}

function activate(d){
  if(d._active) return;
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  d._active=true; const tok=++d._tok;
  const px=PXPT(); const [dw,dh]=dispDims(pg);
  const cw=dw*px, ch=dh*px;
  const cs=Math.min(DPR,Math.sqrt(MAXPIX/(cw*ch)));
  d._cs=cs;
  d._base.width=d._ov.width=Math.max(1,Math.floor(cw*cs));
  d._base.height=d._ov.height=Math.max(1,Math.floor(ch*cs));
  d._base.style.width=d._ov.style.width=cw+'px';
  d._base.style.height=d._ov.style.height=ch+'px';
  drawOverlay(d,pg);
  if(pg.src!=null) rq=rq.then(()=>renderBase(d,pg.id,tok)).catch(()=>{});
  ensureTextLayer(d);
}
function deactivate(d){
  if(!d._active) return;
  d._active=false; d._tok++; d._done=false;
  dropPlaceholder(d); dropTextLayer(d);
  try{d._task&&d._task.cancel();}catch(e){}
  d._task=null;
  d._base.width=d._base.height=0; d._ov.width=d._ov.height=0;
}
async function renderBase(d,pid,tok){
  if(!d._active||d._tok!==tok) return;
  const pg=pageById(pid); if(!pg||pg.src==null) return;
  try{
    const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
    if(!d._active||d._tok!==tok) return;
    const vp=page.getViewport({scale:PXPT()*d._cs,rotation:(pg.intrinsic+pg.rot)%360});
    const ctx=d._base.getContext('2d');
    const task=page.render({canvasContext:ctx,viewport:vp});
    d._task=task;
    await task.promise;
    if(d._tok===tok){d._done=true; dropPlaceholder(d);}
  }catch(e){ if(e&&e.name!=='RenderingCancelledException') console.warn('render',e); }
}
function drawOverlay(d,pg){
  if(!d._active||!d._ov.width) return;
  const ov=d._ov, ctx=ov.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,ov.width,ov.height);
  const k=PXPT()*d._cs; const [a,b,c,e,f,g]=rotM(pg.rot,pg.w,pg.h);
  ctx.setTransform(a*k,b*k,c*k,e*k,f*k,g*k);
  for(const an of pg.annots) if(!(S.editing&&S.editing.aid===an.id)) drawAnnot(ctx,an);   // 入力中のテキストは入力欄で見せる
  for(const an of pg.annots) if(an.draft&&isEmptyText(an)&&!(S.editing&&S.editing.aid===an.id)) drawTextPlaceholder(ctx,an);
  const wm=wmFor(pg); if(wm) drawAnnot(ctx,wm);
  if(S.showBoxes) drawBoxes(ctx,pg);
  drawEraserCursor(ctx,pg);
  // 付箋のコメント: 常に表示 / 選択中 / マウスを重ねている付箋
  const showIds=new Set();
  if(S.sel&&S.sel.pid===pg.id) showIds.add(S.sel.aid);
  if(S.hoverNote&&S.hoverNote.pid===pg.id) showIds.add(S.hoverNote.aid);
  for(const an of pg.annots) if(an.type==='note'&&(S.showNotes||showIds.has(an.id))) drawNotePop(ctx,an,pg);
  if(drag&&drag.mode==='textbox'&&drag.pid===pg.id){
    const u=1/PXPT(); ctx.save(); ctx.strokeStyle='#2350d8'; ctx.lineWidth=1.5*u; ctx.setLineDash([5*u,4*u]);
    ctx.strokeRect(Math.min(drag.ax,drag.x),Math.min(drag.ay,drag.y),Math.abs(drag.x-drag.ax),Math.abs(drag.y-drag.ay)); ctx.restore();
  }
  drawLasso(ctx,d,pg);
  if(S.sel&&S.sel.pid===pg.id&&!(S.editing&&S.editing.aid===S.sel.aid)){const an=pg.annots.find(x=>x.id===S.sel.aid); if(an) drawSel(ctx,d,pg,an);}
}
function drawSel(ctx,d,pg,a){
  ctx.save(); ctx.setTransform(1,0,0,1,0,0);
  const cs=d._cs,k=PXPT()*cs; const P=(x,y)=>{const [X,Y]=b2d(pg,x,y);return [X*k,Y*k];};
  ctx.strokeStyle='#2350d8'; ctx.fillStyle='#fff'; ctx.lineWidth=1.5*cs; ctx.setLineDash([5*cs,4*cs]);
  const hp=handlePoints(a);
  if(a.type!=='line'){
    const b=bboxOf(a), pad=a.type==='pen'?3:a.type==='marker'?a.lw/2:0;
    const cn=[[b.x-pad,b.y-pad],[b.x+b.w+pad,b.y-pad],[b.x+b.w+pad,b.y+b.h+pad],[b.x-pad,b.y+b.h+pad]].map(p=>P(p[0],p[1]));
    ctx.beginPath(); cn.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);
  const hs=4.5*cs;
  for(const p of hp){const q=P(p[0],p[1]); ctx.beginPath(); ctx.rect(q[0]-hs,q[1]-hs,hs*2,hs*2); ctx.fill(); ctx.stroke();}
  const es=edgeSegs(a);
  if(es) for(const s of es){
    const m=P((s[0][0]+s[1][0])/2,(s[0][1]+s[1][1])/2);
    ctx.beginPath(); ctx.rect(m[0]-hs*.8,m[1]-hs*.8,hs*1.6,hs*1.6); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
/* 倍率変更直後、新しい描画が終わるまで旧倍率の画像を引き伸ばして表示しておく */
function dropPlaceholder(d){ if(d._ph){d._ph.remove(); d._ph=null;} }
function takePlaceholder(old,pg){
  if(!old||!old._active||!(old._done||old._ph)||pg.src==null) return null;
  if(old._key.split('|')[0]!==String(pg.rot)) return null;
  const ph=old._done?old._base:old._ph;
  if(old._done){old._base=document.createElement('canvas'); old._done=false;} else old._ph=null;
  return ph;
}
/* ---- 横位置: 拡大縮小しても自動で中央に戻さず、ページを置いた位置を保つ ---- */
const PADX=18;
let padX=null;   // ページ列の左余白(px)。null のときは中央に置く
const colWidth=()=>{let w=0; for(const d of pageEls.values()) w=Math.max(w,parseFloat(d.style.width)||0); return w;};
function layoutX(){
  const free=viewBox.clientWidth-colWidth()-PADX*2;   // 画面に収まるときの左右の余白の合計
  const L=free<=0?PADX:PADX+(padX==null?free/2:Math.min(free,Math.max(0,padX-PADX)));
  pagesBox.style.paddingLeft=L+'px';
}
new ResizeObserver(()=>layoutX()).observe(viewBox);
function redrawPage(pid){const d=pageEls.get(pid),pg=pageById(pid); if(d&&pg) drawOverlay(d,pg);}
function redrawAll(){for(const [id] of pageEls) redrawPage(id);}

function buildPages(){
  const next=new Map(); const frag=document.createDocumentFragment();
  S.pages.forEach(pg=>{
    let d=pageEls.get(pg.id); const key=`${pg.rot}|${S.zoom}`;
    if(!d||d._key!==key){
      const ph=takePlaceholder(d,pg);
      if(d) killEl(d); d=makePageEl(pg);
      if(ph){ph.className='ph'; ph.style.width=ph.style.height='100%'; d.insertBefore(ph,d._ov); d._ph=ph;}
    }
    next.set(pg.id,d); frag.append(d);
  });
  for(const [id,d] of pageEls) if(!next.has(id)) killEl(d);
  pageEls=next; pagesBox.replaceChildren(frag);
  pagesBox.style.setProperty('--z',S.zoom); layoutX();
  if(S.editing) mountInline();   // 拡大縮小しても入力を続けられる
  for(const [id,d] of pageEls) if(d._active) redrawPage(id);
}
