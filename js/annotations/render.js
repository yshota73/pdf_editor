'use strict';

/* ============================================================
   注釈 描画・当たり判定
   ============================================================ */
const mctx=document.createElement('canvas').getContext('2d');
/* テキスト注釈のフォント（太字・斜体を含む） */
const textFont=a=>`${a.italic?'italic ':''}${a.bold?'bold ':''}${a.size}px ${FONT}`;
function wrapText(text,width,size,font){
  mctx.font=font||`${size}px ${FONT}`;
  const out=[];
  for(const para of String(text).split('\n')){
    if(!para){out.push('');continue;}
    const toks=para.match(/[\x21-\x7E]+|\s|[^\x00-\x7F]/gu)||[];
    let line='';
    for(const t of toks){
      if(mctx.measureText(line+t).width<=width){line+=t;continue;}
      if(/^\s$/.test(t)) continue;
      if(line) out.push('');
      if(line) out[out.length-1]=line;
      line='';
      if(t.length>1&&mctx.measureText(t).width>width){
        let seg='';
        for(const ch of t){ if(seg&&mctx.measureText(seg+ch).width>width){out.push(seg);seg='';} seg+=ch; }
        line=seg;
      } else line=t;
    }
    out.push(line);
  }
  return out;
}
const getLines=a=>a.fixed?wrapText(a.text,Math.max(a.w,4),a.size,textFont(a)):String(a.text).split('\n');
function measureText(a){
  const lines=getLines(a); mctx.font=textFont(a); let w=0;
  for(const l of lines) w=Math.max(w,mctx.measureText(l).width);
  return {w:a.fixed?a.w:Math.max(w,4),h:lines.length*a.size*LH};
}
function refitText(a){
  const m=measureText(a);
  if(a.fixed){a.h=Math.max(a.h||0,m.h);} else {a.w=m.w;a.h=m.h;}
}
function drawAnnot(ctx,a){
  ctx.save();
  switch(a.type){
    case 'highlight': ctx.globalAlpha=.4; ctx.fillStyle=a.color; ctx.fillRect(a.x,a.y,a.w,a.h); break;
    case 'marker':   // 1本の線として描くので、重なった所も濃くならない
      ctx.globalAlpha=.4; ctx.lineCap='butt'; ctx.lineJoin='round'; ctx.lineWidth=a.lw; ctx.strokeStyle=a.color;
      ctx.beginPath(); a.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
      if(a.points.length===1) ctx.lineTo(a.points[0][0]+.01,a.points[0][1]);
      ctx.stroke(); break;
    case 'redact': ctx.fillStyle='#000'; ctx.fillRect(a.x,a.y,a.w,a.h); break;
    case 'rect':
      if(a.fill){ctx.fillStyle=a.fill;ctx.fillRect(a.x,a.y,a.w,a.h);}
      ctx.lineWidth=a.lw; ctx.strokeStyle=a.color; ctx.strokeRect(a.x,a.y,a.w,a.h); break;
    case 'ellipse':
      ctx.beginPath(); ctx.ellipse(a.x+a.w/2,a.y+a.h/2,Math.max(a.w/2,.01),Math.max(a.h/2,.01),0,0,Math.PI*2);
      if(a.fill){ctx.fillStyle=a.fill;ctx.fill();}
      ctx.lineWidth=a.lw; ctx.strokeStyle=a.color; ctx.stroke(); break;
    case 'line':
      ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth=a.lw; ctx.strokeStyle=a.color;
      ctx.beginPath(); ctx.moveTo(a.x1,a.y1); ctx.lineTo(a.x2,a.y2);
      if(a.arrow){for(const p of arrowPts(a)){ctx.moveTo(a.x2,a.y2);ctx.lineTo(p[0],p[1]);}}
      ctx.stroke(); break;
    case 'pen':
      ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth=a.lw; ctx.strokeStyle=a.color;
      ctx.beginPath(); a.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));
      ctx.stroke(); break;
    case 'text':
      ctx.fillStyle=a.color; ctx.font=textFont(a); ctx.textBaseline='alphabetic';
      getLines(a).forEach((ln,i)=>{
        const by=a.y+a.size*ASC+i*a.size*LH; ctx.fillText(ln,a.x,by);
        if((a.underline||a.strikeout)&&ln){   // 下線は基準線の少し下、取り消し線は文字の高さの中ほど
          const w=ctx.measureText(ln).width, t=Math.max(.6,a.size*(a.bold?.08:.055));
          if(a.underline) ctx.fillRect(a.x,by+a.size*.12,w,t);
          if(a.strikeout) ctx.fillRect(a.x,by-a.size*.32-t/2,w,t);
        }
      }); break;
    case 'image': {
      const im=S.imgs.get(a.imgId); if(im&&im.el.complete&&im.el.naturalWidth) ctx.drawImage(im.el,a.x,a.y,a.w,a.h); break;
    }
    case 'strike': case 'replace':
      ctx.lineWidth=a.lw||1.2; ctx.strokeStyle=a.color; ctx.lineCap='round'; ctx.beginPath();
      if(isVert(a)){const cx=a.x+a.w/2; ctx.moveTo(cx,a.y); ctx.lineTo(cx,a.y+a.h);}
      else {const cy=a.y+a.h/2; ctx.moveTo(a.x,cy); ctx.lineTo(a.x+a.w,cy);}
      ctx.stroke(); drawLabel(ctx,a); break;
    case 'insert': {
      const s=caretSize(a); ctx.lineWidth=a.lw||1.2; ctx.strokeStyle=a.color; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
      if(a.vert){ctx.moveTo(a.x+s,a.y-s*.7);ctx.lineTo(a.x,a.y);ctx.lineTo(a.x+s,a.y+s*.7);}
      else {ctx.moveTo(a.x-s*.7,a.y+s);ctx.lineTo(a.x,a.y);ctx.lineTo(a.x+s*.7,a.y+s);}
      ctx.stroke(); drawLabel(ctx,a); break;
    }
    case 'note': {
      const s=NOTE; ctx.fillStyle='#ffd43b'; ctx.strokeStyle='#a87900'; ctx.lineWidth=1; ctx.lineJoin='round';
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(a.x+s,a.y); ctx.lineTo(a.x+s,a.y+s*.7); ctx.lineTo(a.x+s*.7,a.y+s); ctx.lineTo(a.x,a.y+s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); for(let i=1;i<=3;i++){ctx.moveTo(a.x+3,a.y+i*s/4.5);ctx.lineTo(a.x+s-4,a.y+i*s/4.5);} ctx.stroke(); break;
    }
    case 'watermark':
      ctx.globalAlpha=a.opacity; ctx.fillStyle=a.color; ctx.font=`bold ${a.size}px ${FONT}`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.translate(a.x+a.w/2,a.y+a.h/2); ctx.rotate(-a.angle*Math.PI/180);
      String(a.text).split('\n').forEach((ln,i,arr)=>ctx.fillText(ln,0,(i-(arr.length-1)/2)*a.size*1.2)); break;
  }
  ctx.restore();
}
/* ---- 校正記号の指示文 (縦組みでは縦書きで表示) ---- */
const isVert=a=>a.h>a.w;
const caretSize=a=>Math.max(5,a.size*.6);
function labelBox(a){
  if(!PROOF_LBL.has(a.type)||!a.text) return null;
  const lines=String(a.text).split('\n'); mctx.font=`${a.size}px ${FONT}`;
  const vert=a.type==='insert'?!!a.vert:isVert(a);
  let w,h;
  if(vert){w=lines.length*a.size*1.15; h=Math.max(...lines.map(l=>[...l].length))*a.size*1.05;}
  else {w=Math.max(...lines.map(l=>mctx.measureText(l).width)); h=lines.length*a.size*LH;}
  w+=4; h+=4;
  let x,y;
  if(a.type==='insert'){const s=caretSize(a); if(vert){x=a.x+s+2;y=a.y-h/2;} else {x=a.x-w/2;y=a.y+s+2;}}
  else if(vert){x=a.x+a.w+3;y=a.y;}
  else {x=a.x;y=a.y-h-3; if(y<0) y=a.y+a.h+3;}
  return {x,y,w,h,lines,vert};
}
function drawLabel(ctx,a){
  const L=labelBox(a); if(!L) return;
  ctx.save(); ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fillRect(L.x,L.y,L.w,L.h);
  ctx.fillStyle=a.color; ctx.font=`${a.size}px ${FONT}`;
  if(L.vert){
    ctx.textAlign='center'; ctx.textBaseline='top';
    L.lines.forEach((ln,i)=>{const cx=L.x+2+(i+.5)*a.size*1.15; [...ln].forEach((ch,j)=>ctx.fillText(ch,cx,L.y+2+j*a.size*1.05));});
  } else {
    ctx.textBaseline='alphabetic'; L.lines.forEach((ln,i)=>ctx.fillText(ln,L.x+2,L.y+2+a.size*ASC+i*a.size*LH));
  }
  ctx.restore();
}
function unionBox(a,b){
  if(!b) return a; const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
  return {x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};
}
const fullBox=a=>(PROOF_LBL.has(a.type)&&a.type!=='insert')?unionBox(bboxOf(a),labelBox(a)):bboxOf(a);
const wmFor=pg=>S.watermark?{type:'watermark',...S.watermark,x:0,y:0,w:pg.w,h:pg.h}:null;
function drawNotePop(ctx,a,pg){
  if(!a.text) return;
  const sz=10, lines=wrapText(a.text,180,sz); mctx.font=`${sz}px ${FONT}`;
  const w=Math.max(60,...lines.map(l=>mctx.measureText(l).width))+10, h=lines.length*sz*LH+8+(a.author?sz*LH:0);
  // ページの外にはみ出す場合は付箋の左側・上側に寄せる
  let x=a.x+NOTE+4, y=a.y;
  if(pg){ if(x+w>pg.w&&a.x-4-w>=0) x=a.x-4-w; else if(x+w>pg.w) x=Math.max(0,pg.w-w); if(y+h>pg.h) y=Math.max(0,pg.h-h); }
  ctx.save(); ctx.fillStyle='#fff8d6'; ctx.strokeStyle='#a87900'; ctx.lineWidth=.8; ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
  ctx.fillStyle='#333'; ctx.font=`${sz}px ${FONT}`; let yy=y+4+sz*ASC;
  if(a.author){ctx.fillStyle='#8a6d00'; ctx.fillText(a.author,x+5,yy); yy+=sz*LH; ctx.fillStyle='#333';}
  lines.forEach(l=>{ctx.fillText(l,x+5,yy); yy+=sz*LH;});
  ctx.restore();
}
function drawBoxes(ctx,pg){
  const b=pg.boxes; if(!b) return; const u=1/PXPT();
  ctx.save(); ctx.lineWidth=1.2*u;
  if(b.bleed){ctx.strokeStyle='#1e6bff'; ctx.setLineDash([6*u,4*u]); ctx.strokeRect(...b.bleed);}
  if(b.trim){ctx.strokeStyle='#00a651'; ctx.setLineDash([]); ctx.strokeRect(...b.trim);}
  ctx.restore();
}
