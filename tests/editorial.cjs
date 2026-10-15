const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(){this.children=[];this.textContent='';this.classList={toggle(){}};}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=items}
}
const elements=new Map();
const context={document:{getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)}},
 rankingPublished:null,teamNode:(id,position)=>({id,position}),node:()=>new Element(),applyRankingMotion(){}};
vm.createContext(context);
const source=fs.readFileSync('assets/community.js','utf8');
vm.runInContext(source.slice(source.indexOf('function renderRanking()'),source.indexOf('function applyRankingMotion()')),context);
context.renderRanking();
assert.equal(elements.get('homeRankingList').children.length,0);
assert.equal(elements.get('homeRankingLink').hidden,true);
context.rankingPublished={edition:'Semana 6',team_ids:Array.from({length:10},(_,i)=>'team-'+i)};
context.renderRanking();
assert.equal(elements.get('homeRankingList').children.length,6);
assert.equal(elements.get('rankingList').children.length,10);
assert.deepEqual(elements.get('homeRankingList').children.map(t=>t.position),[1,2,3,4,5,6]);
assert.equal(elements.get('homeRankingEdition').textContent,' · Semana 6');
assert.equal(elements.get('homeRankingLink').hidden,false);
context.rankingPublished=null;context.renderRanking();
assert.equal(elements.get('homeRankingList').children.length,0);
assert.equal(elements.get('homeRankingEdition').textContent,'');
console.log('PASS: empty, published top six/full ten, edition and stale-data clearing');
