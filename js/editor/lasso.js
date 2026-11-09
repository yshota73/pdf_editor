'use strict';

/* ============================================================
   投げ縄: 自由に囲んだ範囲の注釈をまとめて選び、移動・複製・コピー・切り取り・削除する
   S.lasso = {pid, ids:[注釈id], path:[[x,y],...]}  座標はページ基準(pt)
   ============================================================ */
const LASSO_PT_RATIO=.6;   // 手書き・マーカーは、点のこの割合以上が囲みの中にあれば選ぶ

function inPoly(poly,x,y){
  let c=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [xi,yi]=poly[i],[xj,yj]=poly[j];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c;
  }
  return c;
}
/* 注釈が囲みの中にあるか */
function lassoHit(a,poly){
  if(a.sys||isEmptyText(a)) return false;   // ノンブル・柱など自動で入れたものは対象外
  if(a.type==='pen'||a.type==='marker'){
    const n=a.points.filter(p=>inPoly(poly,p[0],p[1])).length;
    return n>=Math.max(1,a.points.length*LASSO_PT_RATIO);
  }
  if(a.type==='line') return [[a.x1,a.y1],[a.x2,a.y2],[(a.x1+a.x2)/2,(a.y1+a.y2)/2]].filter(p=>inPoly(poly,p[0],p[1])).length>=2;
  const b=bboxOf(a); return inPoly(poly,b.x+b.w/2,b.y+b.h/2);
}
const lassoAnnots=()=>{ const L=S.lasso, pg=L&&pageById(L.pid); return pg?pg.annots.filter(a=>L.ids.includes(a.id)):[]; };
function lassoBox(){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const a of lassoAnnots()){
    const b=fullBox(a), p=(a.type==='pen'||a.type==='marker'||a.type==='line')?(a.lw||0)/2:0;
    x0=Math.min(x0,b.x-p); y0=Math.min(y0,b.y-p); x1=Math.max(x1,b.x+b.w+p); y1=Math.max(y1,b.y+b.h+p);
  }
  return x0>x1?null:{x:x0,y:y0,w:x1-x0,h:y1-y0};
}
function lassoInside(pg,x,y){
  const L=S.lasso; if(!L||L.pid!==pg.id||!L.ids.length) return false;
  const b=lassoBox(), t=6/PXPT();
  if(b&&x>=b.x-t&&x<=b.x+b.w+t&&y>=b.y-t&&y<=b.y+b.h+t) return true;
  return !!(L.path&&L.path.length>2&&inPoly(L.path,x,y));
}
function clearLasso(){
  const L=S.lasso; S.lasso=null; lassoBar.remove();
  if(L) redrawPage(L.pid);
}

/* ---- ポインタ操作（pointer.js から呼ばれる） ---- */
function lassoDown(ev,d,pg,x,y){
  ev.preventDefault(); d._ov.setPointerCapture(ev.pointerId);
  if(lassoInside(pg,x,y)){   // 選んだものの上: まとめて移動
    const orig=new Map(lassoAnnots().map(a=>[a.id,clone(a)]));
    drag={mode:'lassoMove',pid:pg.id,sx:x,sy:y,orig,path0:S.lasso.path&&S.lasso.path.map(p=>p.slice()),moved:false};
    return;
  }
  const prev=S.lasso; S.lasso={pid:pg.id,ids:[],path:[[x,y]]}; lassoBar.remove();
  if(prev&&prev.pid!==pg.id) redrawPage(prev.pid);
  drag={mode:'lasso',pid:pg.id};
}
function lassoMove(ev,d,pg,x,y){
  const L=S.lasso; if(!L) return;
  if(drag.mode==='lasso'){
    const l=L.path[L.path.length-1];
    if(Math.hypot(x-l[0],y-l[1])*PXPT()>2) L.path.push([x,y]);
  }else{
    const dx=x-drag.sx, dy=y-drag.sy;
    if(!drag.moved&&Math.hypot(dx,dy)*PXPT()<3) return;
    drag.moved=true;
    for(const a of lassoAnnots()) moveAnnot(a,drag.orig.get(a.id),dx,dy);
    if(drag.path0) L.path=drag.path0.map(p=>[p[0]+dx,p[1]+dy]);
  }
  drawOverlay(d,pg);
}
function lassoUp(dr,d,pg){
  const L=S.lasso; if(!L) return;
  if(dr.mode==='lasso'){
    L.ids=L.path.length>2?pg.annots.filter(a=>lassoHit(a,L.path)).map(a=>a.id):[];
    if(!L.ids.length){ S.lasso=null; setStatus('囲んだ範囲に注釈がありません'); }
    else setStatus(`${L.ids.length}個の注釈を選びました。ドラッグで移動できます`);
    drawOverlay(d,pg);
  }else if(dr.moved){ commit(); drawOverlay(d,pg); }
}

/* ---- 描画（pages.js の drawOverlay から呼ばれる。座標はページ基準） ---- */
function drawLasso(ctx,d,pg){
  const L=S.lasso;
  if(!L||L.pid!==pg.id){ if(lassoBar.parentNode===d) lassoBar.remove(); return; }
  const u=1/PXPT();
  ctx.save(); ctx.lineWidth=1.5*u; ctx.strokeStyle='#2350d8'; ctx.setLineDash([6*u,4*u]);
  if(L.path&&L.path.length>1){
    ctx.beginPath(); L.path.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
    if(L.ids.length||!(drag&&drag.mode==='lasso')) ctx.closePath();
    ctx.fillStyle='rgba(35,80,216,.06)'; ctx.fill(); ctx.stroke();
  }
  const b=L.ids.length&&lassoBox();
  if(b){ ctx.setLineDash([]); ctx.strokeStyle='rgba(35,80,216,.55)'; ctx.strokeRect(b.x-2*u,b.y-2*u,b.w+4*u,b.h+4*u); }
  ctx.restore();
  if(b&&!(drag&&drag.mode==='lassoMove')) placeLassoBar(d,pg,b); else lassoBar.remove();
}
/* 選んだものの上に出る操作ボタン */
const lassoBar=document.createElement('div');
lassoBar.className='lasso-bar';
lassoBar.innerHTML=`<button type="button" data-act="dup" title="複製 (Ctrl+D)">複製</button><button type="button" data-act="copy" title="コピー (Ctrl+C)">コピー</button><button type="button" data-act="cut" title="切り取り (Ctrl+X)">切り取り</button><button type="button" data-act="del" class="danger" title="削除 (Delete)">削除</button>`;
lassoBar.addEventListener('pointerdown',e=>e.stopPropagation());
lassoBar.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  ({dup:lassoDuplicate,copy:lassoCopy,cut:lassoCut,del:lassoDelete})[b.dataset.act]();
});
function placeLassoBar(d,pg,b){
  const px=PXPT(), cs=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(p=>b2d(pg,p[0],p[1]));
  const X0=Math.min(...cs.map(p=>p[0]))*px, Y0=Math.min(...cs.map(p=>p[1]))*px, Y1=Math.max(...cs.map(p=>p[1]))*px;
  if(lassoBar.parentNode!==d) d.append(lassoBar);
  const h=lassoBar.offsetHeight||32, w=lassoBar.offsetWidth||220;
  lassoBar.style.left=Math.max(0,Math.min(X0,d.clientWidth-w))+'px';
  lassoBar.style.top=(Y0-h-8>=0?Y0-h-8:Y1+8)+'px';
}

/* ---- 操作 ---- */
const PASTE_OFF=14;   // 複製・貼り付けでずらす量(画面上のpt)
function offsetCopies(pg,list){
  const o0=d2b(pg,0,0), o1=d2b(pg,PASTE_OFF,PASTE_OFF), dx=o1[0]-o0[0], dy=o1[1]-o0[1];
  return list.map(src=>{const a=clone(src); a.id=uid(); moveAnnot(a,clone(src),dx,dy); return stampMeta(a);});
}
function selectGroup(pg,list,path){
  if(S.tool!=='lasso') setTool('lasso');
  S.lasso={pid:pg.id,ids:list.map(a=>a.id),path:path||null};
  redrawPage(pg.id);
}
function lassoDuplicate(){
  const list=lassoAnnots(); if(!list.length) return;
  const pg=pageById(S.lasso.pid), copies=offsetCopies(pg,list);
  const o0=d2b(pg,0,0), o1=d2b(pg,PASTE_OFF,PASTE_OFF);
  const path=S.lasso.path&&S.lasso.path.map(p=>[p[0]+o1[0]-o0[0],p[1]+o1[1]-o0[1]]);
  pg.annots.push(...copies); commit(); selectGroup(pg,copies,path);
  toast(`${copies.length}個を複製しました`);
}
function lassoCopy(){
  const list=lassoAnnots(); if(!list.length) return false;
  S.clip=list.map(clone); toast(`${list.length}個をコピーしました（Ctrl+V で貼り付け。別のページにも貼り付けできます）`); updateUI();
  return true;
}
function lassoDelete(){
  const L=S.lasso, list=lassoAnnots(); if(!list.length) return;
  const pg=pageById(L.pid); pg.annots=pg.annots.filter(a=>!L.ids.includes(a.id));
  clearLasso(); commit(); toast(`${list.length}個を削除しました`);
}
function lassoCut(){ if(lassoCopy()) lassoDelete(); }
/* 貼り付け: 表示中のページへ。元と同じページなら少しずらし、続けて貼るたびにずれていく */
function pasteClip(){
  if(!S.clip||!hasDoc()) return;
  const list=Array.isArray(S.clip)?S.clip:[S.clip], pg=S.pages[S.cur];
  const copies=offsetCopies(pg,list);
  S.clip=copies.map(clone);
  pg.annots.push(...copies); commit();
  if(copies.length===1&&S.tool!=='lasso'){ setTool('select'); select(pg.id,copies[0].id); }
  else selectGroup(pg,copies,null);
}
function lassoNudge(dx,dy){
  const list=lassoAnnots(); if(!list.length) return;
  const pg=pageById(S.lasso.pid);
  for(const a of list) moveAnnot(a,clone(a),dx,dy);
  if(S.lasso.path) S.lasso.path=S.lasso.path.map(p=>[p[0]+dx,p[1]+dy]);
  redrawPage(pg.id);
}
on('#btnPaste','click',pasteClip);
