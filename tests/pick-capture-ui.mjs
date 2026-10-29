import assert from 'node:assert/strict';import fs from 'node:fs';import {Window} from 'happy-dom';
const w=new Window({url:'https://example.test/RCM-Sports/'}),d=w.document;
// Skip presentation-only delays; retain real cancellation and OCR deadlines.
const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>timeout(fn,ms<=2600?1:ms,...args);
d.body.innerHTML='<dialog open><form><input name="odds_0"><input name="event_date" type="date"><input name="explanation"><footer class="cp-compose-footer"></footer></form></dialog>';
const form=d.querySelector('form');let picks=[];
const valid={text:'BETSLIP\nNBA\nToronto Raptors vs Boston Celtics\nToronto Raptors Moneyline +150\nStake $10.00',confidence:95};
let nextData=valid,terminated=0,closed=0,workers=0,delayRead=null,delayInit=null,delayTerminate=null,failTerminate=false,delayBitmap=null;const canvases=[];
w.createImageBitmap=async()=>{if(delayBitmap)await delayBitmap;return {width:400,height:800,close(){closed++;}};};
w.HTMLCanvasElement.prototype.getContext=function(){canvases.push(this);return {fillRect(){},drawImage(){},fillStyle:''};};
const makeWorker=()=>({setParameters:async()=>{},recognize:async()=>{if(delayRead)await delayRead;return {data:nextData};},terminate:async()=>{terminated++;if(delayTerminate)await delayTerminate;if(failTerminate)throw Error('Worker did not close');}});
w.Tesseract={createWorker:async(_language,_oem,options)=>{workers++;assert.equal(options.cacheMethod,'none');assert.match(options.workerPath,/example.test\/RCM-Sports\/assets\/vendor\/ocr\/worker.min.js$/);if(delayInit)return delayInit;return makeWorker();}};
// No parser is downloaded until the first screenshot upload.
let parserLoads=0;
const appendHead=d.head.append.bind(d.head);
d.head.append=function(...nodes){
 for(const n of nodes){
  if(n.tagName==='SCRIPT'&&n.src.includes('ae-pick-capture-parser.js')){
   parserLoads++;
   w.eval(fs.readFileSync('assets/ae-pick-capture-parser.js','utf8'));
   queueMicrotask(()=>n.onload?.());
   continue;
  }
  appendHead(n);
 }
};
w.eval(fs.readFileSync('assets/ae-pick-capture.js','utf8'));
const controller=w.aePickCapture.mount({form,getPicks:()=>picks,applyImport:result=>{picks=result?structuredClone(result.readings):[];}});
const input=d.getElementById('cpCaptureFile'),panel=d.querySelector('.cp-capture'),privacy=d.querySelector('.cp-capture-privacy');
const settle=()=>new Promise(r=>setTimeout(r,120));
function upload(type='image/png',size=10){const transfer=new w.DataTransfer();transfer.items.add(new w.File([new Uint8Array(size)],'capture.png',{type}));input.files=transfer.files;input.dispatchEvent(new w.Event('change'));}
assert.throws(()=>controller.proof(),/captura/);assert.equal(workers,0,'OCR is lazy');
assert.equal(parserLoads,0,'No parser request is made before the reader selects an image');
assert.equal(form.firstElementChild,panel,'Screenshot comes before the form fields');
assert.equal(privacy.hidden,true,'No cleanup claim before an image is selected');
upload();for(let i=0;i<16&&panel.dataset.state==='reading';i++)await settle();assert.equal(parserLoads,1,'The OCR parser downloads once on first use');assert.equal(panel.dataset.state,'matched','OCR must reach matched after async parser load: '+panel.dataset.state+' / '+d.getElementById('cpCaptureStatus')?.textContent);assert.equal(input.files.length,0);assert.ok(canvases.every(c=>c.width===1&&c.height===1));assert.equal(terminated,1);assert.equal(closed,1);
assert.equal(privacy.dataset.state,'complete');assert.equal(privacy.hidden,true,'Once discarded, step 03 is the only note on screen');assert.match(privacy.textContent,/Captura descartada/);assert.match(privacy.textContent,/solo guardamos los datos de tu pick/);assert.ok(Array.from(privacy.querySelectorAll('li')).every(step=>step.dataset.state==='complete'));
assert.equal(picks[0].odds,150,'Odds were imported without any typed inputs');assert.equal(picks[0].sport,'NBA');assert.equal(controller.hasImport(),true);
assert.equal(d.querySelector('#cpCaptureConfirm'),null,'Publishing a reviewed ticket needs no separate confirmation checkbox');
assert.equal(controller.isConfirmed(),true);
const eventDate=form.elements.namedItem('event_date');eventDate.value='2026-11-01';eventDate.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(controller.hasImport(),true,'The undated capture remains valid when the event date changes');
assert.equal(eventDate.value,'2026-11-01');assert.equal(controller.isConfirmed(),true);
assert.equal(controller.isConfirmed(),true,'Clicking Publish will explicitly confirm the review');
assert.match(d.querySelector('.cp-capture-readings').textContent,/Toronto Raptors vs Boston Celtics/);
assert.match(d.querySelector('.cp-capture-readings').textContent,/Moneyline/);
assert.equal(controller.proof().readings[0].odds,150);assert.equal(JSON.stringify(controller.proof()).includes('Stake'),false);
assert.equal(d.querySelector('.cp-capture-shot').hidden,true,'The screenshot thumbnail was discarded after OCR');
form.querySelector('[name=explanation]').value='My own analysis';form.querySelector('[name=explanation]').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(controller.proof().confirmed,true,'Analysis stays free');
for(const [key,value] of [['odds',160],['event','Different match'],['selection','Other team wins'],['sport','NFL']]){
 picks[0][key]=value;form.querySelector('input').dispatchEvent(new w.Event('input',{bubbles:true}));assert.throws(()=>controller.proof(),/captura/);assert.equal(controller.hasImport(),false);
 upload();await settle();
}
nextData={...valid,text:valid.text.replace('+150','+160')};upload();await settle();assert.equal(controller.proof().readings[0].odds,160,'Only a new capture changes the quote');
nextData={...valid,text:'BETSLIP\nToronto Raptors vs Boston Celtics\nToronto Raptors Moneyline +150 +160'};upload();await settle();assert.equal(panel.dataset.state,'error');assert.throws(()=>controller.proof(),/captura/);
assert.equal(privacy.dataset.state,'complete','An unreadable receipt is still discarded');
assert.match(panel.querySelector('.cp-capture-title').textContent,/No pudimos preparar/);assert.match(privacy.textContent,/Sin lectura/);assert.doesNotMatch(privacy.textContent,/Completado/);
nextData=valid;let releaseRead;delayRead=new Promise(r=>{releaseRead=r;});upload();await settle();d.querySelector('.cp-capture-cancel').click();releaseRead();delayRead=null;await settle();assert.equal(panel.dataset.state,'empty');assert.throws(()=>controller.proof(),/captura/);
let releaseInit;delayInit=new Promise(r=>{releaseInit=r;});const before=terminated;upload();await settle();d.querySelector('.cp-capture-cancel').click();releaseInit(makeWorker());delayInit=null;await settle();assert.equal(terminated,before+1,'Late workers must terminate');assert.equal(input.files.length,0);
const beforeInvalid=workers;upload('image/gif');await settle();assert.equal(workers,beforeInvalid);assert.match(d.getElementById('cpCaptureStatus').textContent,/PNG/);
assert.equal(privacy.hidden,true,'An invalid file does not pretend to have completed OCR cleanup');
let releaseTerminate;delayTerminate=new Promise(r=>{releaseTerminate=r;});upload();await settle();
assert.equal(panel.dataset.state,'discarding');assert.equal(privacy.dataset.state,'discarding');assert.doesNotMatch(privacy.textContent,/Captura descartada/);assert.equal(controller.hasImport(),false);assert.throws(()=>controller.proof(),/Espera/);assert.equal(d.querySelector('#cpCaptureConfirm'),null);
assert.equal(input.files.length,0);assert.ok(canvases.every(c=>c.width===1&&c.height===1));
releaseTerminate();delayTerminate=null;await settle();assert.equal(panel.dataset.state,'matched');assert.equal(privacy.dataset.state,'complete');
failTerminate=true;upload();await settle();assert.equal(panel.dataset.state,'error');assert.equal(privacy.dataset.state,'unconfirmed');assert.equal(controller.hasImport(),false);assert.doesNotMatch(privacy.textContent,/Captura descartada/);failTerminate=false;
let releaseBitmap;delayBitmap=new Promise(r=>{releaseBitmap=r;});upload();await settle();d.querySelector('.cp-capture-cancel').click();await settle();assert.equal(privacy.dataset.state,'discarding','Cancellation waits for an in-flight image decoder to release the bitmap');
releaseBitmap();delayBitmap=null;await settle();assert.equal(privacy.dataset.state,'complete');assert.equal(panel.dataset.state,'empty');
delayTerminate=new Promise(r=>{releaseTerminate=r;});delayRead=new Promise(r=>{releaseRead=r;});upload();await settle();d.querySelector('.cp-capture-cancel').click();await settle();assert.equal(privacy.dataset.state,'discarding');
delayTerminate=null;upload();await settle();assert.equal(privacy.dataset.state,'reading');releaseTerminate();await settle();assert.equal(privacy.dataset.state,'reading','An old cleanup completion cannot overwrite a newer scan');
releaseRead();delayRead=null;await settle();assert.equal(privacy.dataset.state,'complete');assert.equal(panel.dataset.state,'matched');
upload();await settle();form.reset();assert.throws(()=>controller.proof(),/captura/);
assert.equal(privacy.hidden,true);
upload();await settle();w.dispatchEvent(new w.Event('pagehide'));assert.throws(()=>controller.proof(),/captura/);
// Advanced fallback keeps tall receipts legible and returns a server proof.
let aiCalls=0,jpegSize;
w.HTMLCanvasElement.prototype.toDataURL=function(){jpegSize=[this.width,this.height];return 'data:image/jpeg;base64,AA==';};
w.db={auth:{getSession:async()=>({data:{session:{}}})},functions:{invoke:async(_name,{body})=>{
 aiCalls++;assert.equal(body.images.length,1);return {data:{ok:true,readId:'verified-read',readings:[{sport:'NBA',event:'Toronto vs Boston',selection:'Toronto gana',odds:150}],eventDate:'2026-10-21'}};
}}};
nextData={text:'unreadable receipt',confidence:95};upload();await settle();
assert.equal(panel.dataset.state,'matched');assert.equal(aiCalls,1);assert.ok(jpegSize[1]>1800,'Long screenshots are no longer squeezed to 1800px');
assert.deepEqual(JSON.parse(JSON.stringify(controller.proof())),{version:1,method:'ai_vision',read_id:'verified-read'});
assert.equal(privacy.dataset.state,'complete');assert.ok(canvases.every(c=>c.width===1&&c.height===1));
nextData={text:'Parlay GANADO\nMomios +590',confidence:95};upload();await settle();
assert.equal(panel.dataset.state,'error');assert.equal(aiCalls,1,'Do not send an already resolved ticket to the provider again');
assert.match(d.getElementById('cpCaptureStatus').textContent,/resuelto/);
assert.match(d.querySelector('.cp-capture-overlay-text').textContent,/resuelto/);
await w.happyDOM.close();console.log('PASS: screenshot-first import, automatic odds, immutable bet binding, publish-as-confirmation, real disposal progress, termination failure, decoder cleanup, cancellation and stale-job isolation.');
