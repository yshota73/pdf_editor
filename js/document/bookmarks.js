'use strict';

/* ---- しおり ---- */
async function promptText(title,value,ph){
  const inp=document.createElement('input'); inp.type='text'; inp.value=value||''; inp.placeholder=ph||'';
  inp.style.cssText='width:100%;height:32px;border:1px solid var(--line);border-radius:6px;padding:0 8px;background:var(--panel)';
  const r=await modal({title,body:inp,buttons:[{label:'キャンセル',value:false},{label:'OK',primary:true,value:true}],
    onOpen:(b,close)=>{setTimeout(()=>{inp.focus();inp.select();},30); inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();close(true);}});}});
  return r?inp.value.trim():null;
}
function renderBmList(){
  const box=$('#bmList');
  if(!S.bm.length){box.innerHTML='<div class="empty-list">しおりはありません。<br>「追加」で表示中のページに作成できます。</div>';return;}
  box.innerHTML=S.bm.map(b=>{
    const i=S.pages.findIndex(p=>p.id===b.pid);
    return `<div class="ai${b.id===S.bmSel?' on':''}${i<0?' gone':''}" data-bid="${b.id}" style="padding-left:${8+b.level*16}px" title="ダブルクリックで名前を変更"><div class="ai-h"><span>${esc(b.title)}</span><span class="ai-p">${i<0?'削除済み':'p.'+(i+1)}</span></div></div>`;
  }).join('');
}
const bmChanged=()=>{S.dirty=true; updateUI(); renderBmList();};
const bmIdx=()=>S.bm.findIndex(b=>b.id===S.bmSel);
on('#bmList','click',e=>{
  const it=e.target.closest('.ai'); if(!it) return; S.bmSel=+it.dataset.bid;
  const b=S.bm[bmIdx()], i=S.pages.findIndex(p=>p.id===b.pid); if(i>=0) gotoPage(i); renderBmList();
});
on('#bmList','dblclick',async e=>{
  const it=e.target.closest('.ai'); if(!it) return; const b=S.bm.find(x=>x.id===+it.dataset.bid); if(!b) return;
  const t=await promptText('しおりの名前を変更',b.title); if(t){b.title=t; bmChanged();}
});
on('#bmAdd','click',async()=>{
  const pg=S.pages[S.cur]; if(!pg) return;
  const t=await promptText('しおりを追加',`${S.cur+1}ページ`,'見出し（例: 第1章 はじめに）'); if(!t) return;
  let at=S.bm.length;   // ページ順で挿入位置を決める
  for(let k=0;k<S.bm.length;k++){const i=S.pages.findIndex(p=>p.id===S.bm[k].pid); if(i>S.cur){at=k;break;}}
  const level=at>0?S.bm[at-1].level:0;
  const b={id:uid(),title:t,pid:pg.id,level}; S.bm.splice(at,0,b); S.bmSel=b.id; bmChanged();
});
on('#bmUp','click',()=>{const k=bmIdx(); if(k>0){[S.bm[k-1],S.bm[k]]=[S.bm[k],S.bm[k-1]]; bmChanged();}});
on('#bmDown','click',()=>{const k=bmIdx(); if(k>=0&&k<S.bm.length-1){[S.bm[k+1],S.bm[k]]=[S.bm[k],S.bm[k+1]]; bmChanged();}});
on('#bmIn','click',()=>{const k=bmIdx(); if(k>0&&S.bm[k].level<=S.bm[k-1].level){S.bm[k].level++; bmChanged();}});
on('#bmOut','click',()=>{const k=bmIdx(); if(k>=0&&S.bm[k].level>0){S.bm[k].level--; bmChanged();}});
on('#bmDel','click',()=>{const k=bmIdx(); if(k>=0){S.bm.splice(k,1); S.bmSel=null; bmChanged();}});
