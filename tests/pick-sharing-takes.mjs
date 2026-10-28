import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mockShareLogo} from './fixtures/share-logo.mjs';

const w=new Window({url:'https://example.test/'}),d=w.document,frames=[],callbacks=[];
mockShareLogo(w);
let frame,shared=[],sharingError=null,canShare=()=>true;
w.HTMLCanvasElement.prototype.getContext=function(){
 frame={canvas:this,text:[],images:[]};frames.push(frame);const target=frame;
 return {font:'',fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  drawImage(logo,x,y,width,height){target.images.push({url:logo.url,x,y,width,height});},
  fillText(text,x,y){target.text.push({text,x,y,font:this.font});},
  measureText(text){return {width:Array.from(String(text)).length*(Number.parseFloat(this.font.match(/[\d.]+px/)?.[0])||30)*.6};}};
};
w.HTMLCanvasElement.prototype.toBlob=callback=>callbacks.push(callback);
w.URL.createObjectURL=()=> 'blob:take-'+frames.length;w.URL.revokeObjectURL=()=>{};
Object.defineProperty(w.navigator,'canShare',{configurable:true,value:data=>canShare(data)});
Object.defineProperty(w.navigator,'share',{configurable:true,value:data=>{shared.push(data);return sharingError?Promise.reject(sharingError):Promise.resolve();}});
w.eval(fs.readFileSync('assets/cam-pick-share.js','utf8'));
const take=Object.freeze({id:'00000000-0000-0000-0000-000000000971',author_id:'00000000-0000-0000-0000-000000000951',author:'AutorReal',created_at:'2026-10-24T14:15:00Z',sport:'football',title:'Mi título original: ¿quién ganará?',body:('Primera frase, con  dos espacios.\nSegunda frase: no es una cita inventada.\n\nTercera frase con datos y contexto. ').repeat(10)});
const original=JSON.stringify(take),tick=()=>new Promise(r=>setTimeout(r,0));
const dialog=()=>d.getElementById('camPickShareDialog');
const click=name=>[...dialog().querySelectorAll('button')].find(b=>b.textContent===name).click();
const finish=()=>callbacks.at(-1)(new w.Blob(['real PNG bytes '+frames.length],{type:'image/png'}));
const open=async(row=take)=>{w.CamPickShare.open(row,{kind:'take'});await tick();};
const option=async(index,value)=>{const control=dialog().querySelectorAll('select')[index];control.value=value;control.dispatchEvent(new w.Event('change'));await tick();};
const explain=async value=>{const input=dialog().querySelector('.cam-take-share-explanation');input.value=value;input.dispatchEvent(new w.Event('input'));await tick();};
const drawn=()=>frame.text.map(t=>t.text).join(' ');

await open();assert.equal(dialog().querySelector('.cam-take-share-primary').disabled,true);finish();
assert.equal(dialog().querySelector('img').width,1080);assert.equal(dialog().querySelector('img').height,1350);
assert.ok(drawn().includes(take.title),'Original title keeps spelling and case');
assert.ok(drawn().includes('Primera frase'),'The default card includes the Take below its title');
assert.ok(frame.text.some(t=>t.text==='@AutorReal'));assert.ok(frame.text.some(t=>t.text==='Take guardado en 24/10/2026'));
assert.match(frame.images[0].url,/assets\/cam-sports-logo-completo.webp$/,'Use the actual official resource');
assert.equal(dialog().querySelectorAll('input:not([type=checkbox]),textarea:not([readonly])').length,1,'Only the optional explanation is editable');
assert.equal(dialog().querySelector('details').open,false);assert.equal(shared.length,0);
const withoutExplanation=frame;
await explain('Su impacto decidirá los partidos grandes.');finish();
assert.ok(drawn().includes('Su impacto decidirá los partidos grandes.'));
assert.equal(dialog().querySelector('.cam-take-share-explanation-count').textContent,'41 / 240');
assert.equal(JSON.stringify(take),original,'Typing an explanation never edits the published title or Take');
assert.notDeepEqual(frame.text,withoutExplanation.text,'The composition adjusts for the explanation');
await explain('');finish();assert.deepEqual(frame.text,withoutExplanation.text,'Clearing the explanation restores the complete layout without an empty block');

await option(0,'fragment');const pieces=dialog().querySelectorAll('select')[1].options;
for(let i=0;i<pieces.length;i++){
 await option(1,String(i));const note=dialog().querySelector('.cam-take-share-selection').textContent;
 const fragment=note.replace(/^Fragmento \d+ de \d+\. /,'');
 assert.ok(take.body.includes(fragment),'Every fragment is an exact original slice');assert.ok(!fragment.includes('…'));
}
await option(0,'summary');assert.match(dialog().querySelector('.cam-take-share-selection').textContent,/extractivo/);
await option(2,'story');finish();assert.equal(dialog().querySelector('img').height,1920);
assert.ok(frame.text.every(t=>t.y>=280&&t.y<=1570),'Story text stays within the safe area');
dialog().querySelector('input[type=checkbox]').click();await tick();assert.ok(!drawn().includes('Take guardado en'));
await option(3,'compact');click('Restablecer diseño');await tick();finish();
assert.deepEqual([...dialog().querySelectorAll('select')].map(s=>s.value),['fragment','0','feed','auto']);
assert.equal(dialog().querySelector('input').checked,true);assert.equal(JSON.stringify(take),original);

click('Compartir imagen');assert.equal(shared.at(-1).files[0].type,'image/png');assert.equal(shared.at(-1).text,take.title);assert.match(shared.at(-1).url,/\?t=/);await tick();
click('Instagram');assert.deepEqual(Object.keys(shared.at(-1)),['files']);await tick();
canShare=data=>!data.text;click('Compartir imagen');assert.deepEqual(Object.keys(shared.at(-1)),['files']);await tick();
canShare=()=>{throw Error('restricted browser');};const before=shared.length;
const event=new w.MouseEvent('click',{bubbles:true,cancelable:true});dialog().querySelector('.cam-pick-share-networks a').dispatchEvent(event);
assert.equal(event.defaultPrevented,true);assert.equal(shared.length,before);assert.match(dialog().querySelector('[role=status]').textContent,/Descarga/);
canShare=()=>true;sharingError=Object.assign(Error('combined sharing rejected'),{name:'DataError'});click('Compartir imagen');await tick();
assert.equal(shared.length,before+1);assert.equal(dialog().querySelector('.cam-take-share-primary').textContent,'Compartir solo imagen');
sharingError=null;click('Compartir solo imagen');assert.deepEqual(Object.keys(shared.at(-1)),['files']);await tick();
sharingError=Object.assign(Error('cancel'),{name:'AbortError'});click('TikTok');await tick();assert.match(dialog().querySelector('[role=status]').textContent,/cuando quieras/);

await option(2,'story');const stale=callbacks.at(-1);await option(2,'feed');finish();stale(new w.Blob(['stale']));assert.equal(dialog().querySelector('img').height,1350);
await option(2,'story');const closed=callbacks.at(-1);click('Cerrar');closed(new w.Blob(['closed']));assert.equal(dialog().open,false);
for(const sport of ['nfl','football','opinions']){await open({...take,sport});finish();assert.equal(dialog().querySelector('img').height,1350);click('Cerrar');}
await open({...take,created_at:null,body:''});finish();assert.ok(!/Take guardado en/.test(drawn()),'A missing date is never invented');
assert.equal(dialog().querySelector('option[value=summary]').disabled,true);click('Cerrar');
await open({...take,title:'Lamine Yamal, Balón de Oro 2026',body:'Lamine Yamal, Balón de Oro 2026.'});finish();
assert.equal(frame.text.filter(t=>t.text.includes('Lamine Yamal')).length,1,'Matching title and body are not repeated');
click('Cerrar');
for(const title of [('Una opinión larga con todos los detalles del partido y de la temporada. ').repeat(3).slice(0,160),'W'.repeat(160)]){
 await open({...take,title});
 for(const size of ['feed','story']){await option(2,size);finish();assert.ok(!drawn().includes('…'),'Long titles are never cropped');assert.ok(frame.text.filter(t=>t.font.includes('Playfair')).every(t=>parseInt(t.font.match(/\d+px/)[0])>=38));}
 click('Cerrar');
}
assert.equal(JSON.stringify(take),original);
await w.happyDOM.close();
console.log('PASS: official logo, title/Take hierarchy, original date, optional live explanation/reset/immutability, 4:5/9:16, long titles, original fragments, native/fallback share, cancellation and stale PNGs.');
