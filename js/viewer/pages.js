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
  ov.addEventListener('pointerdown',ev=>onDown(ev,d));
  ov.addEventListener('pointermove',ev=>onMove(ev,d));
  ov.addEventListener('pointerup',ev=>onUp(ev,d));
  ov.addEventListener('pointercancel',ev=>onUp(ev,d));
  ov.addEventListener('dblclick',ev=>onDbl(ev,d));
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
}
function deactivate(d){
  if(!d._active) return;
  d._active=false; d._tok++;
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
  }catch(e){ if(e&&e.name!=='RenderingCancelledException') console.warn('render',e); }
}
function drawOverlay(d,pg){
  if(!d._active||!d._ov.width) return;
  const ov=d._ov, ctx=ov.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,ov.width,ov.height);
  const k=PXPT()*d._cs; const [a,b,c,e,f,g]=rotM(pg.rot,pg.w,pg.h);
  ctx.setTransform(a*k,b*k,c*k,e*k,f*k,g*k);
  for(const an of pg.annots) drawAnnot(ctx,an);
  const wm=wmFor(pg); if(wm) drawAnnot(ctx,wm);
  if(S.showBoxes) drawBoxes(ctx,pg);
  if(S.sel&&S.sel.pid===pg.id){const an=pg.annots.find(x=>x.id===S.sel.aid); if(an&&an.type==='note') drawNotePop(ctx,an);}
  if(drag&&drag.mode==='textbox'&&drag.pid===pg.id){
    const u=1/PXPT(); ctx.save(); ctx.strokeStyle='#2350d8'; ctx.lineWidth=1.5*u; ctx.setLineDash([5*u,4*u]);
    ctx.strokeRect(Math.min(drag.ax,drag.x),Math.min(drag.ay,drag.y),Math.abs(drag.x-drag.ax),Math.abs(drag.y-drag.ay)); ctx.restore();
  }
  if(S.sel&&S.sel.pid===pg.id){const an=pg.annots.find(x=>x.id===S.sel.aid); if(an) drawSel(ctx,d,pg,an);}
}
function drawSel(ctx,d,pg,a){
  ctx.save(); ctx.setTransform(1,0,0,1,0,0);
  const cs=d._cs,k=PXPT()*cs; const P=(x,y)=>{const [X,Y]=b2d(pg,x,y);return [X*k,Y*k];};
  ctx.strokeStyle='#2350d8'; ctx.fillStyle='#fff'; ctx.lineWidth=1.5*cs; ctx.setLineDash([5*cs,4*cs]);
  const hp=handlePoints(a);
  if(a.type!=='line'){
    const b=bboxOf(a), pad=(a.type==='pen')?3:0;
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
function redrawPage(pid){const d=pageEls.get(pid),pg=pageById(pid); if(d&&pg) drawOverlay(d,pg);}
function redrawAll(){for(const [id] of pageEls) redrawPage(id);}

function buildPages(){
  const next=new Map(); const frag=document.createDocumentFragment();
  S.pages.forEach(pg=>{
    let d=pageEls.get(pg.id); const key=`${pg.rot}|${S.zoom}`;
    if(!d||d._key!==key){ if(d) killEl(d); d=makePageEl(pg); }
    next.set(pg.id,d); frag.append(d);
  });
  for(const [id,d] of pageEls) if(!next.has(id)) killEl(d);
  pageEls=next; pagesBox.replaceChildren(frag);
  for(const [id,d] of pageEls) if(d._active) redrawPage(id);
}
