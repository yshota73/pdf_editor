'use strict';

/* ============================================================
   ファイルを開く・結合・新規
   ============================================================ */
async function readPdf(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let doc;
  try{
    doc=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,cMapUrl:CFG.cMapUrl,cMapPacked:true,standardFontDataUrl:CFG.standardFontDataUrl}).promise;
  }catch(e){
    if(e&&e.name==='PasswordException') toast(`「${file.name}」はパスワード保護されています。β版では未対応です`,'err',6000);
    else toast(`「${file.name}」を読み込めませんでした（${e&&e.message||e}）`,'err',6000);
    return null;
  }
  let lib=null;   // TrimBox/BleedBox の読み取りとプリフライト用 (pdf-lib)
  try{ lib=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false}); }catch(e){console.warn('pdf-lib',e);}
  const info=[];
  for(let i=1;i<=doc.numPages;i++){
    const p=await doc.getPage(i); const vp=p.getViewport({scale:1});
    let boxes=null; try{ if(lib) boxes=readBoxes(lib.getPage(i-1),vp); }catch(e){}
    info.push({w:vp.width,h:vp.height,intrinsic:((p.rotate%360)+360)%360,boxes});
    if(i%25===0) busy(`読み込み中… ${i}/${doc.numPages}`);
  }
  return {name:file.name,bytes,doc,info,lib};
}
/* PDF座標の TrimBox/BleedBox → ページ基準座標 [x,y,w,h] */
function readBoxes(lp,vp){
  const {PDFName,PDFArray}=PDFLib;
  const r=k=>{
    const arr=lp.node.lookupMaybe(PDFName.of(k),PDFArray); if(!arr||arr.size()<4) return null;
    const n=arr.asArray().slice(0,4).map(o=>{const v=lp.doc.context.lookup(o); return v&&v.asNumber?v.asNumber():NaN;});
    if(n.some(isNaN)) return null;
    const p1=vp.convertToViewportPoint(n[0],n[1]),p2=vp.convertToViewportPoint(n[2],n[3]);
    return [Math.min(p1[0],p2[0]),Math.min(p1[1],p2[1]),Math.abs(p2[0]-p1[0]),Math.abs(p2[1]-p1[1])];
  };
  const trim=r('TrimBox'),bleed=r('BleedBox');
  return (trim||bleed)?{trim,bleed}:null;
}
function registerPdf(res){
  const si=S.sources.push({name:res.name,bytes:res.bytes,doc:res.doc,lib:res.lib})-1;
  return res.info.map((m,i)=>({id:uid(),src:si,idx:i,w:m.w,h:m.h,intrinsic:m.intrinsic,rot:0,annots:[],boxes:m.boxes}));
}
/* 既存PDFのしおり(アウトライン)を読み込む */
async function importOutline(doc,pages){
  const out=[];
  try{
    const ol=await doc.getOutline(); if(!ol) return out;
    const walk=async(items,level)=>{
      for(const it of items){
        let pid=null;
        try{
          const dest=typeof it.dest==='string'?await doc.getDestination(it.dest):it.dest;
          if(Array.isArray(dest)&&dest[0]!=null){
            const idx=typeof dest[0]==='number'?dest[0]:await doc.getPageIndex(dest[0]);
            if(pages[idx]) pid=pages[idx].id;
          }
        }catch(e){}
        if(pid!=null) out.push({id:uid(),title:it.title||'（無題）',pid,level});
        if(it.items&&it.items.length) await walk(it.items,pid!=null?level+1:level);
      }
    };
    await walk(ol,0);
  }catch(e){console.warn('outline',e);}
  return out;
}
function resetDoc(){
  S.sources.forEach(s=>{try{s.doc.destroy();}catch(e){}});
  S.sources=[]; S.pages=[]; S.imgs.clear(); S.checked=new Set(); S.sel=null; S.hist=[]; S.hpos=-1; S.cur=0; S.pending=null;
  S.bm=[]; S.bmSel=null; S.watermark=null;
  for(const d of pageEls.values()) killEl(d); pageEls=new Map();
  for(const d of thumbEls.values()){tio.unobserve(d);d.remove();} thumbEls=new Map();
}
function afterLoad(){
  S.zoom=fitZoom(); buildPages(); buildThumbs(); commit(); S.dirty=false;
  viewBox.scrollTop=0; setTool('select'); updateUI();
}
async function openFile(file){
  if(!libsOk){toast('ライブラリを読み込めませんでした。ネットワーク設定を確認してください','err',6000);return;}
  if(hasDoc()&&S.dirty&&!(await confirmDlg('未保存の変更があります。破棄して別のPDFを開きますか？','破棄して開く'))) return;
  busy('読み込み中…');
  try{
    const res=await readPdf(file); if(!res){busy(false);return;}
    resetDoc(); S.fileName=file.name; S.pages=registerPdf(res); S.bm=await importOutline(res.doc,S.pages); S.zoom=1; afterLoad();
    setStatus(`${res.name} を開きました（${S.pages.length}ページ）`);
  }catch(e){console.error(e);toast('読み込みに失敗しました: '+(e.message||e),'err',6000);}
  busy(false);
}
async function mergeFiles(files){
  if(!libsOk) return;
  let added=0; busy('結合中…');
  try{
    for(const f of files){
      const res=await readPdf(f); if(!res) continue;
      const pgs=registerPdf(res); S.pages.push(...pgs); added+=pgs.length;
      S.bm.push(...await importOutline(res.doc,pgs));
    }
    if(added){ buildPages(); buildThumbs(); commit(); toast(`${added}ページを末尾に結合しました`,'ok'); gotoPage(S.pages.length-added); }
  }catch(e){console.error(e);toast('結合に失敗しました: '+(e.message||e),'err',6000);}
  busy(false);
}
async function newBlank(){
  if(hasDoc()&&S.dirty&&!(await confirmDlg('未保存の変更があります。破棄して新規作成しますか？','破棄して作成'))) return;
  resetDoc(); S.fileName='新規ドキュメント.pdf';
  S.pages=[{id:uid(),src:null,idx:0,w:595.28,h:841.89,intrinsic:0,rot:0,annots:[]}]; S.zoom=1; afterLoad();
}
on('#btnOpen','click',()=>$('#fileOpen').click()); on('#btnOpen2','click',()=>$('#fileOpen').click());
on('#btnNew','click',newBlank);
on('#btnMerge','click',()=>$('#fileMerge').click());
on('#fileOpen','change',e=>{const f=e.target.files[0]; e.target.value=''; if(f) openFile(f);});
on('#fileMerge','change',e=>{const fs=[...e.target.files]; e.target.value=''; if(fs.length) mergeFiles(fs);});
on('#btnImage','click',()=>$('#fileImg').click());
on('#fileImg','change',e=>{const f=e.target.files[0]; e.target.value=''; if(f) pickImage(f);});
on('#btnSign','click',signatureDialog);
