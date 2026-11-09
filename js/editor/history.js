'use strict';

/* ============================================================
   履歴
   ============================================================ */
function commit(){
  S.hist=S.hist.slice(0,S.hpos+1); S.hist.push(JSON.stringify(S.pages));
  if(S.hist.length>80) S.hist.shift();
  S.hpos=S.hist.length-1; S.dirty=true; updateUI(); refreshPanel();
}
function restore(){
  S.pages=JSON.parse(S.hist[S.hpos]); S.dirty=true; S.sel=null;
  S.checked=new Set([...S.checked].filter(id=>pageById(id)));
  S.cur=Math.min(S.cur,S.pages.length-1);
  buildPages(); buildThumbs(); updateUI(); syncOptions(); refreshPanel();
}
function undo(){if(S.hpos>0){S.hpos--;restore();}}
function redo(){if(S.hpos<S.hist.length-1){S.hpos++;restore();}}
