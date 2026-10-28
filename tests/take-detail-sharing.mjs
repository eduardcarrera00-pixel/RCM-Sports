import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mockShareLogo} from './fixtures/share-logo.mjs';
const w=new Window({url:'https://camsports.github.io/'}),d=w.document;mockShareLogo(w);
const draws=[],writes=[];
w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText:t=>draws.push(t),measureText:t=>({width:String(t).length*18})});
w.HTMLCanvasElement.prototype.toBlob=cb=>cb(new w.Blob(['PNG'],{type:'image/png'}));w.URL.createObjectURL=()=>'blob:detail';w.URL.revokeObjectURL=()=>{};
w.db={auth:{getUser:async()=>({data:{user:null}})},rpc:async name=>{if(!['ae_take_comment_thread','ae_take_reply_vote_totals'].includes(name))writes.push(name);return {data:[]};}};
for(const name of ['cam-pick-share','ae-take-replies'])w.eval(fs.readFileSync('assets/'+name+'.js','utf8'));
const row=Object.freeze({id:'00000000-0000-0000-0000-000000000971',author_id:'00000000-0000-0000-0000-000000000951',author:'Autor',title:'Una lectura del partido',body:'El equipo tiene recursos para dominar y crear ocasiones.',sport:'football',created_at:'2026-10-24T12:00:00Z'});
const tick=()=>new Promise(r=>setTimeout(r,0));
for(const sport of ['football','nfl','general']){
 w.aeTakeReplies.open({...row,sport});await tick();
 assert.equal(d.querySelectorAll('#aeDiscussionShare .cam-pick-share-button').length,1,'A repeated opening has exactly one share button');
 const button=d.querySelector('#aeDiscussionShare button');button.click();await tick();
 assert.equal(d.querySelector('#aeTakeDiscussion').open,true,'Sharing keeps the discussion open');
 assert.equal(d.querySelector('#camPickShareDialog').open,true);
 assert.equal(d.querySelector('.cam-pick-share-preview img').height,1350);
 assert.ok(draws.includes('Take guardado en 24/10/2026'));
 d.querySelector('.cam-pick-share-close').click();assert.equal(d.activeElement,button,'Focus returns to the detail button');
 assert.equal(d.querySelector('#aeTakeDiscussion').open,true);d.querySelector('#aeDiscussionClose').click();
}
w.aeTakeReplies.open({...row,hidden:true});assert.equal(d.querySelectorAll('#aeDiscussionShare button').length,0,'Hidden Takes cannot be shared from detail');
w.aeTakeReplies.open({...row,author_id:null});assert.equal(d.querySelectorAll('#aeDiscussionShare button').length,0,'A public author is required');
await tick();d.querySelector('#aeDiscussionClose').click();await tick();
assert.deepEqual(writes,[],'Sharing never publishes, edits or votes');
await w.happyDOM.close();console.log('PASS: single shared detail button for Football/NFL/general, same PNG flow, no writes, focus return and unavailable Takes.');
