'use strict';

/* ============================================================
   版の比較 (初校と再校などのテキスト差分)
   ============================================================ */
async function textOf(doc,idx){
  const p=await doc.getPage(idx+1); const tc=await p.getTextContent();
  return tc.items.map(it=>(it.str||'')+(it.hasEOL?'\n':'')).join('');
}
function diffStr(a,b){
  const ops=[]; const push=(o,s)=>{if(!s) return; const l=ops[ops.length-1]; if(l&&l[0]===o) l[1]+=s; else ops.push([o,s]);};
  let p=0; while(p<a.length&&p<b.length&&a[p]===b[p]) p++;
  let s=0; while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s]) s++;
  const A=a.slice(p,a.length-s), B=b.slice(p,b.length-s), n=A.length, m=B.length;
  push(0,a.slice(0,p));
  if(n*m>9e6){push(-1,A); push(1,B);}        // 大きすぎる場合は粗い差分
  else if(n&&m){
    const W=m+1, dp=new Uint16Array((n+1)*W);
    for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
      dp[i*W+j]=A[i]===B[j]?dp[(i+1)*W+j+1]+1:Math.max(dp[(i+1)*W+j],dp[i*W+j+1]);
    let i=0,j=0;
    while(i<n&&j<m){
      if(A[i]===B[j]){push(0,A[i]);i++;j++;}
      else if(dp[(i+1)*W+j]>=dp[i*W+j+1]){push(-1,A[i]);i++;}
      else {push(1,B[j]);j++;}
    }
    push(-1,A.slice(i)); push(1,B.slice(j));
  } else {push(-1,A); push(1,B);}
  push(0,a.slice(a.length-s));
  return ops;
}
function toHunks(ops){
  const H=[]; let cur=null, prev='';
  ops.forEach(([o,s],k)=>{
    if(o===0){
      if(cur&&s.length<3&&k<ops.length-1){cur.del+=s;cur.ins+=s;return;}   // ごく短い一致は前後の変更とまとめる
      if(cur){cur.after=s.slice(0,12);H.push(cur);cur=null;}
      prev=s;
    } else {
      if(!cur) cur={before:prev.slice(-12),del:'',ins:'',after:''};
      if(o<0) cur.del+=s; else cur.ins+=s;
    }
  });
  if(cur) H.push(cur);
  return H;
}
async function compareWith(file){
  if(!hasDoc()) return;
  busy('比較中…'); let other;
  try{ other=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:CFG.cMapUrl,cMapPacked:true,standardFontDataUrl:CFG.standardFontDataUrl}).promise; }
  catch(e){busy(false); toast(`「${file.name}」を読み込めませんでした`,'err'); return;}
  try{
    const n=Math.max(S.pages.length,other.numPages), res=[]; let total=0;
    for(let i=0;i<n;i++){
      busy(`比較中… ${i+1}/${n}`);
      const pg=S.pages[i];
      const cur=pg?(pg.src!=null?await textOf(S.sources[pg.src].doc,pg.idx):''):null;
      const old=i<other.numPages?await textOf(other,i):null;
      if(cur===null||old===null){res.push({i,only:cur===null?'old':'new'}); total++; continue;}
      let A=old.replace(/\s+/g,' ').trim(), B=cur.replace(/\s+/g,' ').trim();
      const nonAscii=((A+B).match(/[^\x00-\x7F]/g)||[]).length;
      if(nonAscii>(A.length+B.length)*.3){A=A.replace(/\s/g,'');B=B.replace(/\s/g,'');}   // 和文は空白の差を無視
      if(A===B) continue;
      const hunks=toHunks(diffStr(A,B)); if(hunks.length){res.push({i,hunks}); total+=hunks.length;}
    }
    busy(false); showCompare(file.name,res,total,other.numPages);
  }catch(e){busy(false); console.error(e); toast('比較に失敗しました: '+(e.message||e),'err',6000);}
  finally{try{other.destroy();}catch(e){}}
}
async function showCompare(name,res,total,oldPages){
  const cut=s=>s.length>200?s.slice(0,200)+'…':s;
  let h=`<p>比較元: <b>${esc(name)}</b>（${oldPages}ページ） → 現在の文書（${S.pages.length}ページ）</p>`;
  h+=total?`<p class="pf-warn">${res.length}ページで ${total}か所の違いが見つかりました。<span class="muted">（<del>赤</del>=削除・<ins>緑</ins>=追加）</span></p>`:'<p class="pf-ok">テキストの違いは見つかりませんでした。</p>';
  for(const r of res){
    h+=`<div class="diff-pg"><div class="diff-h"><b>p.${r.i+1}</b>`+(r.only?'':` <span class="muted">${r.hunks.length}か所</span>`)+(S.pages[r.i]?`<button class="btn" data-goto="${r.i}">このページへ</button>`:'')+'</div>';
    if(r.only==='old') h+='<div class="diff-row">比較元にだけあるページです（削除されたページ）</div>';
    else if(r.only==='new') h+='<div class="diff-row">現在の文書にだけあるページです（追加されたページ）</div>';
    else {
      h+=r.hunks.slice(0,100).map(x=>`<div class="diff-row">…${esc(x.before)}${x.del?`<del>${esc(cut(x.del))}</del>`:''}${x.ins?`<ins>${esc(cut(x.ins))}</ins>`:''}${esc(x.after)}…</div>`).join('');
      if(r.hunks.length>100) h+=`<div class="muted">ほか ${r.hunks.length-100}か所</div>`;
    }
    h+='</div>';
  }
  h+='<p class="muted">テキスト情報のないページ（画像だけのスキャンなど）は比較できません。</p>';
  const v=await modal({title:'版の比較結果',wide:true,body:h,
    buttons:[{label:'CSVで書き出し',value:'csv'},{label:'閉じる',primary:true,value:true}],
    onOpen:(box,close)=>box.addEventListener('click',e=>{const b=e.target.closest('[data-goto]'); if(b){close(null); gotoPage(+b.dataset.goto);}})});
  if(v==='csv'){
    const q=s=>`"${String(s??'').replace(/"/g,'""')}"`;
    const lines=[['ページ','種別','前後','削除された文字','追加された文字'].map(q).join(',')];
    for(const r of res){
      if(r.only) lines.push([r.i+1,r.only==='old'?'ページ削除':'ページ追加','','',''].map(q).join(','));
      else r.hunks.forEach(x=>lines.push([r.i+1,x.del&&x.ins?'置換':x.del?'削除':'追加',`${x.before}〓${x.after}`,x.del,x.ins].map(q).join(',')));
    }
    saveText(`${baseName()}_版比較.csv`,'\ufeff'+lines.join('\r\n'),'text/csv');
  }
}
on('#fileCmp','change',e=>{const f=e.target.files[0]; e.target.value=''; if(f) compareWith(f);});
