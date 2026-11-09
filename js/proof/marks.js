'use strict';

/* ============================================================
   校正記号 (トル・置換・挿入・付箋)
   ============================================================ */
const PROOF_PH={strike:'指示文（例: トル / トルツメ / トルアキ）',replace:'正しい文字（例: 校正）',insert:'挿入する文字',note:'コメント'};
async function proofPrompt(type,value,isNew){
  const ta=document.createElement('textarea'); ta.value=value||''; ta.placeholder=PROOF_PH[type]+'（Ctrl+Enterで確定）';
  const r=await modal({title:`${KIND[type]}${isNew?'を追加':'を編集'}`,body:ta,
    buttons:[{label:'キャンセル',value:false},{label:'OK',primary:true,value:true}],onOpen:()=>setTimeout(()=>{ta.focus();ta.select();},30)});
  return r?ta.value.trim():null;
}
async function editProof(pid,aid,isNew){
  const pg0=pageById(pid), a0=pg0&&pg0.annots.find(q=>q.id===aid); if(!a0) return;
  const v=await proofPrompt(a0.type,a0.text,isNew);
  const pg=pageById(pid), a=pg&&pg.annots.find(q=>q.id===aid);
  if(!a){return;}
  if(v===null||(!v&&a.type!=='strike')){
    if(isNew){pg.annots=pg.annots.filter(q=>q!==a); redrawPage(pid);}   // 未確定の新規注釈は破棄 (履歴に積まない)
    return;
  }
  a.text=v||'トル'; redrawPage(pid); commit();
  if(!isNew) select(pid,aid);
}
async function addProofPoint(pid,x,y,type){
  const v=await proofPrompt(type,'',true); if(!v) return;
  const pg=pageById(pid); if(!pg) return;
  const a=type==='note'
    ?{id:uid(),type,x:Math.max(0,Math.min(pg.w-NOTE,x)),y:Math.max(0,Math.min(pg.h-NOTE,y)),w:NOTE,h:NOTE,text:v}
    :{id:uid(),type,x,y,w:0,h:0,text:v,color:S.colors.proof,size:S.sizes.proof,lw:1.2,vert:S.vert};
  stampMeta(a); pg.annots.push(a); redrawPage(pid); commit();
}
