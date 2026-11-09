'use strict';

/* ---- 注釈の書き出し・統合 ---- */
function exportCsv(){
  const rows=filteredAnnots(allAnnots());
  if(!rows.length){toast('書き出す注釈がありません','err');return;}
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[['No','ページ','種類','指示・内容','作成者','日時'].map(q).join(',')];
  rows.forEach((r,n)=>lines.push([n+1,r.i+1,KIND[r.a.type]||r.a.type,annText(r.a),r.a.author||'',fmtTs(r.a.ts)].map(q).join(',')));
  saveText(`${baseName()}_注釈一覧.csv`,'\ufeff'+lines.join('\r\n'),'text/csv');
}
function exportAnnots(){
  const items=allAnnots().map(({i,a})=>{const o={page:i,a:clone(a)}; if(a.type==='image'){const im=S.imgs.get(a.imgId); if(im) o.img=im.url;} return o;});
  if(!items.length){toast('書き出す注釈がありません','err');return;}
  const data={app:'pdf-workbench',format:1,file:S.fileName,pageCount:S.pages.length,exported:Date.now(),author:S.author,annots:items};
  saveText(`${baseName()}_注釈${S.author?'_'+S.author:''}.json`,JSON.stringify(data),'application/json');
}
async function registerDataUrl(url){
  const m=/^data:(image\/(?:png|jpeg));base64,/.exec(url); if(!m) return null;
  const id=uid(), el=new Image(); await new Promise(r=>{el.onload=r;el.onerror=r;el.src=url;});
  S.imgs.set(id,{mime:m[1],bytes:dataUrlBytes(url),el,url}); return id;
}
async function importAnnots(files){
  const key=a=>{const o={...a}; delete o.id; delete o.imgId; return JSON.stringify(o);};
  let added=0,dup=0,skip=0,mismatch=false;
  for(const file of files){
    let data; try{data=JSON.parse(await file.text());}catch(e){toast(`「${file.name}」を読み込めません`,'err');continue;}
    if(!data||data.app!=='pdf-workbench'||!Array.isArray(data.annots)){toast(`「${file.name}」は注釈ファイルではありません`,'err');continue;}
    if(data.pageCount!==S.pages.length) mismatch=true;
    const imgMap=new Map();
    for(const it of data.annots){
      const pg=S.pages[it.page]; if(!pg||!it.a||!KIND[it.a.type]){skip++;continue;}
      const a=clone(it.a);
      if(pg.annots.some(q=>key(q)===key(a))){dup++;continue;}
      a.id=uid();
      if(a.type==='image'){
        if(!it.img){skip++;continue;}
        if(!imgMap.has(it.img)) imgMap.set(it.img,await registerDataUrl(it.img));
        a.imgId=imgMap.get(it.img); if(a.imgId==null){skip++;continue;}
      }
      pg.annots.push(a); added++;
    }
  }
  if(added){redrawAll(); commit(); setPanel('ann');}
  toast(`${added}件の注釈を統合しました`+(dup?`（重複${dup}件は除外）`:'')+(skip?`（対象外${skip}件）`:'')+(mismatch?'。ページ数が異なるため位置を確認してください':''),added?'ok':'info',6000);
}
on('#btnCsv','click',exportCsv); on('#btnAnnOut','click',exportAnnots); on('#btnAnnIn','click',()=>$('#fileAnn').click());
on('#fileAnn','change',e=>{const fs=[...e.target.files]; e.target.value=''; if(fs.length) importAnnots(fs);});
