'use strict';

/* ドラッグ&ドロップ */
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer&&e.dataTransfer.types.includes('Files')){dragDepth++;document.body.classList.add('dropping');}});
window.addEventListener('dragleave',e=>{if(e.dataTransfer&&e.dataTransfer.types.includes('Files')){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)document.body.classList.remove('dropping');}});
window.addEventListener('dragover',e=>{if(e.dataTransfer&&e.dataTransfer.types.includes('Files')) e.preventDefault();});
window.addEventListener('drop',async e=>{
  if(!(e.dataTransfer&&e.dataTransfer.types.includes('Files'))) return;
  e.preventDefault(); dragDepth=0; document.body.classList.remove('dropping');
  const files=[...e.dataTransfer.files];
  const pdfs=files.filter(f=>/pdf/i.test(f.type)||/\.pdf$/i.test(f.name)), imgs=files.filter(f=>/^image\/(png|jpe?g|webp|gif)/.test(f.type));
  if(pdfs.length){
    if(!hasDoc()){ await openFile(pdfs[0]); if(pdfs.length>1) await mergeFiles(pdfs.slice(1)); }
    else {
      const r=await modal({title:'ドロップされたPDFの扱い',body:Object.assign(document.createElement('p'),{textContent:`${pdfs.length}件のPDFを、現在のPDFの末尾に結合しますか？ それとも新しく開き直しますか？`}),
        buttons:[{label:'キャンセル',value:null},{label:'新しく開く',value:'open'},{label:'末尾に結合',primary:true,value:'merge'}]});
      if(r==='merge') await mergeFiles(pdfs); else if(r==='open'){await openFile(pdfs[0]); if(pdfs.length>1) await mergeFiles(pdfs.slice(1));}
    }
  } else if(imgs.length&&hasDoc()) pickImage(imgs[0]);
  else toast('PDFまたは画像ファイルをドロップしてください','err');
});
