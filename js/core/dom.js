'use strict';

/* ============================================================
   DOM・UI ヘルパー
   ============================================================ */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const on=(s,ev,fn)=>{const e=typeof s==='string'?$(s):s; e&&e.addEventListener(ev,fn);};


/* ============================================================
   UI ヘルパー
   ============================================================ */
let toastT;
function toast(msg,kind='info',ms=3800){
  const t=$('#toast'); t.textContent=msg; t.className='toast show '+kind;
  clearTimeout(toastT); toastT=setTimeout(()=>{t.className='toast';},ms);
}
function busy(msg){
  const b=$('#busy');
  if(msg){b.querySelector('span').textContent=msg;b.classList.add('on');} else b.classList.remove('on');
}
function setStatus(msg){$('#stMsg').textContent=msg;}
const hasModal=()=>!!$('.modal-back');

function modal({title,body,buttons,onOpen,wide}){
  return new Promise(res=>{
    const back=document.createElement('div'); back.className='modal-back';
    const box=document.createElement('div'); box.className='modal'+(wide?' wide':'');
    box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    const h=document.createElement('h3'); h.textContent=title; box.append(h);
    const mb=document.createElement('div');
    if(typeof body==='string') mb.innerHTML=body; else if(body) mb.append(body);
    box.append(mb);
    const mf=document.createElement('div'); mf.className='mf'; box.append(mf);
    const onKey=e=>{
      if(e.key==='Escape'){e.stopPropagation();close(null);}
      else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){const p=buttons.find(b=>b.primary); if(p) close(p.value);}
    };
    const close=v=>{back.remove();document.removeEventListener('keydown',onKey,true);res(v);};
    buttons.forEach(b=>{
      const btn=document.createElement('button'); btn.className='btn'+(b.primary?' primary':''); btn.textContent=b.label;
      btn.addEventListener('click',()=>close(b.value)); mf.append(btn);
    });
    document.addEventListener('keydown',onKey,true);
    back.append(box); document.body.append(back);
    back.addEventListener('pointerdown',e=>{if(e.target===back) close(null);});
    onOpen&&onOpen(box,close);
  });
}
const confirmDlg=(msg,ok='OK')=>modal({title:'確認',body:Object.assign(document.createElement('p'),{textContent:msg}),buttons:[{label:'キャンセル',value:false},{label:ok,primary:true,value:true}]});
