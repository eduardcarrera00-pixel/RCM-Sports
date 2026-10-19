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
