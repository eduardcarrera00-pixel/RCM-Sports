import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {articlePage,build} from '../scripts/build-social.mjs';
const a={id:'article-fixture',title:'Título " <script>bad()</script>',summary:'Resumen & más',image:'https://example.test/real-image.png'};
const base='https://example.test/';const html=articlePage(a,base);
assert.ok(html.includes('property="og:image" content="https://example.test/real-image.png"'));
assert.ok(html.includes('property="og:title" content="Título &quot; &lt;script&gt;bad()&lt;/script&gt;"'));
assert.ok(html.includes('https://example.test/articles/article-fixture/'));assert.ok(html.includes('?article=article-fixture'));assert.ok(!html.includes('<script>bad()'));
assert.throws(()=>articlePage({...a,id:'../../evil'},base));assert.ok(articlePage({...a,image:'javascript:bad()'},base).includes('assets/social-card.png'));
const out=await fs.mkdtemp(path.join(os.tmpdir(),'ae-social-'));
try{
 await build({out,articles:[a],config:{url:base}});assert.equal((await fs.readFile(path.join(out,'CNAME'),'utf8')).trim(),'example.test');assert.match(await fs.readFile(path.join(out,'articles',a.id,'index.html'),'utf8'),/og:title/);
 await build({out,articles:[],config:{url:'https://eduardcarrera00-pixel.github.io/RCM-Sports/'}});await assert.rejects(()=>fs.access(path.join(out,'articles',a.id)));await assert.rejects(()=>fs.access(path.join(out,'CNAME')));
 const home=await fs.readFile(path.join(out,'index.html'),'utf8');assert.match(home,/<title>AE SPORTS/);assert.match(home,/property="og:image"/);
}finally{await fs.rm(out,{recursive:true,force:true});}
console.log('PASS social build: article-specific no-JS OG, escaping, canonical, historic-ID redirect, unsafe image fallback, unpublished-page cleanup, root/subpath domain configuration.');
