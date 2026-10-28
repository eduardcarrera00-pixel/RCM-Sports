import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const w=new Window({url:'https://example.test/'}),d=w.document,frames=[],callbacks=[];
let frame,shared=[],sharingError=null,canShare=()=>true;
w.HTMLCanvasElement.prototype.getContext=function(){
 frame={canvas:this,text:[],logos:[]};frames.push(frame);
 return {font:'',drawImage(image,x,y,width,height){frame.logos.push({src:image.src,x,y,width,height});},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
  fillText(text,x,y){frame.text.push({text,x,y,font:this.font});},
  measureText(text){return {width:Array.from(String(text)).length*(Number.parseFloat(this.font.match(/[\d.]+px/)?.[0])||30)*.6};}};
};
w.HTMLCanvasElement.prototype.toBlob=callback=>callbacks.push(callback);
w.URL.createObjectURL=()=> 'blob:take-'+frames.length;w.URL.revokeObjectURL=()=>{};
Object.defineProperty(w.navigator,'canShare',{configurable:true,value:data=>canShare(data)});
Object.defineProperty(w.navigator,'share',{configurable:true,value:data=>{shared.push(data);return sharingError?Promise.reject(sharingError):Promise.resolve();}});
w.Image=class {naturalWidth=1760;naturalHeight=894;set src(value){this.url=value;Promise.resolve().then(()=>this.onload?.());}get src(){return this.url;}};
// A computer-sized window: the dialog starts on X; phones start on the Instagram story.
Object.defineProperty(w,'matchMedia',{configurable:true,value:()=>({matches:false})});
w.eval(fs.readFileSync('assets/cam-pick-share.js','utf8'));
const take=Object.freeze({id:'00000000-0000-0000-0000-000000000971',author_id:'00000000-0000-0000-0000-000000000951',author:'AutorReal',created_at:'2026-10-24T14:15:00Z',sport:'football',title:'Mi título original: ¿quién ganará?',body:('Primera frase, con  dos espacios.\nSegunda frase: no es una cita inventada.\n\nTercera frase con datos y contexto. ').repeat(10)});
const original=JSON.stringify(take),tick=()=>new Promise(r=>setTimeout(r,0));
const open=()=>w.CamPickShare.open(take,{kind:'take'});
const dialog=()=>d.getElementById('camPickShareDialog');
const click=name=>[...dialog().querySelectorAll('button')].find(b=>b.textContent===name).click();
const finish=()=>callbacks.at(-1)(new w.Blob(['real PNG bytes '+frames.length],{type:'image/png'}));
const option=async(index,value)=>{const control=dialog().querySelectorAll('select')[index];control.value=value;control.dispatchEvent(new w.Event('change'));await tick();};
const destination=async size=>{dialog().querySelector(`.cam-take-share-destination[data-size="${size}"]`).click();await tick();};
const pressed=()=>[...dialog().querySelectorAll('.cam-take-share-destination')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.size);

open();assert.equal(dialog().querySelector('.cam-take-share-primary').disabled,true);await tick();finish();
assert.equal(dialog().querySelector('img').width,1080);assert.equal(dialog().querySelector('img').height,760);assert.deepEqual(pressed(),['card']);
assert.ok(frame.logos[0].src.includes('assets/cam-sports-logo-completo.webp'),'Use the same real image as the header');
assert.ok(!frame.text.some(t=>t.text==='CAM'),'Never recreate the logo with typed letters');
assert.ok(frame.text.map(t=>t.text).join(' ').includes(take.title),'The original title keeps its spelling and case');
assert.ok(frame.text.some(t=>t.text==='AutorReal'));assert.ok(frame.text.some(t=>t.text==='24/10/2026'));
assert.equal(dialog().querySelectorAll('input:not([type=checkbox]),textarea:not([readonly])').length,0,'Neither title nor Take is editable');
assert.equal(dialog().querySelector('details').open,false,'The long original caption is collapsed');
assert.equal(shared.length,0,'Opening a preview never invokes native sharing');

await option(0,'fragment');const pieces=dialog().querySelectorAll('select')[2].options;
for(let i=0;i<pieces.length;i++){
 await option(2,String(i));const fragment=dialog().querySelector('.cam-take-share-selection').textContent;
 assert.ok(take.body.includes(fragment),'Every fragment is an exact, contiguous original slice');
 assert.ok(!fragment.includes('…'),'The selected text is never rewritten or ellipsized');
}
await option(0,'summary');assert.ok(frame.text.some(t=>t.text==='RESUMEN DEL TAKE'));
assert.match(dialog().querySelector('.cam-take-share-selection').textContent,/extractivo/);
await destination('story');finish();assert.equal(dialog().querySelector('img').height,1920);assert.deepEqual(pressed(),['story']);
assert.ok(frame.text.every(t=>t.y>=250&&t.y<=1664),'Every Instagram story text item stays clear of the app interface');
await destination('tiktok');finish();assert.equal(dialog().querySelector('img').height,1920);
assert.ok(frame.text.every(t=>t.y>=240&&t.y<=1254&&t.x>=170),'TikTok text stays clear of its tabs, caption and action column');
await destination('post');finish();assert.equal(dialog().querySelector('img').height,1350);
dialog().querySelector('input[type=checkbox]').click();await tick();assert.ok(!frame.text.some(t=>t.text==='24/10/2026'));
await option(1,'compact');click('Restablecer diseño');await tick();finish();
assert.deepEqual([...dialog().querySelectorAll('select')].map(s=>s.value),['summary','auto','0']);assert.deepEqual(pressed(),['card']);
assert.equal(dialog().querySelector('input').checked,true);assert.equal(JSON.stringify(take),original,'No option can mutate the original Take');

click('Compartir imagen');assert.equal(shared.at(-1).files[0].type,'image/png');assert.equal(shared.at(-1).text,take.title);assert.match(shared.at(-1).url,/\?t=/);await tick();
await destination('story');finish();click('Compartir imagen');assert.deepEqual(Object.keys(shared.at(-1)),['files'],'Instagram and TikTok formats receive only the PNG');await tick();
await destination('card');finish();
canShare=data=>!data.text;click('Compartir imagen');assert.deepEqual(Object.keys(shared.at(-1)),['files'],'File-only support is sufficient');await tick();
canShare=()=>{throw Error('restricted browser');};const before=shared.length;
assert.equal(dialog().querySelector('a[href*="intent"]'),null,'X must not open a text-only composer instead of the image');
click('Compartir imagen');assert.equal(shared.length,before);assert.match(dialog().querySelector('[role=status]').textContent,/Descarga/);
canShare=()=>true;sharingError=Object.assign(Error('combined sharing rejected'),{name:'DataError'});click('Compartir imagen');await tick();
assert.equal(shared.length,before+1,'Do not retry after consuming user activation');assert.equal(dialog().querySelector('.cam-take-share-primary').textContent,'Compartir solo imagen');
sharingError=null;click('Compartir solo imagen');assert.deepEqual(Object.keys(shared.at(-1)),['files']);await tick();
sharingError=Object.assign(Error('cancel'),{name:'AbortError'});click('Compartir solo imagen');await tick();assert.match(dialog().querySelector('[role=status]').textContent,/cuando quieras/);

// Delayed encodes and fonts cannot replace a newer selection or a closed dialog.
await destination('story');const stale=callbacks.at(-1);await destination('post');finish();stale(new w.Blob(['stale']));assert.equal(dialog().querySelector('img').height,1350);
await destination('story');const closed=callbacks.at(-1);click('Cerrar');closed(new w.Blob(['closed']));assert.equal(dialog().querySelector('img'),null);
for(const sport of ['nfl','football','opinions']){w.CamPickShare.open({...take,sport},{kind:'take'});await tick();finish();assert.equal(dialog().querySelector('img').height,760);click('Cerrar');}
w.CamPickShare.open({...take,created_at:null,body:''},{kind:'take'});await tick();finish();assert.ok(!frame.text.some(t=>/\d{2}\/\d{2}\/\d{4}/.test(t.text)),'A missing date is never invented');
assert.equal(dialog().querySelector('option[value=summary]').disabled,true);
assert.equal(JSON.stringify(take),original);
await w.happyDOM.close();
console.log('PASS: immutable Take/title, exact original fragments, labelled extractive summary, real metadata, Instagram/TikTok safe areas, 4:5 post, reset, file-only/combined native share, X fallback, cancellation and stale PNGs.');
