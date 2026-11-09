'use strict';

/* ============================================================
   プリフライト (入稿前チェック)
   ============================================================ */
const pnm=o=>o instanceof PDFLib.PDFName?(o.decodeText?o.decodeText():o.asString().slice(1)):'';
const isTrue=o=>!!o&&String(o)==='true';
async function libDoc(si){
  const s=S.sources[si]; if(!s.lib) s.lib=await PDFLib.PDFDocument.load(s.bytes,{ignoreEncryption:true,updateMetadata:false});
  return s.lib;
}
function inhRes(node){
  const {PDFName,PDFDict}=PDFLib; let n=node, guard=0;
  while(n&&guard++<32){const r=n.lookupMaybe(PDFName.of('Resources'),PDFDict); if(r) return r; n=n.lookupMaybe(PDFName.of('Parent'),PDFDict);}
  return null;
}
function csKind(ctx,o){
  const {PDFName,PDFArray}=PDFLib; o=ctx.lookup(o);
  if(o instanceof PDFName){const n=pnm(o); return {k:/RGB/.test(n)?'RGB':/CMYK/.test(n)?'CMYK':/Gray/.test(n)?'Gray':n};}
  if(o instanceof PDFArray&&o.size()){
    const f=pnm(ctx.lookup(o.get(0)));
    if(f==='ICCBased'){const st=ctx.lookup(o.get(1)); const N=st&&st.dict?st.dict.lookup(PDFName.of('N')):null; const n=N&&N.asNumber?N.asNumber():0; return {k:n===3?'RGB':n===4?'CMYK':n===1?'Gray':'ICC'};}
    if(f==='Indexed') return csKind(ctx,o.get(1));
    if(f==='Separation') return {k:'Spot',names:[pnm(ctx.lookup(o.get(1)))]};
    if(f==='DeviceN'){const a=ctx.lookup(o.get(1)); return {k:'Spot',names:a instanceof PDFArray?a.asArray().map(x=>pnm(ctx.lookup(x))):[]};}
    if(/RGB/.test(f)) return {k:'RGB'}; if(/Gray/.test(f)) return {k:'Gray'};
    return {k:f};
  }
  return {k:'?'};
}
function recordCs(R,cs,pno,isImg){
  if(cs.k==='RGB') (isImg?R.rgbImg:R.rgbCs).add(pno);
  else if(cs.k==='Lab') R.rgbCs.add(pno);
  else if(cs.k==='Spot') for(const n of cs.names||[]){
    if(['Cyan','Magenta','Yellow','Black','None','All',''].includes(n)) continue;
    if(!R.spot.has(n)) R.spot.set(n,new Set()); R.spot.get(n).add(pno);
  }
}
function fontCheck(fd,pno,R){
  const {PDFName,PDFDict,PDFArray}=PDFLib;
  const sub=pnm(fd.lookup(PDFName.of('Subtype'))), base=pnm(fd.lookup(PDFName.of('BaseFont')))||'（名前なし）';
  const encO=fd.lookup(PDFName.of('Encoding')), enc=pnm(encO);
  let desc=null, kind=sub;
  if(sub==='Type0'){
    const arr=fd.lookupMaybe(PDFName.of('DescendantFonts'),PDFArray), df=arr&&arr.size()?arr.lookup(0,PDFDict):null;
    if(df){desc=df.lookupMaybe(PDFName.of('FontDescriptor'),PDFDict); kind=pnm(df.lookup(PDFName.of('Subtype')))||'CID';}
  } else if(sub!=='Type3') desc=fd.lookupMaybe(PDFName.of('FontDescriptor'),PDFDict);
  let emb=sub==='Type3', fmt=sub==='Type3'?'Type3':'';
  if(desc){
    if(desc.has(PDFName.of('FontFile2'))){emb=true;fmt='TrueType';}
    else if(desc.has(PDFName.of('FontFile3'))){emb=true; const ff=desc.lookup(PDFName.of('FontFile3')); const st=ff&&ff.dict?pnm(ff.dict.lookup(PDFName.of('Subtype'))):''; fmt=st==='OpenType'?'OpenType':'CFF';}
    else if(desc.has(PDFName.of('FontFile'))){emb=true;fmt='Type1';}
  }
  const key=base+'|'+sub; let f=R.fonts.get(key);
  if(!f){f={base,sub,kind,fmt,emb,cid:sub==='Type0',vert:/-V$/.test(enc),subset:/^[A-Z]{6}\+/.test(base),pages:new Set()}; R.fonts.set(key,f);}
  f.pages.add(pno);
}
function streamText(st){
  try{
    let b=null;
    if(st instanceof PDFLib.PDFRawStream&&PDFLib.decodePDFRawStream) b=PDFLib.decodePDFRawStream(st).decode();
    else if(st&&st.getContents) b=st.getContents();
    if(!b) return '';
    return new TextDecoder('latin1').decode(b.length>8e6?b.subarray(0,8e6):b);
  }catch(e){return '';}
}
const RGB_OP=/(?:^|[\s\]\)>])-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+(?:rg|RG)(?=[\s\/\[\(<]|$)/;
function scanStream(st,pno,R){ if(RGB_OP.test(streamText(st))) R.rgbVec.add(pno); }
function scanResources(ctx,res,pno,R,seen,depth){
  const {PDFName,PDFDict,PDFRef}=PDFLib;
  if(!res||depth>6) return;
  const sub=k=>res.lookupMaybe(PDFName.of(k),PDFDict);
  const fonts=sub('Font');
  if(fonts) for(const [,v] of fonts.entries()){const fd=ctx.lookup(v); if(fd instanceof PDFDict) fontCheck(fd,pno,R);}
  const css=sub('ColorSpace');
  if(css) for(const [,v] of css.entries()) recordCs(R,csKind(ctx,v),pno,false);
  const gs=sub('ExtGState');
  if(gs) for(const [,v] of gs.entries()){const d=ctx.lookup(v); if(d instanceof PDFDict&&(isTrue(d.lookup(PDFName.of('OP')))||isTrue(d.lookup(PDFName.of('op'))))) R.overprint.add(pno);}
  const xo=sub('XObject');
  if(xo) for(const [,v] of xo.entries()){
    const key=v instanceof PDFRef?v.toString()+'@'+pno:null; if(key){if(seen.has(key)) continue; seen.add(key);}
    const st=ctx.lookup(v); if(!st||!st.dict) continue;
    const t=pnm(st.dict.lookup(PDFName.of('Subtype')));
    if(t==='Image'){ if(!isTrue(st.dict.lookup(PDFName.of('ImageMask')))) recordCs(R,csKind(ctx,st.dict.lookup(PDFName.of('ColorSpace'))),pno,true); }
    else if(t==='Form'){ scanResources(ctx,st.dict.lookupMaybe(PDFName.of('Resources'),PDFDict),pno,R,seen,depth+1); scanStream(st,pno,R); }
  }
}
async function scanImageRes(pg,pno,R){
  const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
  const ops=await page.getOperatorList(), O=pdfjsLib.OPS;
  const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
  let m=[1,0,0,1,0,0]; const stk=[];
  for(let i=0;i<ops.fnArray.length;i++){
    const fn=ops.fnArray[i], args=ops.argsArray[i];
    if(fn===O.save) stk.push(m);
    else if(fn===O.restore) m=stk.pop()||m;
    else if(fn===O.transform) m=mul(m,args);
    else if(fn===O.paintFormXObjectBegin){stk.push(m); if(args[0]&&args[0].length===6) m=mul(m,[...args[0]]);}
    else if(fn===O.paintFormXObjectEnd) m=stk.pop()||m;
    else if(fn===O.paintImageXObject||fn===O.paintInlineImageXObject){
      const w=fn===O.paintImageXObject?args[1]:args[0]&&args[0].width, h=fn===O.paintImageXObject?args[2]:args[0]&&args[0].height;
      if(!w||!h||w*h<64*64) continue;
      const sx=Math.hypot(m[0],m[1]), sy=Math.hypot(m[2],m[3]); if(sx<4||sy<4) continue;
      const ppi=Math.min(w/(sx/72),h/(sy/72));
      if(ppi<300) R.lowRes.push({pno,w,h,ppi:Math.round(ppi)});
    }
  }
}
const pageList=set=>{
  const a=[...set].sort((x,y)=>x-y), out=[];
  for(let i=0;i<a.length;i++){let j=i; while(j+1<a.length&&a[j+1]===a[j]+1) j++; out.push(j>i?`${a[i]}-${a[j]}`:`${a[i]}`); i=j;}
  return out.join(', ');
};
async function preflight(){
  if(!hasDoc()) return;
  const R={fonts:new Map(),rgbImg:new Set(),rgbCs:new Set(),rgbVec:new Set(),spot:new Map(),overprint:new Set(),lowRes:[],noTrim:new Set(),lowBleed:[],sizes:new Map(),errors:[]};
  busy('プリフライト中…');
  try{
    for(let n=0;n<S.pages.length;n++){
      const pg=S.pages[n], pno=n+1;
      if(n%5===0) busy(`プリフライト中… ${pno}/${S.pages.length}`);
      const tb=pg.boxes&&pg.boxes.trim;
      const sz=tb?`${mm(tb[2])}×${mm(tb[3])}mm（仕上がり）`:`${mm(pg.w)}×${mm(pg.h)}mm`;
      if(!R.sizes.has(sz)) R.sizes.set(sz,new Set()); R.sizes.get(sz).add(pno);
      if(!tb) R.noTrim.add(pno);
      else {
        const bb=(pg.boxes.bleed)||[0,0,pg.w,pg.h];
        const bl=Math.min(tb[0]-bb[0],tb[1]-bb[1],(bb[0]+bb[2])-(tb[0]+tb[2]),(bb[1]+bb[3])-(tb[1]+tb[3]));
        if(bl<MM(3)-.05) R.lowBleed.push(`p.${pno}（${mm(Math.max(0,bl))}mm）`);
      }
      if(pg.src==null) continue;
      try{
        const lib=await libDoc(pg.src), lp=lib.getPage(pg.idx);
        scanResources(lib.context,inhRes(lp.node),pno,R,new Set(),0);
        const c=lp.node.Contents();
        if(c instanceof PDFLib.PDFArray) c.asArray().forEach(x=>scanStream(lib.context.lookup(x),pno,R)); else if(c) scanStream(c,pno,R);
      }catch(e){R.errors.push(`p.${pno}: 構造を解析できませんでした（${e.message||e}）`);}
      try{ await scanImageRes(pg,pno,R); }catch(e){R.errors.push(`p.${pno}: 画像を解析できませんでした`);}
    }
  }catch(e){console.error(e); R.errors.push(String(e.message||e));}
  busy(false);
  showPreflight(R);
}
function showPreflight(R){
  const fonts=[...R.fonts.values()], noEmb=fonts.filter(f=>!f.emb);
  const items=[];  // [level, 見出し, 詳細HTML]
  items.push(noEmb.length?['err',`埋め込まれていないフォント ${noEmb.length}件`,noEmb.map(f=>`${esc(f.base)}（p.${pageList(f.pages)}）`).join('<br>')]:['ok','すべてのフォントが埋め込まれています','']);
  const low=R.lowRes.filter(x=>x.ppi<300), vlow=low.filter(x=>x.ppi<150);
  items.push(low.length?[vlow.length?'err':'warn',`解像度の低い画像 ${low.length}件（300ppi未満）`,low.slice(0,50).map(x=>`p.${x.pno}: ${x.w}×${x.h}px → 実効 ${x.ppi}ppi`).join('<br>')+(low.length>50?`<br>ほか ${low.length-50}件`:'')]:['ok','画像の実効解像度は300ppi以上です','']);
  items.push(R.rgbImg.size?['warn','RGBの画像があります',`p.${pageList(R.rgbImg)}`]:['ok','RGBの画像はありません','']);
  const rgbOther=new Set([...R.rgbVec,...R.rgbCs]);
  items.push(rgbOther.size?['warn','RGBで指定された色（文字・図形など）があります',`p.${pageList(rgbOther)}`]:['ok','文字・図形にRGBの色指定はありません','']);
  if(R.spot.size) items.push(['info',`特色 ${R.spot.size}色`,[...R.spot].map(([n,s])=>`${esc(n)}（p.${pageList(s)}）`).join('<br>')]);
  if(R.overprint.size) items.push(['info','オーバープリント設定があります（スミノセ・白ノセを確認してください）',`p.${pageList(R.overprint)}`]);
  items.push(R.noTrim.size?['warn','仕上がり位置（TrimBox）が設定されていないページ',`p.${pageList(R.noTrim)}　<span class="muted">「入稿 → 仕上がり・塗り足しを設定」で設定できます</span>`]:['ok','すべてのページに仕上がり位置（TrimBox）があります','']);
  if(R.lowBleed.length) items.push(['warn',`塗り足しが3mm未満のページ ${R.lowBleed.length}件`,R.lowBleed.slice(0,50).join('、')]);
  if(R.sizes.size>1) items.push(['warn','ページサイズが混在しています',[...R.sizes].map(([s,p])=>`${s}: p.${pageList(p)}`).join('<br>')]);
  R.errors.forEach(e=>items.push(['err','解析エラー',esc(e)]));
  const cnt=l=>items.filter(i=>i[0]===l).length;
  const ICON={ok:'✔',warn:'⚠',err:'✖',info:'ℹ'}, CLS={ok:'pf-ok',warn:'pf-warn',err:'pf-err',info:''};
  let h=`<div class="pf-sum"><span class="pf-err">エラー ${cnt('err')}</span><span class="pf-warn">警告 ${cnt('warn')}</span><span class="pf-ok">OK ${cnt('ok')}</span><span>情報 ${cnt('info')}</span></div>`;
  h+=items.map(([l,t,d])=>`<div class="pf-sec"><b class="${CLS[l]}">${ICON[l]} ${t}</b>${d?`<div class="muted" style="margin:2px 0 0 18px">${d}</div>`:''}</div>`).join('');
  if(fonts.length){
    h+='<h4>使用フォント</h4><table class="pf-tbl"><tr><th>フォント名</th><th>形式</th><th>埋め込み</th><th>ページ</th></tr>'+
      fonts.map(f=>`<tr><td>${esc(f.base.replace(/^[A-Z]{6}\+/,''))}${f.cid?' <span class="muted">和文/CID</span>':''}${f.vert?' <span class="muted">縦書き</span>':''}</td><td>${esc(f.fmt||f.kind||f.sub)}</td><td class="${f.emb?'pf-ok':'pf-err'}">${f.emb?(f.subset?'サブセット':'完全'):'なし'}</td><td>${pageList(f.pages)}</td></tr>`).join('')+'</table>';
  }
  h+='<p class="muted">PDF/X準拠の検証・分版プレビュー・総インキ量(TAC)のチェックは今後対応予定です。</p>';
  modal({title:'プリフライト結果',wide:true,body:h,buttons:[{label:'閉じる',primary:true,value:true}]});
}
