'use strict';

/* ============================================================
   文字選択 (pdf.js のテキストレイヤー)
   ページの上に透明な文字を重ね、ブラウザの通常の選択・コピーで扱えるようにする
   ============================================================ */

/* PDFから取り出した文字の補正。
   Word などで作ったPDFでは「日」「言」などの漢字が、形の同じ康熙部首・CJK部首補助の文字
   (U+2F00–U+2FDF, U+2E80–U+2EFF) として埋め込まれていることが多く、コピーや検索で別の文字になる。
   これらを通常の漢字に戻し、混入した NUL 文字を取り除く */
const RADICALS=/[⺀-⻿⼀-⿟]/g;
const fixText=s=>s.replace(/\u0000/g,'').replace(RADICALS,c=>c.normalize('NFKC'));

async function ensureTextLayer(d){
  if(d._tl||d._tlBusy||!d._active||S.tool!=='textsel') return;
  const pg=pageById(+d.dataset.pid); if(!pg||pg.src==null) return;
  const o=S.ocr.get(ocrKey(pg)); if(o){ buildOcrLayer(d,pg,o); return; }
  const tok=d._tok; d._tlBusy=true;
  try{
    const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
    const tc=await page.getTextContent();
    if(!d._active||d._tok!==tok) return;
    for(const it of tc.items) if(it.str) it.str=fixText(it.str);
    const vp=page.getViewport({scale:PXPT(),rotation:(pg.intrinsic+pg.rot)%360});
    const tl=document.createElement('div'); tl.className='textLayer';
    tl.style.setProperty('--scale-factor',vp.scale);
    await pdfjsLib.renderTextLayer({textContentSource:tc,container:tl,viewport:vp,textDivs:[]}).promise;
    if(!d._active||d._tok!==tok) return;
    // 文字のない所からドラッグしても選択が途切れないようにするための要素 (pdf.js と同じ仕組み)
    const end=document.createElement('div'); end.className='endOfContent'; tl.append(end);
    tl.addEventListener('pointerdown',()=>tl.classList.add('selecting'));
    d.append(tl); d._tl=tl;
    let n=0; for(const it of tc.items) n+=(it.str||'').replace(/\s/g,'').length;
    d._tlText=n>=OCR_MIN_CHARS;
  }catch(e){ console.warn('textlayer',e); }
  finally{ d._tlBusy=false; }
}
/* OCR で読み取った文字の層。ページ基準の座標で並べ、ページの回転は層ごと変換する。
   単語ごとに、画像上の位置・幅に合わせて透明な文字を置く（単語の後ろの空白は次の単語の手前まで伸ばす） */
const measureCtx=document.createElement('canvas').getContext('2d');
function fitSpan(t,fs,len){
  measureCtx.font=`${fs}px ${FONT}`;
  return len/Math.max(1,measureCtx.measureText(t).width);
}
function buildOcrLayer(d,pg,o){
  const px=PXPT(), [a,b,c,e,f,g]=rotM(pg.rot,pg.w,pg.h);
  const tl=document.createElement('div'); tl.className='textLayer ocr';
  tl.style.width=pg.w*px+'px'; tl.style.height=pg.h*px+'px';
  tl.style.transform=`matrix(${a},${b},${c},${e},${f*px},${g*px})`;
  const add=(t,x,y,fs,css)=>{
    const sp=document.createElement('span'); sp.textContent=t;
    sp.style.cssText=`left:${x}px;top:${y}px;font-size:${fs}px;font-family:${FONT};${css}`;
    tl.append(sp); return sp;
  };
  for(const s of o.segs||[]){
    if(s.native){   // 元から入っている文字（傾きもそのまま）
      const n=s.native, fs=n.fs*px;
      add(n.t,n.X*px,(n.Y-n.fs*.85)*px,fs,`transform-origin:0 ${fs*.85}px;transform:rotate(${n.ang}rad) scaleX(${fitSpan(n.t,fs,n.w*px)})`);
    }else if(s.vert){
      const t=s.toks[0].t, fs=Math.max(4,(s.x1-s.x0)*px);
      add(t,s.x0*px,s.y0*px,fs,`writing-mode:vertical-rl;transform:scaleY(${fitSpan(t,fs,(s.y1-s.y0)*px)})`);
    }else{
      const fs=Math.max(4,(s.y1-s.y0)*px);
      s.toks.forEach((k,i)=>{
        const nx=s.toks[i+1];
        const sep=nx&&!(isCJK(k.t.slice(-1))&&isCJK(nx.t[0]))?' ':'';
        const t=k.t+sep, len=((nx&&nx.x0>k.x0?nx.x0:k.x1)-k.x0)*px;
        add(t,k.x0*px,s.y0*px,fs,`transform:scaleX(${fitSpan(t,fs,len)})`);
      });
    }
    tl.append(document.createElement('br'));
  }
  const end=document.createElement('div'); end.className='endOfContent'; tl.append(end);
  tl.addEventListener('pointerdown',()=>tl.classList.add('selecting'));
  d.append(tl); d._tl=tl; d._tlText=(o.segs||[]).length>0;
}
function dropTextLayer(d){ if(d._tl){d._tl.remove(); d._tl=null;} }
document.addEventListener('pointerup',()=>$$('.textLayer.selecting').forEach(t=>t.classList.remove('selecting')));

/* 文字選択ツールに切り替えたとき: 表示中のページに文字情報がなければ知らせる */
async function enterTextSelect(){
  const ds=[...pageEls.values()].filter(d=>d._active);
  await Promise.all(ds.map(ensureTextLayer));
  if(S.tool!=='textsel') return;
  const pg=S.pages[S.cur], cur=pg&&pageEls.get(pg.id);
  if(cur&&pg.src!=null&&!S.ocr.has(ocrKey(pg))&&await pageNeedsOcr(pg)&&S.tool==='textsel')
    toast('このページはスキャンした画像のため、文字を選択できません。上の「文字を読み取る」で読み取ると選択できます','info',7000);
}
