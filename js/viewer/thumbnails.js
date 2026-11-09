'use strict';

/* ---- サムネイル ---- */
let thumbEls=new Map(); let tq=Promise.resolve();
const thumbsBox=$('#thumbs');
const tio=new IntersectionObserver(es=>{for(const e of es) if(e.isIntersecting) renderThumb(e.target);},{root:thumbsBox,rootMargin:'300px 0px'});
function makeThumb(pg){
  const d=document.createElement('div'); d.className='th'; d.draggable=true; d.dataset.pid=pg.id;
  const [dw,dh]=dispDims(pg); const sc=Math.min(126/dw,160/dh);
  d.innerHTML='<label class="chk"><input type="checkbox" aria-label="ページを選択"></label><canvas></canvas><div class="thn"></div><div class="tb"></div>';
  const c=d.querySelector('canvas'); c.style.width=dw*sc+'px'; c.style.height=dh*sc+'px';
  d._c=c; d._sc=sc; d._key=String(pg.rot); d._done=false;
  const chk=d.querySelector('input');
  chk.addEventListener('click',e=>e.stopPropagation());
  chk.addEventListener('change',()=>{chk.checked?S.checked.add(pg.id):S.checked.delete(pg.id);updateUI();});
  d.addEventListener('click',()=>{const i=S.pages.findIndex(p=>p.id===pg.id); if(i>=0) gotoPage(i);});
  d.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','page:'+pg.id);e.dataTransfer.effectAllowed='move';});
  d.addEventListener('dragover',e=>{
    if(e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); const r=d.getBoundingClientRect(); const after=e.clientY>r.top+r.height/2;
    d.classList.toggle('drop-after',after); d.classList.toggle('drop-before',!after);
  });
  d.addEventListener('dragleave',()=>d.classList.remove('drop-before','drop-after'));
  d.addEventListener('drop',e=>{
    if(e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); e.stopPropagation();
    const after=d.classList.contains('drop-after'); d.classList.remove('drop-before','drop-after');
    const t=e.dataTransfer.getData('text/plain'); if(!t.startsWith('page:')) return;
    reorder(+t.slice(5),pg.id,after);
  });
  tio.observe(d);
  return d;
}
function renderThumb(d){
  if(d._done) return; d._done=true;
  tq=tq.then(async()=>{
    const pg=pageById(+d.dataset.pid); if(!pg||!d.isConnected) {d._done=false;return;}
    const c=d._c; const [dw,dh]=dispDims(pg);
    c.width=Math.ceil(dw*d._sc*DPR); c.height=Math.ceil(dh*d._sc*DPR);
    if(pg.src==null) return;
    try{
      const page=await S.sources[pg.src].doc.getPage(pg.idx+1);
      const vp=page.getViewport({scale:d._sc*DPR,rotation:(pg.intrinsic+pg.rot)%360});
      await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    }catch(e){console.warn('thumb',e);}
  }).catch(()=>{});
}
function buildThumbs(){
  const next=new Map(); const frag=document.createDocumentFragment();
  S.pages.forEach(pg=>{
    let d=thumbEls.get(pg.id);
    if(!d||d._key!==String(pg.rot)){ if(d){tio.unobserve(d);d.remove();} d=makeThumb(pg); }
    next.set(pg.id,d); frag.append(d);
  });
  for(const [id,d] of thumbEls) if(!next.has(id)){tio.unobserve(d);d.remove();}
  thumbEls=next; thumbsBox.replaceChildren(frag);
}
function refreshThumbMeta(){
  S.pages.forEach((pg,i)=>{
    const d=thumbEls.get(pg.id); if(!d) return;
    d.querySelector('.thn').textContent=String(i+1);
    d.classList.toggle('cur',i===S.cur);
    d.querySelector('input').checked=S.checked.has(pg.id);
    const red=pg.annots.some(a=>a.type==='redact');
    d.querySelector('.tb').textContent=red?'墨消しあり':(pg.annots.length?`注釈 ${pg.annots.length}`:'');
    d.querySelector('.tb').style.color=red?'var(--danger)':'var(--muted)';
  });
}
