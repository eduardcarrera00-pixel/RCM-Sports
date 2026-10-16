/* AE SPORTS · Home community spotlight behavior.
   Reuses the existing Supabase comment RPCs and article modal. */
(function(){
  function articleFor(row){
    return articles.find(a=>String(a.id)===String(row?.article_id)||String(a.legacyId||'')===String(row?.article_id||''));
  }
  function categoryFor(row){
    const value=String(articleFor(row)?.category||'Comunidad').trim();
    if(value==='Fútbol Americano Colegial') return 'Colegial';
    if(value==='Básquetbol') return 'NBA';
    return value||'Comunidad';
  }
  async function openStory(row,reply){
    if(!row?.article_id)return;
    if(reply&&!currentUser){openUserAuthModal();return;}
    const url=articleURL(row.article_id,row.id);
    history.pushState({},'',url);
    await openArticleFromShareLink();
    if(!reply)return;
    let tries=0;
    const seek=()=>{
      const comment=document.getElementById('comment-'+row.id);
      const trigger=comment?[...comment.querySelectorAll('button')].find(b=>b.textContent.trim()==='Responder'):null;
      if(trigger){comment.scrollIntoView({block:'center',behavior:'auto'});trigger.click();return;}
      if(++tries<20)setTimeout(seek,100);
    };
    seek();
  }
  async function vote(row,direction){
    if(!currentUser){openUserAuthModal();return;}
    const key=String(row?.id||'');
    if(!key||votePending.has(key))return;
    votePending.add(key);
    document.querySelectorAll('[data-community-vote]').forEach(button=>{
      if(button.dataset.communityVote===key)button.disabled=true;
    });
    try{
      const desired=Number(row.my_vote)===direction?0:direction;
      const {error}=await db.rpc('rcm_set_comment_vote',{p_comment_id:key,p_vote:desired});
      if(error)throw error;
      row.my_vote=desired;
      await Promise.all([refreshCommunity(),refreshArticleStats()]);
      if(String(activeModalArticleId)===String(row.article_id))await loadCommentsFromSupabase(row.article_id,true);
    }catch{
      notifyCommunity('No pudimos confirmar el voto. Vuelve a intentarlo.',true);
    }finally{
      votePending.delete(key);
      document.querySelectorAll('[data-community-vote]').forEach(button=>{
        if(button.dataset.communityVote===key)button.disabled=false;
      });
    }
  }
  function icon(name){
    const i=node('i',null,'fa-solid '+name);i.setAttribute('aria-hidden','true');return i;
  }
  function card(kind,row){
    const questioned=kind==='questioned';
    const panel=node('article',null,'ae-community-spotlight '+(questioned?'is-questioned':'is-supported'));
    if(!row){
      panel.append(node('p',questioned?'Todavía no hay un comentario suficientemente cuestionado.':'Todavía no hay un comentario suficientemente apoyado.','ae-community-empty'));
      return panel;
    }
    const head=node('div',null,'ae-community-card-head');
    const signal=node('span',null,'ae-community-signal');
    signal.append(icon(questioned?'fa-arrow-down':'fa-trophy'));
    head.append(signal,node('span',categoryFor(row),'ae-community-category'),node('span',questioned?'Más cuestionado':'Más apoyado','sr-only'));
    panel.append(head);

    const story=node('a',row.article_title||'Ver publicación','ae-community-story-link');
    story.href=articleURL(row.article_id,row.id);
    story.onclick=async event=>{
      if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();await openStory(row,false);
    };
    panel.append(story);

    const body=String(row.body||'').trim();
    panel.append(node('blockquote',body.length>185?body.slice(0,185).trimEnd()+'…':body,'ae-community-quote'));

    const footer=node('div',null,'ae-community-card-footer');
    const left=node('div',null,'ae-community-user-actions');
    left.append(node('span',row.author||'Usuario','ae-community-author'));
    const reply=node('button',null,'ae-community-reply');reply.type='button';
    reply.setAttribute('aria-label','Responder al comentario de '+(row.author||'Usuario'));
    const bubble=node('i',null,'fa-regular fa-comment');bubble.setAttribute('aria-hidden','true');
    reply.append(bubble,node('span','Responder'));reply.onclick=()=>openStory(row,true);left.append(reply);

    const votes=node('div',null,'ae-community-votes');
    for(const direction of [1,-1]){
      const b=node('button',null,'ae-community-vote '+(direction===1?'is-up':'is-down'));b.type='button';
      const count=direction===1?Number(row.upvotes||0):Number(row.downvotes||0);
      b.dataset.communityVote=String(row.id);b.setAttribute('aria-pressed',String(Number(row.my_vote)===direction));
      b.setAttribute('aria-label',(direction===1?'Votar a favor. ':'Votar en contra. ')+count+' votos');
      b.append(node('span',direction===1?'▲':'▼'),node('strong',String(count)));
      b.onclick=()=>vote(row,direction);b.disabled=votePending.has(String(row.id));votes.append(b);
    }
    footer.append(left,votes);panel.append(footer);return panel;
  }

  refreshCommunity=async function(){
    if(!db)return;
    const request=++communityRequest;
    const target=document.getElementById('communityLeaders');
    if(!target)return;
    try{
      const {data,error}=await db.rpc('rcm_community_leaders');
      if(error)throw error;
      if(request!==communityRequest)return;
      target.replaceChildren(card('supported',data?.supported),card('questioned',data?.questioned));
    }catch{
      if(request===communityRequest)target.replaceChildren(node('p','No pudimos cargar los comentarios destacados. Volveremos a intentarlo.','ae-community-empty'));
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>refreshCommunity(),{once:true});
  else refreshCommunity();
})();