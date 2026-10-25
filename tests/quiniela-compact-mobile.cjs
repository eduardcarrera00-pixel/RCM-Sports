const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.AE_CHROMIUM_PATH?{executablePath:process.env.AE_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{for(const sport of ['nfl','football'])for(const width of [360,390,720,1366])for(const dark of [false,true]){
const page=await browser.newPage({viewport:{width,height:900}});await page.route('**/*',r=>r.abort());
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
await page.setContent(html);await page.evaluate(({sport,dark})=>{
 document.documentElement.classList.toggle('dark',dark);document.body.className='ae-is-'+sport;
 const root=document.getElementById(sport==='nfl'?'camNflQuiniela':'camFootballQuiniela');
 for(let p=root;p&&p!==document.body;p=p.parentElement){p.hidden=false;p.style.display='block';}
 const kickoff=new Date(Date.now()+86400000).toISOString();const season=new Date().getUTCFullYear();
 const fixtures=Array.from({length:5},(_,i)=>({id:String(i+1),season,week:7,competition:'laliga',matchday:7,home_id:'BUF',away_id:'KC',kickoff,status:'scheduled',picks_open:true,points_home:4,points_away:5,points_draw:6,odds_locked_at:kickoff}));
 window.db={auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange(){}},rpc:async()=>({data:[]}),from:table=>{const q={select(){return q},order(){return q},limit:async()=>({data:table.endsWith('_games')?fixtures:[]})};return q;}};
},{sport,dark});
await page.addScriptTag({content:fs.readFileSync('assets/cam-'+sport+'-quiniela.js','utf8')});
const prefix=sport==='nfl'?'camNfl':'camFootball';await page.locator('#'+prefix+'Games > article').nth(4).waitFor();
await page.waitForFunction(prefix=>document.getElementById(prefix+'Games').style.getPropertyValue('--q-two-height'),prefix);
const result=await page.evaluate(({prefix,width,sport})=>{
 const list=document.getElementById(prefix+'Games'),rect=list.getBoundingClientRect(),cards=[...list.children].map(c=>c.getBoundingClientRect());
 const board=document.getElementById(prefix+'QuinielaStandings'),champion=document.getElementById('aeSeasonPredictions');
 return {noYear:!document.querySelector('#'+prefix+'Nav select[aria-label^="Temporada"]'),after:!!(champion.compareDocumentPosition(board)&Node.DOCUMENT_POSITION_FOLLOWING),outside:!document.getElementById(prefix+'Quiniela').contains(board),boardVisible:getComputedStyle(board).display!=='none',otherHidden:getComputedStyle(document.getElementById((sport==='nfl'?'camFootball':'camNfl')+'QuinielaStandings')).display==='none',height:rect.height,two:cards[1].bottom-cards[0].top,scroll:list.scrollHeight>list.clientHeight,third:cards[2].top>=rect.bottom-1};
},{prefix,width,sport});
assert.ok(result.noYear&&result.after&&result.outside&&result.boardVisible&&result.otherHidden,JSON.stringify(result));
if(width<=720){assert.ok(Math.abs(result.height-result.two)<=2&&result.scroll&&result.third,JSON.stringify(result));await page.locator('#'+prefix+'Games').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await page.locator('#'+prefix+'Games').evaluate(e=>e.scrollTop>0));}
await page.locator('#'+prefix+'RankingTabs button[data-scope="month"]').click();assert.equal(await page.locator('#'+prefix+'RankingTabs button[data-scope="month"]').getAttribute('aria-pressed'),'true');
await page.close();
}console.log('PASS: both sports, day/night, 360/390/720/1366; two complete mobile matches, scroll, no season selector, rankings after champion with working tabs.');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
