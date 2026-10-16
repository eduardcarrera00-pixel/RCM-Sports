/* AE SPORTS · Conversaciones persistentes para Takes, sin comentarios simulados. */
(() => {
  'use strict';
  let dialog, current = null, parentId = null, sequence = 0, sending = false;
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
          <div class="ae-discussion-titleblock"><span>LA COMUNIDAD DEBATE</span><h2 id="aeTakeDiscussionTitle">Takes</h2></div>
          <button type="button" id="aeDiscussionClose" aria-label="Cerrar comentarios"><span aria-hidden="true"></span></button>
        </header>
        <section class="ae-discussion-subject">
          <strong id="aeDiscussionSubject"></strong>
          <span id="aeDiscussionSport" class="ae-discussion-sport"></span>
          <button type="button" id="aeDiscussionEditSport" hidden>Cambiar comunidad</button>
          <p id="aeDiscussionBody"></p>
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
    $('aeDiscussionEditSport').addEventListener('click',()=>{
      if (current && window.aeTakeCategoryEdit) {
        window.aeTakeCategoryEdit.open(current, sport=>{
          current.sport=sport;
          displaySport(current);
        });
      }
    });
    $('aeDiscussionCancel').addEventListener('click',()=>setParent(null));
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
      const author=el('strong','@'+(r.author||'Aficionado'));
      const time=el('time',new Date(r.created_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'}));
      try{time.dateTime=new Date(r.created_at).toISOString();}catch(_){}
      meta.append(author,time);
      content.append(meta,el('p',r.body,'ae-discussion-text'));
      const actions=el('div',undefined,'ae-discussion-actions');
      const reply=el('button','Responder');
      reply.type='button';
      reply.addEventListener('click',()=>setParent(r.parent_id && nodes.has(r.parent_id) ? nodes.get(r.parent_id).data : r));
      actions.append(reply);
      if(typeof currentAdmin!=='undefined' && currentAdmin){
        const hide=el('button','Ocultar');
        hide.type='button';hide.className='ae-discussion-hide';
        hide.addEventListener('click',async()=>{
          if(!confirm('¿Ocultar este comentario?'))return;
          const result=await db.rpc('ae_hide_take_reply',{p_reply_id:r.id});
          if(result.error){$('aeDiscussionStatus').textContent=result.error.message;return;}
          await load();
        });
        actions.append(hide);
      }
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
        dialog.close();
        if(typeof openUserAuthModal==='function')openUserAuthModal();
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
    if(!take?.author_id || typeof db==='undefined'||!db)return;
    try {
      const response=await db.auth.getUser();
      if(current?.id===take.id && dialog.open && response.data?.user?.id===take.author_id){
        edit.hidden=false;
      }
    } catch(_) {}
  }
  function open(take, options={}) {
    if(!take?.id)return;
    init();
    current=take;
    setParent(null);
    displaySport(take);
    // El título de cada conversación pertenece al autor del Take abierto.
    // La etiqueta "Mis Takes" queda reservada al perfil personal.
    const authorName=String(take.author||'').trim().replace(/^@+/, '').trim() || 'Aficionado';
    $('aeTakeDiscussionTitle').textContent=authorName+' — Takes';
    $('aeDiscussionSubject').textContent=take.title||'Take de la comunidad';
    $('aeDiscussionBody').textContent=take.body||'';
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
