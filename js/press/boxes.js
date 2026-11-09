'use strict';

/* ---- 仕上がり(TrimBox)・塗り足し(BleedBox) ---- */
const TRIM_PRESETS=[['A4',210,297],['A5',148,210],['A6（文庫判）',105,148],['B5',182,257],['B6',128,182],['四六判',127,188],['新書判',103,182],['菊判',150,220]];
async function boxesDialog(){
  const f=document.createElement('div'); f.className='fm';
  f.innerHTML=`<label>仕上がりサイズ</label><select id="bxSize"><option value="auto">ページサイズから塗り足し分を除く</option>${TRIM_PRESETS.map((p,i)=>`<option value="${i}">${p[0]}（${p[1]}×${p[2]}mm）</option>`).join('')}<option value="custom">サイズを指定</option></select>
    <label>幅×高さ</label><div class="row"><input type="number" id="bxW" value="148" step="0.1"> × <input type="number" id="bxH" value="210" step="0.1"> mm</div>
    <label>塗り足し</label><div class="row"><input type="number" id="bxBleed" value="3" min="0" max="20" step="0.5"> mm</div>
    <label>対象</label><select id="bxWhich"><option value="all">すべてのページ</option><option value="sel">選択ページ（未選択なら表示中のページ）</option></select>
    <p class="muted">仕上がり位置はページの中央に配置します。保存時に TrimBox / BleedBox として書き込まれます。</p>`;
  const g=id=>f.querySelector('#'+id);
  const r=await modal({title:'仕上がり・塗り足しを設定',body:f,buttons:[{label:'キャンセル',value:null},{label:'設定を解除',value:'clear'},{label:'設定',primary:true,value:'ok'}]});
  if(!r) return;
  const list=g('bxWhich').value==='all'?S.pages:targets();
  if(r==='clear'){list.forEach(p=>{p.boxes=null;}); redrawAll(); commit(); toast('仕上がり・塗り足しの設定を解除しました'); return;}
  const mode=g('bxSize').value, b=MM(Math.max(0,+g('bxBleed').value||0)); let bad=0;
  for(const pg of list){
    let tw,th;
    if(mode==='auto'){tw=pg.w-2*b; th=pg.h-2*b;}
    else {
      const [w,h]=mode==='custom'?[+g('bxW').value,+g('bxH').value]:TRIM_PRESETS[+mode].slice(1);
      tw=MM(w); th=MM(h); if((pg.w>pg.h)!==(tw>th)) [tw,th]=[th,tw];
    }
    if(!(tw>0&&th>0)||tw>pg.w+.5||th>pg.h+.5){bad++; continue;}
    const x=(pg.w-tw)/2, y=(pg.h-th)/2, bx=Math.max(0,x-b), by=Math.max(0,y-b);
    pg.boxes={trim:[x,y,tw,th],bleed:[bx,by,Math.min(pg.w,x+tw+b)-bx,Math.min(pg.h,y+th+b)-by]};
  }
  S.showBoxes=true; redrawAll(); commit();
  toast(bad?`${list.length-bad}ページに設定しました（${bad}ページは仕上がりサイズがページより大きいため除外）`:`${list.length}ページに設定しました（緑=仕上がり、青=塗り足し）`,bad?'err':'ok',6000);
}
