'use strict';

/* ============================================================
   保存 (pdf-lib でページを再構成し、注釈を書き込む)
   ============================================================ */
const hexRgb=h=>{const {rgb}=PDFLib;const n=parseInt(h.slice(1),16);return rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255);};
const canvasBytes=(c,type,q)=>new Promise((res,rej)=>c.toBlob(async b=>{try{res(new Uint8Array(await b.arrayBuffer()));}catch(e){rej(e);}},type,q));
async function pdfImage(out,cache,imgId){
  if(cache.has(imgId)) return cache.get(imgId);
  const im=S.imgs.get(imgId); const p=im.mime==='image/jpeg'?await out.embedJpg(im.bytes):await out.embedPng(im.bytes);
  cache.set(imgId,p); return p;
}
/* ページ基準座標 → 出力ページのPDF座標 */
async function natFor(pg,baked){
  if(baked||pg.src==null) return (x,y)=>[x,pg.h-y];
  const pj=await S.sources[pg.src].doc.getPage(pg.idx+1); const vp=pj.getViewport({scale:1});
  return (x,y)=>vp.convertToPdfPoint(x,y);
}
const toPdfRect=(nat,r)=>{const p=nat(r[0],r[1]),q=nat(r[0]+r[2],r[1]+r[3]); return [Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.abs(q[0]-p[0]),Math.abs(q[1]-p[1])];};
function applyBoxes(page,pg,nat){
  const b=pg.boxes; if(!b) return;
  if(b.bleed) page.setBleedBox(...toPdfRect(nat,b.bleed));
  if(b.trim) page.setTrimBox(...toPdfRect(nat,b.trim));
}
/* 注釈をPNG化して貼り付け (日本語の指示文・透かしなど) */
async function rasterAnnot(out,page,a,nat,rho,key,cache){
  const b=fullBox(a), pad=2, k=Math.min(a.type==='watermark'?2:4,4096/Math.max(b.w+pad*2,b.h+pad*2));   // 透かしはページ全面なので低めの倍率
  let png=key&&cache.get(key);
  if(!png){
    const c=document.createElement('canvas'); c.width=Math.ceil((b.w+pad*2)*k); c.height=Math.ceil((b.h+pad*2)*k);
    const ctx=c.getContext('2d'); ctx.scale(k,k); ctx.translate(pad-b.x,pad-b.y); drawAnnot(ctx,a);
    png=await out.embedPng(await canvasBytes(c,'image/png')); if(key) cache.set(key,png);
  }
  const [x,y]=nat(b.x-pad,b.y+b.h+pad);
  page.drawImage(png,{x,y,width:b.w+pad*2,height:b.h+pad*2,rotate:rho});
}
/* 付箋 → PDF標準のテキスト注釈 (Acrobat等のコメント一覧に表示される) */
function addNoteAnnot(out,page,a,nat){
  const {PDFHexString,PDFString}=PDFLib;
  const r=toPdfRect(nat,[a.x,a.y,NOTE,NOTE]);
  const d=out.context.obj({Type:'Annot',Subtype:'Text',Rect:[r[0],r[1],r[0]+r[2],r[1]+r[3]],
    Contents:PDFHexString.fromText(a.text||''),T:PDFHexString.fromText(a.author||''),Name:'Comment',C:[1,.83,.23],F:4,
    M:PDFString.fromDate(new Date(a.ts||Date.now()))});
  page.node.addAnnot(out.context.register(d));
}
async function drawAnnotsPdf(out,page,pg,helv,cache,nat){
  const {degrees,LineCapStyle}=PDFLib;
  const rho=degrees(pg.src==null?0:pg.intrinsic);
  const wm=wmFor(pg);
  for(const a of wm?[...pg.annots,wm]:pg.annots){
    switch(a.type){
      case 'highlight': { const [x,y]=nat(a.x,a.y+a.h); page.drawRectangle({x,y,width:a.w,height:a.h,color:hexRgb(a.color),opacity:.4,rotate:rho}); break; }
      case 'rect': {
        const [x,y]=nat(a.x,a.y+a.h);
        const o={x,y,width:a.w,height:a.h,borderColor:hexRgb(a.color),borderWidth:a.lw,rotate:rho};
        if(a.fill) o.color=hexRgb(a.fill); page.drawRectangle(o); break;
      }
      case 'ellipse': {
        const [x,y]=nat(a.x+a.w/2,a.y+a.h/2);
        const o={x,y,xScale:a.w/2,yScale:a.h/2,borderColor:hexRgb(a.color),borderWidth:a.lw,rotate:rho};
        if(a.fill) o.color=hexRgb(a.fill); page.drawEllipse(o); break;
      }
      case 'line': {
        const seg=(p,q)=>{const s=nat(p[0],p[1]),e=nat(q[0],q[1]);page.drawLine({start:{x:s[0],y:s[1]},end:{x:e[0],y:e[1]},thickness:a.lw,color:hexRgb(a.color),lineCap:LineCapStyle.Round});};
        seg([a.x1,a.y1],[a.x2,a.y2]);
        if(a.arrow) for(const h of arrowPts(a)) seg([a.x2,a.y2],h);
        break;
      }
      case 'pen': {
        const p=a.points;
        for(let i=0;i<p.length-1;i++){
          const s=nat(p[i][0],p[i][1]),e=nat(p[i+1][0],p[i+1][1]);
          page.drawLine({start:{x:s[0],y:s[1]},end:{x:e[0],y:e[1]},thickness:a.lw,color:hexRgb(a.color),lineCap:LineCapStyle.Round});
        }
        break;
      }
      case 'text': {
        if(/^[\x20-\x7E\n]*$/.test(a.text)){
          getLines(a).forEach((ln,i)=>{
            if(!ln) return; const [x,y]=nat(a.x,a.y+a.size*ASC+i*a.size*LH);
            page.drawText(ln,{x,y,size:a.size,font:helv,color:hexRgb(a.color),rotate:rho});
          });
        } else {
          const k=4,pad=2,c=document.createElement('canvas'); c.width=Math.ceil((a.w+pad*2)*k); c.height=Math.ceil(a.h*k);
          const ctx=c.getContext('2d'); ctx.scale(k,k); drawAnnot(ctx,{...a,x:pad,y:0});
          const png=await out.embedPng(await canvasBytes(c,'image/png'));
          const [x,y]=nat(a.x-pad,a.y+a.h);
          page.drawImage(png,{x,y,width:a.w+pad*2,height:a.h,rotate:rho});
        }
        break;
      }
      case 'image': {
        const im=await pdfImage(out,cache,a.imgId); const [x,y]=nat(a.x,a.y+a.h);
        page.drawImage(im,{x,y,width:a.w,height:a.h,rotate:rho}); break;
      }
      case 'strike': case 'replace': case 'insert': await rasterAnnot(out,page,a,nat,rho,null,cache); break;
      case 'watermark': await rasterAnnot(out,page,a,nat,rho,`wm|${pg.w}|${pg.h}`,cache); break;
      case 'note': addNoteAnnot(out,page,a,nat); break;
    }
  }
}
async function bakePage(out,pg){
  const {degrees}=PDFLib;
  const scale=Math.min(2.5,4200/Math.max(pg.w,pg.h));
  const c=document.createElement('canvas'); c.width=Math.ceil(pg.w*scale); c.height=Math.ceil(pg.h*scale);
  const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  if(pg.src!=null){
    const pj=await S.sources[pg.src].doc.getPage(pg.idx+1);
    const vp=pj.getViewport({scale});
    await pj.render({canvasContext:ctx,viewport:vp}).promise;
  }
  ctx.save(); ctx.scale(scale,scale);
  for(const a of pg.annots) if(a.type!=='note') drawAnnot(ctx,a);
  const wm=wmFor(pg); if(wm) drawAnnot(ctx,wm);
  ctx.restore();
  const img=await out.embedJpg(await canvasBytes(c,'image/jpeg',.92));
  const page=out.addPage([pg.w,pg.h]); page.drawImage(img,{x:0,y:0,width:pg.w,height:pg.h});
  page.setRotation(degrees(pg.rot));
  const nat=await natFor(pg,true);
  for(const a of pg.annots) if(a.type==='note') addNoteAnnot(out,page,a,nat);
  applyBoxes(page,pg,nat);
}
/* しおり(アウトライン)を書き込む。list に含まれないページへのしおりは省く */
function writeOutlines(out,list){
  const {PDFName,PDFHexString}=PDFLib;
  const pidx=new Map(list.map((p,i)=>[p.id,i]));
  const items=S.bm.filter(b=>pidx.has(b.pid)); if(!items.length) return;
  const ctx=out.context, root={children:[]}, stack=[{node:root,level:-1}];
  for(const b of items){
    while(stack.length>1&&stack[stack.length-1].level>=b.level) stack.pop();
    const node={b,children:[],ref:ctx.nextRef()};
    stack[stack.length-1].node.children.push(node); stack.push({node,level:b.level});
  }
  const count=n=>n.children.reduce((s,c)=>s+1+count(c),0);
  const emit=(node,parentRef)=>{
    const kids=node.children;
    kids.forEach((k,i)=>{
      const d={Title:PDFHexString.fromText(k.b.title),Parent:parentRef,Dest:[out.getPage(pidx.get(k.b.pid)).ref,'XYZ',null,null,null]};
      if(i>0) d.Prev=kids[i-1].ref;
      if(i<kids.length-1) d.Next=kids[i+1].ref;
      if(k.children.length){d.First=k.children[0].ref; d.Last=k.children[k.children.length-1].ref; d.Count=count(k);}
      ctx.assign(k.ref,ctx.obj(d)); emit(k,k.ref);
    });
  };
  const rootRef=ctx.nextRef(); emit(root,rootRef);
  ctx.assign(rootRef,ctx.obj({Type:'Outlines',First:root.children[0].ref,Last:root.children[root.children.length-1].ref,Count:count(root)}));
  out.catalog.set(PDFName.of('Outlines'),rootRef);
  out.catalog.set(PDFName.of('PageMode'),PDFName.of('UseOutlines'));
}
async function buildPdf(list,progress){
  const {PDFDocument,StandardFonts,degrees}=PDFLib;
  const out=await PDFDocument.create(); const helv=await out.embedFont(StandardFonts.Helvetica);
  const isBaked=pg=>pg.annots.some(a=>a.type==='redact');
  const need=new Map();
  list.forEach(pg=>{ if(pg.src!=null&&!isBaked(pg)){ if(!need.has(pg.src)) need.set(pg.src,[]); need.get(pg.src).push(pg);} });
  const copied=new Map();
  for(const [si,arr] of need){
    const sd=await PDFDocument.load(S.sources[si].bytes,{updateMetadata:false});
    const seen=new Set(),first=[],dups=[];
    arr.forEach(p=>{ if(seen.has(p.idx)) dups.push(p); else {seen.add(p.idx);first.push(p);} });
    const cps=await out.copyPages(sd,first.map(p=>p.idx)); first.forEach((p,i)=>copied.set(p,cps[i]));
    for(const p of dups){const [c]=await out.copyPages(sd,[p.idx]); copied.set(p,c);}
  }
  const cache=new Map(); let baked=0;
  for(let n=0;n<list.length;n++){
    const pg=list[n]; progress&&progress(n+1,list.length);
    if(isBaked(pg)){await bakePage(out,pg);baked++;continue;}
    let page;
    if(pg.src==null) page=out.addPage([pg.w,pg.h]); else {page=copied.get(pg); out.addPage(page);}
    page.setRotation(degrees((pg.intrinsic+pg.rot)%360));
    const nat=await natFor(pg,false);
    if(pg.annots.length||S.watermark) await drawAnnotsPdf(out,page,pg,helv,cache,nat);
    applyBoxes(page,pg,nat);
    await new Promise(r=>setTimeout(r,0));
  }
  writeOutlines(out,list);
  out.setProducer('PDFワークベンチ β');
  return {bytes:await out.save(),baked};
}
async function downloadBytes(filename,bytes,type){
  const dl=(window.claude&&window.claude.use)?await window.claude.use('downloads'):null;
  if(dl) await dl.save({filename,data:bytes});
  else {
    const blob=new Blob([bytes],{type}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  }
}
const baseName=()=>S.fileName.replace(/\.pdf$/i,'');
async function saveText(filename,text,type){
  try{ await downloadBytes(filename,new TextEncoder().encode(text),type); toast(`保存しました: ${filename}`,'ok'); }
  catch(e){ if(e&&e.code==='declined') toast('保存をキャンセルしました'); else toast('保存できませんでした: '+(e&&(e.message||e.code)||e),'err',6000); }
}
async function saveDoc(list,suffix,full){
  if(!libsOk||!list.length) return;
  busy('PDFを生成中…'); let res;
  try{ res=await buildPdf(list,(n,t)=>busy(`PDFを生成中… ${n}/${t}`)); }
  catch(e){console.error(e);busy(false);const m=String(e&&e.message||e);toast(/encrypt/i.test(m)?'暗号化(パスワード設定)されたPDFは保存できません。β版では未対応です':'PDFの生成に失敗しました: '+m,'err',7000);return;}
  busy(false);
  const filename=`${baseName()}${suffix}.pdf`;
  try{
    await downloadBytes(filename,res.bytes,'application/pdf');
    if(full){S.dirty=false;updateUI();}
    toast(res.baked?`保存しました（墨消しを含む${res.baked}ページは画像化されています）`:`保存しました: ${filename}`,'ok',5000);
  }catch(e){
    if(e&&e.code==='declined') toast('保存をキャンセルしました');
    else toast('保存できませんでした: '+(e&&(e.message||e.code)||e),'err',6000);
  }
}
on('#btnSave','click',()=>saveDoc(S.pages,'_編集済',true));
on('#btnExtract','click',()=>{const t=targets(); saveDoc(t,`_抽出${t.length}p`,false);});
