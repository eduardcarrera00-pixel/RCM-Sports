// Integration of the published-ranking transport and render, without production writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.classList={add(){},toggle(){}};this.hidden=false;}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=children}
 setAttribute(){}
}
(async()=>{
 const nodes=new Map(),events={};
 const ids=Array.from({length:10},(_,i)=>'club-'+i);
 let fail=false,empty=false;
 const document={hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},createElement:t=>new Element(t),addEventListener:(name,fn)=>events[name]=fn};
 const db={from(table){const q={select:()=>q,eq:()=>q,order:()=>q,range:()=>q,then(resolve){return Promise.resolve({error:fail?{message:'offline'}:null,data:empty?[]:table==='champions_rankings'?[{edition:'Jornada 8',team_ids:ids}]:ids.map(id=>({id,name:'Club '+id,logo:'https://example.test/'+id+'.png'}))}).then(resolve)}};return q}};
 const context={document,db,window:{},currentCategory:'Todos',currentTeam:'',currentSearchQuery:''};
 context.window=context;
 vm.createContext(context);vm.runInContext(fs.readFileSync('assets/champions.js','utf8'),context);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 events.DOMContentLoaded();await settle();
 assert.equal(nodes.get('homeChampionsList').children.length,6);
 assert.equal(nodes.get('championsList').children.length,10);
 const track=nodes.get('championsTrack');assert.equal(track.children.length,2);
 for(const group of track.children){assert.equal(group.children.length,10);assert.deepEqual(group.children.map(row=>row.children[0].textContent),Array.from({length:10},(_,i)=>String(i+1)));}
 assert.equal(nodes.get('championsViewport').hidden,false);
 assert.equal(nodes.get('championsEdition').textContent,'Jornada 8');
 fail=true;events.visibilitychange();await settle();
 assert.equal(track.children.length,0);assert.equal(nodes.get('championsList').children.length,0);assert.equal(nodes.get('championsViewport').hidden,true);
 fail=false;empty=true;events.visibilitychange();await settle();
 assert.equal(track.children.length,0);assert.equal(nodes.get('homeChampionsList').children.length,0);
 console.log('PASS: six previews, ten canonical teams, two ordered loop groups, edition, failed/empty reads clear stale data.');
})().catch(e=>{console.error(e);process.exitCode=1});
