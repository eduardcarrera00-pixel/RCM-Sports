import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://camsports.github.io/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const profileDialog=d.getElementById('aeProfileDialog');profileDialog.showModal();
const one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002';
const make=(rank=3)=>({month:'2026-11-01',ranks:[['picks','Picks'],['nfl','Quiniela NFL'],['football','Quiniela Fútbol']].map(([competition,label])=>({competition,label,rank:competition==='picks'?rank:1,best_rank:rank,starts_on:'2026-11-01',current:{competition,season_month:'2026-11-01',eligible:true,position:4,participants:20,available:20,resolved:10,required:10,rank_after:rank+1,zone:'ascenso'}})),awards:[{competition:'picks',season_month:'2026-10-01',position:2,active:true}],history:[{competition:'picks',season_month:'2026-10-01',rank_after:rank,position:2,eligible:true}]});
let resolveOld,slow=false,fail=false,calls=0;
w.db={rpc:async(name,args)=>{
 calls++;
 if(name==='cam_league_profile'){
   if(slow&&args.p_user===one)return new Promise(r=>resolveOld=r);
   if(fail)return {error:{message:'offline'}};
   return {data:make(args.p_user===two?5:3)};
 }
 if(name==='cam_league_board')return {data:{month:'2026-11-01',closed:false,rows:[{...make().ranks[0].current,user_id:one,username:'<script>unsafe</script>',points:15,correct:7,rank_before:3}]}};
 return {data:{}};
}};
w.eval(fs.readFileSync('assets/cam-leagues.js','utf8'));
assert(d.getElementById('camProfileLeagues'),'bind profile UI before DOMContentLoaded for direct links and resolved sessions');
const view=(user,tab='perfil')=>d.dispatchEvent(new w.CustomEvent('cam:profile-view',{detail:{userId:user,tab}}));
const tick=()=>new Promise(r=>setTimeout(r,10));
view(one);await tick();
assert.equal(profileDialog.dataset.leagueRank,'oro','highest earned rank themes header');
assert.match(d.getElementById('camProfileRank').textContent,/Oro · Picks/);
assert.equal(d.getElementById('camProfileAvatar').dataset.rank,'oro','the profile picture is the top-rank shield');
assert.equal(d.getElementById('camProfileAvatar').textContent,'Oro','the rank name goes under the shield, no initial');
assert.match(d.getElementById('camProfileAwards').textContent,/Top 10 · #2/,'earned badge shows position');
assert.match(d.getElementById('camProfileAwards').querySelector('.cam-top10-badge').title,/octubre de 2026/,'badge includes award month');
// «Perfil» (11 nov 2026): solo el escudo y «Rango: Oro», con el enlace a «Rangos».
const simple=d.getElementById('camProfileLeagues');
assert.equal(simple.hidden,false,'the simple rank shows on the Perfil tab');
assert.match(simple.textContent,/^Rango: Oro/,'Perfil shows the real top rank only');
assert.match(simple.textContent,/¿Quieres entender el sistema de rangos\?/);
assert.equal(simple.querySelectorAll('.cam-league-card,details').length,0,'no per-league cards or disclosures on Perfil');
assert.equal(d.querySelector('.cam-rank-disclosure'),null,'the old expandable rank card is gone');
// «Rangos»: rango actual, progreso, modalidades, escalera, historial y reglas.
view(one,'rangos');await tick();
const ranks=d.getElementById('camProfileRanks');
assert.equal(ranks.querySelector('.cam-rk-hero-name').textContent,'Oro');
assert.equal(ranks.querySelector('.cam-rk-hero-best').textContent,'Mejor rango: Oro');
assert.equal(ranks.querySelectorAll('.cam-league-card').length,3);
assert.equal(ranks.querySelector('.cam-rk-ladder').children.length,7,'all seven ranks in order');
assert.equal(ranks.querySelector('.cam-rk-step.is-current .cam-rk-step-name').textContent,'Oro');
assert.equal(ranks.querySelectorAll('.cam-rk-how-item').length,5,'five short explanations');
assert.match(ranks.textContent,/En zona Top 10/,'live badge is explicitly provisional');
assert.match(ranks.querySelector('.cam-rk-progress-main').textContent,/subirías? a Platino|Faltan/);
ranks.querySelector('.cam-rk-pick-btn[data-competition="nfl"]').click();
assert.equal(profileDialog.dataset.leagueRank,'oro','the profile accent stays on the top rank');
assert.match(ranks.querySelector('.cam-rk-progress-label').textContent,/Puesto #4 de 20/);
assert.equal(d.querySelector('.cam-profile-head #camProfileShare'),null,'share is removed from the header');
assert(d.querySelector('.cam-profile-footer-actions #camProfileShare'),'share remains usable at the end');
view(one,'picks');assert.equal(profileDialog.dataset.leagueRank,'oro');
assert.equal(d.getElementById('camProfileLeagues').hidden,true,'league panel follows profile tabs');
const previousCalls=calls;view(one);await tick();assert.equal(calls,previousCalls,'changing tabs does not request data again');
w.CamLeagues.open('picks');await tick();
assert.match(d.getElementById('camLeagueBoard').textContent,/<script>unsafe<\/script>/);
assert.equal(d.getElementById('camLeagueBoard').querySelector('script'),null,'untrusted names are text');
d.getElementById('camLeagueDialog').close();
view(null);assert.equal(profileDialog.dataset.leagueRank,undefined,'closing clears theme and badges');
// A late profile response must never repaint the next user's identity.
slow=true;d.dispatchEvent(new w.Event('ae:picks-updated'));view(one);await tick();view(two);await tick();
assert.equal(profileDialog.dataset.leagueRank,'diamante');
resolveOld({data:make(0)});await tick();assert.equal(profileDialog.dataset.leagueRank,'diamante');
// Failed requests expose retry and never manufacture a rank.
view(null);fail=true;const three='00000000-0000-0000-0000-000000000003';view(three);await tick();
assert.match(d.getElementById('camProfileLeagues').textContent,/No se pudo cargar el rango/);
assert.equal(profileDialog.dataset.leagueRank,undefined);
assert.equal(d.getElementById('camProfileAvatar').dataset.rank,'pending','a failed request leaves a neutral shield');
fail=false;d.getElementById('camProfileLeagues').querySelector('button').click();await tick();
assert.equal(profileDialog.dataset.leagueRank,'oro');
console.log('PASS: league themes, simple Perfil rank, Rangos tab, earned/provisional and dated badges, tab/cache behavior, safe text, stale-request guard and retry.');
await w.happyDOM.abort();
