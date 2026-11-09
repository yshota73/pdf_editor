'use strict';

/* ============================================================
   テキスト / 署名 / スタンプ / 画像
   ============================================================ */
async function editText(pid,x,y,existing,box){
  const ta=document.createElement('textarea');
  ta.value=existing?existing.text:''; ta.placeholder='ここに入力（Ctrl+Enterで確定）';
  const r=await modal({title:existing?'テキストを編集':'テキストを追加',body:ta,
    buttons:[{label:'キャンセル',value:false},{label:'OK',primary:true,value:true}],onOpen:()=>setTimeout(()=>ta.focus(),30)});
  const pg=pageById(pid); if(!r||!pg||!ta.value.trim()) return;
  if(existing){
    const a=pg.annots.find(q=>q.id===existing.id); if(!a) return;
    a.text=ta.value; refitText(a); redrawPage(pid); commit();
  } else {
    const a=stampMeta({id:uid(),type:'text',x,y,text:ta.value,size:S.sizes.text,color:S.colors.text,w:0,h:0});
    if(box){a.x=box.x;a.y=box.y;a.w=box.w;a.h=box.h;a.fixed=true;}
    refitText(a); pg.annots.push(a); commit();
    setTool('select'); select(pid,a.id);
  }
}
const dataUrlBytes=u=>{const b=atob(u.split(',')[1]);const arr=new Uint8Array(b.length);for(let i=0;i<b.length;i++)arr[i]=b.charCodeAt(i);return arr;};
async function registerCanvasImage(c,mime='image/png',q=.92){
  const url=c.toDataURL(mime,q); const id=uid(); const el=new Image();
  await new Promise(r=>{el.onload=r;el.onerror=r;el.src=url;});
  S.imgs.set(id,{mime,bytes:dataUrlBytes(url),el,url}); return id;
}
const readDataUrl=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(f);});
async function importImageFile(file){
  const url=await readDataUrl(file); const img=new Image();
  await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('画像を読み込めません'));img.src=url;});
  let w=img.naturalWidth,h=img.naturalHeight; if(!w||!h) throw new Error('画像サイズを取得できません');
  const s=Math.min(1,2400/Math.max(w,h)); w=Math.round(w*s); h=Math.round(h*s);
  const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d');
  const jpeg=/jpe?g/i.test(file.type); if(jpeg){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
  ctx.drawImage(img,0,0,w,h);
  const imgId=await registerCanvasImage(c,jpeg?'image/jpeg':'image/png');
  const pw=Math.min(w*.75,260); return {imgId,w:pw,h:pw*h/w};
}
function beginPlace(p){
  S.pending=p; setTool('place'); $('#optHint').textContent=HINTS.place; setStatus('配置する位置をクリックしてください');
  $$('.opt').forEach(o=>o.classList.remove('on'));
}
function placePending(pg,x,y){
  const p=S.pending; if(!p) return;
  const a=stampMeta({id:uid(),type:'image',imgId:p.imgId,w:p.w,h:p.h,x:Math.max(0,Math.min(pg.w-p.w,x-p.w/2)),y:Math.max(0,Math.min(pg.h-p.h,y-p.h/2))});
  pg.annots.push(a); S.pending=null; commit(); setTool('select'); select(pg.id,a.id); setStatus('配置しました');
}
async function pickImage(file){
  try{ busy('画像を読み込み中…'); const p=await importImageFile(file); busy(false); beginPlace(p); }
  catch(e){busy(false);toast(e.message||'画像を挿入できませんでした','err');}
}
function rr(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function makeStamp(lines,color='#d32f2f'){
  const m=document.createElement('canvas').getContext('2d'); let maxW=0;
  lines.forEach(([t,fs])=>{m.font=`bold ${fs}px ${FONT}`;maxW=Math.max(maxW,m.measureText(t).width);});
  const padX=20,padY=12,gap=6;
  const H=lines.reduce((s,[,fs])=>s+fs*1.15,0)+gap*(lines.length-1)+padY*2, W=maxW+padX*2;
  const K=3,c=document.createElement('canvas'); c.width=Math.ceil((W+8)*K); c.height=Math.ceil((H+8)*K);
  const ctx=c.getContext('2d'); ctx.scale(K,K); ctx.translate(4,4);
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=4; rr(ctx,0,0,W,H,8); ctx.stroke();
  ctx.textAlign='center'; ctx.textBaseline='middle'; let y=padY;
  lines.forEach(([t,fs])=>{ctx.font=`bold ${fs}px ${FONT}`;ctx.fillText(t,W/2,y+fs*1.15/2);y+=fs*1.15+gap;});
  return {canvas:c,w:W+8,h:H+8};
}
const today=()=>{const d=new Date();return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;};
const STAMPS=[
  {label:'社外秘',lines:()=>[['社外秘',44]]},
  {label:'承認',lines:()=>[['承認',44]]},
  {label:'確認済',lines:()=>[['確認済',44]]},
  {label:'至急',lines:()=>[['至急',44]]},
  {label:'写し',lines:()=>[['写し',44]]},
  {label:'要確認',lines:()=>[['要確認',44]]},
  {label:'校了',lines:()=>[['校了',44]]},
  {label:'責了',lines:()=>[['責了',44]]},
  {label:'念校',lines:()=>[['念校',44]]},
  {label:'責了 (日付入り)',lines:()=>[['責了',34],[today(),24]]},
  {label:'受付 (日付入り)',lines:()=>[['受付',34],[today(),24]]},
  {label:'承認 (日付入り)',lines:()=>[['承認',34],[today(),24]]}
];
(()=>{
  const menu=$('#stampMenu');
  STAMPS.forEach(s=>{
    const b=document.createElement('button'); b.className='mi';
    b.innerHTML='<span class="stp"></span>'; b.firstChild.textContent=s.label.replace(/ \(.*\)/,'');
    if(/日付/.test(s.label)){const n=document.createElement('span');n.className='hint';n.textContent='日付入り';b.append(n);}
    b.addEventListener('click',async()=>{
      menu.classList.remove('on');
      const st=makeStamp(s.lines()); const imgId=await registerCanvasImage(st.canvas);
      beginPlace({imgId,w:st.w*.55,h:st.h*.55});
    });
    menu.append(b);
  });
})();
on('#btnStamp','click',e=>{
  e.stopPropagation(); const m=$('#stampMenu'), r=e.currentTarget.getBoundingClientRect();
  m.style.left=Math.min(r.left,window.innerWidth-230)+'px'; m.style.top=(r.bottom+4)+'px'; m.classList.toggle('on');
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#stampMenu,#btnStamp')) $('#stampMenu').classList.remove('on');});

async function signatureDialog(){
  const wrap=document.createElement('div');
  wrap.innerHTML='<canvas class="sigc" width="1040" height="360"></canvas><div class="sigrow"><label>色 <select id="sigCol"><option value="#111111">黒</option><option value="#1d3fb8">青</option></select></label><button class="btn" id="sigClr" type="button">書き直す</button><span class="muted">枠内にマウス・ペン・指で署名してください</span></div>';
  const c=wrap.querySelector('canvas'), ctx=c.getContext('2d'); let drawing=false,last=null,has=false,bb=[1e9,1e9,-1e9,-1e9];
  const pos=e=>{const r=c.getBoundingClientRect();return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height];};
  const col=()=>wrap.querySelector('#sigCol').value;
  c.addEventListener('pointerdown',e=>{drawing=true;last=pos(e);c.setPointerCapture(e.pointerId);has=true;
    ctx.fillStyle=col();ctx.beginPath();ctx.arc(last[0],last[1],3.5,0,7);ctx.fill();
    bb=[Math.min(bb[0],last[0]),Math.min(bb[1],last[1]),Math.max(bb[2],last[0]),Math.max(bb[3],last[1])];});
  c.addEventListener('pointermove',e=>{if(!drawing)return;const p=pos(e);ctx.strokeStyle=col();ctx.lineWidth=7;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(last[0],last[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();last=p;
    bb=[Math.min(bb[0],p[0]),Math.min(bb[1],p[1]),Math.max(bb[2],p[0]),Math.max(bb[3],p[1])];});
  const end=()=>{drawing=false;};
  c.addEventListener('pointerup',end); c.addEventListener('pointercancel',end);
  wrap.querySelector('#sigClr').addEventListener('click',()=>{ctx.clearRect(0,0,c.width,c.height);has=false;bb=[1e9,1e9,-1e9,-1e9];});
  const r=await modal({title:'署名を作成',body:wrap,buttons:[{label:'キャンセル',value:false},{label:'この署名を使う',primary:true,value:true}]});
  if(!r) return; if(!has){toast('署名が描かれていません','err');return;}
  const pad=14,x0=Math.max(0,bb[0]-pad),y0=Math.max(0,bb[1]-pad),x1=Math.min(c.width,bb[2]+pad),y1=Math.min(c.height,bb[3]+pad);
  const cw=x1-x0,chh=y1-y0; const out=document.createElement('canvas'); out.width=cw; out.height=chh;
  out.getContext('2d').drawImage(c,x0,y0,cw,chh,0,0,cw,chh);
  const imgId=await registerCanvasImage(out);
  const w=Math.min(170,cw/2*.8); beginPlace({imgId,w,h:w*chh/cw});
}
