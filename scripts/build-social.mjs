import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function articlePage(article,base){
 if(!/^[a-zA-Z0-9_-]+$/.test(String(article.id)))throw Error('Invalid permanent article ID');
 const url=new URL(`articles/${article.id}/`,base).href;
 const image=/^https:\/\//i.test(article.image||'')?article.image:new URL('assets/social-card.png',base).href;
 const title=String(article.title||'Publicación');const summary=String(article.summary||'');
 const dest=new URL(base);dest.searchParams.set('article',article.id);
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | AE SPORTS</title><link rel="canonical" href="${escape(url)}"><meta name="description" content="${escape(summary)}"><meta property="og:type" content="article"><meta property="og:site_name" content="AE SPORTS"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(summary)}"><meta property="og:image" content="${escape(image)}"><meta property="og:url" content="${escape(url)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(summary)}"><meta name="twitter:image" content="${escape(image)}"></head><body><main><p>AE SPORTS</p><h1>${escape(title)}</h1><img style="max-width:100%" src="${escape(image)}" alt=""><p>${escape(summary)}</p><a href="${escape(dest.href)}">Leer publicación y comentarios</a></main><script>const target=${JSON.stringify(dest.href).replaceAll('<','\\u003c')};const u=new URL(target);const c=new URL(location.href).searchParams.get('comment');if(c)u.searchParams.set('comment',c);location.replace(u.href);</script></body></html>`;
}
export async function build({out='dist',articles,config}={}){
 config??=JSON.parse(await fs.readFile('site.config.json','utf8'));const base=new URL(config.url);if(base.protocol!=='https:')throw Error('HTTPS canonical URL required');
 if(!base.pathname.endsWith('/'))throw Error('Base URL must end in /');
 if(!articles){articles=[];for(let offset=0;;offset+=200){const res=await fetch(`${config.supabaseUrl}/rest/v1/articles?select=id,title,summary,image&is_public=eq.true&order=id&offset=${offset}&limit=200`,{headers:{apikey:config.publishableKey}});if(!res.ok)throw Error('Public article export failed: '+res.status);const batch=await res.json();if(!Array.isArray(batch))throw Error('Invalid export');articles.push(...batch);if(batch.length<200)break;}}
 await fs.mkdir(out,{recursive:true});
 // Remove only generated article pages: unpublished articles must not survive a rebuild.
 await fs.rm(path.join(out,'articles'),{recursive:true,force:true});
 await fs.rm(path.join(out,'CNAME'),{force:true});
 await fs.cp('assets',path.join(out,'assets'),{recursive:true});
 let home=await fs.readFile('index.html','utf8');home=home.replaceAll('https://eduardcarrera00-pixel.github.io/RCM-Sports/',base.href);await fs.writeFile(path.join(out,'index.html'),home);
 await fs.writeFile(path.join(out,'.nojekyll'),'');
 const fallback=JSON.stringify(base.href).replaceAll('<','\\u003c');
 await fs.writeFile(path.join(out,'404.html'),`<!doctype html><html lang="es"><meta charset="utf-8"><title>AE SPORTS</title><p>Abriendo publicación…</p><script>const b=${fallback};const m=location.pathname.match(new RegExp('/articles/([a-zA-Z0-9_-]+)/?$'));if(m){const u=new URL(b);u.searchParams.set('article',m[1]);const c=new URL(location.href).searchParams.get('comment');if(c)u.searchParams.set('comment',c);location.replace(u.href);}else document.body.textContent='Publicación no encontrada.';</script></html>`);
 const urls=[base.href];for(const a of articles){const folder=path.join(out,'articles',String(a.id));const html=articlePage(a,base);await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'index.html'),html);urls.push(new URL(`articles/${a.id}/`,base).href);}
 await fs.writeFile(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${escape(u)}</loc></url>`).join('')}</urlset>`);
 await fs.writeFile(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml',base).href}\n`);
 // No unpurchased domain or CNAME is deployed. An approved custom URL enables CNAME.
 if(!base.hostname.endsWith('.github.io'))await fs.writeFile(path.join(out,'CNAME'),base.hostname+'\n');
 return articles.length;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log('Generated article pages:',await build());
