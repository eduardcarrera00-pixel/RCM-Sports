import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

const window=new Window({url:'https://camsports.github.io/'});
const document=window.document;
let revision={takes:'0',picks:'0',news:'0',community:'0',scores:'0'};
let reads=0,fail=false,newsLoads=0,scoreLoads=0,homeLoads=0;
const events=[];
const timers=new Map();let seq=0;
for(const name of ['ae:takes-updated','cam:live-picks','cam:live-community'])
  document.addEventListener(name,event=>events.push([name,event.detail.source]));
const context=vm.createContext({document,window,navigator:{onLine:true},
  CustomEvent:window.CustomEvent,AbortController,Promise,Set,Error,Math,
  setTimeout:(fn,delay)=>{timers.set(++seq,{fn,delay});return seq;},
  clearTimeout:id=>timers.delete(id),currentCategory:'Todos',
  loadArticlesFromStorage:()=>{newsLoads++;},
  db:{rpc:()=>{reads++;return Promise.resolve(fail?{error:Error('offline')}:{data:{...revision}});}}
});
window.camNflQuiniela={refreshLive:()=>{scoreLoads++;}};
window.camHomeJornada={refresh:()=>{homeLoads++;}};
vm.runInContext(await readFile(new URL('../assets/cam-live-updates.js',import.meta.url),'utf8'),context);
await window.camLiveUpdates.check();
assert.equal(events.length,0,'initial revision is a baseline');
await window.camLiveUpdates.check();
assert.equal(events.length,0,'unchanged revisions cause no data reload');
revision.takes='1';revision.picks='1';
await window.camLiveUpdates.check();
assert.deepEqual(events,[['ae:takes-updated','live'],['cam:live-picks','live']]);
const input=document.createElement('textarea');document.body.append(input);input.focus();
revision.news='1';revision.takes='2';
await window.camLiveUpdates.check();
assert.equal(newsLoads,0,'editing defers automatic replacement');
assert.equal(events.length,2);
input.blur();await window.camLiveUpdates.check();
assert.equal(newsLoads,1);assert.equal(events.length,3,'deferred revision is preserved');
const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
revision.scores='1';await window.camLiveUpdates.check();assert.equal(scoreLoads,0);
dialog.close();await window.camLiveUpdates.check();assert.equal(scoreLoads,1);assert.equal(homeLoads,1);
Object.defineProperty(document,'hidden',{configurable:true,value:true});
const before=reads;await window.camLiveUpdates.check();assert.equal(reads,before,'hidden tabs make no request');
Object.defineProperty(document,'hidden',{configurable:true,value:false});
fail=true;await window.camLiveUpdates.check();
assert.ok([...timers.values()].some(t=>t.delay===120000),'failures back off');
fail=false;await window.camLiveUpdates.check();
assert.ok([...timers.values()].some(t=>t.delay===60000),'success restores normal interval');
await window.happyDOM.close();
console.log('Live updates: unchanged data, changed channels, drafts/dialogs, hidden tabs and error backoff passed.');
