import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source=fs.readFileSync('index.html','utf8');
const render=source.slice(source.indexOf('        function renderArticlesFeed()'),source.indexOf('        function renderHeroCard('));
export const seed=`
var currentCategory='Todos',currentSearchQuery='',currentTeam='',currentAdmin=null;
var articles=Array.from({length:24},(_,i)=>({id:String(i),title:(i%2?'Fútbol':'NFL')+' noticia '+i,category:i%2?'Fútbol':'NFL',summary:'Análisis deportivo de la jornada.',createdAt:new Date(Date.UTC(2026,9,18,12,i)).toISOString(),date:'18 oct',readTime:'3 min',image:'assets/takes/ae-football-takes-hero-day.webp',likes:i,remote:true}));
var takeRows=['nfl','football'].flatMap(sport=>Array.from({length:25},(_,i)=>({id:sport+'-'+i,sport,title:'Pronóstico '+sport+' '+i,body:'Este es el argumento del aficionado para su pronóstico deportivo. Puede leerse completo al abrir la conversación.',competition:sport==='nfl'?'NFL':'LaLiga',author:'Aficionado'+i,author_id:'reader-'+i,upvotes:i+2,downvotes:i%3,created_at:new Date(Date.UTC(2026,9,18,12,i)).toISOString()})));
var takeReplyCounts=new Map(takeRows.map((t,i)=>[t.id,i%5])),failTakeReplyCounts=false;
var db={auth:{getUser:async()=>({data:{user:{id:'reader'}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>name==='ae_public_take_reply_counts'?
 (failTakeReplyCounts?{data:null,error:{message:'Unavailable'}}:{data:args.p_take_ids.map(id=>({take_id:id,reply_count:takeReplyCounts.get(id)||0})),error:null}):{data:takeRows,error:null}};
var categoryKey=x=>x,escapeHTML=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),safeImageURL=x=>x,imagePosition=()=> 'center',imageScale=()=>1,articleIdArgument=x=>escapeHTML(JSON.stringify(x));
function renderHeroCard(){document.getElementById('heroSection').hidden=true;}
function syncOpinionHighlights(){};
function filterByCategory(sport){currentCategory=sport;renderArticlesFeed();}
var openedArticle=null;function openArticleModal(id){openedArticle=id;}
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
// Los encabezados con botones duplicados desaparecen de Home.
assert.equal(d.querySelectorAll('.ae-news-sport-head, .ae-news-sport-link').length,0);
assert.deepEqual([...d.querySelectorAll('.ae-news-sport-lane')].map(lane=>lane.getAttribute('aria-label')),['Noticias de NFL','Noticias de Fútbol']);
const badges=[...d.querySelectorAll('.ae-home-sport-badge')];
assert.equal(badges.length,20);
assert.deepEqual([...new Set(badges.map(b=>b.textContent.trim()))],['NFL','Fútbol']);
for(const badge of badges){
 assert.equal(badge.tagName,'BUTTON');
 assert.equal(badge.type,'button');
 assert.equal(badge.dataset.aeSportSection,badge.textContent.trim());
 assert.equal(badge.getAttribute('aria-label'),'Ir a la sección '+badge.dataset.aeSportSection);
}
// En Home la foto, el título y Leer siguen abriendo el artículo.
const preview=tracks[0].querySelector('article');
const image=preview.querySelector('img.ae-home-news-image-link');
assert.ok(image);
assert.equal(image.getAttribute('role'),'link');
assert.equal(image.getAttribute('tabindex'),'0');
// Happy DOM no ejecuta atributos onclick insertados por innerHTML: probar su código
// en el mismo contexto aislado; el botón de deporte sí prueba un clic real.
const executeArticleClick = element => w.eval(element.getAttribute('onclick'));
executeArticleClick(image);assert.equal(w.openedArticle,'22');
w.openedArticle=null;
w.eval("((event)=>{"+image.getAttribute('onkeydown')+"})({key:'Enter'})");
assert.equal(w.openedArticle,'22');
w.openedArticle=null;
executeArticleClick(preview.querySelector('h3'));assert.equal(w.openedArticle,'22');
w.openedArticle=null;
executeArticleClick(preview.querySelector('button.text-pitch-600'));assert.equal(w.openedArticle,'22');
w.openedArticle=null;
for(const track of tracks){assert.equal(track.querySelectorAll('article').length,10);for(const card of track.children)assert.match(card.querySelector('h3').textContent,new RegExp(track.dataset.sport));}
assert.equal(d.querySelectorAll('#articlesGrid>article').length,0);
assert.equal(d.querySelectorAll('[data-news-scroll]').length,0);
tracks[0].scrollLeft=123;w.renderArticlesFeed();assert.equal(d.querySelector('.ae-news-sport-track').scrollLeft,123);
// Pulsar la etiqueta no activa el artículo ni el evento del contenedor.
const clickPreview=d.querySelector('.ae-news-sport-track article');
let bubbled=0;clickPreview.addEventListener('click',()=>bubbled++);
clickPreview.querySelector('.ae-home-sport-badge').click();
assert.equal(w.currentCategory,'NFL');
assert.equal(w.openedArticle,null);
assert.equal(bubbled,0);
for(const [category,sport] of [['NFL','nfl'],['Fútbol','football']]){
 w.currentCategory='Todos';w.currentSearchQuery='';w.renderArticlesFeed();
 d.querySelector('.ae-home-sport-badge[data-ae-sport-section="'+category+'"]').click();
 assert.equal(w.currentCategory,category);await new Promise(r=>setTimeout(r,40));
 const cards=[...d.querySelectorAll('#freeTakesFeed>article')];assert.equal(cards.length,20);
 assert.equal(cards[0].dataset.sport,sport);assert.match(cards[0].querySelector('h3').textContent,/24/);assert.match(cards.at(-1).querySelector('h3').textContent,/ 5/);
 assert.equal(d.querySelectorAll('.ae-news-sport-track').length,0);assert.equal(d.querySelectorAll('.ae-home-sport-badge').length,0);assert.equal(d.querySelectorAll('#articlesGrid>article').length,3);
 cards.at(-1).querySelector('.ae-take-reply-link').click();assert.equal(w.openedTake.id,sport+'-5');
 assert.equal(d.getElementById('freeTakes').hidden,false);assert.equal(d.getElementById('aeTakesFeedHeading').textContent,'Últimos Takes');
 assert.equal(cards[0].querySelector('.ae-take-reply-count').textContent,'4');
 assert.equal(cards.at(-1).querySelector('.ae-take-reply-count').textContent,'0');
 assert.match(cards[0].querySelector('.ae-take-reply-link').getAttribute('aria-label'),/4 respuestas/);
 const feed=d.getElementById('freeTakes');assert.ok([...feed.children].indexOf(d.getElementById('aeSportTakeLeaders'))<[...feed.children].indexOf(d.getElementById('freeTakesFeed')));
}
// Responder conserva la conversación; la publicación refresca el contador real.
w.takeReplyCounts.set('football-24',9);d.dispatchEvent(new w.Event('ae:takes-updated'));await new Promise(r=>setTimeout(r,40));
assert.equal(d.querySelector('#freeTakesFeed .ae-take-reply-count').textContent,'9');
// Un fallo de contadores no elimina publicaciones ni finge cero respuestas.
w.failTakeReplyCounts=true;d.dispatchEvent(new w.Event('ae:takes-updated'));await new Promise(r=>setTimeout(r,40));
assert.equal(d.querySelectorAll('#freeTakesFeed>article').length,20);
assert.equal(d.querySelector('#freeTakesFeed .ae-take-reply-count').textContent,'—');
// Una respuesta NFL tardía no puede sustituir los contadores de Fútbol.
w.failTakeReplyCounts=false;
const originalRpc=w.db.rpc;let resolveOldCounts;
w.db.rpc=(name,args)=>name==='ae_public_take_reply_counts'&&args.p_take_ids[0].startsWith('nfl')?
 new Promise(resolve=>{resolveOldCounts=resolve;}):originalRpc(name,args);
w.currentCategory='NFL';w.renderFreeTakesVisibility();await new Promise(r=>setTimeout(r,40));
w.currentCategory='Fútbol';w.renderFreeTakesVisibility();await new Promise(r=>setTimeout(r,40));
resolveOldCounts({data:[{take_id:'football-24',reply_count:99}],error:null});await new Promise(r=>setTimeout(r,40));
assert.equal(d.querySelector('#freeTakesFeed .ae-take-reply-count').textContent,'9');
w.currentCategory='Todos';w.currentSearchQuery='NFL noticia 2';w.renderArticlesFeed();assert.equal(d.querySelectorAll('.ae-news-sport-track').length,0);assert.ok(d.querySelectorAll('#articlesGrid>article').length>0);
console.log('PASS: Home badges navigate without opening articles, image/title/Leer open articles, no duplicate buttons, native sport carousels and Takes stay intact.');
await w.happyDOM.close();
