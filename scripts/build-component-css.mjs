/**
 * AE SPORTS · Component stylesheet groups.
 *
 * Concatenates ONLY CSS links that were adjacent in index.html, in the same
 * order, without rewriting any rule or its relative asset URL.
 *
 * node scripts/build-component-css.mjs           (generate)
 * node scripts/build-component-css.mjs --check   (verify without writes)
 */
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/component-css-groups.json'),'utf8'));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const check=process.argv.includes('--check');
let failures=0;
let bytes=0;
let built=0;
for(const group of manifest.groups){
  const {output,sources,component}=group;
  if(!Array.isArray(sources)||sources.length!==2||!output.startsWith('assets/')) {
    throw Error('Invalid CSS group: '+JSON.stringify(group));
  }
  if(new Set(sources).size!==sources.length||sources.some(p=>!p.startsWith('assets/'))) {
    throw Error('Invalid or duplicate CSS source paths in '+output);
  }
  // The physical directory of the result equals that of every input, so
  // relative url() references retain the same meaning.
  if(sources.some(p=>path.dirname(p)!==path.dirname(output))) {
    throw Error('Different asset base paths are not safe to combine: '+output);
  }
  for(const source of sources){
    const data=read(source);
    const forbidden=['@import','@charset','@namespace','@layer','@font-face','@property','@keyframes'];
    if(forbidden.some(word=>new RegExp('(^|\\n)\\s*'+word+'\\b','i').test(data))) {
      throw Error('CSS at-rule requires individual cascade review: '+source);
    }
    postcss.parse(data,{from:source}); // Reject invalid CSS.
  }
  // The index can reference the source pair (initial migration) or generated
  // output, but must not reorder sources in the HTML.
  const links=[...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g)]
    .map(match=>match[1].split('?')[0]);
  const indexes=sources.map(p=>links.indexOf(p));
  const destination=links.indexOf(output);
  if(destination===-1 && !(indexes[0]!==-1&&indexes[1]===indexes[0]+1)) {
    throw Error('CSS group sources must be adjacent in head: '+output);
  }
  if(destination>=0 && indexes.some(idx=>idx>=0)) {
    throw Error('Individual CSS source still linked alongside group: '+output);
  }
  const css=sources.map(source=>`/* AE SPORTS component source: ${source} */\n${read(source)}`).join('\n')+'\n';
  postcss.parse(css,{from:output});
  const target=path.join(root,output);
  if(check){
    if(!fs.existsSync(target)||read(output)!==css) {
      console.error('Stale generated CSS: '+output);
      failures++;
    }
  }else {
    fs.writeFileSync(target,css);
  }
  bytes+=Buffer.byteLength(css);
  built++;
  console.log((check?'Checked ':'Generated ')+component+' → '+output);
}
if(failures)process.exitCode=1;
console.log(`Component groups: ${built}, CSS output: ${Math.round(bytes/1024)} KiB; status: ${failures?'STALE':'OK'}`);
