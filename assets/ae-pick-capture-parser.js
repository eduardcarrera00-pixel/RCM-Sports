/* AE SPORTS · Cotejo conservador de texto OCR. No autentica boletos ni consulta casas. */
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.aePickCaptureParser=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[−–—﹣]/g,'-').replace(/[＋]/g,'+').toLowerCase();
 const stop=new Set('a al el la los las de del en es por para que un una con the of to for and will vs v at fc cf il'.split(' '));
 const words=s=>clean(s).match(/[+-]?\d+(?:[.,]\d+)?|[a-z]+/g)||[];
 const tokens=s=>words(s).filter(w=>!stop.has(w));
 const american=d=>d>=2?Math.round((d-1)*100):-Math.round(100/(d-1));
 function odds(token){
  const text=clean(token).replace(/\s/g,'').replace(',','.');let decimal,format;
  if(/^[+-]\d{3,6}$/.test(text)){const n=Number(text);if(Math.abs(n)<100||Math.abs(n)>100000)return null;return {american:n,decimal:n>0?1+n/100:1+100/Math.abs(n),format:'americana',visible:text};}
  if(/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(text)){
   const [a,b]=text.split('/').map(Number);if(a<=0||b<=0)return null;decimal=1+a/b;format='fraccionaria';
  }else if(/^\d{1,3}\.\d{1,3}$/.test(text)){decimal=Number(text);format='decimal';}
  else if(/^(evs|even|evens)$/.test(text)){decimal=2;format='americana';}
  else return null;
  if(decimal<1.001||decimal>1001)return null;
  return {american:american(decimal),decimal,format,visible:text};
 }
 function linesFrom(data){
  const lines=[];
  for(const b of data.blocks||[])for(const p of b.paragraphs||[])for(const l of p.lines||[]){
   if(l.text?.trim())lines.push({text:l.text.trim(),confidence:Number(l.confidence)||0,words:l.words||[]});
  }
  return lines.length?lines:String(data.text||'').split(/\n/).filter(s=>s.trim()).map(text=>({text,confidence:Number(data.confidence)||0,words:[]}));
 }
 const money=/\b(balance|saldo|stake|risk|importe|potential returns?|possible winnings?|possible winning|total bets?|total stake|to win|retorno|ganancias?|premio|bet id|ref\.)\b/;
 const offer=/\b(power play|boost|bonus|bono|mejora|cash out|cashout)\b/;
 function candidates(line,index){
  const raw=clean(line.text);if(money.test(raw)||offer.test(raw)||/\b\d{1,2}:\d{2}\b/.test(raw))return [];
  const total=/\b(total odds|cuota total|momio total|parlay|multi\s*\d\s*legs?|accumulator|acumulada)\b/.test(raw);
  const found=[],re=/(^|[\s(=:])([+-]\s*\d{3,6}|\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?|\d{1,3}[.,]\d{1,3}|evens?|evs)(?=$|[\s),;|])/g;
  for(const m of raw.matchAll(re)){
   const value=odds(m[2]);if(!value)continue;
   const start=m.index+m[1].length,prior=raw.slice(Math.max(0,start-3),start),next=raw.slice(start+m[2].length,start+m[2].length+3);
   if(/[$€£]\s*$/.test(prior)||/^\s*[$€£%]/.test(next))continue;
   const word=line.words.find(w=>clean(w.text).replace(/\s/g,'').includes(m[2].replace(/\s/g,'')));
   const confidence=word?Number(word.confidence):line.confidence;
   if(!Number.isFinite(confidence)||confidence<65)continue;
   found.push({...value,index,total,confidence});
  }
  return found;
 }
 function eventParts(event){return clean(event).split(/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s*|\s+\/\s+|\s+-\s+/).map(tokens).filter(t=>t.length);}
 function eventAnchor(lines,event){
  const groups=eventParts(event);if(!groups.length||groups.some(g=>g.every(t=>t.length<3)))return null;
  for(let size=1;size<=3;size++)for(let i=0;i<=lines.length-size;i++){
   const seen=new Set(words(lines.slice(i,i+size).map(l=>l.text).join(' ')));
   if(groups.every(g=>g.every(t=>seen.has(t))))return {start:i,end:i+size-1};
  }
  return null;
 }
 function canonical(s){return clean(s)
  .replace(/\b(mas de|more than|over)\b/g,' over ').replace(/\b(menos de|less than|under)\b/g,' under ')
  .replace(/\b(ambos anotan|ambos equipos anotan|both teams to score|btts)\b/g,' btts ')
  .replace(/\b(doble oportunidad|double chance)\b/g,' doublechance ')
  .replace(/\b(gana|ganara|ganador|moneyline|match betting|full[ -]time result|resultado final|win1|winner|wins?)\b/g,' winner ')
  .replace(/\b(empate|draw)\b/g,' draw ').replace(/\b(si|yes)\b/g,' yes ');
 }
 function selectionMatches(scope,selection){
  const expected=tokens(canonical(selection));if(!expected.length)return false;
  const seen=new Set(words(canonical(scope)));
  return expected.every(t=>seen.has(t));
 }
 function compare(data,picks){
  const fail=reason=>({ok:false,reason,readings:[]});
  if(!Array.isArray(picks)||picks.length<1||picks.length>2)return fail('Completa una o dos selecciones antes de añadir la captura.');
  const lines=linesFrom(data),text=lines.map(l=>l.text).join('\n'),plain=clean(text);
  if(!lines.length||Number(data.confidence)<50)return fail('No se lee con suficiente claridad. Prueba una captura más nítida.');
  if(!/\b(bet\s?slip|bet receipt|bet placed|bets successfully|review.*confirm|singles|place bet|apuesta|boleto|recibo|combinada|parlay|total odds|multi\s*\d)/.test(plain))return fail('Necesitamos la captura completa del boleto, con partido, pronóstico y cuota.');
  const count=plain.match(/\bmulti\s*(\d+)\s*legs?|\bparlay\s*\((\d+)\s*picks?|\b(\d+)\s*selecciones/);
  if(count&&Number(count[1]||count[2]||count[3])!==picks.length)return fail('El número de selecciones del boleto no coincide con tu Pick.');
  const all=lines.flatMap((line,i)=>{
   // Una cifra aislada debajo de «Risk / Win» sigue siendo un importe.
   const previous=clean(lines[i-1]?.text||'');
   if(/\b(risk|stake|potential returns?|possible winnings?|to win)\b/.test(previous)&&!/[a-z]{3,}/.test(clean(line.text).replace(/\b(ui|me)\b/g,'')))return [];
   const found=candidates(line,i);
   // OCR de texto disperso puede separar el rótulo «Multi 2 Legs» de su cuota.
   // Solo asociar una fila de cuota aislada al rótulo inmediatamente anterior.
   const before=clean(lines.slice(Math.max(0,i-2),i).map(l=>l.text).join(' '));
   if(found.length===1&&odds(line.text.trim())&&/\b(total odds|cuota total|momio total|multi\s*\d+\s*legs?|accumulator|acumulada)\s*[:=]?\s*$/.test(before))found[0].total=true;
   return found;
  });
  if(lines.some((l,i)=>all.filter(c=>c.index===i&&!c.total).length>1))return fail('Aparecen varias cuotas en una misma fila. Añade el boleto de la selección elegida.');
  const anchors=picks.map(p=>eventAnchor(lines,p.event));
  if(anchors.some(a=>!a))return fail('No pude identificar el partido completo. Escríbelo como aparece en la captura o añade otra.');
  const readings=[];
  for(let n=0;n<picks.length;n++){
   const pick=picks[n],anchor=anchors[n];let lo=picks.length>1?anchor.start:Math.max(0,anchor.start-3),hi=Math.min(lines.length-1,anchor.end+5);
   for(let j=0;j<anchors.length;j++)if(j!==n){
    const other=anchors[j];
    if(other.end<anchor.start)lo=Math.max(lo,anchor.start);
    else if(other.start>anchor.end)hi=Math.min(hi,other.start-1);
    else return fail('No pude separar los partidos de la combinada. Prueba capturas individuales.');
   }
   const choices=all.filter(c=>!c.total&&c.index>=lo&&c.index<=hi);
   if(choices.length!==1)return fail('No pude asociar una única cuota a la selección '+(n+1)+'. Prueba una captura más completa o más clara.');
   const found=choices[0];
   // Los nombres del encabezado del partido no prueban cuál se seleccionó.
   // Asociar el pronóstico a la fila de su cuota, excluyendo ese encabezado.
   const selectionScope=lines.slice(Math.max(lo,found.index-2),Math.min(hi,found.index+1)+1)
    .filter((_,offset)=>{const index=Math.max(lo,found.index-2)+offset;return index<anchor.start||index>anchor.end;})
    .map(l=>l.text).join(' ');
   if(!selectionMatches(selectionScope,pick.selection))return fail('La selección '+(n+1)+' no se distingue o no coincide. Incluye el mercado y la línea tal como aparecen en el boleto.');
   if(found.american!==Number(pick.odds))return fail('La captura indica '+(found.american>0?'+':'')+found.american+' para la selección '+(n+1)+', y escribiste '+pick.odds+'. Corrige el momio o usa la captura correspondiente.');
   readings.push({event:pick.event,selection:pick.selection,odds:found.american,format:found.format,visible:found.visible,confidence:Math.floor(found.confidence)});
  }
  let total=null;
  if(picks.length===2){
   const decimal=picks.reduce((v,p)=>v*(p.odds>0?1+p.odds/100:1+100/Math.abs(p.odds)),1);
   const totals=all.filter(c=>c.total);
   if(totals.some(t=>Math.abs(t.american-american(decimal))>1))return fail('La cuota total del boleto difiere del cálculo de estas dos selecciones. No podemos cotejar esta combinada, por ejemplo si incluye otras selecciones o un bono.');
   if(totals.length===1)total={american:totals[0].american,decimal:totals[0].decimal};
  }
  return {ok:true,reason:'El partido, la selección y el momio coinciden con la captura.',readings,total};
 }
 return {odds,compare,linesFrom,selectionMatches};
});
