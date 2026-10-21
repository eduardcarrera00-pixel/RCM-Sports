import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/?article=old&token=PRIVATE#profile'}),d=w.document;
const drawn=[];let pendingBlob=null,shared=null,clipboard='',cancel=false;
w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText:t=>drawn.push(t),measureText:t=>({width:String(t).length*18})});
w.HTMLCanvasElement.prototype.toBlob=function(callback){pendingBlob=callback;};
w.URL.createObjectURL=()=> 'blob:share-preview';const revoked=[];w.URL.revokeObjectURL=u=>revoked.push(u);
Object.defineProperty(w.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{clipboard=text;}}});
Object.defineProperty(w.navigator,'canShare',{configurable:true,value:()=>true});
Object.defineProperty(w.navigator,'share',{configurable:true,value:data=>{shared=data;return cancel?Promise.reject(Object.assign(new Error('cancelled'),{name:'AbortError'})):Promise.resolve();}});
w.notifyCommunity=t=>{w.lastNotification=t;};
w.eval(fs.readFileSync('assets/cam-pick-share.js','utf8'));
const pick={id:'00000000-0000-0000-0000-000000000921',author:'Sofia',title:'Barça ante el PSG',american_odds:150,event_date:'2026-11-01',outcome:'pending',moderation_status:'pending',legs:[{event:'Barça vs PSG',selection:'Barcelona gana'}],capture_check:{image:'PRIVATE_SCREENSHOT',stake:9999},email:'PRIVATE_EMAIL'};
const opener=w.CamPickShare.button(pick);d.body.append(opener);opener.focus();opener.click();
const dlg=d.getElementById('camPickShareDialog');
assert.equal(dlg.open,true);assert.match(dlg.textContent,/Comparte este Pick/);
const x=dlg.querySelector('.cam-pick-share-network');const xu=new URL(x.href),link=new URL(xu.searchParams.get('url'));
assert.equal(link.origin,'https://camsports.github.io');assert.match(link.searchParams.get('p'),/^[A-Za-z0-9_-]{22}$/);assert.equal(link.searchParams.has('utm_source'),false);assert.ok(link.href.length<55);assert.equal(link.searchParams.has('token'),false);assert.equal(link.searchParams.has('article'),false);assert.equal(link.hash,'');
assert.match(xu.searchParams.get('text'),/@Sofia/);assert.equal(x.rel,'noopener noreferrer');
const ig=[...dlg.querySelectorAll('button')].find(b=>b.textContent==='Instagram');assert.equal(ig.disabled,true,'The image must be ready before sharing');
pendingBlob(new w.Blob(['PNG_IMAGE'],{type:'image/png'}));
assert.equal(ig.disabled,false);assert.equal(dlg.querySelector('img').width,1080);assert.equal(dlg.querySelector('img').height,1350);
assert.ok(drawn.includes('Cuota en revisión'),'Unapproved odds are not presented as verified');
const caption=dlg.querySelector('textarea');assert.match(caption.value,/Barcelona gana/);assert.match(caption.value,/Cuota \+150/);assert.ok(!caption.value.includes('PRIVATE'));
const click=label=>[...dlg.querySelectorAll('button')].find(b=>b.textContent===label).click();
click('Copiar enlace');await new Promise(r=>setTimeout(r,0));assert.equal(clipboard,link.href);
click('Copiar texto');await new Promise(r=>setTimeout(r,0));assert.match(clipboard,/Barça vs PSG/);
ig.click();assert.ok(shared.files,'File sharing starts synchronously in the click');assert.equal(shared.files.length,1);assert.equal(shared.text,caption.value);assert.match(shared.text,/Pendiente de resultado/);assert.equal(shared.files[0].type,'image/png');assert.equal(shared.files[0].name,'cam-sports-pick-'+pick.id+'.png');
await new Promise(r=>setTimeout(r,0));assert.match(dlg.querySelector('[role=status]').textContent,/menú de compartir/);assert.doesNotMatch(dlg.querySelector('[role=status]').textContent,/publicado/i);
cancel=true;ig.click();await new Promise(r=>setTimeout(r,0));assert.match(dlg.querySelector('[role=status]').textContent,/cuando quieras/);
Object.defineProperty(w.navigator,'canShare',{configurable:true,value:()=>false});ig.click();assert.match(dlg.querySelector('[role=status]').textContent,/Descarga la tarjeta/);
assert.ok(dlg.querySelector('.cam-pick-share-download').download.endsWith('.png'));
click('Cerrar');assert.equal(dlg.open,false);assert.equal(d.activeElement,opener);assert.ok(revoked.includes('blob:share-preview'));
// A Blob prepared after closing cannot restore a stale preview or leak its URL.
opener.click();const oldCallback=pendingBlob;click('Cerrar');oldCallback(new w.Blob(['old']));assert.equal(dlg.open,false);assert.equal(dlg.querySelector('img'),null);
const weekly={...pick,id:'00000000-0000-0000-0000-000000000922',event_name:'Toronto vs Boston',selection:'Toronto gana',title:'Pick de hoy'};
w.CamPickShare.open(weekly,{kind:'weekly'});assert.match(dlg.textContent,/Comparte el Pick del editor/);assert.ok(new URL(new URL(dlg.querySelector('a').href).searchParams.get('url')).searchParams.has('e'));assert.match(dlg.querySelector('textarea').value,/Toronto gana/);assert.doesNotMatch(dlg.querySelector('textarea').value,/@Sofia/);
const longPick={...pick,title:'X'.repeat(500),legs:Array.from({length:6},(_,i)=>({event:'Evento '+i,selection:'L'.repeat(500)}))};
w.CamPickShare.open(longPick);assert.ok(drawn.includes('3 de 6 selecciones · Pick completo en el enlace'));assert.equal(dlg.querySelector('textarea').value.split('Evento ').length-1,6,'The full caption retains every selection');

// Results and odds verification are independent and consistent across X, text and PNG.
for(const [state,result,cta] of [['pending','Pendiente de resultado','¿Lo sigues o lo debates?'],['won','Pick acertado','Aquí lo que se canta, se baila.'],['lost','Pick no acertado','También se da la cara'],['void','Pick anulado','no cuenta']]){
 for(const approved of [true,false]){
  w.CamPickShare.open({...pick,outcome:state,moderation_status:approved?'approved':'pending'});
  const body=dlg.querySelector('textarea').value,post=new URL(dlg.querySelector('a').href).searchParams.get('text');
  for(const text of [body,post]){assert.ok(text.includes(result));assert.ok(text.includes(cta));assert.equal(text.includes('Cuota verificada'),approved);}
  assert.ok(drawn.includes(result));
 }
}
const wide={...pick,author:'漢'.repeat(60),title:'漢'.repeat(500),legs:[{event:'漢'.repeat(160),selection:'漢'.repeat(280)}]};
w.CamPickShare.open(wide);const post=new URL(dlg.querySelector('a').href).searchParams.get('text');
assert.ok(Array.from(post).reduce((n,c)=>n+(c.codePointAt(0)>0x10ff?2:1),0)+24<=280);assert.match(post,/Pendiente de resultado/);assert.match(post,/¿Lo sigues o lo debates/);
// Decode compact links before normal app handlers read the route, retaining old links.
const code=fs.readFileSync('assets/cam-pick-share.js','utf8');
async function expanded(url){const page=new Window({url});page.eval(code);const actual=new URL(page.location.href);await page.happyDOM.close();return actual;}
assert.equal((await expanded(link.href)).searchParams.get('pick'),pick.id);
assert.equal((await expanded('https://camsports.github.io/?pick='+pick.id)).searchParams.get('pick'),pick.id);
for(const value of ['bad','A'.repeat(21),'A'.repeat(23),'!'.repeat(22),'A'.repeat(21)+'B']){
 const broken=await expanded('https://camsports.github.io/?p='+encodeURIComponent(value));assert.equal(broken.searchParams.has('pick'),false);
}
w.camWeeklyResults={getResult:()=>({outcome:'won'})};w.CamPickShare.open(weekly,{kind:'weekly'});
assert.match(dlg.querySelector('textarea').value,/Pick acertado/);
const resultUrl=new URL(dlg.querySelector('a').href).searchParams.get('url');assert.equal((await expanded(resultUrl)).searchParams.get('weeklyResult'),weekly.id);
w.camWeeklyResults=null;w.CamPickShare.open(weekly,{kind:'weekly'});
assert.equal((await expanded(new URL(dlg.querySelector('a').href).searchParams.get('url'))).searchParams.get('weeklyPick'),weekly.id);

w.CamPickShare.open({...pick,id:'invalid'});assert.match(w.lastNotification,/No se puede compartir/);
assert.equal(d.querySelector('script'),null);
await w.happyDOM.close();
console.log('PASS: canonical Pick/weekly links, PNG card, odds review, no screenshot/private fields, explicit file share, cancellation, fallback, clipboard, focus and stale image cleanup.');
