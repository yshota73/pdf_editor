'use strict';

/* ============================================================
   注釈一覧 (右パネル)
   ============================================================ */
const annText=a=>a.type==='image'?'（画像・署名・スタンプ）':(a.text||'');
function allAnnots(){const r=[]; S.pages.forEach((pg,i)=>pg.annots.forEach(a=>{if(!a.sys) r.push({pg,i,a});})); return r;}
function filteredAnnots(list){
  const fa=$('#annAuthor').value||'*', fk=$('#annKind').value||'*';
  return list.filter(x=>(fa==='*'||(x.a.author||'')===fa)&&(fk==='*'||x.a.type===fk));
}
function renderAnnList(){
  const list=allAnnots(), fa=$('#annAuthor'), fk=$('#annKind'), va=fa.value, vk=fk.value;
  const authors=[...new Set(list.map(x=>x.a.author||''))], kinds=[...new Set(list.map(x=>x.a.type))];
  fa.innerHTML='<option value="*">すべての作成者</option>'+authors.map(n=>`<option value="${esc(n)}">${esc(n||'（作成者なし）')}</option>`).join('');
  fa.value=authors.includes(va)?va:'*';
  fk.innerHTML='<option value="*">すべての種類</option>'+kinds.map(k=>`<option value="${k}">${esc(KIND[k]||k)}</option>`).join('');
  fk.value=kinds.includes(vk)?vk:'*';
  const rows=filteredAnnots(list);
  $('#annList').innerHTML=rows.length?rows.map(({pg,i,a})=>{
    const col=a.color&&PROOF.has(a.type)?a.color:a.type==='note'?'#a87900':'var(--text)';
    return `<div class="ai" data-pid="${pg.id}" data-aid="${a.id}"><div class="ai-h"><span class="ai-k" style="color:${col}">${esc(KIND[a.type]||a.type)}</span><span class="ai-p">p.${i+1}</span></div>`+
      (annText(a)?`<div class="ai-t">${esc(annText(a))}</div>`:'')+
      `<div class="ai-m">${esc(a.author||'')}${a.author&&a.ts?' · ':''}${fmtTs(a.ts)}</div></div>`;
  }).join(''):'<div class="empty-list">注釈はありません</div>';
  markAnnSel();
}
function markAnnSel(){
  if(S.panel!=='ann') return;
  $$('#annList .ai').forEach(e=>e.classList.toggle('on',!!S.sel&&+e.dataset.aid===S.sel.aid));
}
on('#annList','click',e=>{
  const it=e.target.closest('.ai'); if(!it) return;
  const pid=+it.dataset.pid, i=S.pages.findIndex(p=>p.id===pid); if(i<0) return;
  gotoPage(i); setTool('select'); select(pid,+it.dataset.aid);
});
on('#annAuthor','change',renderAnnList); on('#annKind','change',renderAnnList);
