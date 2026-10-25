import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import seo from '../assets/cam-article-seo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://zahuhmvmqvxaunqebqaa.supabase.co/rest/v1/articles';
// This is the site's public publishable key. RLS permits only published articles.
const PUBLIC_KEY = 'sb_publishable_QK4qV6totowE4KjolNANrQ_O46olHYg';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchArticles(fetcher = fetch) {
  const articles = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(API);
    url.search = new URLSearchParams({
      select:'id,title,summary,body,image,author,created_at,is_public',
      is_public:'eq.true', order:'id.asc', limit:'1000', offset:String(offset)
    });
    const response = await fetcher(url, {headers:{apikey:PUBLIC_KEY}, signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('Cannot read published news: HTTP ' + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || row.is_public !== true || !UUID.test(String(row.id)) || typeof row.title !== 'string')) {
      throw Error('Unexpected published news response; existing pages were preserved.');
    }
    articles.push(...rows);
    if (rows.length < 1000) break;
  }
  if (new Set(articles.map(a => a.id)).size !== articles.length) throw Error('Duplicate public article IDs');
  return articles;
}
export function previewHTML(article) {
  if (article.is_public !== true || !UUID.test(String(article.id))) throw Error('Only public article UUIDs can have previews');
  const data = seo.describe(article);
  const url = new URL(seo.previewPath(article.id), seo.defaults.url).href;
  const meta = (name, value, property = false) => '    <meta ' + (property ? 'property' : 'name') + '="' + name + '" content="' + escape(value) + '">';
  return '<!doctype html>\n<html lang="es">\n<head>\n    <meta charset="utf-8">\n    <meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '    <title>' + escape(data.title) + '</title>\n'
    + '    <link rel="canonical" href="' + escape(data.url) + '">\n'
    + [meta('description',data.description),meta('robots','noindex,follow'),
      meta('og:type','article',true),meta('og:site_name','CAM SPORTS',true),meta('og:locale','es_ES',true),
      meta('og:title',data.title,true),meta('og:description',data.description,true),meta('og:url',url,true),meta('og:image',data.image,true),
      meta('twitter:card','summary_large_image'),meta('twitter:title',data.title),meta('twitter:description',data.description),meta('twitter:image',data.image),
      ...(data.published ? [meta('article:published_time',data.published,true)] : []),
      meta('article:author',data.author,true)].join('\n')
    + '\n    <script>location.replace(' + json(data.url) + ');</script>\n</head>\n<body>\n    <p><a href="' + escape(data.url) + '">Leer ' + escape(seo.text(article.title,180)) + ' en CAM SPORTS</a></p>\n</body>\n</html>\n';
}
export async function build({root = ROOT, fetcher = fetch} = {}) {
  // Read and validate the complete result before touching any generated files.
  const articles = await fetchArticles(fetcher);
  const pages = articles.map(article => ({article, html:previewHTML(article)}));
  const ids = articles.map(a => a.id.toLowerCase()).sort();
  const directory = path.join(root,'compartir/noticias');
  await fs.mkdir(directory,{recursive:true});
  await fs.mkdir(path.join(root,'assets'),{recursive:true});
  for (const {article, html} of pages) {
    const target = path.join(directory,article.id.toLowerCase());
    await fs.mkdir(target,{recursive:true});
    await fs.writeFile(path.join(target,'index.html'),html);
  }
  // Remove only stale pages owned by this generator, never other site content.
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if (entry.isDirectory() && UUID.test(entry.name) && !ids.includes(entry.name)) await fs.rm(path.join(directory,entry.name),{recursive:true});
  }
  await fs.writeFile(path.join(root,'assets/cam-article-previews.json'),JSON.stringify({version:1,ids},null,2)+'\n');
  const urls = [seo.defaults.url,...articles.map(a => seo.articleURL(a.id))].sort();
  await fs.writeFile(path.join(root,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(url => '  <url><loc>' + escape(url) + '</loc></url>').join('\n') + '\n</urlset>\n');
  await fs.writeFile(path.join(root,'robots.txt'),'User-agent: *\nAllow: /\nSitemap: https://camsports.github.io/sitemap.xml\n');
  return ids;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = await build();
  console.log('Generated metadata, sharing previews and sitemap for ' + ids.length + ' published articles.');
}
