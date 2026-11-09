'use strict';

/* テーマ */
const themeDark=()=>{const t=document.documentElement.dataset.theme; return t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;};
on('#btnTheme','click',()=>{
  const next=themeDark()?'light':'dark'; document.documentElement.dataset.theme=next;
  try{localStorage.setItem('pdfwb-theme',next);}catch(e){}
});
try{const t=localStorage.getItem('pdfwb-theme'); if(t) document.documentElement.dataset.theme=t;}catch(e){}
