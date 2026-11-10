'use strict';

/* ============================================================
   色の選択 (Word のような 10色 × 5段階のパレット)
   ページ内のすべての <input type="color"> を、パレットを開くボタンに置き換える。
   元の input は隠して残し、選んだ色はその input に入れて input / change を発生させるので、
   既存の処理（ツールバー・透かしのダイアログなど）はそのまま動く
   ============================================================ */
const CP_BASE=[   // 基本の10色
  ['#ffffff','白'],['#000000','黒'],['#e60012','赤'],['#ff7f00','オレンジ'],['#ffe600','黄'],
  ['#00a650','緑'],['#00a0e9','水色'],['#1d3fb8','青'],['#7030a0','紫'],['#e4007f','ピンク']
];
/* 各色のバリエーション（上から: 基本・明るく60%・明るく30%・暗く25%・暗く50%）。白と黒は灰色の段階にする */
const CP_ROWS=[['基本',0],['明るさ 60%',.6],['明るさ 30%',.3],['暗さ 25%',-.25],['暗さ 50%',-.5]];
const CP_WHITE=[0,-.05,-.15,-.25,-.35], CP_BLACK=[0,.5,.35,.25,.15];
const CP_RECENT_MAX=10;
const hex2=v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0');
function cpVary(hex,p){
  const n=parseInt(hex.slice(1),16), c=[n>>16&255,n>>8&255,n&255];
  return '#'+c.map(v=>hex2(p>=0?v+(255-v)*p:v*(1+p))).join('');
}
function cpGrid(){
  const rows=[];
  CP_ROWS.forEach(([rowName,p],r)=>rows.push(CP_BASE.map(([hex,name])=>{
    const q=hex==='#ffffff'?CP_WHITE[r]:hex==='#000000'?CP_BLACK[r]:p;
    return {hex:cpVary(hex,q),name:r?`${name}、${hex==='#ffffff'?'暗さ '+Math.round(-q*100)+'%':hex==='#000000'?'明るさ '+Math.round(q*100)+'%':rowName}`:name};
  })));
  return rows;
}
let cpRecent=[];
try{ cpRecent=JSON.parse(localStorage.getItem('pdfwb.recentColors')||'[]').filter(c=>/^#[0-9a-f]{6}$/i.test(c)).slice(0,CP_RECENT_MAX); }catch(e){ cpRecent=[]; }
function cpRemember(hex){
  cpRecent=[hex,...cpRecent.filter(c=>c!==hex)].slice(0,CP_RECENT_MAX);
  try{ localStorage.setItem('pdfwb.recentColors',JSON.stringify(cpRecent)); }catch(e){}
}

/* ---- パレット（1つを使い回す） ---- */
const cpPop=document.createElement('div'); cpPop.className='cpop'; cpPop.setAttribute('role','dialog'); cpPop.setAttribute('aria-label','色の選択');
let cpTarget=null;
function cpSet(inp,hex){
  hex=hex.toLowerCase(); inp.value=hex; cpRemember(hex);
  inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true}));
}
function cpSwatch(hex,name,cur){
  const b=document.createElement('button'); b.type='button'; b.className='cps'+(hex===cur?' on':'');
  b.style.background=hex; b.title=`${name}（${hex}）`; b.setAttribute('aria-label',name);
  b.addEventListener('click',()=>{ const t=cpTarget; closeColorPop(); if(t) cpSet(t,hex); });
  return b;
}
function openColorPop(inp,btn){
  cpTarget=inp; const cur=(inp.value||'').toLowerCase();
  cpPop.replaceChildren();
  const h=t=>{const e=document.createElement('div'); e.className='cph'; e.textContent=t; return e;};
  cpPop.append(h('テーマの色'));
  const g=document.createElement('div'); g.className='cpg';
  cpGrid().forEach(row=>row.forEach(c=>g.append(cpSwatch(c.hex,c.name,cur))));
  cpPop.append(g);
  if(cpRecent.length){
    cpPop.append(h('最近使った色'));
    const r=document.createElement('div'); r.className='cpg';
    cpRecent.forEach(hex=>r.append(cpSwatch(hex,'最近使った色',cur)));
    cpPop.append(r);
  }
  const more=document.createElement('button'); more.type='button'; more.className='cpmore';
  more.innerHTML='<span class="cpwheel"></span>その他の色…';
  // ブラウザの色選択（showPicker）は見えない入力欄からだと開かないことがある（iPad の Safari など）ので、パレットの中で選ぶ
  more.addEventListener('click',()=>openCustomColor(inp,btn,cur));
  cpPop.append(more);
  document.body.append(cpPop);
  cpPlace(btn);
  const on=cpPop.querySelector('.cps.on')||cpPop.querySelector('.cps'); on&&on.focus();
}
function cpPlace(btn){
  const r=btn.getBoundingClientRect(), w=cpPop.offsetWidth, hh=cpPop.offsetHeight;
  cpPop.style.left=Math.max(4,Math.min(r.left,innerWidth-w-4))+'px';
  cpPop.style.top=(r.bottom+4+hh<=innerHeight?r.bottom+4:Math.max(4,r.top-hh-4))+'px';
}
function closeColorPop(){ cpPop.remove(); cpTarget=null; }
document.addEventListener('pointerdown',e=>{ if(cpPop.isConnected&&!cpPop.contains(e.target)&&!e.target.closest('.cbtn')) closeColorPop(); },true);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&cpPop.isConnected){ e.stopPropagation(); closeColorPop(); } },true);

/* ---- その他の色: 彩度・明るさの四角と色相のバーで自由に選ぶ（16進数でも入力できる） ---- */
function hex2hsv(hex){
  const n=parseInt(hex.slice(1),16), r=(n>>16&255)/255, g=(n>>8&255)/255, b=(n&255)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let h=0;
  if(d){ h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; if(h<0) h+=360; }
  return [h,mx?d/mx:0,mx];
}
function hsv2hex(h,s,v){
  const f=k=>{const x=(k+h/60)%6; return v-v*s*Math.max(0,Math.min(x,4-x,1));};
  return '#'+[f(5),f(3),f(1)].map(c=>hex2(c*255)).join('');
}
function openCustomColor(inp,btn,cur){
  const start=/^#[0-9a-f]{6}$/.test(cur)?cur:'#e60012';
  let [h,s,v]=hex2hsv(start);
  cpPop.replaceChildren();
  cpPop.insertAdjacentHTML('beforeend',`
    <div class="cph">その他の色</div>
    <div class="cpsv" role="slider" aria-label="彩度と明るさ" tabindex="0"><span class="cpk"></span></div>
    <div class="cphue" role="slider" aria-label="色相" aria-valuemin="0" aria-valuemax="360" tabindex="0"><span class="cpk"></span></div>
    <div class="cprow">
      <span class="cpcmp" title="左: 今の色 / 右: 新しい色"><span class="cpold"></span><span class="cpnew"></span></span>
      <label class="cphex">#<input type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="色の16進数"></label>
    </div>
    <div class="cpact"><button type="button" class="btn sm" data-a="back">戻る</button><button type="button" class="btn sm primary" data-a="ok">OK</button></div>`);
  const sv=cpPop.querySelector('.cpsv'), svk=sv.firstElementChild, hue=cpPop.querySelector('.cphue'), huek=hue.firstElementChild;
  const hexIn=cpPop.querySelector('.cphex input'), nw=cpPop.querySelector('.cpnew');
  cpPop.querySelector('.cpold').style.background=start;
  const paint=(fromHex)=>{
    const hex=hsv2hex(h,s,v);
    sv.style.setProperty('--hue',`hsl(${h} 100% 50%)`);
    svk.style.left=s*100+'%'; svk.style.top=(1-v)*100+'%'; svk.style.background=hex;
    huek.style.left=h/360*100+'%'; hue.setAttribute('aria-valuenow',Math.round(h));
    nw.style.background=hex; if(!fromHex) hexIn.value=hex.slice(1);
  };
  const drag=(el,fn)=>{
    const at=e=>{const r=el.getBoundingClientRect(); fn(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))); paint();};
    el.addEventListener('pointerdown',e=>{ e.preventDefault(); el.focus(); try{el.setPointerCapture(e.pointerId);}catch(_){} at(e); });
    el.addEventListener('pointermove',e=>{ if(el.hasPointerCapture(e.pointerId)) at(e); });
  };
  drag(sv,(x,y)=>{s=x; v=1-y;});
  drag(hue,x=>{h=Math.min(x*360,359.9);});
  const key=(el,fn)=>el.addEventListener('keydown',e=>{
    const st=e.shiftKey?.1:.02, d={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
    if(!d) return; e.preventDefault(); fn(d[0],d[1]); paint();
  });
  key(sv,(dx,dy)=>{s=Math.max(0,Math.min(1,s+dx)); v=Math.max(0,Math.min(1,v-dy));});
  key(hue,dx=>{h=Math.max(0,Math.min(359.9,h+dx*360));});
  hexIn.addEventListener('input',()=>{
    const t=hexIn.value.replace(/[^0-9a-f]/gi,'');
    const m=t.length===3?t.replace(/./g,c=>c+c):t;
    if(m.length===6){ [h,s,v]=hex2hsv('#'+m.toLowerCase()); paint(true); }
  });
  const ok=()=>{ const hex=hsv2hex(h,s,v), t=cpTarget; closeColorPop(); if(t) cpSet(t,hex); };
  hexIn.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); ok(); } });
  cpPop.querySelector('[data-a="ok"]').addEventListener('click',ok);
  cpPop.querySelector('[data-a="back"]').addEventListener('click',()=>openColorPop(inp,btn));
  paint(); cpPlace(btn); sv.focus();
}

/* ---- input[type=color] をボタンに置き換える ---- */
const VALUE_DESC=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
function enhanceColorInput(inp){
  if(inp._cp) return; inp._cp=true;
  const btn=document.createElement('button'); btn.type='button'; btn.className='cbtn';
  btn.title=inp.title||'色を選ぶ'; btn.setAttribute('aria-haspopup','dialog');
  btn.innerHTML='<span class="sw"></span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const sw=btn.firstChild, paint=()=>{ sw.style.background=VALUE_DESC.get.call(inp); };
  // プログラムから value を変えても見本の色が変わるようにする
  Object.defineProperty(inp,'value',{configurable:true,get(){return VALUE_DESC.get.call(this);},set(v){VALUE_DESC.set.call(this,v); paint();}});
  inp.addEventListener('input',paint);
  inp.addEventListener('click',e=>{ e.preventDefault(); openColorPop(inp,btn); });   // ラベルの文字をクリックしたとき
  inp.classList.add('cp-native'); inp.tabIndex=-1;
  inp.after(btn); paint();
  btn.addEventListener('click',e=>{ e.preventDefault(); if(cpPop.isConnected&&cpTarget===inp){closeColorPop();return;} openColorPop(inp,btn); });
  btn.disabled=inp.disabled;
}
function enhanceColorInputs(root=document){ root.querySelectorAll('input[type=color]').forEach(enhanceColorInput); }
enhanceColorInputs();
/* 後から作られる入力欄（ダイアログなど）にも適用する */
new MutationObserver(ms=>{ for(const m of ms) for(const n of m.addedNodes) if(n.nodeType===1){ if(n.matches('input[type=color]')) enhanceColorInput(n); else enhanceColorInputs(n); } })
  .observe(document.body,{childList:true,subtree:true});
