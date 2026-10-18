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
  function card(kind,row,replyCounts){
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
    // Fila 1: perfil; fila 2: ▲ y ▼ a la izquierda, Responder a la derecha.
    const left=node('div',null,'ae-community-user-actions');
    left.append(node('span',row.author||'Usuario','ae-community-author'));
    const actions=node('div',null,'ae-community-controls');
    const votes=node('div',null,'ae-community-votes');
    for(const direction of [1,-1]){
      const b=node('button',null,'ae-community-vote '+(direction===1?'is-up':'is-down'));b.type='button';
      const count=direction===1?Number(row.upvotes||0):Number(row.downvotes||0);
      b.dataset.communityVote=String(row.id);b.setAttribute('aria-pressed',String(Number(row.my_vote)===direction));
      b.setAttribute('aria-label',(direction===1?'Votar a favor. ':'Votar en contra. ')+count+' votos');
      b.append(node('span',direction===1?'▲':'▼'),node('strong',String(count)));
      b.onclick=()=>vote(row,direction);b.disabled=votePending.has(String(row.id));votes.append(b);
    }
    // Replies to this exact comment, loaded from the public article discussion.
    const replyCount=replyCounts?.get(String(row.id));
    if(Number.isFinite(replyCount)){
      const badge=node('span',null,'ae-community-replies-count');
      badge.setAttribute('aria-label',replyCount===1?'1 respuesta':replyCount+' respuestas');
      badge.title=replyCount===1?'1 respuesta':replyCount+' respuestas';
      const symbol=node('i',null,'fa-regular fa-comment');
      symbol.setAttribute('aria-hidden','true');
      badge.append(symbol,node('strong',String(replyCount)));
      votes.append(badge);
    }
    const reply=node('button',null,'ae-community-reply');reply.type='button';
    reply.setAttribute('aria-label','Responder al comentario de '+(row.author||'Usuario'));
    const bubble=node('i',null,'fa-regular fa-comment');bubble.setAttribute('aria-hidden','true');
    reply.append(bubble,node('span','Responder'));reply.onclick=()=>openStory(row,true);
    actions.append(votes,reply);
    footer.append(left,actions);panel.append(footer);return panel;
  }

  // Use the same publicly visible, vote-aggregated comments as the old
  // single-leader RPC. Keep its ordering and show at most ten real entries.
  async function loadLeadersByVote(column){
    const {data,error}=await db.from('rcm_comment_totals')
      .select('id,article_id,parent_id,author,body,created_at,article_title,upvotes,downvotes,my_vote')
      .gt(column,0)
      .order(column,{ascending:false})
      .order('created_at',{ascending:false})
      .order('id',{ascending:false})
      .limit(10);
    if(error)throw error;
    return data||[];
  }

  // One batched read instead of one network request per displayed comment.
  async function loadReplyCounts(positive,negative){
    const ids=[...new Set([...positive,...negative].map(row=>String(row?.id||'')).filter(Boolean))];
    if(!ids.length)return new Map();
    try{
      const {data,error}=await db.from('comments').select('parent_id').in('parent_id',ids);
      if(error)throw error;
      const counts=new Map(ids.map(id=>[id,0]));
      for(const reply of data||[]){
        const parent=String(reply.parent_id||'');
        if(counts.has(parent))counts.set(parent,counts.get(parent)+1);
      }
      return counts;
    }catch(error){
      console.warn('No se pudo consultar el número de respuestas destacadas.',error);
      return null; // Do not display invented zeroes if the read failed.
    }
  }
  function scrollingLeaders(kind,rows,replyCounts){
    const questioned=kind==='questioned';
    const group=node('section',null,'ae-community-spotlight ae-community-scroll-group '+(questioned?'is-questioned':'is-supported'));
    const viewport=node('div',null,'ae-community-scroll-viewport');
    viewport.dataset.communityScroll=kind;
    viewport.tabIndex=0;
    viewport.setAttribute('role','list');
    viewport.setAttribute('aria-label',questioned?
      'Hasta 10 comentarios más cuestionados. Desplaza hacia abajo para verlos.':
      'Hasta 10 comentarios más apoyados. Desplaza hacia abajo para verlos.');
    for(const row of rows){
      // Reuse the existing card unchanged: article links, votes, author and
      // reply actions still point to the original comment and publication.
      const entry=card(kind,row,replyCounts);
      entry.className='ae-community-scroll-entry';
      entry.setAttribute('role','listitem');
      viewport.append(entry);
    }
    if(!rows.length){
      const empty=card(kind,null);
      empty.className='ae-community-scroll-entry';
      empty.setAttribute('role','listitem');
      viewport.append(empty);
    }
    group.append(viewport);
    return group;
  }
  // Una entrada completa debe caber en cada ventana con scroll vertical.
  // La altura se calcula usando el comentario más alto, no un recorte fijo.
  function fitCommunityViewports(){
    const target=document.getElementById('communityLeaders');
    if(!target)return;
    for(const viewport of target.querySelectorAll('[data-community-scroll]')){
      const cards=[...viewport.querySelectorAll(':scope > .ae-community-scroll-entry')];
      if(!cards.length)continue;
      const required=Math.max(260,...cards.map(card=>Math.ceil(card.getBoundingClientRect().height)))+5;
      viewport.style.setProperty('--ae-community-visible-card-height',required+'px');
    }
  }
  let fitQueued=false;
  function scheduleCommunityFit(){
    if(fitQueued)return;
    fitQueued=true;
    requestAnimationFrame(()=>{fitQueued=false;fitCommunityViewports();});
  }
  window.addEventListener('resize',scheduleCommunityFit,{passive:true});
  if(document.fonts?.ready)document.fonts.ready.then(scheduleCommunityFit);

  refreshCommunity=async function(){
    if(!db)return;
    const request=++communityRequest;
    const target=document.getElementById('communityLeaders');
    if(!target)return;
    // Votes and new comments reload this section. Keep both lists at the
    // positions readers were using, rather than jumping back to the top.
    const positions=new Map([...target.querySelectorAll('[data-community-scroll]')]
      .map(list=>[list.dataset.communityScroll,list.scrollTop]));
    try{
      const [supported,questioned]=await Promise.all([
        loadLeadersByVote('upvotes'),loadLeadersByVote('downvotes')
      ]);
      if(request!==communityRequest)return;
      const replyCounts=await loadReplyCounts(supported,questioned);
      if(request!==communityRequest)return;
      target.replaceChildren(
        scrollingLeaders('supported',supported,replyCounts),
        scrollingLeaders('questioned',questioned,replyCounts)
      );
      for(const list of target.querySelectorAll('[data-community-scroll]')){
        list.scrollTop=positions.get(list.dataset.communityScroll)||0;
      }
      scheduleCommunityFit();
    }catch{
      if(request===communityRequest)target.replaceChildren(node('p','No pudimos cargar los comentarios destacados. Volveremos a intentarlo.','ae-community-empty'));
    }
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>refreshCommunity(),{once:true});
  else refreshCommunity();
})();