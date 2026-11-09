'use strict';

/* ============================================================
   透かし
   ============================================================ */
async function watermarkDialog(){
  const w=S.watermark||{text:'見本',color:'#d32f2f',opacity:.18,size:120,angle:45};
  const f=document.createElement('div'); f.className='fm';
  f.innerHTML=`<label>文字</label><div class="row"><select id="wmPre" style="width:auto">${['見本','校正用','社外秘','複製禁止','SAMPLE','DRAFT'].map(t=>`<option>${t}</option>`).join('')}<option value="">自由入力</option></select><input type="text" id="wmText" style="flex:1;width:auto"></div>
    <label>色</label><input type="color" id="wmColor">
    <label>濃さ</label><div class="row"><input type="range" id="wmOp" min="5" max="60"> <span id="wmOpV"></span></div>
    <label>文字サイズ</label><div class="row"><input type="number" id="wmSize" min="12" max="400"> pt</div>
    <label>角度</label><div class="row"><input type="number" id="wmAng" min="-90" max="90"> 度</div>
    <p class="muted">すべてのページの中央に入ります。画面に表示され、保存時にPDFへ書き込まれます。</p>`;
  const g=id=>f.querySelector('#'+id);
  g('wmText').value=w.text; g('wmColor').value=w.color; g('wmOp').value=Math.round(w.opacity*100); g('wmSize').value=w.size; g('wmAng').value=w.angle;
  g('wmPre').value=[...g('wmPre').options].some(o=>o.value===w.text)?w.text:'';
  const opv=()=>{g('wmOpV').textContent=g('wmOp').value+'%';}; opv();
  g('wmOp').addEventListener('input',opv);
  g('wmPre').addEventListener('change',()=>{if(g('wmPre').value) g('wmText').value=g('wmPre').value; else g('wmText').focus();});
  const r=await modal({title:'透かし',body:f,buttons:[{label:'キャンセル',value:null},{label:'透かしを解除',value:'off'},{label:'適用',primary:true,value:'ok'}]});
  if(!r) return;
  if(r==='off') S.watermark=null;
  else {
    const text=g('wmText').value.trim(); if(!text){toast('透かしの文字を入力してください','err');return;}
    S.watermark={text,color:g('wmColor').value,opacity:Math.max(.05,Math.min(.6,+g('wmOp').value/100)),size:Math.max(12,Math.min(400,+g('wmSize').value||120)),angle:Math.max(-90,Math.min(90,+g('wmAng').value||0))};
  }
  S.dirty=true; redrawAll(); updateUI(); toast(S.watermark?'透かしを設定しました':'透かしを解除しました');
}
