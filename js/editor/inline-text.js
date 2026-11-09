'use strict';

/* ============================================================
   テキストの直接入力 (Word のテキストボックスのように、ページの上でそのまま書く)
   編集中の注釈は S.editing = {pid, aid, isNew}。キャンバスには描かず、代わりに入力欄を重ねる。
   入力欄はページ基準の座標で置き、ページの回転は入れ物ごと変換する
   ============================================================ */
let inlineWrap=null, inlineTa=null;
const STYLE_KEYS={b:'bold',i:'italic',u:'underline'};   // Ctrl+B / Ctrl+I / Ctrl+U

/* ---- 空のテキストボックス（中をクリックすると入力できる。空のままなら保存されず、ツールを替えると消える） ---- */
const TEXT_BOX_W=200, TEXT_BOX_LINES=3;   // 既定の大きさ: 幅(pt)・高さ(行数)
const isEmptyText=a=>a.type==='text'&&!a.text;
function newTextBox(pg,x,y){
  const size=S.sizes.text, w=Math.max(40,Math.min(TEXT_BOX_W,pg.w-8)), h=size*LH*TEXT_BOX_LINES;
  x=Math.max(4,Math.min(pg.w-w-4,x)); y=Math.max(4,Math.min(pg.h-h-4,y));
  const a=stampMeta({id:uid(),type:'text',x,y,w,h,fixed:true,text:'',size,color:S.colors.text,...textStyleProps(),draft:true});
  pg.annots.push(a); return a;
}
/* 空のボックスを片付ける（keepId は残す） */
function purgeTextDrafts(keepId){
  for(const pg of S.pages){
    const n=pg.annots.length;
    pg.annots=pg.annots.filter(a=>!(a.draft&&isEmptyText(a)&&a.id!==keepId));
    if(pg.annots.length!==n) redrawPage(pg.id);
  }
}
/* 「テキスト」ボタンを押したとき: 表示中のページの見えている所の真ん中に空のボックスを置く */
function placeTextBox(){
  if(!hasDoc()) return;
  const pg=S.pages[S.cur], d=pg&&pageEls.get(pg.id); if(!d) return;
  purgeTextDrafts();   // 前に置いた空のボックスは、今見ている所へ置き直す
  const vr=viewBox.getBoundingClientRect(), dr=d.getBoundingClientRect(), px=PXPT(), [dw,dh]=dispDims(pg);
  const X=Math.max(0,Math.min(dw,(vr.left+viewBox.clientWidth/2-dr.left)/px));
  const Y=Math.max(0,Math.min(dh,(vr.top+viewBox.clientHeight/2-dr.top)/px));
  const [bx,by]=d2b(pg,X,Y), size=S.sizes.text;
  newTextBox(pg,bx-TEXT_BOX_W/2,by-size*LH*TEXT_BOX_LINES/2);
  redrawPage(pg.id);
}
/* 空のボックスの見た目（画面だけ。保存するPDFには描かない） */
function drawTextPlaceholder(ctx,a){
  const u=1/PXPT();
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillRect(a.x,a.y,a.w,a.h);
  ctx.strokeStyle='#2350d8'; ctx.lineWidth=1.2*u; ctx.setLineDash([5*u,4*u]); ctx.strokeRect(a.x,a.y,a.w,a.h);
  const fs=Math.min(a.size,14); ctx.fillStyle='#8a94a6'; ctx.font=`${fs}px ${FONT}`; ctx.textBaseline='middle';
  ctx.fillText('クリックして入力',a.x+6*u+2,a.y+Math.min(a.h/2,a.size*LH/2));
  ctx.restore();
}

function editingAnnot(){
  const E=S.editing, pg=E&&pageById(E.pid);
  return pg?pg.annots.find(a=>a.id===E.aid)||null:null;
}
/* テキストの編集を始める。existing があればその注釈、なければ (x,y) か box に新しく作る */
function editText(pid,x,y,existing,box){
  finishInlineText();
  const pg=pageById(pid); if(!pg) return;
  let a, isNew=false;
  if(existing){ a=pg.annots.find(q=>q.id===existing.id); if(!a) return; isNew=!!a.draft; }
  else{
    if(box){ a=stampMeta({id:uid(),type:'text',x:box.x,y:box.y,w:box.w,h:box.h,fixed:true,text:'',size:S.sizes.text,color:S.colors.text,...textStyleProps()}); pg.annots.push(a); }
    else a=newTextBox(pg,x,y);   // クリックした所に既定の大きさのボックス
    refitText(a); isNew=true;
  }
  purgeTextDrafts(a.id);   // ほかの空のボックスは片付ける
  S.editing={pid,aid:a.id,isNew,orig:a.text};
  S.sel={pid,aid:a.id}; syncOptions();   // ツールバーの色・サイズがこのテキストに効くようにする
  const d=pageEls.get(pid); if(d&&!d._active) activate(d);
  mountInline();
  redrawPage(pid);
}
function mountInline(){
  const E=S.editing, a=editingAnnot(), pg=E&&pageById(E.pid), d=E&&pageEls.get(E.pid);
  if(!a||!d){ return; }
  if(!inlineWrap){
    inlineWrap=document.createElement('div'); inlineWrap.className='inline-wrap';
    inlineTa=document.createElement('textarea'); inlineTa.className='inline-text'; inlineTa.spellcheck=false; inlineTa.placeholder='ここに入力';
    inlineTa.setAttribute('aria-label','テキストを入力');
    inlineWrap.append(inlineTa);
    inlineTa.addEventListener('input',()=>{ const x=editingAnnot(); if(!x) return; x.text=inlineTa.value; refitText(x); styleInline(); });
    inlineTa.addEventListener('keydown',e=>{
      if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){ e.preventDefault(); e.stopPropagation(); finishInlineText(); }
      else if((e.ctrlKey||e.metaKey)&&!e.altKey&&STYLE_KEYS[e.key.toLowerCase()]){ e.preventDefault(); toggleTextStyle(STYLE_KEYS[e.key.toLowerCase()]); }
    });
  }
  if(inlineWrap.parentNode!==d) d.append(inlineWrap);
  inlineTa.value=a.text;
  styleInline();
  setTimeout(()=>{ inlineTa.focus(); const n=inlineTa.value.length; inlineTa.setSelectionRange(n,n); },0);
}
/* 入力欄の位置・大きさ・文字の見た目を、注釈とページの表示倍率・回転に合わせる */
function styleInline(){
  const a=editingAnnot(), pg=S.editing&&pageById(S.editing.pid); if(!a||!inlineWrap) return;
  const px=PXPT(), [m0,m1,m2,m3,m4,m5]=rotM(pg.rot,pg.w,pg.h);
  Object.assign(inlineWrap.style,{width:pg.w*px+'px',height:pg.h*px+'px',transform:`matrix(${m0},${m1},${m2},${m3},${m4*px},${m5*px})`});
  const lines=getLines({...a,text:inlineTa.value||' '});
  mctx.font=textFont(a);
  const w=a.fixed?a.w:Math.max(a.size*2,...lines.map(l=>mctx.measureText(l).width))+a.size;   // 入力位置の分だけ余裕を持たせる
  const h=Math.max(1,lines.length)*a.size*LH;
  Object.assign(inlineTa.style,{
    left:a.x*px+'px', top:a.y*px+'px', width:w*px+'px', height:Math.max(h,a.fixed?a.h:0)*px+'px',
    fontSize:a.size*px+'px', lineHeight:a.size*LH*px+'px', fontFamily:FONT, color:a.color,
    fontWeight:a.bold?'bold':'normal', fontStyle:a.italic?'italic':'normal',
    textDecoration:[a.underline&&'underline',a.strikeout&&'line-through'].filter(Boolean).join(' ')||'none',
    whiteSpace:a.fixed?'pre-wrap':'pre'
  });
  if(a.fixed){ inlineTa.style.height='0px'; inlineTa.style.height=Math.max(inlineTa.scrollHeight,a.h*px)+'px'; }
}
/* ツールバーで色・大きさを変えたとき（tools.js の optApply から呼ばれる） */
function refreshInlineText(){ if(S.editing) styleInline(); }

/* 編集を終える。空なら新しいテキストは消す。変わっていれば履歴に積む */
function finishInlineText(){
  const E=S.editing; if(!E) return;
  const pg=pageById(E.pid), a=editingAnnot();
  S.editing=null;
  if(inlineWrap) inlineWrap.remove();
  if(!pg||!a){ return; }
  a.text=inlineTa.value;
  if(!a.text.trim()){
    pg.annots=pg.annots.filter(q=>q!==a);
    if(S.sel&&S.sel.aid===a.id) S.sel=null;
    if(!E.isNew) commit();   // 既存のテキストを空にした = 削除
  }else{
    delete a.draft; refitText(a);
    if(E.isNew||a.text!==E.orig) commit();
  }
  if(S.tool!=='select'&&S.sel&&S.sel.aid===a.id) S.sel=null;   // テキストツールでは、続けて次のテキストを書けるよう選択を外す
  syncOptions(); redrawPage(E.pid);
}
/* 入力欄の外をクリックしたら編集を終える（ツールバーの色・サイズの操作では終えない）。
   ページ上のクリックは「編集を終える」だけにして、新しいテキストを作らない */
document.addEventListener('pointerdown',e=>{
  if(!S.editing||!inlineWrap) return;
  if(inlineWrap.contains(e.target)||e.target.closest('.bar,.modal-back,.menu')) return;
  const onPage=!!e.target.closest('#pages');
  finishInlineText();
  if(onPage&&S.tool==='text'){ e.stopPropagation(); e.preventDefault(); }
},true);
