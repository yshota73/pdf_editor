'use strict';

/* ============================================================
   ポインタ操作
   ============================================================ */
let drag=null;
/* ---- iPad だけの仕様: 手書き・マーカー・消しゴムはタッチペン（Apple Pencil など）だけで書け、指はスクロールになる ---- */
const PEN_ONLY_TOOLS=new Set(['pen','highlight','eraser']);
// iPadOS 13 以降の Safari は Mac として名乗るので、タッチ対応の「Mac」も iPad とみなす
const IS_IPAD=/iPad/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
// ペンか指かは Pointer Events の pointerType で見分ける（'pen' / 'touch'）
const fingerBlocked=ev=>IS_IPAD&&ev.pointerType==='touch'&&PEN_ONLY_TOOLS.has(S.tool);
/* これらのツールは touch-action:none のまま（ペンでスクロールが起きないように）なので、
   指でなぞったときのスクロールは pointermove から自分で動かす */
let fingerPan=null;
const touchIds=new Set();   // 画面に触れている指の pointerId
function fingerDown(ev,d){
  touchIds.add(ev.pointerId);
  if(touchIds.size>1){ fingerPan=null; return; }   // 2本目の指: ピンチでの拡大縮小に任せる
  try{d._ov.setPointerCapture(ev.pointerId);}catch(_){}
  fingerPan={id:ev.pointerId,x:ev.clientX,y:ev.clientY};
}
function fingerMove(ev){
  if(!fingerPan||ev.pointerId!==fingerPan.id||zg) return;
  const dx=ev.clientX-fingerPan.x, dy=ev.clientY-fingerPan.y; fingerPan.x=ev.clientX; fingerPan.y=ev.clientY;
  if(fitsX()) panX(dx); else viewBox.scrollLeft-=dx;
  viewBox.scrollTop-=dy;
}
function fingerUp(ev){
  touchIds.delete(ev.pointerId);
  if(fingerPan&&fingerPan.id===ev.pointerId) fingerPan=null;
}
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
function onDown(ev,d){
  if(ev.button!==0) return;
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  const idx=S.pages.indexOf(pg); if(idx!==S.cur) setCur(idx);
  if(S.tool==='none'){ if(S.sel) select(null,null); return; }   // ツールなし: 選択を外すだけ（ドラッグはページの移動になる）
  const [x,y]=ptrBase(ev,d,pg); const tol=6/PXPT(); const t=S.tool;
  if(t==='select'){
    ev.preventDefault();
    if(S.sel&&S.sel.pid===pg.id){
      const a=getSel();
      if(a){const h=hitHandle(pg,a,ev,d); if(h>=0){d._ov.setPointerCapture(ev.pointerId);d._ov.style.cursor=handleCursor(pg,a,h);drag={mode:'resize',pid:pg.id,aid:a.id,hi:h,orig:clone(a),moved:false};return;}}
    }
    const a=hitAnnot(pg,x,y,tol);
    if(a&&a.draft&&isEmptyText(a)){ editText(pg.id,0,0,a); return; }   // 空のテキストボックスの中をクリック: 入力を始める
    if(a){
      select(pg.id,a.id);
      d._ov.setPointerCapture(ev.pointerId); d._ov.style.cursor='move';
      drag={mode:'move',pid:pg.id,aid:a.id,sx:x,sy:y,orig:clone(a),moved:false};
    } else select(null,null);
  } else if(t==='lasso'){
    lassoDown(ev,d,pg,x,y);
  } else if(t==='text'){
    ev.preventDefault();
    const hit=hitAnnot(pg,x,y,tol);
    if(hit&&hit.type==='text'){ editText(pg.id,hit.x,hit.y,hit); return; }   // 既にあるテキストをクリック: 編集（文字の大きさも変えられる）
    d._ov.setPointerCapture(ev.pointerId);
    drag={mode:'textbox',pid:pg.id,ax:x,ay:y,x,y};
  } else if(t==='place'){
    ev.preventDefault(); placePending(pg,x,y);
  } else if(t==='note'&&(()=>{const a=hitAnnot(pg,x,y,tol); return a&&a.type==='note'?a:null;})()){
    // 既にある付箋をクリック: 新しく貼らずに、その付箋のコメントを表示する
    ev.preventDefault(); const a=hitAnnot(pg,x,y,tol);
    if(S.sel&&S.sel.aid===a.id) select(null,null); else select(pg.id,a.id);
  } else if(t==='insert'||t==='note'){
    ev.preventDefault(); addProofPoint(pg.id,x,y,t);
  } else if(t==='eraser'){
    ev.preventDefault(); d._ov.setPointerCapture(ev.pointerId);
    drag={mode:'erase',pid:pg.id,lx:x,ly:y,changed:eraseAlong(pg,x,y,x,y)};
    setEraserPos(pg.id,x,y);
  } else {
    ev.preventDefault(); d._ov.setPointerCapture(ev.pointerId);
    const id=uid(); let a;
    if(t==='rect'||t==='ellipse') a={id,type:t,x,y,w:0,h:0,color:S.colors.shape,lw:S.lw,fill:S.fillOn?S.fillColor:null};
    else if(t==='highlight') a={id,type:'marker',points:[[x,y]],color:S.colors.highlight,lw:S.markerW};
    else if(t==='redact') a={id,type:'redact',x,y,w:0,h:0};
    else if(t==='line') a={id,type:'line',x1:x,y1:y,x2:x,y2:y,color:S.colors.shape,lw:S.lw,arrow:S.arrow};
    else if(t==='pen') a={id,type:'pen',points:[[x,y]],color:S.colors.shape,lw:S.lw};
    else if(t==='strike'||t==='replace') a={id,type:t,x,y,w:0,h:0,color:S.colors.proof,size:S.sizes.proof,lw:1.2,text:t==='strike'?'トル':''};
    else return;
    stampMeta(a); pg.annots.push(a); drag={mode:'create',pid:pg.id,aid:id,ax:x,ay:y};
  }
}
/* ---- マーカー: ある程度引いてから止めると直線になる ---- */
const HOLD_MS=450, HOLD_TOL=3, HOLD_MIN=40;   // 止める時間(ms)・止まっているとみなす動き(px)・直線にする最短の長さ(px)
const SNAP_DEG=4;                              // 水平・垂直からこの角度以内ならぴったり水平・垂直にする
function snapLine(p0,p){
  const dx=p[0]-p0[0], dy=p[1]-p0[1], deg=Math.abs(Math.atan2(dy,dx)*180/Math.PI);
  if(Math.min(deg,180-deg)<=SNAP_DEG) return [p[0],p0[1]];
  if(Math.abs(deg-90)<=SNAP_DEG) return [p0[0],p[1]];
  return [p[0],p[1]];
}
function armHold(dr,d,pg,a,ev){
  if(dr.holdAt&&Math.hypot(ev.clientX-dr.holdAt[0],ev.clientY-dr.holdAt[1])<=HOLD_TOL) return;   // 止まっている間はそのまま待つ
  dr.holdAt=[ev.clientX,ev.clientY]; clearTimeout(dr.holdT);
  dr.holdT=setTimeout(()=>{
    if(drag!==dr||dr.straight) return;
    const p0=a.points[0], pl=a.points[a.points.length-1];
    if(Math.hypot(pl[0]-p0[0],pl[1]-p0[1])*PXPT()<HOLD_MIN) return;
    dr.straight=true; a.points=[p0,snapLine(p0,pl)]; drawOverlay(d,pg);
  },HOLD_MS);
}
/* 付箋にマウスを重ねたらコメントを表示する（どのツールでも） */
function setHoverNote(pg,x,y){
  let h=null;
  if(pg&&x!=null) for(let i=pg.annots.length-1;i>=0;i--){const a=pg.annots[i]; if(a.type==='note'&&x>=a.x-2&&x<=a.x+NOTE+2&&y>=a.y-2&&y<=a.y+NOTE+2){h={pid:pg.id,aid:a.id};break;}}
  const o=S.hoverNote;
  if((o&&o.aid)===(h&&h.aid)) return;
  S.hoverNote=h; if(o) redrawPage(o.pid); if(h&&(!o||o.pid!==h.pid)) redrawPage(h.pid);
  for(const d of pageEls.values()) if(+d.dataset.pid===(h||o).pid) d._ov.style.cursor=h?'pointer':'';
}
function onMove(ev,d){
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  if(!drag){ const [hx,hy]=ptrBase(ev,d,pg); setHoverNote(pg,hx,hy); if(S.hoverNote&&S.tool!=='select') return; }
  if(!drag){
    if(S.tool==='select'){
      let cur='default'; const sa=(S.sel&&S.sel.pid===pg.id)?getSel():null;
      const hh=sa?hitHandle(pg,sa,ev,d):-1;
      if(hh>=0) cur=handleCursor(pg,sa,hh);
      else {const [x,y]=ptrBase(ev,d,pg); if(hitAnnot(pg,x,y,6/PXPT())) cur='move';}
      d._ov.style.cursor=cur;
    } else if(S.tool==='eraser'){const [x,y]=ptrBase(ev,d,pg); setEraserPos(pg.id,x,y);}
    else if(S.tool==='lasso'){const [x,y]=ptrBase(ev,d,pg); d._ov.style.cursor=lassoInside(pg,x,y)?'move':'';}
    return;
  }
  if(drag.pid!==pg.id) return;
  if(drag.mode==='lasso'||drag.mode==='lassoMove'){const [x,y]=ptrBase(ev,d,pg); lassoMove(ev,d,pg,x,y); return;}
  if(drag.mode==='textbox'){const [tx,ty]=ptrBase(ev,d,pg); drag.x=tx; drag.y=ty; drawOverlay(d,pg); return;}
  if(drag.mode==='erase'){
    const [x,y]=ptrBase(ev,d,pg);
    if(eraseAlong(pg,drag.lx,drag.ly,x,y)) drag.changed=true;
    drag.lx=x; drag.ly=y; setEraserPos(pg.id,x,y); return;
  }
  const a=pg.annots.find(q=>q.id===drag.aid); if(!a) return;
  const [x,y]=ptrBase(ev,d,pg);
  if(drag.mode==='create'){
    if(a.type==='line'){
      let nx=x,ny=y;
      if(ev.shiftKey){const dx=x-a.x1,dy=y-a.y1,st=Math.PI/4,ang=Math.round(Math.atan2(dy,dx)/st)*st,L=Math.hypot(dx,dy);nx=a.x1+L*Math.cos(ang);ny=a.y1+L*Math.sin(ang);}
      a.x2=nx;a.y2=ny;
    } else if(a.type==='pen'){
      const l=a.points[a.points.length-1]; if(Math.hypot(x-l[0],y-l[1])>.8) a.points.push([x,y]);
    } else if(a.type==='marker'){
      // Shift を押している・止めて直線になった後は、始点からの直線のまま伸び縮みする
      if(ev.shiftKey||drag.straight) a.points=[a.points[0],snapLine(a.points[0],[x,y])];
      else { const l=a.points[a.points.length-1]; if(Math.hypot(x-l[0],y-l[1])>.8) a.points.push([x,y]); armHold(drag,d,pg,a,ev); }
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
  const dr=drag; drag=null; clearTimeout(dr.holdT);
  try{d._ov.releasePointerCapture(ev.pointerId);}catch(e){}
  const pg=pageById(dr.pid); if(!pg) return;
  if(dr.mode==='textbox'){
    drawOverlay(d,pg);
    const w=Math.abs(dr.x-dr.ax),hh=Math.abs(dr.y-dr.ay);
    if(w<12||hh<8) editText(pg.id,dr.ax,dr.ay,null);
    else editText(pg.id,0,0,null,{x:Math.min(dr.ax,dr.x),y:Math.min(dr.ay,dr.y),w,h:hh});
    return;
  }
  if(dr.mode==='erase'){ if(dr.changed){syncOptions(); commit();} return; }
  if(dr.mode==='lasso'||dr.mode==='lassoMove'){ lassoUp(dr,d,pg); return; }
  const a=pg.annots.find(q=>q.id===dr.aid); if(!a) return;
  if(dr.mode==='create'){
    let ok=true;
    if(a.type==='line') ok=Math.hypot(a.x2-a.x1,a.y2-a.y1)>3;
    else if(a.type==='pen'){ if(a.points.length===1) a.points.push([a.points[0][0]+.01,a.points[0][1]]); }
    else if(a.type==='marker'){ const b=bboxOf(a); ok=Math.max(b.w,b.h)>2; }
    else if(a.type==='strike'||a.type==='replace'){ ok=Math.max(a.w,a.h)>4; a.w=Math.max(a.w,2); a.h=Math.max(a.h,2); }
    else ok=a.w>2&&a.h>2;
    if(!ok){pg.annots=pg.annots.filter(q=>q.id!==a.id); drawOverlay(d,pg); return;}
    if(a.type==='replace'){ drawOverlay(d,pg); editProof(pg.id,a.id,true); return; }
    commit(); redrawPage(pg.id);   // どのツールも、使った後は同じツールのまま続けて使える
  } else if(dr.moved){ commit(); }
}
function onDbl(ev,d){
  const pg=pageById(+d.dataset.pid); if(!pg) return;
  const [x,y]=ptrBase(ev,d,pg); const a=hitAnnot(pg,x,y,6/PXPT());
  // 付箋の編集は付箋ツールでもダブルクリックでできる
  if(S.tool==='note'&&a&&a.type==='note'){ editProof(pg.id,a.id,false); return; }
  if(S.tool!=='select') return;
  if(a&&a.type==='text') editText(pg.id,a.x,a.y,a);
  else if(a&&PROOF.has(a.type)) editProof(pg.id,a.id,false);
}
