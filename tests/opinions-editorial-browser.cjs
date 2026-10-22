/* CAM SPORTS — Opiniones editorial, interactions + responsive regression.
 * Mocked published data only; no production Supabase writes.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('<section id="aeOpinions"');
  const end=html.indexOf('<section id="heroSection"',start);
  assert.ok(start>0&&end>start,'Find original Opiniones markup, not a replacement page');
  const section=html.slice(start,end);
  const magazine=html.match(/<style id="ae-opinions-reused-home-panels">([\s\S]*?)<\/style>/)?.[1]||'';
  const css=fs.readFileSync('assets/ae-opinions.css','utf8')+'\n'+magazine;
  const code=fs.readFileSync('assets/ae-opinions.js','utf8');
  const headline=i=>i===0?'Crónica del domingo en la NFL':'Historia deportiva '+i+' para CAM SPORTS';
  const stories=Array.from({length:12},(_,i)=>({
    id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    sport:i%3===0?'nfl':i%3===1?'futbol':'tenis',
    title:headline(i),summary:'Análisis deportivo original '+i,
    body:'Primer párrafo de la crónica deportiva.\n\nSegundo párrafo del artículo completo.',
    image:i%2===0?'https://img.test/'+i+'.webp':null,
    image_focus_x:50,image_focus_y:50,author:'Redacción '+i,
    is_published:true,featured:i===0,
    created_at:new Date(Date.UTC(2026,9,20-i,16)).toISOString(),edited_at:null
  }));
  stories.push({...stories[0],id:'00000000-0000-4000-8000-999999999990',is_published:false,title:'Borrador que no debe mostrarse'});
  const takes=Array.from({length:8},(_,i)=>({
    id:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    title:'Pronóstico de la comunidad '+i,body:'Análisis de la comunidad con argumentos propios para el encuentro.',
    author:'Opinador '+i,author_id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    sport:i%2?'football':'nfl',upvotes:i+1,downvotes:2,my_vote:0,
    created_at:new Date(Date.UTC(2026,9,19-i,12)).toISOString()
  }));
  const browser=await chromium.launch({headless:true});
  try{
    for(const [width,dark] of [[1366,false],[1366,true],[375,false],[390,true]]){
      const page=await browser.newPage({viewport:{width,height:860}});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<!doctype html><html class="'+(dark?'dark':'')+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body class="ae-is-opinions"><main id="mainContent">'+section+'</main><dialog id="aeOpinionReader"><button id="aeOpinionReaderClose"></button><div id="aeOpinionReaderBody"></div><div id="aeOpinionReaderAdmin" hidden></div></dialog><dialog id="aeOpinionEditor"></dialog></body></html>');
      await page.evaluate(({stories,takes})=>{
        window.__openedTakes=[];window.__openedArticles=[];window.__openedProfiles=[];window.__votes=[];window.__dbCalls=[];
        window.articles=[{id:700,title:'Noticia NFL enlazada',summary:'Noticia original',
          category:'NFL',body:'Texto original',image:null,author:'Periodista',createdAt:'2026-10-21T15:00:00Z'},
          {id:701,title:stories[0].title,summary:'Duplicado en noticias',category:'NFL',body:'',
          author:'Redacción',createdAt:'2026-10-20T16:00:00Z'}];
        window.openArticleModal=id=>window.__openedArticles.push(id);
        window.aeTakeReplies={open:t=>window.__openedTakes.push(t.id)};
        window.openAePublicProfile=id=>window.__openedProfiles.push(id);
        window.openUserAuthModal=()=>{};
        window.db={
          from(name){
            let data=name==='ae_opinions'?stories:name==='ae_opinion_views'?[{opinion_id:stories[0].id,views:41}]:[];
            let chain={};
            for(const action of ['select','order','limit','in','eq'])chain[action]=()=>chain;
            chain.then=(ok,bad)=>Promise.resolve({data,error:null}).then(ok,bad);
            return chain;
          },
          auth:{getUser:async()=>({data:{user:{id:'90000000-0000-4000-8000-000000000001'}}})},
          rpc:async(name,args)=>{
            window.__dbCalls.push(name);
            if(name==='ae_public_take_feed')return {data:takes,error:null};
            if(name==='ae_public_take_reply_counts'){
              return {data:args.p_take_ids.map(id=>({take_id:id,
                reply_count:takes.findIndex(t=>t.id===id)+1})),error:null};
            }
            if(name==='ae_vote_free_take'){window.__votes.push(args);return {data:true,error:null};}
            return {data:null,error:null};
          }
        };
      },{stories,takes});
      await page.addScriptTag({content:code});
      await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
      await page.evaluate(()=>{document.getElementById('aeOpinions').hidden=false;window.aeOpinions.show();});
      await page.waitForSelector('.ae-opinions-front-grid .ae-opinion-card');
      await page.waitForFunction(()=>document.querySelectorAll('#aeOpinionsDebatedContent .ae-opinions-take').length===5);
      assert.equal(await page.locator('.ae-opinions-front-grid .ae-opinion-card').count(),3);
      assert.equal(await page.locator('.ae-opinions-front-grid .is-lead').count(),1);
      assert.equal(await page.locator('.ae-opinions-recent-list .ae-opinion-card').count(),6);
      assert.equal(await page.locator('#aeOpinions .ae-opinion-card').count(),13,'All real unique stories stay reachable');
      assert.equal(await page.locator('.ae-opinion-card.is-draft').count(),0,'Drafts stay private');
      assert.equal(await page.locator('#aeOpinionsHighlights #aeOpinionsCommunitySlot').count(),1);
      assert.equal(await page.locator('#aeOpinionsHighlights #aeOpinionsTrendingSlot').count(),1);
      assert.equal(await page.locator('#aeOpinionsDebatedContent .ae-opinions-take').count(),5);
      assert.equal(await page.locator('#aeOpinionsDebatedContent .ae-opinions-take').first().getAttribute('data-take-id'),takes[7].id,
        'Most replies, rather than latest or arbitrary votes, determines debated order');
      assert.equal(await page.locator('#aeOpinionsSports .ae-opinions-sport-block').count(),3);
      const repeats=await page.locator('#aeOpinions .ae-opinion-card .ae-opinion-title').allInnerTexts();
      assert.equal(new Set(repeats).size,repeats.length,'No article is duplicated in the editorial layout');
      await page.locator('#aeOpinionsDebatedContent .ae-opinions-take-open').first().click();
      assert.equal((await page.evaluate(()=>window.__openedTakes)).length,1);
      await page.locator('#aeOpinionsDebatedContent .ae-opinions-take-author').first().click();
      assert.equal((await page.evaluate(()=>window.__openedProfiles)).length,1);
      await page.locator('#aeOpinionsDebatedContent .ae-opinions-take-vote').first().click();
      await page.waitForFunction(()=>window.__votes.length===1);
      assert.equal((await page.evaluate(()=>window.__votes))[0].p_value,1);
      const articleButton=page.locator('.ae-opinion-card').filter({hasText:'Noticia NFL enlazada'}).locator('.ae-opinion-open');
      await articleButton.click();
      assert.deepEqual(await page.evaluate(()=>window.__openedArticles),[700],'News opens its original reader');
      const hero=page.locator('.ae-opinions-front-grid .ae-opinion-open').first();
      const heroTitle=await hero.innerText();
      await hero.click();
      const readerDebug=await page.evaluate(()=>({
        open:document.getElementById('aeOpinionReader')?.open,
        text:document.getElementById('aeOpinionReaderBody')?.textContent?.slice(0,100),
        readerCount:document.querySelectorAll('#aeOpinionReader').length
      }));
      assert.equal(await page.locator('#aeOpinionReader[open]').count(),1,
        'Original editorial reader still opens: '+heroTitle+' '+JSON.stringify(readerDebug)+' errors: '+JSON.stringify(errors));
      assert.match(await page.locator('.ae-opinion-reader-text').innerText(),/Segundo párrafo/,'Original article body is unchanged');
      await page.locator('#aeOpinionReaderClose').click();
      await page.locator('#aeOpinionsTabs [data-sport="tenis"]').click();
      assert.equal(await page.locator('.ae-opinion-card').count(),4,'The selected sport filters editorials');
      assert.equal(await page.locator('#aeOpinionsSports .ae-opinions-sport-block').count(),0,'No duplicate category blocks when filtered');
      await page.locator('#aeOpinionsTabs [data-sport="todas"]').click();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<4,'No horizontal overflow ('+overflow+') at '+width);
      assert.deepEqual(errors,[],'Browser should not throw exceptions');
      await page.close();
    }
    console.log('PASS Opiniones: magazine cover, uniqueness, dates, debates, votes, reader, sports, responsive night/day.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
