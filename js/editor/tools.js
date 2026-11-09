'use strict';

/* ============================================================
   選択・ツール・オプション
   ============================================================ */
const getSel=()=>{if(!S.sel) return null; const pg=pageById(S.sel.pid); return pg?(pg.annots.find(a=>a.id===S.sel.aid)||null):null;};
function select(pid,aid){
  const prev=S.sel; S.sel=pid?{pid,aid}:null;
  if(prev) redrawPage(prev.pid);
  if(S.sel) redrawPage(S.sel.pid);
  syncOptions(); markAnnSel();
}
const groupOf=t=>t==='text'?'text':(t==='highlight'||t==='marker')?'highlight':PROOF.has(t)?'proof':'shape';
const sizeKey=t=>PROOF_LBL.has(t)?'proof':'text';
const hasSize=a=>a.type==='text'||PROOF_LBL.has(a.type);
const activeType=()=>{const a=getSel(); return a?a.type:S.tool;};
const HINTS={
  select:'空のテキストボックスはクリックで入力 / 書いたテキストはダブルクリックで編集',
  highlight:'なぞって線を引きます。引いた所で少し止めると直線に（ほぼ水平・垂直ならまっすぐ）。Shiftを押しながらでも直線。太さは「細・中・太」または数値で指定',
  lasso:'注釈を自由に囲んで選びます。ドラッグで移動、上に出るボタンで複製・コピー・切り取り・削除（PDFにもとからある文字や画像は動かせません）',
  textsel:'ドラッグで文字を選択し、Ctrl+C でコピー（ダブルクリックで1語、トリプルクリックで1行）',
  text:'入力中もツールバーで色・大きさを変更できます。Esc かボックスの外をクリックで確定。書いたテキストはダブルクリックで編集',
  redact:'ドラッグで続けて墨消しできます。保存時、対象ページは画像化され下の文字も完全に削除されます',
  place:'配置したい位置をクリック。続けてクリックすると同じものを配置できます（Escで終了）',
  image:'ドラッグで移動、四隅で拡大縮小',
  strike:'削除する文字の上をドラッグ（縦組みは縦にドラッグ）。ダブルクリックで指示文を変更',
  replace:'直したい文字の上をドラッグし、正しい文字を入力',
  insert:'挿入位置をクリックし、入れる文字を入力（縦組みは「縦組み」をオン）',
  note:'クリックで付箋を貼る / 付箋にマウスを重ねるとコメントを表示 / 付箋をダブルクリックで編集',
  eraser:'手書きの線をなぞった部分を消します（「線ごと」をオンにすると触れた線をまとめて消去）'
};
function syncOptions(){
  const t=activeType(), a=getSel();
  $$('.opt').forEach(o=>o.classList.toggle('on',o.dataset.for.split(' ').includes(t)));
  $('#optHint').textContent=HINTS[t]||'';
  const g=groupOf(t);
  $('#optColor').value=(a&&a.color)?a.color:S.colors[g];
  $('#optLw').value=String((a&&a.lw)||S.lw);
  $('#optSize').value=(a&&hasSize(a))?a.size:S.sizes[sizeKey(t)];
  $('#optVert').checked=(a&&a.type==='insert')?!!a.vert:S.vert;
  $('#optFillOn').checked=(a&&(a.type==='rect'||a.type==='ellipse'))?!!a.fill:S.fillOn;
  $('#optFill').value=(a&&a.fill)?a.fill:S.fillColor;
  $('#optArrow').checked=(a&&a.type==='line')?!!a.arrow:S.arrow;
  syncMarkerW((a&&a.type==='marker')?a.lw:S.markerW);
  const ta=(a&&a.type==='text')?a:null;
  for(const [id,k] of TEXT_STYLES){ const v=ta?!!ta[k]:S.textStyle[k]; $(id).classList.toggle('active',v); $(id).setAttribute('aria-pressed',String(v)); }
  $('#optShowNotes').checked=S.showNotes;
}
function setTool(t){
  if(S.editing) finishInlineText();
  // 「テキスト」はボタンを押した時に空のボックスを置くだけで、ツールは「選択」に戻す（ボックスの中をクリックすると入力できる）
  if(t==='text'){
    if(hasDoc()){ placeTextBox(); setStatus('テキストボックスを置きました。中をクリックすると入力できます'); }
    t='select';
  }
  const prev=S.tool; S.tool=t; pagesBox.dataset.tool=t;
  if(t!=='place') S.pending=null;
  if(t!=='lasso'&&S.lasso) clearLasso();   // 画像・スタンプの配置待ちは別のツールに切り替えたら終わり
  if(t==='textsel') enterTextSelect();
  if(t!=='select') purgeTextDrafts();   // 別のツールにしたら、空のテキストボックスは片付ける
  else if(prev==='textsel'){const s=window.getSelection(); if(s) s.removeAllRanges();}
  if(t!=='eraser'&&S.eraserPos) setEraserPos(null);
  for(const d of pageEls.values()) d._ov.style.cursor='';
  $$('.bar [data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  if(t!=='select'&&S.sel) select(null,null); else syncOptions();
}
function optApply(fn,doCommit){
  const a=getSel();
  if(a){fn(a); if(a.type==='text') refitText(a); redrawPage(S.sel.pid); refreshInlineText(); if(doCommit) commit();}
}
on('#optColor','input',e=>{const v=e.target.value; S.colors[groupOf(activeType())]=v; optApply(a=>{if('color' in a) a.color=v;},false);});
on('#optColor','change',()=>{if(getSel()) commit();});
on('#optLw','change',e=>{const v=+e.target.value; S.lw=v; optApply(a=>{if('lw' in a) a.lw=v;},true);});
on('#optSize','input',e=>{const v=Math.max(6,Math.min(200,+e.target.value||14)); S.sizes[sizeKey(activeType())]=v; optApply(a=>{if(hasSize(a)) a.size=v;},false);});
on('#optVert','change',e=>{S.vert=e.target.checked; optApply(a=>{if(a.type==='insert') a.vert=S.vert;},true);});
on('#optSize','change',()=>{if(getSel()) commit();});
on('#optFillOn','change',e=>{S.fillOn=e.target.checked; optApply(a=>{if(a.type==='rect'||a.type==='ellipse') a.fill=S.fillOn?S.fillColor:null;},true);});
on('#optFill','input',e=>{S.fillColor=e.target.value; optApply(a=>{if((a.type==='rect'||a.type==='ellipse')&&a.fill) a.fill=S.fillColor;},false);});
on('#optFill','change',()=>{if(getSel()) commit();});
on('#optArrow','change',e=>{S.arrow=e.target.checked; optApply(a=>{if(a.type==='line') a.arrow=S.arrow;},true);});
/* マーカーの太さ: 細・中・太のボタン、または数値 */
function syncMarkerW(v){
  $('#optMw').value=String(Math.round(v*10)/10);
  $$('#optMwSeg [data-mw]').forEach(b=>b.classList.toggle('active',+b.dataset.mw===v));
}
function setMarkerW(v,doCommit){
  v=Math.max(1,Math.min(80,+v||12)); S.markerW=v; syncMarkerW(v);
  optApply(a=>{if(a.type==='marker') a.lw=v;},doCommit);
}
$$('#optMwSeg [data-mw]').forEach(b=>b.addEventListener('click',()=>setMarkerW(+b.dataset.mw,true)));
on('#optMw','input',e=>{if(e.target.value!=='') setMarkerW(e.target.value,false);});
on('#optMw','change',e=>{setMarkerW(e.target.value,false); if(getSel()) commit();});
/* 文字の大きさ: A−/A＋ で一段階ずつ */
const SIZE_STEPS=[6,7,8,9,10,11,12,14,16,18,20,24,28,32,36,40,48,56,64,72,96,120,160,200];
function stepSize(dir){
  const cur=+$('#optSize').value||14;
  const v=dir>0?(SIZE_STEPS.find(s=>s>cur)||200):([...SIZE_STEPS].reverse().find(s=>s<cur)||6);
  $('#optSize').value=v; S.sizes[sizeKey(activeType())]=v;
  optApply(a=>{if(hasSize(a)) a.size=v;},true);
}
on('#optSizeDown','click',()=>stepSize(-1)); on('#optSizeUp','click',()=>stepSize(1));
/* 太字・斜体・下線・取り消し線（選んでいるテキスト・入力中のテキストに効き、次に書くテキストにも引き継ぐ） */
const TEXT_STYLES=[['#optBold','bold'],['#optItalic','italic'],['#optUnderline','underline'],['#optStrike','strikeout']];
const textStyleProps=()=>({bold:S.textStyle.bold,italic:S.textStyle.italic,underline:S.textStyle.underline,strikeout:S.textStyle.strikeout});
function toggleTextStyle(k){
  const a=getSel(), v=(a&&a.type==='text')?!a[k]:!S.textStyle[k];
  S.textStyle[k]=v;
  optApply(x=>{if(x.type==='text') x[k]=v;},true);
  syncOptions();
  if(S.editing&&inlineTa) inlineTa.focus();
}
for(const [id,k] of TEXT_STYLES) on(id,'click',()=>toggleTextStyle(k));
on('#optShowNotes','change',e=>{S.showNotes=e.target.checked; redrawAll();});
// ツールバーのボタンだけ（ページの入れ物 #pages も data-tool を持つので、それには付けない）
$$('.bar [data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
