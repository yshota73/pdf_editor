'use strict';

/* ============================================================
   状態
   ============================================================ */
const S={
  sources:[],            // {name, bytes, doc}
  pages:[],              // {id, src, idx, w, h, intrinsic, rot, annots[]}
  zoom:1, cur:0, tool:'select', sel:null,
  checked:new Set(),
  hist:[], hpos:-1, dirty:false,
  imgs:new Map(), nextId:1, fileName:'document.pdf',
  colors:{text:'#111111',highlight:'#ffe600',shape:'#e11d48',proof:'#e60012'},
  lw:2, sizes:{text:14,proof:10}, textStyle:{bold:false,italic:false,underline:false,strikeout:false}, fillOn:false, fillColor:'#ffffff', arrow:true, vert:false,
  pending:null, clip:null,
  eraser:{size:12,whole:false}, eraserPos:null,
  editing:null,          // ページ上で入力中のテキスト {pid, aid, isNew, orig}
  lasso:null,            // 投げ縄で選んだ注釈 {pid, ids, path}
  markerW:12,            // マーカーの太さ(pt)
  showNotes:false, hoverNote:null,   // 付箋のコメントを常に表示 / マウスを重ねている付箋 {pid, aid}   // 消しゴムの直径(pt)・線ごと消すか / 表示中の位置
  author:'',             // 注釈に記録する作成者名
  bm:[], bmSel:null,     // しおり {id, title, pid, level}
  watermark:null,        // {text, color, opacity, size, angle}
  showBoxes:false, panel:null,
  ocr:new Map()          // 読み取った文字 (元PDFのページ単位) 'src:idx' -> {lines, vert}
};
const PROOF=new Set(['strike','replace','insert','note']);     // 校正記号
const PROOF_LBL=new Set(['strike','replace','insert']);        // 指示文(ラベル)を持つ校正記号
const NOTE=16;                                                 // 付箋アイコンの大きさ(pt)
const KIND={text:'テキスト',highlight:'マーカー',marker:'マーカー',rect:'四角',ellipse:'楕円',line:'線・矢印',pen:'手書き',redact:'墨消し',image:'画像',
  strike:'トル（削除）',replace:'置換',insert:'挿入',note:'付箋'};
const stampMeta=a=>{a.author=S.author;a.ts=Date.now();return a;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad2=n=>String(n).padStart(2,'0');
const fmtTs=ts=>{if(!ts) return ''; const d=new Date(ts); return `${d.getFullYear()}/${pad2(d.getMonth()+1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;};
const mm=pt=>(pt*25.4/72).toFixed(1);
const MM=v=>v*72/25.4;
const uid=()=>S.nextId++;
const clone=o=>JSON.parse(JSON.stringify(o));
const pageById=id=>S.pages.find(p=>p.id===id);
const hasDoc=()=>S.pages.length>0;
const PXPT=()=>S.zoom*96/72;               // 1pt あたりの CSS px
const dispDims=pg=>(pg.rot%180===0)?[pg.w,pg.h]:[pg.h,pg.w];
