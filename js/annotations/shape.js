'use strict';

/* ============================================================
   注釈 外接矩形・ハンドル・当たり判定・移動・変形
   ============================================================ */
function bboxOf(a){
  if(a.type==='insert'){const s=caretSize(a); return unionBox({x:a.x-s,y:a.y-s,w:2*s,h:2*s},labelBox(a));}
  if(a.type==='line') return {x:Math.min(a.x1,a.x2),y:Math.min(a.y1,a.y2),w:Math.abs(a.x1-a.x2),h:Math.abs(a.y1-a.y2)};
  if(a.type==='pen'||a.type==='marker'){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const p of a.points){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
    return {x:x0,y:y0,w:x1-x0,h:y1-y0};
  }
  return {x:a.x,y:a.y,w:a.w,h:a.h};
}
function handlePoints(a){
  if(a.type==='line') return [[a.x1,a.y1],[a.x2,a.y2]];
  if(['rect','ellipse','highlight','redact','image','text','strike','replace'].includes(a.type))
    return [[a.x,a.y],[a.x+a.w,a.y],[a.x+a.w,a.y+a.h],[a.x,a.y+a.h]];
  return [];
}
const EDGE_TYPES=['rect','ellipse','highlight','redact','text','strike','replace'];
function edgeSegs(a){
  if(!EDGE_TYPES.includes(a.type)) return null;
  const b=bboxOf(a),x1=b.x+b.w,y1=b.y+b.h;
  return [[[b.x,b.y],[x1,b.y]],[[x1,b.y],[x1,y1]],[[x1,y1],[b.x,y1]],[[b.x,y1],[b.x,b.y]]]; // 上・右・下・左 = ハンドル4〜7
}
function handleCursor(pg,a,hi){
  if(a.type==='line') return 'crosshair';
  const [ma,mb,mc,md]=rotM(pg.rot,pg.w,pg.h);
  if(hi<4){
    const b=bboxOf(a),hp=handlePoints(a)[hi],vx=hp[0]-(b.x+b.w/2),vy=hp[1]-(b.y+b.h/2);
    return (ma*vx+mc*vy)*(mb*vx+md*vy)>0?'nwse-resize':'nesw-resize';
  }
  const n=[[0,-1],[1,0],[0,1],[-1,0]][hi-4];
  return Math.abs(ma*n[0]+mc*n[1])>Math.abs(mb*n[0]+md*n[1])?'ew-resize':'ns-resize';
}
function hitAnnot(pg,x,y,tol){
  for(let i=pg.annots.length-1;i>=0;i--){
    const a=pg.annots[i];
    if(a.type==='line'){ if(distSeg(x,y,a.x1,a.y1,a.x2,a.y2)<=tol+a.lw/2) return a; }
    else if(a.type==='pen'||a.type==='marker'){
      const p=a.points;
      if(p.length===1&&Math.hypot(x-p[0][0],y-p[0][1])<=tol+a.lw/2) return a;
      for(let j=0;j<p.length-1;j++) if(distSeg(x,y,p[j][0],p[j][1],p[j+1][0],p[j+1][1])<=tol+a.lw/2) return a;
    } else {
      const b=fullBox(a);
      if(x>=b.x-tol&&x<=b.x+b.w+tol&&y>=b.y-tol&&y<=b.y+b.h+tol) return a;
    }
  }
  return null;
}
function moveAnnot(a,o,dx,dy){
  if(a.type==='line'){a.x1=o.x1+dx;a.y1=o.y1+dy;a.x2=o.x2+dx;a.y2=o.y2+dy;}
  else if(a.type==='pen'||a.type==='marker'){a.points=o.points.map(p=>[p[0]+dx,p[1]+dy]);}
  else {a.x=o.x+dx;a.y=o.y+dy;}
}
function doResize(a,o,hi,x,y){
  if(a.type==='line'){ if(hi===0){a.x1=x;a.y1=y;} else {a.x2=x;a.y2=y;} return; }
  if(hi>=4){
    if(hi===4){const yb=o.y+o.h; a.y=Math.min(y,yb); a.h=Math.abs(y-yb);}
    else if(hi===6){a.y=Math.min(y,o.y); a.h=Math.abs(y-o.y);}
    else if(hi===5){a.x=Math.min(x,o.x); a.w=Math.abs(x-o.x);}
    else {const xr=o.x+o.w; a.x=Math.min(x,xr); a.w=Math.abs(x-xr);}
    if(a.type==='text'){
      a.fixed=true;
      if(a.w<14){a.w=14; if(hi===7) a.x=o.x+o.w-14;}
      const m=measureText(a); if(a.h<m.h){a.h=m.h; if(hi===4) a.y=o.y+o.h-a.h;}
    }
    return;
  }
  const c=[[o.x,o.y],[o.x+o.w,o.y],[o.x+o.w,o.y+o.h],[o.x,o.y+o.h]];
  const f=c[(hi+2)%4];
  if(a.type==='image'){
    const asp=o.w/o.h; const w=Math.max(8,Math.abs(x-f[0])); const h=w/asp;
    a.w=w; a.h=h; a.x=(x>=f[0])?f[0]:f[0]-w; a.y=(y>=f[1])?f[1]:f[1]-h;
  } else {
    a.x=Math.min(f[0],x); a.y=Math.min(f[1],y); a.w=Math.abs(x-f[0]); a.h=Math.abs(y-f[1]);
    if(a.type==='text'){
      a.fixed=true; a.w=Math.max(a.w,14); if(x<f[0]) a.x=f[0]-a.w;
      const m=measureText(a);
      if(a.h<m.h){a.h=m.h; a.y=(y>=f[1])?f[1]:f[1]-a.h;}
    }
  }
}
