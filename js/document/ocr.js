'use strict';

/* ============================================================
   文字の読み取り (OCR)
   スキャンした画像のページから文字を読み取り、「文字選択」ツールで選択・コピーできるようにする。
   読み取りは tesseract.js でこの端末のブラウザ内で行う（初回のみ辞書データをダウンロード）

   読み取り結果は S.ocr に「行の断片(seg)」の並びとして記録する。
     seg = {x0,y0,x1,y1, toks:[{t,x0,x1}], vert?, ang?}   座標はページ基準(pt, 左上原点)
   並びは読む順（段組みは左の段→右の段）。単語ごとの位置を持つので、選択範囲が画像の文字と重なる
   ============================================================ */
const ocrKey=pg=>pg.src+':'+pg.idx;   // 元のPDFのページ単位で記録する（並べ替え・複製・元に戻すの影響を受けない）
const CJK='　-ヿ㐀-鿿豈-﫿＀-￯';
const CJK_GAP=new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`,'g');
const joinCJK=s=>s.replace(CJK_GAP,'$1').trim();   // 日本語の文字の間に入る余計な半角空白を除く（全角空白は残す）
const isCJK=ch=>!!ch&&new RegExp(`[${CJK}]`).test(ch);
const OCR_LANGS={h:'jpn+eng',en:'eng',v:'jpn_vert'};

let tessP=null;
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(!tessP) tessP=new Promise((res,rej)=>{
    const s=document.createElement('script'); s.src=CFG.tesseract;
    s.onload=res; s.onerror=()=>{tessP=null; s.remove(); rej(new Error('文字読み取りのライブラリを読み込めませんでした'));};
    document.head.append(s);
  });
  return tessP;
}

/* ---- ページの調査: 元から入っている文字と、ページを覆う画像の大きさ ---- */
const OCR_MIN_CHARS=20;      // これ未満の文字しかないページは「文字なし」とみなす（スキャナーが付けたページ番号など）
const SCAN_IMG_COVER=.5;     // ページの半分以上を1枚の画像が覆っていればスキャンしたページとみなす
const SCAN_TEXT_COVER=.15;   // そのうえで文字が占める面積がこれ未満なら、画像の文字を読み取る
const IMG_OPS=()=>{const O=pdfjsLib.OPS; return new Set([O.paintImageXObject,O.paintJpegXObject,O.paintInlineImageXObject,O.paintImageMaskXObject,O.paintImageXObjectRepeat].filter(v=>v!=null));};
const mulM=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];

async function pageInfo(pg){
  const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
  const vp=page.getViewport({scale:1});           // ページ基準の座標系（元の回転を含む）
  const pageArea=vp.width*vp.height;
  // 元から入っている文字。選択できるよう読み取り結果に合流させ、重なる読み取り結果は捨てる
  const tc=await page.getTextContent();
  const items=[]; let chars=0, textArea=0;
  for(const it of tc.items){
    const t=fixText(it.str||''); if(!t.trim()) continue;
    chars+=t.replace(/\s/g,'').length;
    const [a,b,,,e,f]=it.transform, fs=Math.hypot(a,b)||it.height||1;
    const w=it.width||fs*t.length*.5;
    const [X,Y]=vp.convertToViewportPoint(e,f);    // 文字の基準線の左端
    const m=vp.transform, dir=Math.atan2(m[1]*a+m[3]*b,m[0]*a+m[2]*b);   // ページ基準の座標での文字の向き（y軸が下向き）
    const cos=Math.cos(dir), sin=Math.sin(dir);
    const pts=[[0,-fs*.85],[w,-fs*.85],[w,fs*.2],[0,fs*.2]].map(([u,v])=>[X+u*cos-v*sin,Y+u*sin+v*cos]);
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
    items.push({t,X,Y,w,fs,ang:dir,box:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]});
    textArea+=w*fs;
  }
  // 画像がページを覆う割合（描画命令を追って、画像が置かれる範囲の面積を求める）
  let imgCover=0;
  try{
    const ops=await page.getOperatorList(), O=pdfjsLib.OPS, IMG=IMG_OPS();
    const st=[[1,0,0,1,0,0]];
    ops.fnArray.forEach((fn,i)=>{
      const a=ops.argsArray[i], top=st[st.length-1];
      if(fn===O.save) st.push(top.slice());
      else if(fn===O.restore){ if(st.length>1) st.pop(); }
      else if(fn===O.transform) st[st.length-1]=mulM(top,a);
      else if(fn===O.paintFormXObjectBegin){ st.push(a&&a[0]?mulM(top,a[0]):top.slice()); }
      else if(fn===O.paintFormXObjectEnd){ if(st.length>1) st.pop(); }
      else if(IMG.has(fn)) imgCover=Math.max(imgCover,Math.abs(top[0]*top[3]-top[1]*top[2])/pageArea);
    });
  }catch(e){ console.warn('ocr ops',e); }
  const scan=imgCover>=SCAN_IMG_COVER&&textArea/pageArea<SCAN_TEXT_COVER;
  return {page,vp,items,chars,scan,needsOcr:chars<OCR_MIN_CHARS||scan};
}
async function pageNeedsOcr(pg){ try{ return (await pageInfo(pg)).needsOcr; }catch(e){ return false; } }

/* 読み取り用に高解像度(約300dpi)で描画する。座標はページ基準(pt)に戻せるよう倍率を返す */
async function renderForOcr(pg){
  const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
  const v1=page.getViewport({scale:1});
  const k=Math.min(300/72,Math.sqrt(MAXPIX/(v1.width*v1.height)));
  const vp=page.getViewport({scale:k});
  const c=document.createElement('canvas'); c.width=Math.floor(vp.width); c.height=Math.floor(vp.height);
  const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  // 'print' で描画する。通常の表示用の描画は画面の更新に合わせて少しずつ進むため、
  // 別のタブやウィンドウを見ている間（読み取り中によくある）は止まってしまう
  await page.render({canvasContext:ctx,viewport:vp,intent:'print'}).promise;
  return {canvas:c,k};
}

/* ---- 読み取り結果の整理: 単語の位置・段組み・読む順 ---- */
const GAP_RATIO=.9;          // 行の高さに対してこれ以上の空きを、段の境目の候補にする

function boxHit(b,x,y){ return x>=b[0]-1&&x<=b[2]+1&&y>=b[1]-1&&y<=b[3]+1; }

/* 横書き: 行を単語に分け、段の境目（多くの行で同じ位置にある広い空き）で行を分割し、読む順に並べる */
function layoutHorizontal(data,k,native,pageW){
  const lines=[];
  for(const l of data.lines||[]){
    const ws=[];
    for(const w of l.words||[]){
      // 信頼度では絞らない（正しく読めた単語でも信頼度が0になることがあり、捨てると文字が欠ける）
      const t=joinCJK(fixText(w.text||'')); if(!t) continue;
      const b=w.bbox, x0=b.x0/k, x1=b.x1/k, y0=b.y0/k, y1=b.y1/k;
      if(native.some(n=>boxHit(n.box,(x0+x1)/2,(y0+y1)/2))) continue;   // 元から入っている文字と同じもの
      ws.push({t,x0,x1,y0,y1});
    }
    if(!ws.length) continue;
    ws.sort((a,b)=>a.x0-b.x0);
    lines.push({ws,y0:l.bbox.y0/k,y1:l.bbox.y1/k});
  }
  // 段の境目を探す
  const cand=[];
  for(const l of lines){
    const h=l.y1-l.y0;
    for(let i=0;i+1<l.ws.length;i++){
      const g=l.ws[i+1].x0-l.ws[i].x1; if(g>h*GAP_RATIO) cand.push((l.ws[i].x1+l.ws[i+1].x0)/2);
    }
  }
  cand.sort((a,b)=>a-b);
  const tol=pageW*.012, need=Math.max(4,lines.length*.12), gutters=[];
  for(let i=0;i<cand.length;){
    let j=i; while(j+1<cand.length&&cand[j+1]-cand[i]<=tol*2) j++;
    if(j-i+1>=need) gutters.push(cand[i+((j-i)>>1)]);
    i=j+1;
  }
  // 境目で行を分割して断片にする
  const segs=[];
  const mk=ws=>({x0:ws[0].x0,x1:ws[ws.length-1].x1,y0:Math.min(...ws.map(w=>w.y0)),y1:Math.max(...ws.map(w=>w.y1)),toks:ws.map(w=>({t:w.t,x0:w.x0,x1:w.x1}))});
  for(const l of lines){
    const h=l.y1-l.y0; let cur=[l.ws[0]];
    for(let i=1;i<l.ws.length;i++){
      const a=l.ws[i-1], b=l.ws[i];
      // 段の境目の位置にある「広い」空きでだけ分ける（全幅の行の普通の空白では分けない）
      if(b.x0-a.x1>h*GAP_RATIO&&gutters.some(g=>a.x1<=g+tol&&b.x0>=g-tol)){ segs.push(mk(cur)); cur=[]; }
      cur.push(b);
    }
    segs.push(mk(cur));
  }
  // 元から入っている文字も断片として加える
  for(const n of native) segs.push({x0:n.box[0],x1:n.box[2],y0:n.box[1],y1:n.box[3],native:n,toks:[{t:n.t,x0:n.box[0],x1:n.box[2]}]});
  return orderSegs(segs,gutters);
}
/* 読む順: 段をまたぐ断片（見出し・本文の全幅の行など）で区切り、その間は左の段から順に上→下 */
function orderSegs(segs,gutters){
  const span=s=>gutters.some(g=>s.x0<g&&s.x1>g);
  const col=s=>gutters.filter(g=>g<=(s.x0+s.x1)/2).length;
  const flat=segs.filter(s=>!s.native||Math.abs(s.native.ang)<.1).sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
  const out=[]; let band=[];
  const flush=()=>{ band.sort((a,b)=>col(a)-col(b)||a.y0-b.y0||a.x0-b.x0); out.push(...band); band=[]; };
  for(const s of flat){ if(span(s)){ flush(); out.push(s); } else band.push(s); }
  flush();
  out.push(...segs.filter(s=>s.native&&Math.abs(s.native.ang)>=.1));   // 斜め・縦向きの元の文字は最後に
  return out;
}
/* 縦書き: 行ごと（縦の1列ずつ）に記録する */
function layoutVertical(data,k,native){
  const segs=[];
  for(const l of data.lines||[]){
    const t=joinCJK(fixText(l.text||'')); if(!t) continue;
    const b=l.bbox, x0=b.x0/k, x1=b.x1/k, y0=b.y0/k, y1=b.y1/k;
    if(native.some(n=>boxHit(n.box,(x0+x1)/2,(y0+y1)/2))) continue;
    segs.push({x0,x1,y0,y1,vert:y1-y0>(x1-x0)*1.2&&t.length>1,toks:[{t,x0,x1}]});
  }
  for(const n of native) segs.unshift({x0:n.box[0],x1:n.box[2],y0:n.box[1],y1:n.box[3],native:n,toks:[{t:n.t,x0:n.box[0],x1:n.box[2]}]});
  return segs;
}

/* ---- ダイアログと実行 ---- */
async function ocrDialog(){
  if(!hasDoc()) return;
  const f=document.createElement('div'); f.className='fm';
  const nChk=[...S.checked].filter(id=>pageById(id)).length;
  f.innerHTML=`<label>対象</label><select id="ocTarget">
      <option value="notext">スキャンした（文字の情報がない）ページすべて</option>
      <option value="cur">表示中のページ（${S.cur+1}ページ）</option>
      ${nChk?`<option value="checked">選択したページ（${nChk}ページ）</option>`:''}
    </select>
    <label>言語・向き</label><select id="ocLang">
      <option value="h">日本語と英語（横書き）</option>
      <option value="en">英語のみ（英文の資料・論文）</option>
      <option value="v">日本語（縦書き）</option>
    </select>
    <span></span><label style="color:inherit;font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="ocForce">文字の情報があるページも読み取り直す</label>
    <p class="muted" style="grid-column:1/-1;margin:4px 0 0">読み取りはこの端末のブラウザ内で行い、資料は外部へ送信されません（初回のみ辞書データ約2〜5MBをダウンロードします）。<br>
    読み取った文字は「文字選択」ツールで選択・コピーできます（段組みは左の段から順に読みます）。保存したPDFには含まれません。<br>
    英文の資料は「英語のみ」の方が正確で速く読み取れます。数式・図の中の文字は正しく読み取れないことがあります。</p>`;
  const r=await modal({title:'文字を読み取る（OCR）',body:f,buttons:[{label:'キャンセル',value:null},{label:'読み取る',primary:true,value:'ok'}]});
  if(!r) return;
  const target=f.querySelector('#ocTarget').value, lang=f.querySelector('#ocLang').value, force=f.querySelector('#ocForce').checked;
  let cand=target==='cur'?[S.pages[S.cur]]:target==='checked'?S.pages.filter(p=>S.checked.has(p.id)):S.pages;
  cand=cand.filter(p=>p&&p.src!=null);
  await runOcr(cand,lang,force);
}

async function runOcr(cand,lang='h',force=false){
  if(lang===true) lang='v'; else if(lang===false) lang='h';
  const vert=lang==='v';
  busy('ページを確認中…');
  const workers=[]; let done=0, skipped=0, failed=0;
  try{
    // 同じ元ページは1回だけ。文字の情報があるページは読み取らない
    const seen=new Set(), todo=[];
    for(const pg of cand){
      const key=ocrKey(pg); if(seen.has(key)) continue; seen.add(key);
      const info=await pageInfo(pg);
      if(!force&&!info.needsOcr) skipped++; else todo.push({pg,info});
    }
    if(!todo.length){
      busy(false);
      toast(skipped?'対象のページには文字の情報があります。不正確な場合は「文字の情報があるページも読み取り直す」をオンにしてください':'読み取るページがありません','info',6000);
      return;
    }
    busy('読み取りの準備中…（初回は辞書データをダウンロードします）');
    await loadTesseract();
    // 複数ページは並行して読み取る（端末のCPUに合わせて最大3つ）
    const nW=Math.max(1,Math.min(3,(navigator.hardwareConcurrency||2)-1,todo.length));
    for(let i=0;i<nW;i++){
      const w=await Tesseract.createWorker(OCR_LANGS[lang],1);
      if(vert) await w.setParameters({tessedit_pageseg_mode:'5'});   // 縦書きの段落として読む
      workers.push(w);
    }
    const show=()=>busy(`文字を読み取り中… ${done}/${todo.length}ページ完了`);
    show();
    let next=0;
    await Promise.all(workers.map(async w=>{
      while(next<todo.length){
        const {pg,info}=todo[next++];
        try{
          const {canvas,k}=await renderForOcr(pg);
          const {data}=await w.recognize(canvas);
          canvas.width=canvas.height=0;
          const native=force?[]:info.items;   // 読み取り直すときは元の文字を使わない
          const segs=vert?layoutVertical(data,k,native):layoutHorizontal(data,k,native,info.vp.width);
          S.ocr.set(ocrKey(pg),{segs,vert});
          done++;
          for(const [pid,d] of pageEls){ const p=pageById(pid); if(p&&ocrKey(p)===ocrKey(pg)){ dropTextLayer(d); ensureTextLayer(d); } }
        }catch(e){ console.error('ocr',e); failed++; }
        show();
      }
    }));
  }catch(e){
    console.error(e); toast('文字の読み取りに失敗しました: '+(e.message||e),'err',7000);
  }finally{
    for(const w of workers) try{await w.terminate();}catch(e){}
    busy(false);
  }
  if(done){
    setTool('textsel');
    toast(`${done}ページの文字を読み取りました。ドラッグで選択し Ctrl+C でコピーできます`+(skipped?`（文字の情報がある${skipped}ページは対象外）`:'')+(failed?`（${failed}ページは失敗）`:''),'ok',6000);
    setStatus(`${done}ページの文字を読み取りました`);
  }else if(failed) toast('文字の読み取りに失敗しました','err',6000);
}
