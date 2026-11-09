'use strict';

/* ============================================================
   右パネル: 注釈一覧 / しおり
   ============================================================ */
function setPanel(tab){
  S.panel=tab; $('#rpanel').hidden=!tab;
  if(!tab) return;
  $$('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  $('#rpAnn').hidden=tab!=='ann'; $('#rpBm').hidden=tab!=='bm';
  refreshPanel();
}
function refreshPanel(){ if(S.panel==='ann') renderAnnList(); else if(S.panel==='bm') renderBmList(); }

$$('.tab').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.tab)));
on('#rpClose','click',()=>setPanel(null));
