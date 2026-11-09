'use strict';

/* ============================================================
   UI 更新
   ============================================================ */
function updateUI(){
  const has=hasDoc();
  $('#empty').style.display=has?'none':'flex'; pagesBox.style.display=has?'flex':'none';
  $$('[data-needdoc]').forEach(b=>{b.disabled=!has;});
  $('#btnUndo').disabled=S.hpos<=0; $('#btnRedo').disabled=S.hpos>=S.hist.length-1;
  $('#fname').textContent=has?(S.fileName+(S.dirty?'  ● 未保存':'')):'';
  document.title=has?`${S.dirty?'● ':''}${S.fileName} – PDFワークベンチ β`:'PDFワークベンチ β';
  $('#pgTotal').textContent=`/ ${S.pages.length}`;
  if(document.activeElement!==$('#pgIn')) $('#pgIn').value=has?S.cur+1:'';
  const zs=$('#zoomSel'),pct=Math.round(S.zoom*100);
  let o=[...zs.options].find(x=>!x.dataset.custom&&+x.value===pct);
  if(!o){o=zs.querySelector('[data-custom]');o.value=String(pct);o.textContent=pct+'%';}
  zs.value=String(pct);
  $('#selCount').textContent=S.checked.size?`${S.checked.size}件選択`:'';
  $('#chkAll').checked=has&&S.checked.size===S.pages.length;
  $('#stPage').textContent=has?`${S.cur+1} / ${S.pages.length} ページ・${pct}%`:'';
  refreshThumbMeta();
}
on('#btnUndo','click',undo); on('#btnRedo','click',redo);
on('#btnZoomIn','click',()=>applyZoom(S.zoom*1.2)); on('#btnZoomOut','click',()=>applyZoom(S.zoom/1.2));
on('#btnFit','click',()=>applyZoom(fitZoom()));
on('#zoomSel','change',e=>{const v=+e.target.value; if(v>0) applyZoom(v/100);});
on('#btnPrev','click',()=>gotoPage(S.cur-1)); on('#btnNext','click',()=>gotoPage(S.cur+1));
on('#pgIn','change',e=>gotoPage((+e.target.value||1)-1));
on('#pgIn','keydown',e=>{if(e.key==='Enter'){e.target.blur();}});
on('#btnSide','click',()=>$('#side').classList.toggle('hide'));
if(window.innerWidth<=820) $('#side').classList.add('hide');
