/* AE SPORTS · Conversaciones persistentes para Takes, sin comentarios simulados. */
(() => {
  'use strict';
  let dialog, current = null, parentId = null, sequence = 0, sending = false, voting = false, replyVoting = false, viewerId = null, viewerReady = false;
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  function init() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'aeTakeDiscussion';
    dialog.className = 'ae-take-discussion';
    dialog.setAttribute('aria-labelledby','aeTakeDiscussionTitle');
    dialog.innerHTML = `
      <div class="ae-take-discussion-inner">
        <header class="ae-discussion-header">
          <div class="ae-discussion-titleblock"><h2 id="aeTakeDiscussionTitle"><button type="button" id="aeDiscussionAuthor">Aficionado</button> — Takes</h2></div>
          <button type="button" id="aeDiscussionClose" aria-label="Cerrar comentarios"><span aria-hidden="true"></span></button>
        </header>
        <section class="ae-discussion-subject">
          <strong id="aeDiscussionSubject"></strong>
          <span id="aeDiscussionSport" class="ae-discussion-sport"></span>
          <button type="button" id="aeDiscussionEditSport" hidden>Cambiar comunidad</button>
          <p id="aeDiscussionBody"></p>
          <div id="aeDiscussionVotes" class="ae-discussion-votes" aria-label="Votos del Take">
            <button type="button" id="aeDiscussionUp" aria-pressed="false">▲ Apoyar 0</button>
            <button type="button" id="aeDiscussionDown" aria-pressed="false">▼ Cuestionar 0</button>
          </div>
        </section>
        <section class="ae-discussion-thread" aria-labelledby="aeDiscussionCount">
          <h3 class="ae-discussion-counter" id="aeDiscussionCount">Comentarios</h3>
          <p id="aeDiscussionStatus" role="status" aria-live="polite"></p>
          <div id="aeDiscussionList" class="ae-discussion-list" aria-live="polite"></div>
        </section>
        <div class="ae-discussion-reply-target" id="aeDiscussionTarget" hidden><span id="aeDiscussionTargetName"></span><button id="aeDiscussionCancel" type="button">Cancelar respuesta</button></div>
        <form id="aeDiscussionForm"><label for="aeDiscussionText">Tu opinión</label><textarea id="aeDiscussionText" name="body" required minlength="2" maxlength="900" rows="3" placeholder="Responde a este Take con respeto…"></textarea><button type="submit" id="aeDiscussionSubmit">Publicar comentario <span aria-hidden="true">→</span></button></form>
      </div>`;
    document.body.append(dialog);
    $('aeDiscussionClose').addEventListener('click',()=>dialog.close());
    $('aeDiscussionAuthor').addEventListener('click',()=>{
      if(current?.author_id)openAuthorProfile(current.author_id);
    });
    $('aeDiscussionEditSport').addEventListener('click',()=>{
      if (current && window.aeTakeCategoryEdit) {
        window.aeTakeCategoryEdit.open(current, sport=>{
          current.sport=sport;
          displaySport(current);
          // Si el Take pasa a Fútbol, no mostrar la acción de cambiar comunidad.
          showEditIfOwner(current);
        });
      }
    });
    $('aeDiscussionCancel').addEventListener('click',()=>setParent(null));
    $('aeDiscussionUp').addEventListener('click',()=>vote(1));
    $('aeDiscussionDown').addEventListener('click',()=>vote(-1));
    dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{current=null;sequence++;setParent(null);});
    $('aeDiscussionForm').addEventListener('submit',post);
  }
  function setParent(reply) {
    parentId=reply?.id||null;
    const hint=$('aeDiscussionTarget');
    if(!hint)return;
    hint.hidden=!reply;
    $('aeDiscussionTargetName').textContent=reply?'Respondiendo a @'+reply.author:'';
    $('aeDiscussionText').placeholder=reply?'Escribe tu respuesta…':'Responde a este Take con respeto…';
    if(reply)$('aeDiscussionText').focus();
  }
  function openAuthorProfile(authorId){
    if(!authorId || typeof window.openAePublicProfile!=='function')return;
    // Navegar sin dejar dos ventanas superpuestas.
    dialog?.close();
    window.openAePublicProfile(authorId);
  }
  function render(comments, totals) {
    const list=$('aeDiscussionList');
    list.replaceChildren();
    $('aeDiscussionCount').textContent=comments.length===1?'1 comentario':comments.length+' comentarios';
    if(!comments.length) {
      list.append(el('p','Todavía nadie ha comentado. Abre la conversación.','ae-discussion-empty'));
      return;
    }
    const scores=new Map((totals||[]).map(t=>[String(t.reply_id),t]));
    const nodes=new Map();
    for(const r of comments) {
      const score=scores.get(String(r.id))||{upvotes:0,downvotes:0,my_vote:0,reply_count:0};
      const card=el('article',undefined,'ae-discussion-comment');
      const avatar=el('span',String(r.author||'Aficionado').trim().charAt(0).toUpperCase()||'A','ae-discussion-avatar');
      avatar.setAttribute('aria-hidden','true');
      const content=el('div',undefined,'ae-discussion-comment-content');
      const meta=el('div',undefined,'ae-discussion-meta');
      const authorId=r.author_id||r.user_id||null;
      const author=el(authorId?'button':'strong','@'+(r.author||'Aficionado'),authorId?'ae-discussion-author-link':undefined);
      if(authorId){
        author.type='button';
        author.title='Ver perfil de '+(r.author||'Aficionado');
        author.setAttribute('aria-label','Ver perfil y Takes de '+(r.author||'Aficionado'));
        author.addEventListener('click',()=>openAuthorProfile(authorId));
      }
      const time=el('time',new Date(r.created_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'}));
      try{time.dateTime=new Date(r.created_at).toISOString();}catch(_){}
      meta.append(author,time);
      content.append(meta,el('p',r.body,'ae-discussion-text'));
      const actions=el('div',undefined,'ae-discussion-actions ae-discussion-comment-controls');
      for(const [value,label,count] of [[1,'▲',score.upvotes],[-1,'▼',score.downvotes]]){
        const selected=Number(score.my_vote)===value;
        const button=el('button',label+' '+(Number(count)||0),'ae-discussion-comment-vote');
        button.type='button';
        button.setAttribute('aria-pressed',String(selected));
        button.setAttribute('aria-label',(value===1?'Apoyar':'Cuestionar')+' comentario de '+(r.author||'Aficionado')+': '+(Number(count)||0)+' votos');
        button.title=value===1?'Votar a favor':'Votar en contra';
        button.disabled=replyVoting||Boolean(viewerId&&authorId===viewerId);
        button.addEventListener('click',()=>voteComment(r,selected?0:value));
        actions.append(button);
      }
      const reply=el('button','Responder','ae-discussion-reply');
      reply.type='button';
      reply.addEventListener('click',()=>{
        const take=current,replyTo=r.parent_id&&nodes.has(r.parent_id)?nodes.get(r.parent_id).data:r;
        if(typeof aeRequestPublication==='function'){
          void aeRequestPublication('reply',()=>{
            if(!dialog?.open||current?.id!==take?.id)show(take,{focusComposer:true});
            setParent(replyTo);
          },()=>{if(dialog?.open)dialog.close();});
        }else if(typeof openUserAuthModal==='function')openUserAuthModal();
      });
      actions.append(reply);
      if(!r.parent_id){
        const count=Number(score.reply_count)||0;
        const badge=el('span',count+' '+(count===1?'respuesta':'respuestas'),'ae-discussion-reply-count');
        badge.setAttribute('aria-label',count+' respuestas a este comentario');
        actions.append(badge);
      }
      content.append(actions);
      card.append(avatar,content);
      nodes.set(r.id,{card,data:r});
    }
    for(const r of comments) {
      const entry=nodes.get(r.id);
      if(!entry)continue;
      const target=r.parent_id&&nodes.get(r.parent_id);
      if(target){
        entry.card.classList.add('ae-discussion-nested');
        target.card.append(entry.card);
      } else list.append(entry.card);
    }
  }
  async function voteComment(reply, value){
    if(replyVoting||!current?.id)return;
    const takeId=current.id;
    try{
      const result=await db.auth.getUser();
      if(!result.data?.user){
        if(typeof openUserAuthModal==='function')openUserAuthModal();
        return;
      }
      if(result.data.user.id===(reply.author_id||reply.user_id)){
        $('aeDiscussionStatus').textContent='No puedes votar tu propio comentario.';
        return;
      }
      replyVoting=true;
      const status=$('aeDiscussionStatus');
      status.textContent='Guardando voto…';
      const saved=await db.rpc('ae_set_take_reply_vote',{p_reply_id:reply.id,p_vote:value});
      if(saved.error)throw saved.error;
      replyVoting=false;
      if(dialog?.open&&current?.id===takeId)await load();
    }catch(err){
      $('aeDiscussionStatus').textContent='No se pudo guardar el voto. '+(err.message||'');
    }finally{
      replyVoting=false;
    }
  }
  async function load() {
    if(!current || !dialog?.open)return;
    const token=++sequence, takeId=current.id;
    $('aeDiscussionStatus').textContent='Cargando conversación…';
    try {
      if(typeof db==='undefined'||!db)throw Error('Sin conexión a la comunidad.');
      const [result, counts, session]=await Promise.all([
        db.rpc('ae_take_comment_thread',{p_take_id:takeId}),
        db.rpc('ae_take_reply_vote_totals',{p_take_id:takeId}),
        db.auth.getUser().catch(()=>({data:{user:null}}))
      ]);
      if(result.error)throw result.error;
      if(counts.error)throw counts.error;
      if(token!==sequence||current?.id!==takeId)return;
      viewerId=session.data?.user?.id||null;
      viewerReady=true;
      showVotes(current);
      render(result.data||[],counts.data||[]);
      $('aeDiscussionStatus').textContent='';
    } catch(err) {
      if(token===sequence)$('aeDiscussionStatus').textContent='No se pudieron cargar los comentarios. '+(err.message||'');
    }
  }
  async function post(event) {
    event.preventDefault();
    if(!current||sending)return;
    const takeId=current.id, text=$('aeDiscussionText').value.trim();
    if(text.length<2||text.length>900)return;
    sending=true;$('aeDiscussionSubmit').disabled=true;
    try {
      const session=await db.auth.getUser();
      if(!session.data?.user) {
        const take=current,replyTo=parentId,draft=text;
        if(typeof aeRequestPublication==='function'){
          await aeRequestPublication('reply',()=>{
            show(take,{focusComposer:true});
            $('aeDiscussionText').value=draft;
            if(replyTo){parentId=replyTo;$('aeDiscussionTarget').hidden=false;}
          },()=>{if(dialog?.open)dialog.close();});
        }else{
          dialog.close();
          if(typeof openUserAuthModal==='function')openUserAuthModal();
        }
        return;
      }
      const result=await db.rpc('ae_post_take_reply',{p_take_id:takeId,p_body:text,p_parent_id:parentId});
      if(result.error)throw result.error;
      $('aeDiscussionText').value='';
      setParent(null);
      await load();
      document.dispatchEvent(new Event('ae:takes-updated'));
    } catch(err) {
      $('aeDiscussionStatus').textContent='No se pudo publicar el comentario. '+(err.message||'');
    } finally {
      sending=false;$('aeDiscussionSubmit').disabled=false;
    }
  }
  function showVotes(take){
    // Oculta ambos controles al autor; nunca muestra votos antes de comprobar la sesión.
    $('aeDiscussionVotes').style.display=!viewerReady||(viewerId&&take.author_id&&String(viewerId)===String(take.author_id))?'none':'';
    for(const [value,id,name,count] of [[1,'aeDiscussionUp','▲ Apoyar',take.upvotes],[-1,'aeDiscussionDown','▼ Cuestionar',take.downvotes]]){
      const button=$(id);
      button.textContent=name+' '+(Number(count)||0);
      button.setAttribute('aria-pressed',String(Number(take.my_vote)===value));
      button.disabled=voting;
    }
  }
  async function vote(value){
    if(!current||voting)return;
    const take=current;
    try{
      if(typeof db==='undefined'||!db)throw Error('No hay conexión.');
      const session=await db.auth.getUser();
      const user=session.data?.user;
      if(!user){
        if(typeof openUserAuthModal==='function')openUserAuthModal();
        return;
      }
      if(user.id===take.author_id){
        $('aeDiscussionStatus').textContent='No puedes votar tu propio Take.';
        return;
      }
      voting=true;
      showVotes(take);
      const result=await db.rpc('ae_vote_free_take',{p_take_id:take.id,p_value:value});
      if(result.error)throw result.error;
      // El servidor es la fuente de verdad para votos y estado del usuario.
      if(take.author_id){
        const refreshed=await db.rpc('ae_public_take_profile',{p_author_id:take.author_id});
        const updated=!refreshed.error&&(refreshed.data||[]).find(item=>String(item.id)===String(take.id));
        if(updated&&current?.id===take.id)current={...take,...updated};
      }
      if(current?.id===take.id){
        $('aeDiscussionStatus').textContent='';
        document.dispatchEvent(new Event('ae:takes-updated'));
      }
    }catch(e){
      if(current?.id===take.id)$('aeDiscussionStatus').textContent='No se pudo registrar el voto. '+(e.message||'');
    }finally{
      voting=false;
      if(current?.id===take.id)showVotes(current);
    }
  }
  function displaySport(take) {
    const footballSports=new Set(['laliga','premier','ligamx','champions','football','futbol','fútbol']);
    const sport=String(take.sport||'').toLowerCase();
    const isNfl=sport==='nfl';
    const isFootball=!isNfl&&footballSports.has(sport);
    dialog.dataset.sport=isNfl?'nfl':isFootball?'football':'general';
    $('aeDiscussionSport').textContent=isNfl?'NFL':isFootball?'FÚTBOL':'TAKE';
  }
  async function showEditIfOwner(take) {
    const edit=$('aeDiscussionEditSport');
    edit.hidden=true;
    // En Fútbol no se ofrece cambiar de comunidad al abrir un Take.
    if(dialog?.dataset.sport==='football')return;
    if(!take?.author_id || typeof db==='undefined'||!db)return;
    try {
      const response=await db.auth.getUser();
      if(current?.id===take.id && dialog.open && dialog.dataset.sport!=='football' && response.data?.user?.id===take.author_id){
        edit.hidden=false;
      }
    } catch(_) {}
  }
  function open(take, options={}) {
    if(!take?.id)return;
    if(options.focusComposer&&typeof aeRequestPublication==='function'){
      return aeRequestPublication('reply',()=>show(take,options),()=>{if(dialog?.open)dialog.close();});
    }
    show(take,options);
  }
  function show(take, options={}) {
    if(!take?.id)return;
    init();
    current=take;
    setParent(null);
    displaySport(take);
    // El título de cada conversación pertenece al autor del Take abierto.
    // La etiqueta "Mis Takes" queda reservada al perfil personal.
    const authorName=String(take.author||'').trim().replace(/^@+/, '').trim() || 'Aficionado';
    $('aeDiscussionAuthor').textContent='@'+authorName;
    $('aeDiscussionAuthor').disabled=!take.author_id;
    $('aeDiscussionAuthor').title=take.author_id?'Ver perfil de @'+authorName:'Perfil no disponible';
    $('aeDiscussionAuthor').setAttribute('aria-label','Ver perfil de '+authorName);
    $('aeDiscussionSubject').textContent=take.title||'Take de la comunidad';
    $('aeDiscussionBody').textContent=take.body||'';
    viewerReady=false;
    viewerId=null;
    showVotes(take);
    $('aeDiscussionText').value='';
    $('aeDiscussionCount').textContent='Comentarios';
    $('aeDiscussionList').replaceChildren();
    $('aeDiscussionStatus').textContent='';
    if(!dialog.open)dialog.showModal();
    showEditIfOwner(take);
    load();
    if(options.focusComposer)$('aeDiscussionText')?.focus();
  }
  window.aeTakeReplies={open};
})();
