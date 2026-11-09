'use strict';

/* ---- メニュー ---- */
const MENUS={
  mProof:()=>[
    {label:'注釈一覧パネル',check:S.panel==='ann',run:()=>setPanel(S.panel==='ann'?null:'ann')},
    {label:'注釈一覧をCSVで書き出し',run:exportCsv},
    {label:'付箋のコメントを常に表示',check:S.showNotes,run:()=>{S.showNotes=!S.showNotes; $('#optShowNotes').checked=S.showNotes; redrawAll();}},
    '-',
    {label:'注釈を書き出し（共有用 .json）',run:exportAnnots},
    {label:'注釈を読み込んで統合…',run:()=>$('#fileAnn').click()},
    '-',
    {label:'版を比較（初校・再校など）…',run:()=>$('#fileCmp').click()}
  ],
  mPress:()=>[
    {label:'プリフライトチェック',run:preflight},
    '-',
    {label:'仕上がり・塗り足しを設定…',run:boxesDialog},
    {label:'仕上がり・塗り足しを表示',check:S.showBoxes,run:()=>{S.showBoxes=!S.showBoxes; redrawAll();}}
  ],
  mDoc:()=>[
    {label:'ノンブル・柱を追加…',run:folioDialog},
    {label:'透かしを設定…',run:watermarkDialog},
    {label:'分割して保存（台割）…',run:splitDialog},
    '-',
    {label:'文字を読み取る（OCR）…',run:ocrDialog},
    '-',
    {label:'しおりパネル',check:S.panel==='bm',run:()=>setPanel(S.panel==='bm'?null:'bm')}
  ]
};
function openMenu(btn,items){
  const m=$('#ddMenu'); m.replaceChildren(); m._owner=btn;
  for(const it of items){
    if(it==='-'){const s=document.createElement('div'); s.className='mi-sep'; m.append(s); continue;}
    const b=document.createElement('button'); b.className='mi'; b.innerHTML='<span class="ck"></span><span></span>';
    b.firstChild.textContent=it.check?'✓':''; b.lastChild.textContent=it.label;
    b.addEventListener('click',()=>{m.classList.remove('on'); it.run();}); m.append(b);
  }
  const r=btn.getBoundingClientRect();
  m.style.left=Math.max(4,Math.min(r.left,window.innerWidth-290))+'px'; m.style.top=(r.bottom+4)+'px'; m.classList.add('on');
}
on('#btnOcr','click',ocrDialog);
$$('[data-menu]').forEach(b=>b.addEventListener('click',e=>{
  e.stopPropagation(); const m=$('#ddMenu');
  if(m.classList.contains('on')&&m._owner===b){m.classList.remove('on');return;}
  openMenu(b,MENUS[b.id]());
}));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#ddMenu,[data-menu]')) $('#ddMenu').classList.remove('on');});
