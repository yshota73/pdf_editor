'use strict';

/* ============================================================
   消しゴム (手書きの線をなぞった部分だけ、または線ごと消す)
   ============================================================ */
/* 消しゴムが (x0,y0)→(x1,y1) と動いた範囲にかかる手書きを消す。変更があれば true */
function eraseAlong(pg,x0,y0,x1,y1){
  const r=S.eraser.size/2; let changed=false; const out=[];
  for(const a of pg.annots){
    if(a.type!=='pen'&&a.type!=='marker'){out.push(a);continue;}
    const re=r+a.lw/2, b=bboxOf(a);
    if(Math.max(x0,x1)<b.x-re||Math.min(x0,x1)>b.x+b.w+re||Math.max(y0,y1)<b.y-re||Math.min(y0,y1)>b.y+b.h+re){out.push(a);continue;}
    const pieces=S.eraser.whole?eraseWhole(a,re,x0,y0,x1,y1):erasePart(a,re,x0,y0,x1,y1);
    if(!pieces){out.push(a);continue;}
    changed=true; out.push(...pieces);
    if(S.sel&&S.sel.aid===a.id) S.sel=null;
  }
  if(changed) pg.annots=out;
  return changed;
}
/* 線ごと消す: 線のどこかが消しゴムに触れたら丸ごと削除 */
function eraseWhole(a,re,x0,y0,x1,y1){
  const p=a.points, n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)/(re/2)));
  for(let k=0;k<=n;k++){
    const ex=x0+(x1-x0)*k/n, ey=y0+(y1-y0)*k/n;
    for(let i=0;i<p.length-1;i++) if(distSeg(ex,ey,p[i][0],p[i][1],p[i+1][0],p[i+1][1])<=re) return [];
    if(p.length===1&&Math.hypot(ex-p[0][0],ey-p[0][1])<=re) return [];
  }
  return null;
}
/* なぞった部分だけ消す: 線を細かく分割し、消しゴムに触れた点を除いて複数の線に分ける */
function erasePart(a,re,x0,y0,x1,y1){
  const step=Math.max(.5,re/3), pts=[];
  a.points.forEach((q,i)=>{
    if(i){
      const o=a.points[i-1], n=Math.ceil(Math.hypot(q[0]-o[0],q[1]-o[1])/step);
      for(let k=1;k<n;k++) pts.push([o[0]+(q[0]-o[0])*k/n,o[1]+(q[1]-o[1])*k/n]);
    }
    pts.push(q);
  });
  const hit=pts.map(q=>distSeg(q[0],q[1],x0,y0,x1,y1)<=re);
  if(!hit.some(Boolean)) return null;
  const runs=[]; let cur=[];
  pts.forEach((q,i)=>{ if(hit[i]){if(cur.length) runs.push(cur); cur=[];} else cur.push(q); });
  if(cur.length) runs.push(cur);
  return runs.filter(rn=>rn.length>1).map(rn=>({...a,id:uid(),points:rn}));
}
/* 消しゴムの範囲を示す円 */
function drawEraserCursor(ctx,pg){
  const e=S.eraserPos; if(S.tool!=='eraser'||!e||e.pid!==pg.id) return;
  const u=1/PXPT();
  ctx.save(); ctx.lineWidth=1.2*u;
  ctx.beginPath(); ctx.arc(e.x,e.y,S.eraser.size/2,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,.35)'; ctx.fill();
  ctx.strokeStyle='#555'; ctx.setLineDash([3*u,2*u]); ctx.stroke();
  ctx.restore();
}
function setEraserPos(pid,x,y){
  const prev=S.eraserPos; S.eraserPos=pid==null?null:{pid,x,y};
  if(prev&&prev.pid!==pid) redrawPage(prev.pid);
  if(pid!=null) redrawPage(pid);
}
function onLeave(){ if(S.eraserPos&&!drag) setEraserPos(null); if(S.hoverNote) setHoverNote(null); }
/* 消しゴムの太さ: 細・中・太のボタン、または数値（マーカーの太さと同じ操作） */
function setEraserSize(v){
  v=Math.max(1,Math.min(200,+v||12)); S.eraser.size=v;
  $('#optEraser').value=String(Math.round(v*10)/10);
  $$('#optEraserSeg [data-ew]').forEach(b=>b.classList.toggle('active',+b.dataset.ew===v));
  if(S.eraserPos) redrawPage(S.eraserPos.pid);   // 範囲を示す円の大きさも変える
}
$$('#optEraserSeg [data-ew]').forEach(b=>b.addEventListener('click',()=>setEraserSize(+b.dataset.ew)));
on('#optEraser','input',e=>{if(e.target.value!=='') setEraserSize(e.target.value);});
on('#optEraser','change',e=>setEraserSize(e.target.value));
setEraserSize(S.eraser.size);
on('#optEraseWhole','change',e=>{S.eraser.whole=e.target.checked;});
