/* AE SPORTS · Conversaciones persistentes para Takes, sin comentarios simulados. */
(() => {
  'use strict';
  let dialog, current = null, parentId = null, sequence = 0, sending = false, voting = false;
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
      if(current?.author_id)window.openAePublicProfile?.(current.author_id);
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
  function render(comments) {
    const list=$('aeDiscussionList');
    list.replaceChildren();
    $('aeDiscussionCount').textContent=comments.length===1?'1 comentario':comments.length+' comentarios';
    if(!comments.length) {
      list.append(el('p','Todavía nadie ha comentado. Abre la conversación.','ae-discussion-empty'));
      return;
    }
    const nodes=new Map();
    for(const r of comments) {
      const card=el('article',undefined,'ae-discussion-comment');
      const avatar=el('span',String(r.author||'Aficionado').trim().charAt(0).toUpperCase()||'A','ae-discussion-avatar');
      avatar.setAttribute('aria-hidden','true');
      const content=el('div',undefined,'ae-discussion-comment-content');
      const meta=el('div',undefined,'ae-discussion-meta');
      const authorId=r.author_id||r.user_id||null;
      const author=el(authorId?'button':'strong','@'+(r.author||'Aficionado'),authorId?'ae-discussion-author-link':undefined);
      if(authorId){
        author.type='button';
        author.setAttribute('aria-label','Ver perfil y Takes de '+(r.author||'Aficionado'));
        author.addEventListener('click',()=>window.openAePublicProfile?.(authorId));
      }
      const time=el('time',new Date(r.created_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'}));
      try{time.dateTime=new Date(r.created_at).toISOString();}catch(_){}
      meta.append(author,time);
      content.append(meta,el('p',r.body,'ae-discussion-text'));
      const actions=el('div',undefined,'ae-discussion-actions');
      const reply=el('button','Responder');
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
      content.append(actions);
      card.append(avatar,content);
      nodes.set(r.id,{card,data:r});
    }
    for(const r of comments) {
      const card=nodes.get(r.id).card;
      const target=r.parent_id&&nodes.get(r.parent_id);
      if(target){
        card.classList.add('ae-discussion-nested');
        target.card.append(card);
      } else list.append(card);
    }
  }
  async function load() {
    if(!current || !dialog?.open)return;
    const token=++sequence, takeId=current.id;
    $('aeDiscussionStatus').textContent='Cargando conversación…';
    try {
      if(typeof db==='undefined'||!db)throw Error('Sin conexión a la comunidad.');
      const result=await db.rpc('ae_take_comment_thread',{p_take_id:takeId});
      if(result.error)throw result.error;
      if(token!==sequence||current?.id!==takeId)return;
      render(result.data||[]);
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
    $('aeDiscussionSubject').textContent=take.title||'Take de la comunidad';
    $('aeDiscussionBody').textContent=take.body||'';
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
