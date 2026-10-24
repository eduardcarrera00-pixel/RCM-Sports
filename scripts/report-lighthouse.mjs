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
  requests:(audits['network-requests']?.details?.items||[])
    .filter(item=>item.url&&Number.isFinite(Number(item.transferSize)))
    .map(item=>({url:item.url,bytes:Number(item.transferSize)||0}))
    .sort((a,b)=>b.bytes-a.bytes).slice(0,8),
  finalUrl:result.finalDisplayedUrl||result.finalUrl||'',
  version:result.lighthouseVersion||''
 };
});
const [mobile,desktop]=data;
const kb=n=>n?Math.round(n/1024)+' KB':'—';
const row=(name,m)=>'| '+name+' | '+m.score+'/100 | '+m.fcp+' | '+m.lcp+' | '+m.tbt+' | '+m.cls+' | '+kb(m.bytes)+' |';
function resourceLabel(url){
 try{
  const parsed=new URL(url);
  return parsed.hostname==='127.0.0.1' ? parsed.pathname : parsed.hostname+parsed.pathname.slice(0,90);
 }catch{return String(url).slice(0,95);}
}
const largest=(device,data)=>[
  '#### '+device+': largest transferred resources',
  ...(data.requests.length
    ? data.requests.map(item=>'- '+resourceLabel(item.url)+' — '+kb(item.bytes))
    : ['- Resource-level transfer data unavailable in this Lighthouse run.']),
  ''
];
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
 '- Source tested: '+mobile.finalUrl+' (mobile), '+desktop.finalUrl+' (desktop).',
 '',
 ...largest('Mobile',mobile),
 ...largest('Desktop',desktop)
].join('\n')+'\n';
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
