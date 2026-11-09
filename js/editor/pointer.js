'use strict';

/* ============================================================
   ポインタ操作
   ============================================================ */
let drag=null;
function ptrBase(ev,d,pg){
  const r=d._ov.getBoundingClientRect(); const px=PXPT();
  return d2b(pg,(ev.clientX-r.left)/px,(ev.clientY-r.top)/px);
}
function hitHandle(pg,a,ev,d){
  const r=d._ov.getBoundingClientRect(); const hp=handlePoints(a);
  for(let i=0;i<hp.length;i++){
    const [X,Y]=b2d(pg,hp[i][0],hp[i][1]);
    if(Math.hypot(ev.clientX-(r.left+X*PXPT()),ev.clientY-(r.top+Y*PXPT()))<=9) return i;
  }
  const es=edgeSegs(a);
  if(es){
    const px=ev.clientX-r.left,py=ev.clientY-r.top;
    for(let k=0;k<4;k++){
      const A=b2d(pg,es[k][0][0],es[k][0][1]),B=b2d(pg,es[k][1][0],es[k][1][1]),u=PXPT();
      if(distSeg(px,py,A[0]*u,A[1]*u,B[0]*u,B[1]*u)<=6) return 4+k;
    }
  }
  return -1;
}
const STICKY=new Set(['pen','highlight','strike','replace','insert','note']);
function onDown(ev,d){
  if(ev.button!==0) return;
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  const idx=S.pages.indexOf(pg); if(idx!==S.cur) setCur(idx);
  const [x,y]=ptrBase(ev,d,pg); const tol=6/PXPT(); const t=S.tool;
  if(t==='select'){
    ev.preventDefault();
    if(S.sel&&S.sel.pid===pg.id){
      const a=getSel();
      if(a){const h=hitHandle(pg,a,ev,d); if(h>=0){d._ov.setPointerCapture(ev.pointerId);d._ov.style.cursor=handleCursor(pg,a,h);drag={mode:'resize',pid:pg.id,aid:a.id,hi:h,orig:clone(a),moved:false};return;}}
    }
    const a=hitAnnot(pg,x,y,tol);
    if(a){
      select(pg.id,a.id);
      d._ov.setPointerCapture(ev.pointerId); d._ov.style.cursor='move';
      drag={mode:'move',pid:pg.id,aid:a.id,sx:x,sy:y,orig:clone(a),moved:false};
    } else select(null,null);
  } else if(t==='text'){
    ev.preventDefault(); d._ov.setPointerCapture(ev.pointerId);
    drag={mode:'textbox',pid:pg.id,ax:x,ay:y,x,y};
  } else if(t==='place'){
    ev.preventDefault(); placePending(pg,x,y);
  } else if(t==='insert'||t==='note'){
    ev.preventDefault(); addProofPoint(pg.id,x,y,t);
  } else {
    ev.preventDefault(); d._ov.setPointerCapture(ev.pointerId);
    const id=uid(); let a;
    if(t==='rect'||t==='ellipse') a={id,type:t,x,y,w:0,h:0,color:S.colors.shape,lw:S.lw,fill:S.fillOn?S.fillColor:null};
    else if(t==='highlight') a={id,type:'highlight',x,y,w:0,h:0,color:S.colors.highlight};
    else if(t==='redact') a={id,type:'redact',x,y,w:0,h:0};
    else if(t==='line') a={id,type:'line',x1:x,y1:y,x2:x,y2:y,color:S.colors.shape,lw:S.lw,arrow:S.arrow};
    else if(t==='pen') a={id,type:'pen',points:[[x,y]],color:S.colors.shape,lw:S.lw};
    else if(t==='strike'||t==='replace') a={id,type:t,x,y,w:0,h:0,color:S.colors.proof,size:S.sizes.proof,lw:1.2,text:t==='strike'?'トル':''};
    else return;
    stampMeta(a); pg.annots.push(a); drag={mode:'create',pid:pg.id,aid:id,ax:x,ay:y};
  }
}
function onMove(ev,d){
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  if(!drag){
    if(S.tool==='select'){
      let cur='default'; const sa=(S.sel&&S.sel.pid===pg.id)?getSel():null;
      const hh=sa?hitHandle(pg,sa,ev,d):-1;
      if(hh>=0) cur=handleCursor(pg,sa,hh);
      else {const [x,y]=ptrBase(ev,d,pg); if(hitAnnot(pg,x,y,6/PXPT())) cur='move';}
      d._ov.style.cursor=cur;
    }
    return;
  }
  if(drag.pid!==pg.id) return;
  if(drag.mode==='textbox'){const [tx,ty]=ptrBase(ev,d,pg); drag.x=tx; drag.y=ty; drawOverlay(d,pg); return;}
  const a=pg.annots.find(q=>q.id===drag.aid); if(!a) return;
  const [x,y]=ptrBase(ev,d,pg);
  if(drag.mode==='create'){
    if(a.type==='line'){
      let nx=x,ny=y;
      if(ev.shiftKey){const dx=x-a.x1,dy=y-a.y1,st=Math.PI/4,ang=Math.round(Math.atan2(dy,dx)/st)*st,L=Math.hypot(dx,dy);nx=a.x1+L*Math.cos(ang);ny=a.y1+L*Math.sin(ang);}
      a.x2=nx;a.y2=ny;
    } else if(a.type==='pen'){
      const l=a.points[a.points.length-1]; if(Math.hypot(x-l[0],y-l[1])>.8) a.points.push([x,y]);
    } else {
      let w=Math.abs(x-drag.ax),h=Math.abs(y-drag.ay);
      if(ev.shiftKey&&(a.type==='rect'||a.type==='ellipse')){const m=Math.max(w,h);w=h=m;}
      a.x=x>=drag.ax?drag.ax:drag.ax-w; a.y=y>=drag.ay?drag.ay:drag.ay-h; a.w=w; a.h=h;
    }
  } else if(drag.mode==='move'){
    const dx=x-drag.sx,dy=y-drag.sy;
    if(!drag.moved&&Math.hypot(dx,dy)<1.5/PXPT()*2) return;
    drag.moved=true; moveAnnot(a,drag.orig,dx,dy);
  } else if(drag.mode==='resize'){
    drag.moved=true; doResize(a,drag.orig,drag.hi,x,y);
  }
  drawOverlay(d,pg);
}
function onUp(ev,d){
  if(!drag) return;
  const dr=drag; drag=null;
  try{d._ov.releasePointerCapture(ev.pointerId);}catch(e){}
  const pg=pageById(dr.pid); if(!pg) return;
  if(dr.mode==='textbox'){
    drawOverlay(d,pg);
    const w=Math.abs(dr.x-dr.ax),hh=Math.abs(dr.y-dr.ay);
    if(w<12||hh<8) editText(pg.id,dr.ax,dr.ay,null);
    else editText(pg.id,0,0,null,{x:Math.min(dr.ax,dr.x),y:Math.min(dr.ay,dr.y),w,h:hh});
    return;
  }
  const a=pg.annots.find(q=>q.id===dr.aid); if(!a) return;
  if(dr.mode==='create'){
    let ok=true;
    if(a.type==='line') ok=Math.hypot(a.x2-a.x1,a.y2-a.y1)>3;
    else if(a.type==='pen'){ if(a.points.length===1) a.points.push([a.points[0][0]+.01,a.points[0][1]]); }
    else if(a.type==='strike'||a.type==='replace'){ ok=Math.max(a.w,a.h)>4; a.w=Math.max(a.w,2); a.h=Math.max(a.h,2); }
    else ok=a.w>2&&a.h>2;
    if(!ok){pg.annots=pg.annots.filter(q=>q.id!==a.id); drawOverlay(d,pg); return;}
    if(a.type==='replace'){ drawOverlay(d,pg); editProof(pg.id,a.id,true); return; }
    commit();
    if(STICKY.has(S.tool)){ redrawPage(pg.id); }
    else { setTool('select'); select(pg.id,a.id); }
  } else if(dr.moved){ commit(); }
}
function onDbl(ev,d){
  if(S.tool!=='select') return;
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  const [x,y]=ptrBase(ev,d,pg); const a=hitAnnot(pg,x,y,6/PXPT());
  if(a&&a.type==='text') editText(pg.id,a.x,a.y,a);
  else if(a&&PROOF.has(a.type)) editProof(pg.id,a.id,false);
}
