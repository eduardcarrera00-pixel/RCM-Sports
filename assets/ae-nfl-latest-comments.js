/* Recent public article comments for NFL and Fútbol. Reuses existing comment links and RLS view. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const count=4;
  let request=0,lastKey='',lastLoad=0;
  function node(tag,text,cls){
    const n=document.createElement(tag);
    if(text!==undefined)n.textContent=String(text);
    if(cls)n.className=cls;
    return n;
  }
  function state(message,retry=false){
    const list=$('aeNflLatestCommentsList');
    list.replaceChildren();
    $('aeNflLatestCommentsStatus').textContent=message;
    if(retry){
      const button=node('button','Volver a intentar','rcm-button');button.type='button';
      button.onclick=()=>refresh(true);list.append(button);
    }
  }
  async function refresh(force=false){
    const root=$('aeNflLatestComments');if(!root)return;
    const section=typeof currentCategory==='undefined'?'':currentCategory;
    const active=(section==='NFL'&&document.body.classList.contains('ae-is-nfl'))||
      (section==='Fútbol'&&document.body.classList.contains('ae-is-football'));
    root.hidden=!active;
    if(!active){request++;lastKey='';return;}
    const stories=typeof articles==='undefined'?[]:articles.filter(a=>a.remote&&a.category===section);
    const ids=[...new Set(stories.map(a=>String(a.id)))];
    const key=section+':'+ids.join(',');
    if(!force&&key===lastKey&&Date.now()-lastLoad<15000)return;
    lastKey=key;lastLoad=Date.now();const seq=++request;
    state('Cargando últimos comentarios…');
    if(!ids.length){state('Todavía no hay comentarios en noticias de '+section+'.');return;}
    try{
      if(typeof db==='undefined'||!db)throw Error('Sin conexión');
      const rows=[];
      // Bound URL length while keeping the newest comments across every article in the active sport.
      for(let i=0;i<ids.length;i+=50){
        const {data,error}=await db.from('rcm_comment_totals')
          .select('id,article_id,article_title,author,body,created_at')
          .in('article_id',ids.slice(i,i+50))
          .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(count);
        if(error)throw error;
        if(seq!==request)return;
        rows.push(...(data||[]));
      }
      if(seq!==request)return;
      const allowed=new Set(ids);
      const recent=rows.filter(c=>allowed.has(String(c.article_id)))
        .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id).localeCompare(String(a.id)))
        .slice(0,count);
      if(!recent.length){state('Todavía no hay comentarios en noticias de '+section+'.');return;}
      $('aeNflLatestCommentsStatus').textContent='';
      const list=$('aeNflLatestCommentsList');list.replaceChildren();
      for(const comment of recent){
        const card=node('article',undefined,'ae-nfl-comment-card');
        const link=node('a',undefined,'ae-nfl-comment-link');
        const url=articleURL(comment.article_id,comment.id);
        link.href=url;
        link.append(node('h3',comment.article_title||stories.find(a=>String(a.id)===String(comment.article_id))?.title||'Noticia de '+section),
          node('blockquote',comment.body||''),
          node('span',comment.author||'Aficionado','ae-nfl-comment-author'),
          node('span','Ver comentario →','ae-nfl-comment-open'));
        link.addEventListener('click',async event=>{
          if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
          event.preventDefault();history.pushState({},'',url);await openArticleFromShareLink();
        });
        card.append(link);list.append(card);
      }
    }catch{
      if(seq===request){lastKey='';state('No pudimos cargar los últimos comentarios.',true);}
    }
  }
  window.refreshAeNflLatestComments=refresh;
  document.addEventListener('DOMContentLoaded',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
