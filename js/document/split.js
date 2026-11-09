'use strict';

/* ============================================================
   分割して保存 (台割)
   ============================================================ */
function parseRanges(text,len){
  const groups=[], errs=[];
  text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach((line,ln)=>{
    const m=line.match(/^(.*?)([\d\s,，\-–〜~]+)$/); if(!m){errs.push(`${ln+1}行目`);return;}
    const pages=[]; let ok=true;
    for(const part of m[2].split(/[,，]/).map(s=>s.trim()).filter(Boolean)){
      const r=part.match(/^(\d+)\s*(?:[-–〜~]\s*(\d+))?$/); if(!r){ok=false;break;}
      const a=+r[1], b=r[2]?+r[2]:a; if(a<1||b>len||a>b){ok=false;break;}
      for(let p=a;p<=b;p++) pages.push(p-1);
    }
    if(!ok||!pages.length){errs.push(`${ln+1}行目`);return;}
    groups.push({name:m[1].trim(),pages});
  });
  return {groups,errs};
}
async function splitDialog(){
  const f=document.createElement('div'); f.className='fm';
  f.innerHTML=`<label>方法</label><select id="spMode"><option value="n">一定のページ数ごと</option><option value="r">範囲を指定（台割）</option></select>
    <label>ページ数</label><div class="row"><input type="number" id="spN" min="1" value="16"> ページごと</div>
    <label>範囲</label><textarea id="spR" placeholder="1行に1ファイル（名前は省略可）&#10;表紙 1-4&#10;本文1折 5-20&#10;本文2折 21-36"></textarea>
    <p class="muted">全${S.pages.length}ページ。分割したファイルは順番にダウンロードされます（注釈・墨消し・しおりも反映）。</p>`;
  const g=id=>f.querySelector('#'+id);
  const r=await modal({title:'分割して保存',body:f,buttons:[{label:'キャンセル',value:null},{label:'分割して保存',primary:true,value:'ok'}]});
  if(!r) return;
  let groups;
  if(g('spMode').value==='n'){
    const n=Math.max(1,Math.round(+g('spN').value||1)); groups=[];
    for(let i=0;i<S.pages.length;i+=n) groups.push({name:'',pages:[...Array(Math.min(n,S.pages.length-i)).keys()].map(k=>i+k)});
  } else {
    const res=parseRanges(g('spR').value,S.pages.length);
    if(res.errs.length||!res.groups.length){toast(`範囲を読み取れません: ${res.errs.join('、')||'入力がありません'}`,'err',6000);return;}
    groups=res.groups;
  }
  for(let k=0;k<groups.length;k++){
    const gr=groups[k], sfx=gr.name?`_${gr.name.replace(/[\\/:*?"<>|]/g,'_')}`:`_${String(k+1).padStart(2,'0')}`;
    await saveDoc(gr.pages.map(i=>S.pages[i]),sfx,false);
  }
}
