/**
 * AE SPORTS CSS inventory. Read-only; never rewrites styles or changes cascade.
 * Run: npm run css:audit       (human-readable)
 *      npm run css:audit -- --json
 *
 * Includes the 76 source sheets at the precise position where the editorial
 * bundle is linked; other links and inline <style> elements remain in order.
 * A repeated selector or bundled + standalone file is NOT automatically safe
 * to delete: cascade order, specificity and media conditions still matter.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const postcss=require('postcss'); // Installed as Tailwind's dependency.
const root=process.cwd();
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const bundle='assets/ae-editorial-bundle.css';
const bundled=JSON.parse(fs.readFileSync(path.join(root,'assets/style-sources.json'),'utf8'));
const sheets=[];
const missing=[];
const read=file=>{
  const absolute=path.join(root,file);
  if(!fs.existsSync(absolute)){missing.push(file);return null;}
  return fs.readFileSync(absolute,'utf8');
};
const add=(file,origin,body)=>{
  const css=body===undefined?read(file):body;
  if(css!==null)sheets.push({file,origin,css});
};
const tag=/<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
for(const match of html.matchAll(tag)){
  const str=match[0];
  if(/^<style/i.test(str)){
    const name=str.match(/\bid=["']([^"']+)["']/i)?.[1]||'anonymous';
    const css=str.replace(/^<style\b[^>]*>/i,'').replace(/<\/style\s*>$/i,'');
    add('index.html#'+name,'inline',css);
    continue;
  }
  if(!/\brel=["']stylesheet["']/i.test(str))continue;
  const url=str.match(/\bhref=["']([^"']+)["']/i)?.[1]?.split('?')[0];
  if(!url||!url.startsWith('assets/'))continue;
  if(url===bundle){
    for(const source of bundled)add(source,'bundle');
  }else add(url,'link');
}
const order=new Map();
const duplicates=new Map();
let selectorCount=0;
let ruleCount=0;
let repeatCount=0;
let byteCount=0;
const exactWithin=new Map();
for(const sheet of sheets){
  byteCount+=Buffer.byteLength(sheet.css,'utf8');
  if(sheet.origin==='bundle'||sheet.origin==='link'){
    const entry=order.get(sheet.file)||[];
    entry.push(sheet.origin);
    order.set(sheet.file,entry);
  }
  let ast;
  try{ast=postcss.parse(sheet.css,{from:sheet.file});}
  catch(error){
    console.error('Could not parse '+sheet.file+': '+error.message);
    process.exitCode=1;
    continue;
  }
  const seenHere=new Set();
  ast.walkRules(rule=>{
    if(rule.parent?.type==='atrule'&&/-?keyframes$/i.test(rule.parent.name))return;
    ruleCount++;
    const context=[];
    for(let node=rule.parent;node&&node.type!=='root';node=node.parent){
      if(node.type==='atrule')context.unshift('@'+node.name+' '+node.params);
    }
    const selector=rule.selector.trim();
    const signature=context.join(' / ')+' | '+selector;
    const declarations=(rule.nodes||[]).filter(node=>node.type==='decl')
      .map(node=>node.prop+':'+node.value+(node.important?'!important':'')).join(';');
    const lookup=sheet.file+' | '+signature+' | '+declarations;
    if(seenHere.has(lookup))exactWithin.set(lookup,(exactWithin.get(lookup)||1)+1);
    else seenHere.add(lookup);
    if(order.size>=0){
      const record=duplicates.get(signature)||new Set();
      record.add(sheet.file);
      duplicates.set(signature,record);
    }
    selectorCount++;
  });
}
const doubleLoaded=[...order.entries()].filter(([,origin])=>origin.length>1)
  .map(([file,origins])=>({file,origins})).sort((a,b)=>a.file.localeCompare(b.file));
const repeatedAcrossSources=[...duplicates.entries()].filter(([,sources])=>sources.size>1)
  .map(([selector,sources])=>({selector,sources:[...sources].slice(0,8)}))
  .sort((a,b)=>b.sources.length-a.sources.length||a.selector.localeCompare(b.selector));
const exactRuleCandidates=[...exactWithin.entries()]
  .map(([key,occurrences])=>({rule:key.slice(0,210),occurrences}));
const report={
  status:missing.length?'incomplete':'ok',
  bundleSourceCount:bundled.length,
  linkedStylesheetCount:[...order.values()].reduce((n,v)=>n+v.filter(x=>x==='link').length,0),
  inlineStyleCount:sheets.filter(x=>x.origin==='inline').length,
  cascadeSheetCount:sheets.length,
  expandedStylesheetBytes:byteCount,
  parsedRules:ruleCount,
  doubleLoaded,
  duplicateSelectorAcrossSourcesCount:repeatedAcrossSources.length,
  duplicateSelectorSamples:repeatedAcrossSources.slice(0,16),
  exactRepeatedRuleCandidates:exactRuleCandidates,
  missing
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
  console.log('AE SPORTS CSS inventory (read-only)');
  console.log('Bundle sources: '+report.bundleSourceCount+
    ' | Separate CSS links: '+report.linkedStylesheetCount+
    ' | Inline styles: '+report.inlineStyleCount);
  console.log('Expanded CSS: '+Math.round(report.expandedStylesheetBytes/1024)+' KiB | Rules: '+ruleCount);
  console.log('Same file loaded twice: '+doubleLoaded.length);
  for(const row of doubleLoaded)console.log('  '+row.file+' ('+row.origins.join(' + ')+')');
  console.log('Selectors found in multiple source files: '+repeatedAcrossSources.length+
    ' (NOT necessarily redundant)');
  console.log('Exact rule copies within individual sources: '+exactRuleCandidates.length);
  if(missing.length)console.error('Missing CSS files: '+missing.join(', '));
  console.log('Use --json for a machine-readable report.');
}
if(missing.length)process.exitCode=1;
