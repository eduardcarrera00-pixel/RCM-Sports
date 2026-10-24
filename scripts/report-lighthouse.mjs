/**
 * CAM SPORTS Lighthouse lab baseline reporter.
 * Usage: node scripts/report-lighthouse.mjs lighthouse/mobile.json lighthouse/desktop.json
 * Chrome lab scores vary by environment: report them; do not impose a fragile pass threshold.
 */
import fs from 'node:fs';

const files=process.argv.slice(2);
if(files.length!==2)throw Error('Provide mobile and desktop Lighthouse JSON reports');
const data=files.map(path=>{
 const result=JSON.parse(fs.readFileSync(path,'utf8'));
 if(result.runtimeError)throw Error('Lighthouse failed: '+result.runtimeError.message);
 const audits=result.audits||{};
 const metric=id=>audits[id]?.displayValue||'—';
 const score=result.categories?.performance?.score;
 if(typeof score!=='number')throw Error('Missing performance score in '+path);
 return {
  score:Math.round(score*100),
  fcp:metric('first-contentful-paint'),
  lcp:metric('largest-contentful-paint'),
  tbt:metric('total-blocking-time'),
  cls:metric('cumulative-layout-shift'),
  speedIndex:metric('speed-index'),
  bytes:Number(audits['total-byte-weight']?.numericValue)||0,
  finalUrl:result.finalDisplayedUrl||result.finalUrl||'',
  version:result.lighthouseVersion||''
 };
});
const [mobile,desktop]=data;
const kb=n=>n?Math.round(n/1024)+' KB':'—';
const row=(name,m)=>'| '+name+' | '+m.score+'/100 | '+m.fcp+' | '+m.lcp+' | '+m.tbt+' | '+m.cls+' | '+kb(m.bytes)+' |';
const report=[
 '# CAM SPORTS — Lighthouse lab baseline',
 '',
 '| Device | Performance | FCP | LCP | TBT | CLS | Network bytes |',
 '|---|---:|---:|---:|---:|---:|---:|',
 row('Mobile',mobile),
 row('Desktop',desktop),
 '',
 '- These are **synthetic lab measurements**, not real-user field data.',
 '- Tested on local static source (this exact commit), cold storage / first visit, with the welcome modal enabled.',
 '- Network conditions, CDN availability and runner hardware can change scores; compare trends before changing the UI.',
 '- Lighthouse version: '+(mobile.version||'unknown')+'.',
 '- Source tested: '+mobile.finalUrl+' (mobile), '+desktop.finalUrl+' (desktop).'
].join('\n')+'\n';
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
