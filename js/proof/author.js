'use strict';

/* 作成者名 */
try{S.author=localStorage.getItem('pdfwb-author')||'';}catch(e){}
$('#author').value=S.author;
on('#author','input',e=>{S.author=e.target.value.trim(); try{localStorage.setItem('pdfwb-author',S.author);}catch(_){}});
