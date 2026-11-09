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
const groupOf=t=>t==='text'?'text':t==='highlight'?'highlight':PROOF.has(t)?'proof':'shape';
const sizeKey=t=>PROOF_LBL.has(t)?'proof':'text';
const hasSize=a=>a.type==='text'||PROOF_LBL.has(a.type);
const activeType=()=>{const a=getSel(); return a?a.type:S.tool;};
const HINTS={
  select:'ダブルクリックでテキスト編集',
  text:'クリックで配置 / ドラッグで枠の大きさを指定 / 選択して四隅・辺をドラッグで大きさ変更',
  redact:'墨消し: 保存時、対象ページは画像化され下の文字も完全に削除されます',
  place:'配置したい位置をクリックしてください',
  image:'ドラッグで移動、四隅で拡大縮小',
  strike:'削除する文字の上をドラッグ（縦組みは縦にドラッグ）。ダブルクリックで指示文を変更',
  replace:'直したい文字の上をドラッグし、正しい文字を入力',
  insert:'挿入位置をクリックし、入れる文字を入力（縦組みは「縦組み」をオン）',
  note:'クリックした位置に付箋コメントを貼ります。選択すると内容が表示されます'
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
}
function setTool(t){
  S.tool=t; pagesBox.dataset.tool=t;
  for(const d of pageEls.values()) d._ov.style.cursor='';
  $$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  if(t!=='select'&&S.sel) select(null,null); else syncOptions();
}
function optApply(fn,doCommit){
  const a=getSel();
  if(a){fn(a); if(a.type==='text') refitText(a); redrawPage(S.sel.pid); if(doCommit) commit();}
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
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
