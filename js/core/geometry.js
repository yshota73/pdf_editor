'use strict';

/* ============================================================
   幾何 (注釈は「ページ基準座標」= 固有回転を適用した表示状態・左上原点・単位pt で保持)
   ============================================================ */
function rotM(rot,W,H){
  switch(rot){
    case 90:  return [0,1,-1,0,H,0];
    case 180: return [-1,0,0,-1,W,H];
    case 270: return [0,-1,1,0,0,W];
    default:  return [1,0,0,1,0,0];
  }
}
function b2d(pg,x,y){const [a,b,c,d,e,f]=rotM(pg.rot,pg.w,pg.h);return [a*x+c*y+e,b*x+d*y+f];}
function d2b(pg,X,Y){
  switch(pg.rot){
    case 90:  return [Y,pg.h-X];
    case 180: return [pg.w-X,pg.h-Y];
    case 270: return [pg.w-Y,X];
    default:  return [X,Y];
  }
}
function distSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;
  let t=l2?((px-x1)*dx+(py-y1)*dy)/l2:0; t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}
const arrowPts=a=>{
  const th=Math.atan2(a.y2-a.y1,a.x2-a.x1),L=Math.max(9,a.lw*4.5);
  return [[a.x2-L*Math.cos(th-.42),a.y2-L*Math.sin(th-.42)],[a.x2-L*Math.cos(th+.42),a.y2-L*Math.sin(th+.42)]];
};
