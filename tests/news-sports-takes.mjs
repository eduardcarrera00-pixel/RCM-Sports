import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source=fs.readFileSync('index.html','utf8');
const render=source.slice(source.indexOf('        function renderArticlesFeed()'),source.indexOf('        function renderHeroCard('));
export const seed=`
var currentCategory='Todos',currentSearchQuery='',currentTeam='',currentAdmin=null;
var articles=Array.from({length:24},(_,i)=>({id:String(i),title:(i%2?'Fútbol':'NFL')+' noticia '+i,category:i%2?'Fútbol':'NFL',summary:'Análisis deportivo de la jornada.',createdAt:new Date(Date.UTC(2026,9,18,12,i)).toISOString(),date:'18 oct',readTime:'3 min',image:'assets/takes/ae-football-takes-hero-day.webp',likes:i,remote:true}));
var takeRows=['nfl','football'].flatMap(sport=>Array.from({length:25},(_,i)=>({id:sport+'-'+i,sport,title:'Pronóstico '+sport+' '+i,body:'Este es el argumento del aficionado para su pronóstico deportivo. Puede leerse completo al abrir la conversación.',competition:sport==='nfl'?'NFL':'LaLiga',author:'Aficionado'+i,author_id:'reader-'+i,upvotes:i+2,downvotes:i%3,created_at:new Date(Date.UTC(2026,9,18,12,i)).toISOString()})));
var db={auth:{getUser:async()=>({data:{user:{id:'reader'}}}),onAuthStateChange:()=>{}},rpc:async()=>({data:takeRows,error:null})};
var categoryKey=x=>x,escapeHTML=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),safeImageURL=x=>x,imagePosition=()=> 'center',imageScale=()=>1,articleIdArgument=x=>JSON.stringify(x);
function renderHeroCard(){document.getElementById('heroSection').hidden=true;}
function filterByCategory(sport){currentCategory=sport;renderArticlesFeed();}
var openedTake=null;window.aeTakeReplies={open:take=>{openedTake=take;}};
window.aeTakeRankings={setSport:()=>{}};
`;
const w=new Window({url:'https://aesportsclub.github.io/'}),d=w.document;
d.body.innerHTML=source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
w.eval(seed+render);
w.eval(fs.readFileSync('assets/free-takes.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
w.renderArticlesFeed();
let tracks=[...d.querySelectorAll('.ae-news-sport-track')];
assert.equal(tracks.length,2);
for(const track of tracks){assert.equal(track.querySelectorAll('article').length,10);for(const card of track.children)assert.match(card.querySelector('h3').textContent,new RegExp(track.dataset.sport));}
assert.equal(d.querySelectorAll('#articlesGrid>article').length,0);
assert.equal(d.querySelectorAll('[data-news-scroll]').length,0);
tracks[0].scrollLeft=123;w.renderArticlesFeed();assert.equal(d.querySelector('.ae-news-sport-track').scrollLeft,123);
for(const [category,sport] of [['NFL','nfl'],['Fútbol','football']]){
 w.currentCategory='Todos';w.currentSearchQuery='';w.renderArticlesFeed();
 d.querySelector('[data-ae-sport-section="'+category+'"]').click();
 assert.equal(w.currentCategory,category);await new Promise(r=>setTimeout(r,40));
 const cards=[...d.querySelectorAll('#freeTakesFeed>article')];assert.equal(cards.length,20);
 assert.equal(cards[0].dataset.sport,sport);assert.match(cards[0].querySelector('h3').textContent,/24/);assert.match(cards.at(-1).querySelector('h3').textContent,/ 5/);
 assert.equal(d.querySelectorAll('.ae-news-sport-track').length,0);assert.equal(d.querySelectorAll('#articlesGrid>article').length,3);
 cards.at(-1).querySelector('.ae-take-reply-link').click();assert.equal(w.openedTake.id,sport+'-5');
 assert.equal(d.getElementById('freeTakes').hidden,false);assert.match(d.getElementById('aeTakesFeedHeading').textContent,/20/);
 const feed=d.getElementById('freeTakes');assert.ok([...feed.children].indexOf(d.getElementById('aeSportTakeLeaders'))<[...feed.children].indexOf(d.getElementById('freeTakesFeed')));
}
w.currentCategory='Todos';w.currentSearchQuery='NFL noticia 2';w.renderArticlesFeed();assert.equal(d.querySelectorAll('.ae-news-sport-track').length,0);assert.ok(d.querySelectorAll('#articlesGrid>article').length>0);
console.log('PASS: separate news carousels, sport filtering, 10 recent stories each, preserved scroll, category previews/search unchanged, 20 sorted Takes in each sport and reply access to the last post.');
await w.happyDOM.close();
