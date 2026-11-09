'use strict';

/* ============================================================
   キーボード
   ============================================================ */
let nudgeT=null;
document.addEventListener('keydown',e=>{
  if(hasModal()) return;
  const inField=e.target.matches&&e.target.matches('input:not([type=checkbox]):not([type=color]),textarea,select');
  const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
  if(mod&&k==='s'){e.preventDefault(); finishInlineText(); if(hasDoc()) saveDoc(S.pages,'_編集済',true); return;}
  if(mod&&k==='o'){e.preventDefault(); $('#fileOpen').click(); return;}
  if(inField) return;
  if(mod&&STYLE_KEYS[k]){ const a=getSel(); if(a&&a.type==='text'){e.preventDefault(); toggleTextStyle(STYLE_KEYS[k]);} return; }
  if(mod&&k==='z'){e.preventDefault(); e.shiftKey?redo():undo(); return;}
  if(mod&&k==='y'){e.preventDefault(); redo(); return;}
  if(mod&&k==='c'){
    if(S.lasso&&S.lasso.ids.length){e.preventDefault(); lassoCopy(); return;}
    const a=getSel(); if(a){S.clip=[clone(a)];e.preventDefault();toast('コピーしました'); updateUI();} return;
  }
  if(mod&&k==='x'&&S.lasso&&S.lasso.ids.length){e.preventDefault(); lassoCut(); return;}
  if(mod&&k==='d'&&S.lasso&&S.lasso.ids.length){e.preventDefault(); lassoDuplicate(); return;}
  if(mod&&k==='v'){ if(S.clip&&hasDoc()){e.preventDefault(); pasteClip();} return; }
  if(mod||e.altKey||!hasDoc()) return;
  const map={v:'select',s:'textsel',q:'lasso',t:'text',h:'highlight',r:'rect',o:'ellipse',l:'line',p:'pen',e:'eraser',x:'redact',d:'strike',c:'replace',i:'insert',n:'note'};
  if(map[k]){setTool(map[k]);return;}
  if(e.key==='Escape'){S.pending=null;setTool('select');select(null,null);return;}
  if(S.lasso&&S.lasso.ids.length){   // 投げ縄で選んだ注釈: 削除・矢印キーで移動
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault(); lassoDelete(); return;}
    if(e.key.startsWith('Arrow')){
      e.preventDefault(); const st=e.shiftKey?10:1, pg=pageById(S.lasso.pid);
      const dd=e.key==='ArrowLeft'?[-st,0]:e.key==='ArrowRight'?[st,0]:e.key==='ArrowUp'?[0,-st]:[0,st];
      const o0=d2b(pg,0,0),o1=d2b(pg,dd[0],dd[1]); lassoNudge(o1[0]-o0[0],o1[1]-o0[1]);
      clearTimeout(nudgeT); nudgeT=setTimeout(commit,400); return;
    }
  }
  const a=getSel();
  if(a&&(e.key==='Delete'||e.key==='Backspace')){
    e.preventDefault(); const pg=pageById(S.sel.pid); pg.annots=pg.annots.filter(q=>q.id!==a.id);
    const pid=pg.id; select(null,null); redrawPage(pid); commit(); return;
  }
  if(a&&e.key.startsWith('Arrow')){
    e.preventDefault(); const st=e.shiftKey?10:1; const pg=pageById(S.sel.pid);
    const dd=e.key==='ArrowLeft'?[-st,0]:e.key==='ArrowRight'?[st,0]:e.key==='ArrowUp'?[0,-st]:[0,st];
    const o0=d2b(pg,0,0),o1=d2b(pg,dd[0],dd[1]); moveAnnot(a,clone(a),o1[0]-o0[0],o1[1]-o0[1]); redrawPage(pg.id);
    clearTimeout(nudgeT); nudgeT=setTimeout(commit,400); return;
  }
  if(e.key==='PageDown'){e.preventDefault();gotoPage(S.cur+1);}
  if(e.key==='PageUp'){e.preventDefault();gotoPage(S.cur-1);}
});
window.addEventListener('beforeunload',e=>{if(S.dirty){e.preventDefault();e.returnValue='';}});
