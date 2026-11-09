'use strict';

/* ============================================================
   設定  (社内サーバーに自己ホストする場合はここのURLを変更)
   ============================================================ */
const PDFJS_VER='3.11.174';
const CFG={
  workerSrc:`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`,
  cMapUrl:`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/cmaps/`,
  standardFontDataUrl:`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/standard_fonts/`
};
const FONT='"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans CJK JP","Noto Sans JP",sans-serif';
const ASC=1.0, LH=1.3;           // テキスト注釈のベースライン位置 / 行送り(サイズ比)
const MAXPIX=16e6;               // 1ページのキャンバス最大画素数
const DPR=Math.min(window.devicePixelRatio||1,2);

/* ============================================================
   ライブラリ確認
   ============================================================ */
const libsOk=!!(window.pdfjsLib&&window.PDFLib);
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc=CFG.workerSrc;
