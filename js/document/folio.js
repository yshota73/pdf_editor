'use strict';

/* ============================================================
   ノンブル・柱
   ============================================================ */
async function folioDialog(){
  const f=document.createElement('div'); f.className='fm';
  f.innerHTML=`<h5>ノンブル（ページ番号）</h5>
    <label>表示</label><div class="row"><label><input type="checkbox" id="fnOn" checked> ノンブルを入れる</label></div>
    <label>書式</label><select id="fnFmt"><option value="{n}">1</option><option value="- {n} -">- 1 -</option><option value="{n} / {N}">1 / 総数</option><option value="p.{n}">p.1</option></select>
    <label>位置</label><select id="fnPos"><option value="bc">下・中央</option><option value="bo">下・小口側（外側）</option><option value="to">上・小口側（外側）</option><option value="tc">上・中央</option></select>
    <label>開始番号</label><input type="number" id="fnStart" value="1">
    <h5>柱（書名・章名など）</h5>
    <label>文字</label><input type="text" id="fhText" placeholder="例: 書名 / 第1章 はじめに（空欄なら入れない）">
    <label>位置</label><select id="fhPos"><option value="to">上・小口側（外側）</option><option value="tc">上・中央</option><option value="bo">下・小口側（外側）</option></select>
    <label>対象</label><select id="fhWhich"><option value="all">全ページ</option><option value="odd">奇数ページ</option><option value="even">偶数ページ</option></select>
    <h5>共通</h5>
    <label>綴じ方向</label><select id="fBind"><option value="L">左綴じ（横組み）</option><option value="R">右綴じ（縦組み）</option></select>
    <label>対象ページ</label><div class="row"><input type="number" id="fFrom" min="1" max="${S.pages.length}" value="1"> 〜 <input type="number" id="fTo" min="1" max="${S.pages.length}" value="${S.pages.length}"> ページ</div>
    <label>文字サイズ</label><div class="row"><input type="number" id="fSize" min="5" max="40" value="9"> pt</div>
    <label>余白</label><div class="row"><input type="number" id="fMargin" min="0" max="50" step="0.5" value="10"> mm（仕上がり線から）</div>
    <p class="muted">再度適用すると、以前に追加したノンブル・柱は置き換えられます。仕上がり位置（TrimBox）があればその内側に配置します。</p>`;
  const g=id=>f.querySelector('#'+id);
  const r=await modal({title:'ノンブル・柱を追加',body:f,buttons:[{label:'キャンセル',value:null},{label:'すべて削除',value:'del'},{label:'適用',primary:true,value:'ok'}]});
  if(!r) return;
  let removed=0; S.pages.forEach(p=>{const n=p.annots.length; p.annots=p.annots.filter(a=>a.sys!=='folio'); removed+=n-p.annots.length;});
  if(r==='del'){S.sel=null; redrawAll(); commit(); toast(`${removed}件のノンブル・柱を削除しました`); return;}
  const len=S.pages.length, clamp=v=>Math.max(1,Math.min(len,Math.round(+v||1)));
  const from=clamp(g('fFrom').value)-1, to=Math.max(from,clamp(g('fTo').value)-1);
  const start=Math.round(+g('fnStart').value||1), size=Math.max(5,Math.min(40,+g('fSize').value||9)), margin=MM(Math.max(0,+g('fMargin').value||0));
  const bind=g('fBind').value, fnOn=g('fnOn').checked, fmt=g('fnFmt').value, fnPos=g('fnPos').value;
  const fhText=g('fhText').value.trim(), fhPos=g('fhPos').value, which=g('fhWhich').value;
  let cnt=0;
  for(let i=from;i<=to;i++){
    const pg=S.pages[i], n=start+(i-from), odd=Math.abs(n)%2===1;
    const outerRight=(bind==='L')===odd;   // 左綴じは奇数=右ページ(外側が右)、右綴じは奇数=左ページ
    const [ax,ay,aw,ah]=(pg.boxes&&pg.boxes.trim)||[0,0,pg.w,pg.h];
    const place=(text,pos)=>{
      const a=stampMeta({id:uid(),type:'text',x:0,y:0,w:0,h:0,text,size,color:'#000000',sys:'folio'}); refitText(a);
      a.x=pos[1]==='c'?ax+(aw-a.w)/2:(outerRight?ax+aw-margin-a.w:ax+margin);
      a.y=pos[0]==='t'?ay+margin:ay+ah-margin-a.h;
      pg.annots.push(a); cnt++;
    };
    if(fnOn) place(fmt.replace('{n}',n).replace('{N}',start+(to-from)),fnPos);
    if(fhText&&(which==='all'||(which==='odd')===odd)) place(fhText,fhPos);
  }
  S.sel=null; redrawAll(); commit(); toast(`ノンブル・柱を${cnt}件追加しました`,'ok');
}
