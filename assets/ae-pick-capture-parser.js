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
   if(l.text?.trim())lines.push({text:l.text.trim(),confidence:Number(l.confidence)||0,words:l.words||[],bbox:l.bbox});
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
   found.push({...value,index,total,confidence,raw:m[2]});
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

 // Support ordinary single bets and priced multi-event parlays in addition to
 // Same Game Parlay cards. A large parlay is one immutable Pick, carrying all
 // selections and the ticket's explicitly visible total price.
 function extractDirectTicket(data){
  const lines=linesFrom(data),plain=clean(lines.map(l=>l.text).join('\n'));
  if(!lines.length||Number(data.confidence)<50||/\bsame game parlay\b/.test(plain))return null;
  const single=/\b(single(?:\s+bet)?|straight(?:\s+bet)?)\b/;
  const multi=/\b(parlay|multi\s*\d+\s*legs?|accumulator|combinada|acumulada)\b/;
  const eventRe=/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s+/i;
  const events=lines.map((l,i)=>({...l,index:i})).filter(l=>eventRe.test(l.text)&&l.confidence>=65
   &&!/\b(share bet|cash out|potential|total payout)\b/i.test(l.text));
  if(!events.length)return null;
  if(!single.test(plain)&&!multi.test(plain)&&!/\bmy bets\b/.test(plain))return null;
  const fail=reason=>({ok:false,reason,readings:[]});
  if(events.length>12)return fail('Hay demasiados partidos en el comprobante.');
  if(events.length>1&&!multi.test(plain))return fail('La imagen contiene varios boletos, no un Pick.');
  const m=plain.match(/\b(?:parlay|multi)\s*(\d+)\s*legs?|\b(\d+)\s*selecciones\b/);
  const expected=m?Number(m[1]||m[2]):null;
  if(expected!==null&&(expected!==events.length||expected>12))return fail('No se ven todas las selecciones que anuncia el boleto.');
  const headerIndex=lines.findIndex(l=>single.test(clean(l.text))||multi.test(clean(l.text)));
  const firstEvent=events[0].index;
  const headerPrice=headerIndex<0?[]:lines.slice(headerIndex,Math.min(headerIndex+2,firstEvent)).flatMap((l,j)=>{
   const found=candidates(l,headerIndex+j).filter(c=>c.confidence>=78);
   return j===0?found:odds(l.text.trim())?found:[];
  });
  if(headerPrice.length>1)return fail('Aparecen varias cuotas totales en el encabezado.');
  const price=headerPrice[0]||null;
  const market=/\b(moneyline|match betting|winner|wins?|gana|ganador|spread|handicap|over|under|mas de|menos de|ambos anotan|both teams to score|btts|double chance|doble oportunidad|draw no bet|resultado final|anytime|goal\s*scorer|goalscorer|to score|touchdown|receiving|rushing|passing|rebounds?|assists?|cards?|tarjetas?|corners?|puntos?|points?|sets?|goles?|yards?|yardas?)\b/i;
  const stop=/\b(total wager|total stake|total payout|potential returns|stake|balance|cash out|share bet|reuse|pin bet|bet id|placed:|profit boost)\b/i;
  const tidy=x=>String(x||'').replace(/^[^\p{L}\p{N}+-]+/u,'').replace(/\s+/g,' ').trim();
  const readings=[];
  for(let n=0;n<events.length;n++){
   const event=events[n],next=n+1<events.length?events[n+1].index:lines.length;
   const stopAt=lines.findIndex((l,i)=>i>event.index&&i<next&&stop.test(l.text));
   const section=lines.slice(event.index+1,stopAt>=0?stopAt:next);
   const choices=section.flatMap((l,k)=>{
    const found=candidates(l,event.index+1+k).filter(c=>c.confidence>=78);
    return found.filter(c=>{
     const before=clean(l.text.slice(0,l.text.toLowerCase().indexOf(c.raw.toLowerCase())));
     return !(c.format==='decimal'&&/\b(over|under|mas de|menos de)\s*$/.test(before));
    });
   });
   if(choices.length>1||(!choices.length&&!(events.length===1&&price)))
    return fail('No se identifica una única cuota para cada selección.');
   const chosen=choices[0]||price;
   if(price&&events.length===1&&choices.length===1&&price.american!==chosen.american)
    return fail('El momio del encabezado no coincide con el de la selección.');
   const spot=choices.length?choices[0].index-event.index-1:-1;
   const own=spot<0?'':tidy(section[spot].text.replace(chosen.raw,''));
   const before=spot<0?[]:section.slice(Math.max(0,spot-2),spot).map(l=>tidy(l.text)).filter(t=>t&&!stop.test(t));
   const after=spot>=0?[]:section.slice(0,3).map(l=>tidy(l.text)).filter(t=>t&&!stop.test(t));
   const selection=tidy(before.concat(own?[own]:[],after).join(' · '));
   if(!market.test(selection)||selection.length<4||selection.length>500)
    return fail('No se leyó el pronóstico completo junto con su mercado.');
   const eventName=tidy(event.text.replace(/\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY)?\b.*$/i,''));
   if(eventName.length<6||eventName.length>160)return fail('No se pudo leer el partido completo.');
   const teams=eventName.split(/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s+/i);
   const chooseTokens=t=>tokens(t).filter(w=>w.length>3);
   if(/\b(moneyline|match betting|winner)\b/i.test(selection)&&teams.length===2&&
     !teams.some(team=>chooseTokens(team).some(w=>tokens(selection).includes(w)))&&!/\b(draw|empate)\b/i.test(selection))
    return fail('El pronóstico no se puede relacionar con un equipo del partido.');
   readings.push({event:eventName,selection,odds:chosen.american,confidence:Math.floor(chosen.confidence)});
  }
  const decimal=readings.reduce((v,r)=>v*(r.odds>0?1+r.odds/100:1+100/Math.abs(r.odds)),1);
  if(price&&readings.length>1&&Math.abs(price.american-american(decimal))>2)
   return fail('El total del boleto no coincide con las cuotas de sus selecciones.');
  const sport=x=>{
   const t=clean(x);
   if(/\b(nfl|packers|bengals|chiefs|touchdown|rushing|receiving)\b/.test(t))return 'NFL';
   if(/\b(nba|lakers|celtics|raptors|pistons|rebounds)\b/.test(t))return 'NBA';
   if(/\b(futbol|soccer|barcelona|madrid|manchester|goals|goles|ambos anotan)\b/.test(t))return 'Fútbol';
   return 'Otros';
  };
  if(readings.length>2){
   if(!price||price.american<100)return fail('Una combinada de tres o más selecciones necesita mostrar su momio total original.');
   const event=readings.map(r=>r.event).join(' / ');
   const selection=readings.map((r,i)=>(i+1)+'. '+r.event+': '+r.selection).join(' / ');
   if(event.length>640||selection.length>2000)return fail('El boleto contiene demasiado texto para un Pick.');
   return {ok:true,readings:[{event,selection,sport:sport(selection),odds:price.american,confidence:Math.floor(price.confidence),selectionCount:readings.length}],total:null,eventDate:''};
  }
  return {ok:true,readings:readings.map(r=>({...r,sport:sport(r.event+' '+r.selection)})),
   total:readings.length===2&&price?{american:price.american,decimal:price.decimal}:null,eventDate:''};
 }

 // Importar sin datos escritos: abstenerse si no hay una cuota única por selección.
 // Evento, mercado, selección y cuota se importan como una unidad inmutable.
 function extract(data){
  const ticket=extractOpenSameGameParlay(data)||extractGameParlay(data)||extractDirectTicket(data);
  if(ticket)return ticket;
  const fail=reason=>({ok:false,reason,readings:[]});
  const lines=linesFrom(data),plain=clean(lines.map(l=>l.text).join('\n'));
  if(!lines.length||Number(data.confidence)<50)return fail('No se lee con suficiente claridad. Prueba una captura más nítida.');
  if(!/\b(bet\s?slip|bet receipt|bet placed|bets successfully|review.*confirm|singles|place bet|apuesta|boleto|recibo|combinada|parlay|total odds|multi\s*\d)/.test(plain))return fail('Añade una captura del boleto donde se vea la cuota de cada selección.');
  const count=plain.match(/\bmulti\s*(\d+)\s*legs?|\bparlay\s*\((\d+)\s*picks?|\b(\d+)\s*selecciones/);
  const declared=count?Number(count[1]||count[2]||count[3]):null;
  if(declared>2)return fail('Por ahora puedes importar boletos de una o dos selecciones.');
  const all=lines.flatMap((line,i)=>{
   const raw=clean(line.text),previous=clean(lines[i-1]?.text||'');
   if(/\b\d{1,4}\/\d{1,2}\/\d{1,4}\b/.test(raw))return [];
   if(/\b(risk|stake|importe|saldo|balance|potential returns?|possible winnings?|to win)\b/.test(previous)&&!/[a-z]{3,}/.test(raw))return [];
   const found=candidates(line,i).filter(c=>{
    if(c.confidence<85)return false;
    // «Over 220.5 points» es una línea del mercado, no una cuota decimal.
    const before=raw.slice(0,raw.indexOf(clean(c.raw))),after=raw.slice(raw.indexOf(clean(c.raw))+c.raw.length);
    return !(/\b(over|under|mas de|menos de)\s*$/.test(before)||/^\s*(points?|puntos?|goals?|goles?|rebounds?|rebotes?|corners?|yards?|yardas?)\b/.test(after));
   });
   const before=clean(lines.slice(Math.max(0,i-2),i).map(l=>l.text).join(' '));
   if(found.length===1&&odds(line.text.trim())&&/\b(total odds|cuota total|momio total|multi\s*\d+\s*legs?|accumulator|acumulada)\s*[:=]?\s*$/.test(before))found[0].total=true;
   return found;
  });
  const quotes=all.filter(c=>!c.total),totals=all.filter(c=>c.total);
  if(!quotes.length||quotes.length>2||totals.length>1||lines.some((_,i)=>quotes.filter(c=>c.index===i).length>1))return fail('No pude distinguir una cuota única por selección. Añade otra captura más clara, sin cuotas alternativas.');
  if(declared!==null&&declared!==quotes.length)return fail('No se leen todas las cuotas del boleto. Usa una captura completa o una por selección.');
  if(quotes.length===2&&!declared&&!/\b(combinada|parlay|accumulator|acumulada|multi)\b/.test(plain))return fail('Aparece más de una apuesta. Usa una captura de un solo Pick o de su combinada.');
  const tidy=s=>String(s||'').replace(/^[^\p{L}\p{N}+-]+/u,'').replace(/\s+/g,' ').trim();
  const noise=s=>money.test(clean(s))||offer.test(clean(s))||/\b(betslip|bet slip|singles|multi|parlay|receipt|recibo|cuota total|total odds|first name|last name|share|place bet|clear bets|deposit|imagine what|saldo|balance)\b/.test(clean(s))||/^\W*\d[\d\W]*(?:am|pm)?\W*$/i.test(s);
  const eventLike=s=>/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s*|\bR\d{1,2}\b/i.test(s);
  function sport(s){
   const t=clean(s),matches=[];
   if(/\b(nfl|american football|futbol americano|bengals|browns|packers|chiefs|49ers|patriots|cowboys|steelers|ravens|seahawks|buccaneers)\b/.test(t))matches.push('NFL');
   if(/\b(nba|basketball|baloncesto|basquetbol|lakers|celtics|raptors|76ers|wizards|pistons|pacers|trail blazers)\b/.test(t))matches.push('NBA');
   if(/\b(soccer|futbol(?! americano)|barcelona|real madrid|manchester united|ambos anotan|both teams to score|btts)\b/.test(t))matches.push('Fútbol');
   if(/\b(mlb|baseball|beisbol)\b/.test(t))matches.push('Béisbol');
   if(/\b(nhl|ice hockey|hockey)\b/.test(t))matches.push('Hockey');
   if(/\b(tennis|tenis)\b/.test(t))matches.push('Tenis');
   if(/\b(horse racing|hipica|sandown)\b/.test(t))matches.push('Hípica');
   return matches.length===1?matches[0]:'';
  }
  const readings=quotes.map((c,n)=>{
   const lo=n?quotes[n-1].index+1:0,hi=n+1<quotes.length?quotes[n+1].index:lines.length;
   const context=lines.slice(lo,hi).map((l,offset)=>({text:tidy(l.text),index:lo+offset,confidence:l.confidence}));
   const events=context.filter(l=>eventLike(l.text)&&!noise(l.text)&&l.confidence>=65);
   const event=events.filter(e=>e.index<=c.index).at(-1)||events[0];
   const own=tidy(lines[c.index].text.replace(c.raw,'')).replace(/^(?:ml|[oO])\s+/,'').replace(/\s*[<©].*$/,'').trim(),generic=/^(?:odds|cuota|momio|price|match betting|moneyline|win or place|fixed|ganador|resultado final)\s*[:=]?$/i;
   const nearby=context.filter(l=>l.index!==event?.index&&l.index>=(event?.index??lo)&&l.index<=c.index&&Math.abs(l.index-c.index)<=3&&l.confidence>=65&&!noise(l.text)&&!all.some(v=>v.index===l.index)&&!generic.test(l.text)&&/[\p{L}]{2}/u.test(l.text));
   let selection=own&&!generic.test(own)&&!eventLike(own)?own:'';
   if(!selection){const near=nearby.sort((a,b)=>Math.abs(a.index-c.index)-Math.abs(b.index-c.index))[0];selection=near?.text||'';if(selection&&generic.test(own)&&own)selection+=' · '+own;}
   else if(/^(?:over|under|ambos|both|mas de|menos de)/i.test(own)===false&&/win or place/i.test(own)){selection=(nearby.at(-1)?.text||'')+' · '+own;}
   const markets=context.filter(l=>l.index!==c.index&&l.index!==event?.index&&Math.abs(l.index-c.index)<=2&&!noise(l.text)&&/\b(moneyline|match betting|spread|handicap|total|resultado final|ganador|first half|second half|1st half|2nd half|quarter|period|mitad|primer tiempo|segundo tiempo|cuarto)\b/i.test(l.text)&&!all.some(v=>v.index===l.index));
   for(const market of markets)if(selection&&!selection.includes(market.text))selection+=' · '+market.text;
   const eventText=event?.text||'';
   return {sport:sport(eventText+' '+selection)||sport(plain),event:eventText,selection,odds:c.american,format:c.format,visible:c.visible,confidence:Math.floor(c.confidence)};
  });
  const marketKnown=s=>/\b(moneyline|match betting|ganador|gana|winner|wins?|resultado final|over|under|mas de|menos de|spread|handicap|ambos anotan|both teams|btts|doble oportunidad|double chance|draw no bet|win or place|to score|anota|goals?|goles?|points?|puntos?|touchdowns?|sets?|rebounds?|rebotes?|cards?|tarjetas?|corners?)\b|[+-]\d+(?:[.,]\d+)?/i.test(clean(s));
  if(readings.some(r=>r.event.length<3||r.event.length>160||r.selection.length<2||r.selection.length>200||!marketKnown(r.selection)))return fail('No pude identificar el partido y el pronóstico completos, con su mercado y línea. Añade otra captura donde aparezcan junto al momio.');
  let total=null;
  if(readings.length===2&&totals.length){
   const computed=american(quotes.reduce((d,c)=>d*c.decimal,1)),rounded=american(readings.reduce((d,r)=>d*(r.odds>0?1+r.odds/100:1+100/Math.abs(r.odds)),1));
   if(Math.abs(totals[0].american-computed)>1||Math.abs(totals[0].american-rounded)>1)return fail('La cuota total no coincide con las selecciones. Usa otra captura sin bonos o selecciones adicionales.');
   total={american:totals[0].american,decimal:totals[0].decimal};
  }else if(totals.length&&Math.abs(totals[0].american-readings[0].odds)>1)return fail('El total y la cuota de la selección son distintos. Usa otra captura.');
  const date=plain.match(/\b(20\d{2}-\d{2}-\d{2})\b/),eventDate=date&&!Number.isNaN(Date.parse(date[1]))?date[1]:'';
  return {ok:true,readings,total,eventDate};
 }
 // A Same Game Parlay+ is one ticket, with a quoted price for the whole ticket.
 // Its internal groups are NOT independently priced player props. Keep every
 // condition, including repeated players in different markets, in one reading.

 // An already-placed My Bets card may show a Same Game Parlay with one quoted
 // total and several unpriced markets. They form ONE Pick, not separate legs.
 function extractOpenSameGameParlay(data){
  const lines=linesFrom(data),plain=clean(lines.map(l=>l.text).join('\n'));
  // Tickets shared from My Bets often crop away the application header. The
  // visible, uniquely priced SGP heading and complete market summary prove the
  // receipt's structure; an unrelated screenshot still fails below.
  if(!/\bsame game parlay\b/.test(plain))return null;
  // The multi-event "N leg Same Game Parlay+" parser handles its own headers.
  if(/\b\d+\s*leg\s+same game parlay/.test(plain)||/\bincludes?\s*:?\s*\d+\s*same game parlay/.test(plain))return null;
  const fail=reason=>({ok:false,reason,readings:[]});
  if(Number(data.confidence)<50)return fail('No se lee con suficiente claridad. Prueba una captura más nítida.');
  const headers=lines.map((l,i)=>({i,text:clean(l.text)})).filter(l=>/\bsame game parlay\b/.test(l.text));
  if(headers.length!==1)return fail('El comprobante contiene varias apuestas o un encabezado ambiguo. Captura un solo Pick completo.');
  const h=headers[0].i,headerQuotes=candidates(lines[h],h).filter(c=>/^[+]\s*\d{3,6}$/.test(c.raw)&&c.confidence>=85);
   // On narrow phones OCR sometimes places the large +240 on the next line.
   const next=lines[h+1],followingQuotes=next&&/^\+\s*\d{3,6}$/.test(next.text.trim())?candidates(next,h+1).filter(c=>c.confidence>=85):[];
   const quotes=headerQuotes.length?headerQuotes:followingQuotes;
  if(quotes.length!==1||data.hasBoostedTicketPrice||/\bprofit boost\b/.test(plain))
   return fail('No pude leer un momio total original único de la combinada. Incluye su encabezado sin bonos.');
  const price=quotes[0];
  const stop=lines.findIndex((l,i)=>i>h&&/\b(total wager|total payout|total stake|cash out|cashout|reuse|share bet|pin bet|bet id|placed:)\b/i.test(l.text));
  const part=lines.slice(h+1,stop<0?lines.length:stop);
  const eventPattern=/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s+/i;
  const eventIndex=part.findIndex(l=>eventPattern.test(l.text)&&l.confidence>=65);
  if(eventIndex<0)return fail('No pude identificar el partido completo de la combinada.');
  const tidy=s=>String(s||'').replace(/\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN)(?:DAY)?\b.*$/i,'').replace(/\s+/g,' ').trim();
  const event=tidy(part[eventIndex].text);
  if(event.length<6||event.length>160)return fail('El nombre del partido está incompleto.');
  const marketKind=s=>{
   const t=clean(s);
   if(/\bmoneyline\b|\bmatch betting\b/.test(t))return 'moneyline';
   if(/\bover\s*\/\s*under\b|\bover under\b/.test(t))return 'total';
   if(/\bboth teams to score\b|\bambos anotan\b/.test(t))return 'btts';
   return '';
  };
  const summary=part.slice(0,eventIndex).map(l=>l.text).join(' ');
  const expected=new Set(['moneyline','total','btts'].filter(k=>marketKind(k==='moneyline'?'moneyline':k==='total'?'over/under':'both teams to score')&&
   (k==='moneyline'?/\bmoneyline\b/i.test(summary):k==='total'?/over\s*\/\s*under/i.test(summary):/both teams to score/i.test(summary))));
  if(expected.size<2)return fail('La imagen debe incluir el resumen de los mercados y las selecciones completas para cotejar tu combinada.');
  const conditions=[],seen=new Set();
  const details=part.slice(eventIndex+1);
  for(let i=0;i<details.length;i++){
   const label=details[i],kind=marketKind(label.text);
   if(!kind||label.confidence<65)continue;
   if(seen.has(kind))return fail('Hay mercados repetidos o no se pudieron separar. Prueba otra captura.');
   const previous=details[i-1];let name=previous?tidy(previous.text):'';
   if(kind==='moneyline'){
    // The receipt summary states the chosen team next to MONEYLINE. When OCR
    // garbles the small detailed row, recover that team only if it is an
    // actual participant, and never override a clearly different opponent.
    const teams=event.split(/\s+(?:vs?\.?|versus|at)\s+|\s*@\s+/i).map(t=>t.trim());
    const firstMarket=tidy(summary.split(/\b(?:moneyline|match betting)\b/i)[0]);
    const chosen=teams.find(t=>t&&clean(firstMarket).endsWith(clean(t)));
    if(chosen){
     const other=teams.find(t=>t!==chosen&&clean(name)===clean(t));
     if(other)return fail('El resumen y la selección del equipo no coinciden. Sube otra captura más clara.');
     name=chosen;
    }
   }
   if(!previous||previous.confidence<65||name.length<2||name.length>120||
    eventPattern.test(name)||marketKind(name)||
    /^(?:my bets|open|settled|same game parlay|total wager|total payout)$/i.test(name))
    return fail('Falta una selección junto a su mercado. Sube una captura más completa.');
   if(kind==='total'&&!/\b(over|under|mas de|menos de)\b/i.test(name))return fail('No pude leer el más/menos de goles completo.');
   if(kind==='btts'&&!/\b(yes|no|si|sí)\b/i.test(name))return fail('No pude distinguir la selección de ambos anotan.');
   conditions.push(name+' · '+tidy(label.text));seen.add(kind);
  }
  if(conditions.length!==expected.size||conditions.length>12||[...expected].some(k=>!seen.has(k)))
   return fail('Falta una de las selecciones de la combinada. Incluye sus mercados completos.');
  const selection=conditions.join(' + ');
  if(selection.length>2000)return fail('La combinada es demasiado extensa para publicarla completa.');
  const amountFor=label=>{
   const index=lines.findIndex((l,i)=>i>h&&new RegExp('\\b'+label+'\\b','i').test(l.text));
   if(index<0)return null;
   const preceding=lines[index-1]?.text.trim()||'';
   // PSM 11 often puts stake and payout on consecutive lines, then their
   // labels on consecutive lines. Respect the column order, not proximity.
   const wagerLine=lines.findIndex((l,i)=>i>h&&/^\s*total wager\s*$/i.test(l.text));
   const payoutLine=lines.findIndex((l,i)=>i>h&&/^\s*total payout\s*$/i.test(l.text));
   if(wagerLine>1&&payoutLine===wagerLine+1){
    const first=lines[wagerLine-2]?.text.match(/^\s*\$\s*(\d+[.,]\d{2})\s*$/);
    const second=lines[wagerLine-1]?.text.match(/^\s*\$\s*(\d+[.,]\d{2})\s*$/);
    if(first&&second)return Number((label==='total wager'?first[1]:second[1]).replace(',','.'));
   }
   const match=preceding.match(/^\$?\s*(\d+(?:[.,]\d{2}))$/);
   if(match)return Number(match[1].replace(',','.'));
   // On phones, both amount columns and their labels may share adjacent lines.
   const pair=preceding.match(/^\s*\$\s*(\d+[.,]\d{2})\s+\$\s*(\d+[.,]\d{2})\s*$/);
   if(pair&&/total wager.*total payout/i.test(lines[index].text))
    return Number((label==='total wager'?pair[1]:pair[2]).replace(',','.'));
   return null;
  };
  return {ok:true,readings:[{
   sport:/\b(goals?|barcelona|st-g|soccer|futbol)\b/i.test(event+' '+selection)?'Fútbol':'Otros',
   event,selection,selectionCount:conditions.length,odds:price.american,
   format:'americana',visible:price.visible,confidence:Math.floor(price.confidence),
   wager:amountFor('total wager'),payout:amountFor('total payout')
  }],total:null,eventDate:''};
 }
 function extractGameParlay(data){
  const lines=linesFrom(data),plain=clean(lines.map(l=>l.text).join('\n'));
  if(!/same game parlay/.test(plain))return null;
  const fail=reason=>({ok:false,reason,readings:[]});
  if(Number(data.confidence)<50)return fail('No se lee con suficiente claridad. Prueba otra captura.');
  // Mobile OCR may split the Includes summary across several lines. That
  // decoration is optional when a single full header proves the leg count.
  const includes=[];
  for(let i=0;i<lines.length;i++)if(/\bincludes?\b/.test(clean(lines[i].text))){
   for(let end=i;end<Math.min(lines.length,i+4);end++){
    const match=clean(lines.slice(i,end+1).map(l=>l.text).join(' ')).match(/\bincludes?\s*:?\s*(\d+)\s*same game parlay.*?\+\s*(\d+)\s*selections?\b/);
    if(match){includes.push({i,end,match});break;}
   }
  }
  const headers=lines.map((l,i)=>({i,match:clean(l.text).match(/\b(\d+)\s*leg\s+same game parlay/)})).filter(l=>l.match);
  if(includes.length>1||(!includes.length&&headers.length!==1))return fail('No pude identificar una combinada completa. Sube el boleto original con todos los partidos, las selecciones y su momio total.');
  const start=includes[0]?.i??headers[0].i;
  const header=includes.length?headers.filter(h=>h.i<start).at(-1):headers[0];
  const nextHeader=lines.findIndex((l,i)=>i>start&&/\b\d+\s*leg\s+same game parlay/.test(clean(l.text)));
  const end=lines.findIndex((l,i)=>i>start&&/\b(total wager|total payout|cash out|total stake|total returns)\b/.test(clean(l.text)));
  const stopAt=Math.min(end<0?lines.length:end,nextHeader<0?lines.length:nextHeader);
  const part=lines.slice((includes[0]?.end??start)+1,stopAt);
  const groups=part.filter(l=>/same game parlay/.test(clean(l.text)));
  if(!groups.length||(includes.length&&groups.length!==Number(includes[0].match[1])))return fail('Falta un bloque de la combinada. Incluye sus partidos y selecciones completos.');
  const isEvent=s=>/\s+(?:vs?\.?|versus|contra|at)\s+|\s*@\s*/i.test(s);
  const tidy=s=>String(s||'').replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\s*(?:ET|EST|EDT|CT|PT)?\b/gi,'').replace(/\s+/g,' ').trim();
  const events=[...new Set(part.filter(l=>isEvent(l.text)&&!money.test(clean(l.text))&&!offer.test(clean(l.text))).map(l=>tidy(l.text)))];
  const market=s=>/\b(moneyline|any\s*time\s+(?:goal\s*scorer|touchdown\s*scorer|assist)|(?:alt\s+)?(?:receiving|rushing|passing)\s+(?:yds|yards)|over\s*\/\s*under|both teams to score|total (?:points|goals)|spread|handicap)\b/i.test(s);
  const picks=[];
  for(let i=0;i<part.length;i++){
   const label=part[i];if(!market(label.text)||label.confidence<65)continue;
   let name,nameIndex;
   for(let j=i-1;j>=Math.max(0,i-3);j--){
    const line=part[j],t=clean(line.text);
    if(isEvent(line.text)||/same game parlay|includes|bonus|boost|super sub/.test(t))break;
    if(market(line.text))break;
    if(/[a-z]{3}/.test(t)&&!/^\W*\d{1,2}:\d{2}/.test(t)){name=line;nameIndex=j;break;}
   }
   if(!name)return fail('No pude unir uno de los pronósticos con su mercado. Incluye el nombre y la condición completos.');
   const labelWords=(label.words||[]).filter(w=>/[a-z]{3}/i.test(w.text));
   const left=labelWords[0]?.bbox?.x0;
   const nameWords=(name.words||[]).filter(w=>!Number.isFinite(left)||!w.bbox||w.bbox.x1>=left-10);
   const title=tidy(nameWords.length?nameWords.map(w=>w.text).join(' '):name.text)
    .replace(/\s+[+-]\d{3,6}\s*$/,'').replace(/^[^\p{L}\p{N}]+/u,'');
   const conditionWords=(label.words||[]).filter(w=>!Number.isFinite(left)||!w.bbox||w.bbox.x1>=left-10);
   const condition=tidy(conditionWords.length?conditionWords.map(w=>w.text).join(' '):label.text).replace(/^[^\p{L}\p{N}]+/u,'');
   if(title.length<2||title.length>180)return fail('Uno de los nombres no se lee con claridad. Prueba otra captura.');
   const single=part.slice(nameIndex,i).some(l=>candidates(l,0).some(c=>!c.total&&/^[+-]\d{3,6}$/.test(c.raw)));
   const groupStart=part.slice(0,nameIndex).map((l,j)=>({j,l})).filter(e=>/same game parlay/.test(clean(e.l.text))).at(-1)?.j??0;
   const eventLine=single?part.slice(i+1,i+5).find(l=>isEvent(l.text)):part.slice(groupStart,nameIndex).find(l=>isEvent(l.text));
   if(!eventLine)return fail('No pude leer el partido de una de las selecciones. Inclúyelo junto al pronóstico.');
   picks.push({event:tidy(eventLine.text),text:title+' · '+condition});
  }
  if(!events.length||picks.length<2||picks.length>20)return fail('No pude leer todos los partidos y condiciones de la combinada.');
  if(header&&picks.length!==Number(header.match[1]))return fail('El número de selecciones visibles no coincide con el boleto. Incluye las que faltan.');
  const event=events.join(' / '),selection=events.map(e=>e+': '+picks.filter(p=>p.event===e).map(p=>p.text).join(' + ')).join(' / ');
  if(event.length>640||selection.length>2000)return fail('El boleto es demasiado extenso. Usa una captura de una combinada más pequeña.');
  const sport=/receiving|rushing|passing|touchdown|nfl/.test(clean(selection))?'NFL':/moneyline \(3-way\)|goals|goal\s*scorer|anytime assist|barcelona|bayern/.test(clean(event+' '+selection))?'Fútbol':'';
  const preview={sport:sport||'Otros',event,selection,selectionCount:picks.length};
  let price=null,originalBeforeBoost=false;
  if(header){
   const row=lines[header.i];
   const evidence=data.ticketPriceEvidence;
   if(evidence&&Math.abs((row.bbox?.y0??0)-evidence.headerY)<12&&evidence.confidence>=85){
    price={...odds(evidence.visible),confidence:evidence.confidence};originalBeforeBoost=true;
   }else{
    const prices=candidates(row,header.i).filter(c=>c.confidence>=85);
    if(prices.length===1&&!data.hasBoostedTicketPrice&&!/profit boost/.test(plain))price=prices[0];
   }
  }
  if(!price||!Number.isFinite(price.american))return {...fail('Se recuperaron '+picks.length+' selecciones, pero no se lee el momio total original. Sube otra captura que incluya la parte superior y los partidos; no usamos el bonus ni el importe para calcularlo.'),partial:preview};
  return {ok:true,readings:[{...preview,odds:price.american,visible:price.visible,format:'americana',confidence:Math.floor(price.confidence),originalBeforeBoost}],total:null,eventDate:''};
 }
 return {odds,compare,extract,linesFrom,selectionMatches,extractGameParlay,extractOpenSameGameParlay,extractDirectTicket};
});
