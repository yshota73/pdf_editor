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
  more.addEventListener('click',()=>{   // ブラウザの色選択で自由に選ぶ
    const t=cpTarget; closeColorPop(); if(!t) return;
    t._cpNative=true; t._cpNativeUsed=true;
    try{ if(t.showPicker){ t.showPicker(); } else t.click(); }catch(e){ t.click(); }
    setTimeout(()=>{t._cpNative=false;},0);
  });
  cpPop.append(more);
  document.body.append(cpPop);
  const r=btn.getBoundingClientRect(), w=cpPop.offsetWidth, hh=cpPop.offsetHeight;
  cpPop.style.left=Math.max(4,Math.min(r.left,innerWidth-w-4))+'px';
  cpPop.style.top=(r.bottom+4+hh<=innerHeight?r.bottom+4:Math.max(4,r.top-hh-4))+'px';
  const on=cpPop.querySelector('.cps.on')||cpPop.querySelector('.cps'); on&&on.focus();
}
function closeColorPop(){ cpPop.remove(); cpTarget=null; }
document.addEventListener('pointerdown',e=>{ if(cpPop.isConnected&&!cpPop.contains(e.target)&&!e.target.closest('.cbtn')) closeColorPop(); },true);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&cpPop.isConnected){ e.stopPropagation(); closeColorPop(); } },true);
/* その他の色で選んだ色も「最近使った色」に入れる */
document.addEventListener('change',e=>{ const t=e.target; if(t&&t._cp&&t._cpNativeUsed){ t._cpNativeUsed=false; cpRemember(t.value.toLowerCase()); } },true);

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
  inp.addEventListener('click',e=>{ if(inp._cpNative) return; e.preventDefault(); openColorPop(inp,btn); });   // ラベルの文字をクリックしたとき
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
