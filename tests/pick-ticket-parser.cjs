const assert=require('node:assert/strict');
const {extract}=require('../assets/ae-pick-capture-parser.js');
const football=['My Bets','5 leg Same Game Parlay+ +737 +1104','PROFIT BOOST 50%','Includes: 1 Same Game Parlay + 1 selection',
 'Same Game Parlay +504','Galatasaray v Barcelona 3:00PM ET','Barcelona','MONEYLINE (3-WAY)',
 'Lamine Yamal','ANYTIME GOALSCORER','Over 5.5 Goals','OVER/UNDER 5.5 GOALS','Lamine Yamal','ANYTIME ASSIST',
 'Harry Kane -205','ANYTIME GOALSCORER','Viking v Bayern Munich 3:00PM ET','TOTAL WAGER','TOTAL PAYOUT'];
const scan=lines=>({text:lines.join('\n'),confidence:95});
let data=scan(football);data.hasBoostedTicketPrice=true;data.ticketPriceEvidence={visible:'+737',confidence:95,headerY:0};
let result=extract(data);assert.equal(result.ok,true);assert.equal(result.readings.length,1);
let reading=result.readings[0];assert.equal(reading.odds,737);assert.equal(reading.selectionCount,5);assert.equal(reading.originalBeforeBoost,true);
for(const text of ['Barcelona · MONEYLINE','Lamine Yamal · ANYTIME GOALSCORER','Over 5.5 Goals','Lamine Yamal · ANYTIME ASSIST','Harry Kane'])assert.ok(reading.selection.includes(text),text);
assert.ok(reading.selection.indexOf('Viking v Bayern Munich')<reading.selection.indexOf('Harry Kane'),'Keep the single selection linked to its own game');
assert.doesNotMatch(reading.selection,/BOOST|50%|1104|TOTAL WAGER/);
assert.equal(extract({...data,ticketPriceEvidence:null}).ok,false,'Never silently use the boosted quote');
assert.equal(extract({...data,ticketPriceEvidence:{...data.ticketPriceEvidence,confidence:64}}).ok,false);
assert.equal(extract({...data,text:football.filter(l=>l!=='Harry Kane -205'&&l!=='Viking v Bayern Munich 3:00PM ET').join('\n')}).ok,false,'Do not drop a leg');
assert.equal(extract({...data,text:football.concat(football).join('\n')}).ok,false,'Two tickets must not merge');
for(const summary of [['Includes:', '1 Same Game Parlay', '+ 1 selection'],['Includes 1 Same Game Parlay + 1 selection'],['v Includes: 1 Same Game Parlaybets + 1 selection'],[]]){
 const wrapped={...data,text:football.flatMap(line=>line.startsWith('Includes:')?summary:[line]).join('\n')};
 const recovered=extract(wrapped);assert.equal(recovered.ok,true,'A wrapped or absent summary must not hide a complete, priced five-leg ticket');assert.equal(recovered.readings[0].selectionCount,5);assert.equal(recovered.readings[0].odds,737);
 assert.equal(extract({...wrapped,ticketPriceEvidence:null}).ok,false,'Summary recovery still requires the original pre-boost odds');
 assert.equal(extract({...wrapped,text:wrapped.text.replace('Harry Kane -205\nANYTIME GOALSCORER\n','')}).ok,false,'Header count must still reject missing selections');
}
assert.equal(extract({...data,text:football.filter(line=>!line.startsWith('Includes:')).concat(football.filter(line=>!line.startsWith('Includes:'))).join('\n')}).ok,false,'Missing summaries cannot merge two ticket headers');
const nfl=['My Bets','...cropped prior card...','BONUS BET','Includes: 2 Same Game Parlay bets + 1 selection',
 'Same Game Parlay +455','New York Giants @ Washington Commanders 1:01PM ET','Isaiah Likely Over 41.5','ISAIAH LIKELY - RECEIVING YDS','Terry McLaurin','ANY TIME TOUCHDOWN SCORER',
 'Same Game Parlay -118','Chicago Bears @ Green Bay Packers 1:01PM ET','Christian Watson 30+ Yards','CHRISTIAN WATSON - ALT RECEIVING YDS',
 'Rome Odunze 25+ Yards','ROME ODUNZE - ALT RECEIVING YDS','Matthew Golden 25+ Yards','MATTHEW GOLDEN - ALT RECEIVING YDS',
 'Chase Brown 60+ Yards -136','CHASE BROWN - ALT RUSHING YDS','Cincinnati Bengals @ Miami Dolphins 1:01PM ET','TOTAL WAGER','TOTAL PAYOUT'];
result=extract(scan(nfl));assert.equal(result.ok,false);assert.equal(result.partial.selectionCount,6);
assert.match(result.reason,/momio total original/);assert.doesNotMatch(result.partial.selection,/BONUS BET/);
assert.ok(result.partial.selection.indexOf('New York Giants')<result.partial.selection.indexOf('Isaiah Likely'));
assert.ok(result.partial.selection.indexOf('Chicago Bears')>result.partial.selection.indexOf('Terry McLaurin'));
// A cropped decoration is harmless when the actual ticket total is readable.
result=extract(scan(['Previous card BONUS BET', '6 leg Same Game Parlay+ +1688',...nfl.slice(3)]));
assert.equal(result.ok,true);assert.equal(result.readings[0].odds,1688);assert.equal(result.readings[0].selectionCount,6);
assert.equal(extract(scan(nfl.filter(l=>!l.includes('Chicago Bears')))).ok,false);
console.log('PASS: whole nested tickets, original boost odds only, all player conditions and event binding, cropped decorations, partial recovery, missing totals and ticket separation.');

const opened=['My Bets','Open','Settled','Same Game Parlay +240',
 'Paris St-G Moneyline (3-way), Over 3.5 Goals Over/Under 3.5 Goals, Yes Both Teams To Score',
 'Paris St-G v Barcelona TUE 3:00PM ET','Paris St-G','MONEYLINE (3-WAY)',
 'Over 3.5 Goals','OVER/UNDER 3.5 GOALS','Yes','BOTH TEAMS TO SCORE',
 '$10.00','TOTAL WAGER','$34.08','TOTAL PAYOUT'];
const openedResult=extract(scan(opened));
assert.equal(openedResult.ok,true,'An open ticket with one total and three unpriced markets is one Pick');
assert.equal(openedResult.readings.length,1);
assert.equal(openedResult.readings[0].odds,240);
assert.equal(openedResult.readings[0].selectionCount,3);
assert.equal(openedResult.readings[0].sport,'Fútbol');
assert.equal(openedResult.readings[0].event,'Paris St-G v Barcelona');
assert.equal(openedResult.readings[0].wager,10);
assert.equal(openedResult.readings[0].payout,34.08);
assert.equal(extract(scan(opened.flatMap(x=>x==='Same Game Parlay +240'?['Same Game Parlay','+240']:[x]))).readings[0].odds,240,'Split-line header price from mobile OCR');
assert.ok(['Paris St-G','Over 3.5 Goals','Yes'].every(t=>openedResult.readings[0].selection.includes(t)));
assert.equal(extract(scan(opened.filter(x=>x!=='BOTH TEAMS TO SCORE'))).ok,false,'Missing market must fail');
assert.equal(extract(scan(opened.filter(x=>!x.includes('Paris St-G Moneyline (3-way), Over 3.5 Goals')))).ok,false,'A cropped market summary cannot authenticate an incomplete compact ticket');
assert.equal(extract(scan(opened.concat(opened))).ok,false,'Multiple tickets must not merge');
assert.equal(extract(scan(opened.map(x=>x==='Same Game Parlay +240'?'Same Game Parlay':x))).ok,false,'Do not derive a quote from monetary returns');

const phoneOcr=[
 'My Bets @so00 B','Open Settled','Same Game Parlay” +240',
 'Paris St-G Moneyline (3-way), Over 3.5 Goals Over/Under 3.5 A',
 'Goals, Yes Both Teams To Score','Paris St-G v Barcelona TUE 3:00PM ET',
 'ni Is Paris St-G','MONEYLINE (3-WAY)','Over 3.5 Goals',
 'OVER/UNDER 3.5 GOALS','Yes','BOTH TEAMS TO SCORE',
 '$10.00 $34.08','TOTAL WAGER TOTAL PAYOUT'];
const phoneResult=extract(scan(phoneOcr));
assert.equal(phoneResult.ok,true,'The real phone screenshot OCR should read as one SGP');
assert.equal(phoneResult.readings[0].odds,240);
assert.equal(phoneResult.readings[0].wager,10);
assert.equal(phoneResult.readings[0].payout,34.08);
assert.match(phoneResult.readings[0].selection,/^Paris St-G · MONEYLINE/);
console.log('PASS: real mobile OCR lines preserve the three markets, +240, wager and payout.');


// Regression text comes from the actual uploaded 997x557 cropped receipt at
// the 1400px width our on-device reader uses (Tesseract modes 6 and 11).
// No real bet IDs, screenshots, or personal details are stored here.
const croppedScreenshotPsm6=[
 'Same Game Parlay™ +240',
 'Paris St-G Moneyline (3-way), Over 3.5 Goals Over/Under 3.5 Goals, Yes Both Teams To Score A',
 'Paris St-G v Barcelona TUE 3:00PM ET','TT Paris St-G','MONEYLINE (3-WAY)',
 'Over 3.5 Goals','OVER/UNDER 3.5 GOALS','Yes','BOTH TEAMS TO SCORE',
 '$10.00 $34.08','TOTAL WAGER TOTAL PAYOUT'];
const croppedScreenshotPsm11=[
 'Same Game Parlay™','+240',
 'Paris St-G Moneyline (3-way), Over 3.5 Goals Over/Under 3.5 Goals, Yes Both Teams To Score',
 'Paris St-G v Barcelona','TUE 3:00PM ET','Paris St-G','MONEYLINE (3-WAY)',
 'Over 3.5 Goals','OVER/UNDER 3.5 GOALS','Yes','BOTH TEAMS TO SCORE',
 '$10.00','$34.08','TOTAL WAGER','TOTAL PAYOUT'];
for(const [mode,lines] of [['6',croppedScreenshotPsm6],['11',croppedScreenshotPsm11]]){
 const parsed=extract(scan(lines));
 assert.equal(parsed.ok,true,'Cropped receipt must work without My Bets header, mode '+mode);
 assert.equal(parsed.readings.length,1);
 assert.equal(parsed.readings[0].selectionCount,3);
 assert.equal(parsed.readings[0].event,'Paris St-G v Barcelona');
 assert.equal(parsed.readings[0].odds,240);
 assert.equal(parsed.readings[0].wager,10);
 assert.equal(parsed.readings[0].payout,34.08);
 assert.match(parsed.readings[0].selection,/^Paris St-G · MONEYLINE/);
 assert.match(parsed.readings[0].selection,/Over 3.5 Goals · OVER\/UNDER 3.5 GOALS/);
 assert.match(parsed.readings[0].selection,/Yes · BOTH TEAMS TO SCORE/);
 assert.equal(extract(scan(lines.filter(x=>x!=='BOTH TEAMS TO SCORE'))).ok,false,'Missing condition rejected');
 assert.equal(extract(scan(lines.filter(x=>!x.includes('Moneyline (3-way), Over 3.5 Goals')))).ok,false,'Missing summary rejected');
 assert.equal(extract(scan(lines.concat(lines))).ok,false,'Duplicate receipts rejected');
}
assert.equal(extract(scan(croppedScreenshotPsm6.map(x=>x.replace('+240','+240 +350')))).ok,false,'Multiple total odds rejected');
console.log('PASS: exact cropped uploaded receipt OCR at on-device scale, PSM 6/11, no My Bets header, full SGP and safety cases.');

console.log('PASS: three-market Same Game Parlay +240, complete selection list, and guarded currency metadata.');


// English and Spanish simple receipts, two-leg and three-leg multi-event parlays.
const straightTicketEnglish=scan(['My Bets','Single Bet +150','Toronto Raptors vs Boston Celtics',
 'Toronto Raptors','Moneyline','$10.00','Total Wager']);
const english=extract(straightTicketEnglish);
assert.equal(english.ok,true,'English single must be recognized without a leg quote');
assert.equal(english.readings.length,1);
assert.equal(english.readings[0].odds,150);
assert.equal(english.readings[0].selection,'Toronto Raptors · Moneyline','Never import wager into selection');

const straightTicketSpanish=scan(['Apuesta simple +150','Barcelona vs Real Madrid',
 'Barcelona','Gana','$10.00','Importe']);
const spanish=extract(straightTicketSpanish);
assert.equal(spanish.ok,true,'Spanish single must be recognized');
assert.equal(spanish.readings[0].odds,150);
assert.equal(spanish.readings[0].selection,'Barcelona · Gana');
const sameWithLegQuote=scan(['My Bets','Straight Bet','Chiefs vs Bills',
 'Chiefs Moneyline +150','Stake $10.00']);
assert.equal(extract(sameWithLegQuote).readings[0].odds,150);

const multiEvent3=['My Bets','Parlay 3 Legs +1475',
 'LA Lakers v Boston Celtics','Lakers','Moneyline +150',
 'Packers v Bears','Packers','Moneyline +110',
 'Barcelona v Madrid','Barcelona','Moneyline +200','Total Wager $10.00'];
const triple=extract(scan(multiEvent3));
assert.equal(triple.ok,true,'A three-leg multi-event parlay imports all three as ONE pick');
assert.equal(triple.readings.length,1);
assert.equal(triple.readings[0].selectionCount,3);
assert.equal(triple.readings[0].odds,1475,'Original total price, not a leg quote');
assert.match(triple.readings[0].selection,/Packers/);
assert.match(triple.readings[0].selection,/Barcelona/);
assert.equal(extract(scan(multiEvent3.map(l=>l.replace('+1475','+1275')))).ok,false,
 'Never use an inconsistent total');
assert.equal(extract(scan(multiEvent3.filter(l=>l!=='Barcelona v Madrid'))).ok,false,
 'Never omit a game');
assert.equal(extract(scan(multiEvent3.map(l=>l.replace('+1475','')))).ok,false,
 'Three-leg parlay must show original total');
assert.equal(extract(scan(['My Bets','Straight Bet','Chiefs vs Bills',
 'Chiefs Moneyline +150 +165','Stake $10.00'])).ok,false,'Conflicting odds must not be chosen');
console.log('PASS: single bets in English and Spanish, and 3-leg parlays with explicit total, no amounts imported or incomplete bets.');


const {receiptEventDate}=require('../assets/ae-pick-capture-parser.js');
const dateScan=lines=>({text:lines.join('\n'),confidence:95});
const eventExample=['My Bets','Same Game Parlay +240',
 'Paris St-G Moneyline (3-way), Over 3.5 Goals Over/Under 3.5 Goals, Yes Both Teams To Score',
 'Paris St-G v Barcelona TUE 3:00PM ET',
 'Paris St-G','MONEYLINE (3-WAY)','Over 3.5 Goals','OVER/UNDER 3.5 GOALS','Yes','BOTH TEAMS TO SCORE',
 '$10.00 $34.08','TOTAL WAGER TOTAL PAYOUT','PLACED: 10/19/2026 8:54PM ET'];
assert.equal(extract(dateScan(eventExample)).eventDate,'2026-10-20','Event weekday after Monday placement auto-fills Tuesday');
assert.equal(extract(dateScan(eventExample)).dateSource,'weekday_placed');
assert.deepEqual(receiptEventDate(dateScan(['BETSLIP','Raptors vs Celtics','TUE 7:30PM ET']), '2026-10-19'),
 {eventDate:'2026-10-20',dateSource:'weekday_estimated'},'Weekday only can estimate upcoming game');
assert.deepEqual(receiptEventDate(dateScan(['BETSLIP','Lakers vs Celtics 2026-11-12','PLACED: 10/19/2026']), '2026-10-19'),
 {eventDate:'2026-11-12',dateSource:'exact'},'Explicit event date overrides placement date');
assert.equal(receiptEventDate(dateScan(['BETSLIP','Lakers vs Celtics','PLACED: 10/19/2026']), '2026-10-19').eventDate,'',
 'A wager placement date must never impersonate the event date');
assert.deepEqual(receiptEventDate(dateScan(['Parlay 2 Legs','Bears vs Packers TUE 4PM ET','Boston vs Toronto FRI 7PM ET','PLACED: 10/19/2026']), '2026-10-19'),
 {eventDate:'2026-10-23',dateSource:'last_event'},'For multi-day parlays use the final event');
assert.equal(receiptEventDate(dateScan(['BETSLIP','Lakers vs Celtics 2026-02-30']), '2026-10-19').eventDate,'',
 'Invalid calendar dates may not be auto-filled');
console.log('PASS: instant date from exact match, English weekday, ticket placement anchor, multi-event last date, invalid dates and no blind placement date.');

// FanDuel «9 leg Same Game Parlay+» con condiciones en MAYÚSCULAS (OCR real, 21 oct): RESULT & BOTH TO SCORE,
// DOUBLE CHANCE, HOME TEAM OVER/UNDER… y una cuota sin signo («Bayern Munich 130»).
{
 const rows=["9 leg Same Game Parlay+                        +4956", "666 PTS PENDING 777 SUPER SUB", "Includes: 1 Same Game Parlay™ + 7 selections                                      A", "Same Game Parlay”                                -161", "Real Madrid v Sevilla                                      SUN 3:00PM ET", "Kylian Mbappe", "ANYTIME GOALSCORER", "Kylian Mbappe", "PLAYER TO HAVE 2 OR MORE SHOTS ON TARGET", "Over                                                       -178", "HOME TEAM OVER/UNDER 2.5 GOALS", "Al-Quadisiya (KSA) v Abha                           FRI 9:15AM ET", "Yes                                                         -270", "BOTH TEAMS TO SCORE", "Hamburger SV v Stuttgart                                      SAT 9:30AM ET", "* Barcelona                            +110", "RESULT & BOTH TO SCORE", "Betis v Barcelona                                           SAT 12:30PM ET", "© Bayern Munich                              130", "RESULT & BOTH TO SCORE", "Bayern Munich v RB Leipzig                                  SAT 12:30PM ET", "Leeds And Draw                                           -260", "DOUBLE CHANCE", "Leeds v Man Utd                                 SUN 9:00AM ET", "Yes                                                         -138", "BOTH TEAMS TO SCORE", "Fluminense v Santos                                      SUN 3:00PM ET", "Yes                                                         -156", "BOTH TEAMS TO SCORE", "Monterrey v Pachuca                                      SUN 9:00PM ET", "$111.11                                                        $5,618.24", "TOTAL WAGER                                                      TOTAL PAYOUT"];
 const r=extract({text:rows.join('\n'),confidence:90});
 assert.equal(r.ok,true,r.reason);const x=r.readings[0];
 assert.equal(x.odds,4956);assert.equal(x.selectionCount,9);
 assert.match(x.selection,/Real Madrid v Sevilla: Kylian Mbappe · ANYTIME GOALSCORER \+ Kylian Mbappe · PLAYER TO HAVE 2 OR MORE SHOTS ON TARGET/);
 assert.match(x.selection,/Bayern Munich v RB Leipzig: Bayern Munich · RESULT & BOTH TO SCORE/);
 assert.match(x.selection,/Leeds v Man Utd: Leeds And Draw · DOUBLE CHANCE/);
 assert.doesNotMatch(x.event,/\bSUN\b|\bSAT\b|PM ET/);
 assert.equal(extract({text:rows.filter(l=>!l.startsWith('Leeds')).join('\n'),confidence:90}).ok,false,'Falta un partido: no se publica');
 console.log('PASS: FanDuel SGP+ de 9 selecciones con condiciones en mayúsculas.');
}

