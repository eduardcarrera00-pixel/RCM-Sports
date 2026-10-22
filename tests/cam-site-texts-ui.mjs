/* CAM SPORTS · Regresión del editor de textos sin navegador remoto. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('assets/cam-site-texts.js'), index=read('index.html'), css=read('assets/cam-global-edit.css');
const sql=read('supabase/migrations/20261022065000_cam_site_texts.sql');
new vm.Script(js,{filename:'cam-site-texts.js'});
assert.match(index,/assets\/cam-site-texts\.js/);
assert.match(read('assets/cam-global-edit.js'),/camSiteTexts\?\.refresh/);
assert.match(css,/cam-site-text-dialog/);
assert.match(sql,/NOT public\.rcm_is_editor\(\)/);
assert.match(sql,/REVOKE ALL ON TABLE public\.cam_site_texts FROM anon, authenticated/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.cam_set_site_text\(text,text,jsonb\) TO authenticated/);
assert.doesNotMatch(js,/\b(?:eval|Function)\s*\(/);
assert.doesNotMatch(js,/\.innerHTML\s*=\s*(?:draft|content|row\.content)/);
const browser=new Window({url:'https://camsports.github.io/'});
const {document}=browser;
document.body.innerHTML='<header><button id="camGlobalEditToggle">Editar</button></header>'+
'<main><span class="cam-home-take-square-label">Demuestra tu conocimiento</span>'+
'<h3 id="picksPopularTitle">Mejores platos</h3>'+
'<div id="cpFeed"><article>PICK DE UN USUARIO</article></div></main>';
browser.HTMLElement.prototype.getBoundingClientRect=function(){
  return {left:10,right:230,top:30,bottom:60,width:220,height:30};
};
browser.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
browser.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new browser.Event('close'));};
const stored=new Map(), calls=[];
let enabled=false;
browser.camGlobalEditMode={isActive:()=>enabled};
const sb={
  from:table=>{
    assert.equal(table,'cam_site_texts');
    return {select:async()=>({data:[...stored.values()],error:null})};
  },
  rpc:async(name,args)=>{
    calls.push([name,args]);
    if(name==='cam_set_site_text'){
      stored.set(args.p_key,{key:args.p_key,content:args.p_content,settings:args.p_settings});
    }else if(name==='cam_reset_site_text') stored.delete(args.p_key);
    else throw Error('Unexpected RPC');
    return {data:null,error:null};
  }
};
let frames=[];
const flush=()=>{for(let i=0;i<8 && frames.length;i++){const f=frames.splice(0);for(const cb of f)cb();}};
const ctx={
  window:browser,document,db:sb,console,localStorage:browser.localStorage,
  MutationObserver:browser.MutationObserver,
  requestAnimationFrame:callback=>{frames.push(callback);},
  matchMedia:()=>({matches:false}),
  getComputedStyle:browser.getComputedStyle.bind(browser),
  innerWidth:1280,innerHeight:800,
  addEventListener:()=>{},confirm:()=>true,Event:browser.Event
};
vm.runInNewContext(js,ctx,{filename:'cam-site-texts.js'});
if(document.readyState==='loading')document.dispatchEvent(new browser.Event('DOMContentLoaded'));
await Promise.resolve();await Promise.resolve();flush();
assert.equal(document.querySelector('.cam-site-text-layer'),null,'normal site has no pencils');
enabled=true;browser.camSiteTexts.refresh();flush();
const pencil=[...document.querySelectorAll('.cam-site-text-pencil')].find(p=>p.title.includes('Demuestra tu conocimiento'));
assert.ok(pencil,'global edit mode shows the text pencil');
pencil.click();
const dialog=document.getElementById('camSiteTextDialog');
assert.equal(dialog.open,true);
const textarea=dialog.querySelector('[data-content]');
textarea.value='Mi nuevo eslogan';
textarea.dispatchEvent(new browser.Event('input',{bubbles:true}));
const size=dialog.querySelector('[data-field="desktopSize"]');
size.value='32';size.dispatchEvent(new browser.Event('input',{bubbles:true}));flush();
assert.equal(document.querySelector('.cam-home-take-square-label').textContent,'Mi nuevo eslogan','live preview updates only a fixed text');
assert.equal(document.querySelector('#cpFeed').textContent,'PICK DE UN USUARIO','community posts remain unchanged');
dialog.querySelector('form').dispatchEvent(new browser.Event('submit',{cancelable:true,bubbles:true}));
await Promise.resolve();await Promise.resolve();flush();
assert.equal(calls.at(-1)?.[0],'cam_set_site_text','saving uses server-authorized RPC');
assert.equal(stored.get('home.take.cta').content,'Mi nuevo eslogan');
assert.equal(stored.get('home.take.cta').settings.desktopSize,32);
assert.equal(document.querySelector('#picksPopularTitle').textContent,'Mejores platos');
enabled=false;browser.camSiteTexts.refresh();flush();
assert.equal(document.querySelector('.cam-site-text-layer'),null,'pencils disappear outside edit mode');
enabled=true;browser.camSiteTexts.refresh();flush();
const reopen=[...document.querySelectorAll('.cam-site-text-pencil')].find(p=>p.title.includes('Demuestra tu conocimiento'));
reopen.click();
dialog.querySelector('[data-reset]').click();
await Promise.resolve();await Promise.resolve();flush();
assert.equal(calls.at(-1)?.[0],'cam_reset_site_text','reset also checks permissions in RPC');
assert.equal(document.querySelector('.cam-home-take-square-label').textContent,'Demuestra tu conocimiento');
assert.equal(stored.size,0);
await browser.happyDOM.close();
console.log('CAM SPORTS text editor: syntax, permissions integration, preview, save, reset, global toggle passed');
