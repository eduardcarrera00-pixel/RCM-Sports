/**
 * AE SPORTS / CSS phase 5: conservative cascade inventory (read-only).
 *
 * Parses CSS in its actual HTML load order, expanding the editorial bundle's
 * source manifest. Does NOT auto-remove competing styles: identical selector
 * strings do not establish equivalent effects (media, layers, supports,
 * specificity, custom properties, and relative stylesheet position matter).
 *
 * npm run css:conflicts
 * npm run css:conflicts -- --json
 */
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const postcss=require('postcss');
const html=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('assets/style-sources.json','utf8'));
const bundle='assets/ae-editorial-bundle.css';
const read=filename=>fs.readFileSync(filename,'utf8');
const sources=[];
const tags=/<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
for(const match of html.matchAll(tags)){
  const tag=match[0];
  if(/^<style\b/i.test(tag)){
    const id=tag.match(/\bid=["']([^"']+)["']/i)?.[1]||'anonymous';
    sources.push({file:'index.html#'+id,content:tag.replace(/^<style\b[^>]*>/i,'').replace(/<\/style\s*>$/i,'')});
    continue;
  }
  if(!/\brel=["']stylesheet["']/i.test(tag))continue;
  const url=tag.match(/\bhref=["']([^"']+)["']/i)?.[1]?.split('?')[0];
  if(!url?.startsWith('assets/'))continue;
  if(url===bundle){
    for(const file of manifest)sources.push({file,content:read(file)});
  }else sources.push({file:url,content:read(url)});
}
const selectorDeclarations=new Map();
const exactRuleCopies=[];
const duplicateDeclarations=[];
let rules=0;
let declarations=0;
for(const [order,source] of sources.entries()){
  const root=postcss.parse(source.content,{from:source.file});
  const localRules=new Map();
  root.walkRules(rule=>{
    if(rule.parent?.type==='atrule'&&/-?keyframes$/i.test(rule.parent.name))return;
    rules++;
    const context=[];
    for(let node=rule.parent;node&&node.type!=='root';node=node.parent){
      if(node.type==='atrule')context.unshift('@'+node.name+' '+node.params.replace(/\s+/g,' ').trim());
    }
    const normalizedSelector=rule.selector.replace(/\s+/g,' ').trim();
    const scope=context.join(' / ');
    const decl=rule.nodes.filter(node=>node.type==='decl');
    const signature=scope+' | '+normalizedSelector;
    const orderedDecls=decl.map(d=>d.prop.toLowerCase()+':'+d.value.trim()+(d.important?'!important':''));
    const full=signature+' | '+orderedDecls.join(';');
    if(localRules.has(full)){
      exactRuleCopies.push({
        file:source.file,selector:normalizedSelector.slice(0,130),
        scope,previousLine:localRules.get(full),line:rule.source?.start?.line||0
      });
    } else localRules.set(full,rule.source?.start?.line||0);
    const previouslySeen=new Set();
    for(const d of decl){
      declarations++;
      const value=d.value.trim()+(d.important?'!important':'');
      const key=d.prop.toLowerCase()+'|'+value;
      if(previouslySeen.has(key))duplicateDeclarations.push({
        file:source.file,line:d.source?.start?.line||0,selector:normalizedSelector.slice(0,130),
        property:d.prop,value:value.slice(0,120)
      });
      previouslySeen.add(key);
      const csskey=signature+' | '+d.prop.toLowerCase();
      const entry=selectorDeclarations.get(csskey)||[];
      entry.push({file:source.file,value,order});
      selectorDeclarations.set(csskey,entry);
    }
  });
}
let competingProperties=0;
let identicalProperties=0;
const conflicts=[];
for(const [key,entries] of selectorDeclarations){
  if(entries.length<2)continue;
  const values=[...new Set(entries.map(e=>e.value))];
  const files=[...new Set(entries.map(e=>e.file))];
  if(values.length===1){identicalProperties++;continue;}
  competingProperties++;
  // This is an inventory, NOT a claim that earlier declarations are wrong.
  if(files.length>1){
    conflicts.push({signature:key.slice(0,210),sources:files.slice(0,6),values:values.slice(0,4)});
  }
}
const sortedConflicts=conflicts.sort((a,b)=>b.sources.length-a.sources.length||a.signature.localeCompare(b.signature));
const report={
  cssSourcesInLoadOrder:sources.length,rules,declarations,
  distinctSelectorProperties:selectorDeclarations.size,
  repeatedIdenticalSelectorProperties:identicalProperties,
  competingSelectorProperties:competingProperties,
  sameScopeExactRuleCopies:exactRuleCopies,
  identicalDeclarationsWithinOneRule:duplicateDeclarations,
  competingExamples:sortedConflicts.slice(0,25),
  notes:'Potential conflicts require manual cascade review. Exact copies still need context and browser QA before removal.'
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
  console.log('AE SPORTS CSS phase 5 (READ-ONLY; no CSS rewritten)');
  console.log('Sources: '+report.cssSourcesInLoadOrder+', rules: '+rules+', declarations: '+declarations);
  console.log('Same-scope repeated exact rules: '+exactRuleCopies.length);
  for(const x of exactRuleCopies.slice(0,30))console.log('  '+x.file+':'+x.previousLine+' → '+x.line+' | '+x.scope+' | '+x.selector);
  console.log('Redundant identical declarations within one rule: '+duplicateDeclarations.length);
  for(const x of duplicateDeclarations.slice(0,15))console.log('  '+x.file+':'+x.line+' | '+x.selector+' | '+x.property+': '+x.value);
  console.log('Potentially competing selector/property pairs: '+competingProperties);
  for(const x of sortedConflicts.slice(0,15))console.log('  '+x.signature+' | '+x.sources.join(' → '));
  console.log('Use --json for details; competing rules are never removed automatically.');
}
