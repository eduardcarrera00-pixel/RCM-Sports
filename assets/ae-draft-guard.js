/* AE SPORTS · Private, account-scoped browser drafts for Takes and Picks.
   Never stores passwords, sessions, or unpublished data on the server. */
(() => {
  'use strict';
  const configs = {
    take:{form:'freeTakesForm',dialog:'aeTakeComposerDialog',close:'aeTakeComposerClose'},
    pick:{form:'cpForm',dialog:'cpComposePanel',close:'cpComposeClose'}
  };
  const state = {
    take:{owner:null,timer:null,silent:false},
    pick:{owner:null,timer:null,silent:false}
  };
  const $ = id => document.getElementById(id);
  const key = (kind,id) => 'ae-sports-draft-v1:'+kind+':'+id;
  const control = (form,name) => form.elements.namedItem(name);
  function value(form,name) { return String(control(form,name)?.value ?? ''); }
  function fields(form,number) {
    return ['sport','event','selection','odds'].reduce((item,name)=>{
      item[name]=value(form,name+'_'+number);return item;
    },{});
  }
  function snapshot(kind) {
    const form=$(configs[kind].form);if(!form)return null;
    if(kind==='take')return {
      sport:value(form,'sport'),competition:value(form,'competition'),
      title:value(form,'title'),body:value(form,'body')
    };
    return {
      legs:[fields(form,0),...(control(form,'sport_1')?[fields(form,1)]:[])],
      event_date:value(form,'event_date'),explanation:value(form,'explanation'),
      analysisOpen:!!form.querySelector('.cp-compose-analysis')?.open
    };
  }
  function meaningful(kind,data) {
    if(!data)return false;
    if(kind==='take')return ['competition','title','body'].some(k=>String(data[k]||'').trim().length>0);
    return !!data.legs?.some(leg=>Object.values(leg).some(v=>String(v||'').trim())) ||
      !!String(data.explanation||'').trim();
  }
  function notice(kind,message) {
    const form=$(configs[kind].form);
    let node=form?.querySelector('[data-ae-draft-notice]');
    if(!node)return;
    node.textContent=message;
    const discard=form.querySelector('[data-ae-draft-discard]');
    if(discard)discard.hidden=!meaningful(kind,snapshot(kind));
  }
  function getStore() {
    try {
      const probe='ae-sports-draft-probe';
      localStorage.setItem(probe,'1');localStorage.removeItem(probe);
      return localStorage;
    } catch {return null;}
  }
  async function accountId() {
    try {
      const client=typeof db!=='undefined'?db:window.db;
      const r=await client?.auth?.getUser();
      return !r?.error && typeof r.data?.user?.id==='string' ? r.data.user.id : null;
    } catch {return null;}
  }
  function cancelTimer(kind) {
    if(state[kind].timer!==null){clearTimeout(state[kind].timer);state[kind].timer=null;}
  }
  function save(kind) {
    cancelTimer(kind);
    const owner=state[kind].owner;
    if(!owner||state[kind].silent)return false;
    const store=getStore(),data=snapshot(kind);
    if(!store){notice(kind,'No se pudo guardar el borrador en este navegador. Copia el texto antes de salir.');return false;}
    try {
      if(meaningful(kind,data)){
        store.setItem(key(kind,owner),JSON.stringify({version:1,updated:Date.now(),data}));
        notice(kind,'Borrador guardado en este navegador.');
      } else {
        store.removeItem(key(kind,owner));
        notice(kind,'Tu texto se guardará automáticamente mientras escribes.');
      }
      return true;
    } catch {
      notice(kind,'No hay espacio para guardar el borrador. Copia el texto antes de salir.');
      return false;
    }
  }
  function schedule(kind) {
    if(state[kind].silent)return;
    cancelTimer(kind);
    state[kind].timer=setTimeout(()=>save(kind),300);
    const form=$(configs[kind].form);
    const discard=form?.querySelector('[data-ae-draft-discard]');
    if(discard)discard.hidden=!meaningful(kind,snapshot(kind));
  }
  function reset(kind) {
    const form=$(configs[kind].form);if(!form)return;
    state[kind].silent=true;
    form.reset();
    if(kind==='pick'){
      const remove=form.querySelector('.cp-compose-remove');
      if(remove)remove.click();
      const details=form.querySelector('.cp-compose-analysis');
      if(details)details.open=false;
    }
    state[kind].silent=false;
  }
  function apply(kind,data) {
    const form=$(configs[kind].form);
    if(!form||!data||typeof data!=='object')return;
    state[kind].silent=true;
    if(kind==='take'){
      for(const name of ['competition','title','body']){
        const element=control(form,name);if(element)element.value=String(data[name]||'');
      }
      const sport=String(data.sport||'');
      const radio=form.querySelector('input[name="sport"][value="'+sport+'"]');
      if(radio)radio.checked=true;
    } else {
      const legs=Array.isArray(data.legs)?data.legs.slice(0,2):[];
      const second=control(form,'sport_1');
      if(legs.length===2&&!second){
        const combined=[...form.querySelectorAll('button')].find(b=>b.textContent==='Combinada');
        combined?.click();
      }else if(legs.length<2&&second){
        form.querySelector('.cp-compose-remove')?.click();
      }
      legs.forEach((leg,i)=>{
        for(const field of ['sport','event','selection','odds']){
          const element=control(form,field+'_'+i);
          if(element)element.value=String(leg?.[field]||'');
        }
      });
      if(control(form,'event_date')&&data.event_date)control(form,'event_date').value=String(data.event_date);
      if(control(form,'explanation'))control(form,'explanation').value=String(data.explanation||'');
      const details=form.querySelector('.cp-compose-analysis');
      if(details)details.open=!!data.analysisOpen;
      control(form,'odds_0')?.dispatchEvent(new Event('input',{bubbles:true}));
    }
    state[kind].silent=false;
  }
  async function restore(kind) {
    if(!configs[kind])return;
    const id=await accountId();
    const form=$(configs[kind].form),st=state[kind];
    if(!form||!id)return;
    cancelTimer(kind);
    if(st.owner&&st.owner!==id)reset(kind);
    st.owner=id;
    const store=getStore();
    if(!store){notice(kind,'El almacenamiento local no está disponible. Copia tu texto antes de salir.');return;}
    // Reopening the same form during this session must not overwrite new typing.
    if(meaningful(kind,snapshot(kind))) {save(kind);return;}
    let saved=null;
    try {saved=JSON.parse(store.getItem(key(kind,id))||'null');}catch{}
    if(saved?.version===1&&meaningful(kind,saved.data)){
      apply(kind,saved.data);
      notice(kind,'Borrador recuperado de este navegador. Puedes continuar donde lo dejaste.');
    }else notice(kind,'Tu texto se guardará automáticamente mientras escribes.');
  }
  function clear(kind) {
    if(!configs[kind])return;
    cancelTimer(kind);
    const st=state[kind],store=getStore();
    if(store&&st.owner)try{store.removeItem(key(kind,st.owner));}catch{}
    notice(kind,'Publicado. Se ha eliminado el borrador guardado.');
  }
  function addControls(kind) {
    const form=$(configs[kind].form),close=$(configs[kind].close),dialog=$(configs[kind].dialog);
    if(!form||!close||!dialog||form.querySelector('[data-ae-draft-notice]'))return;
    const toolbar=document.createElement('div');toolbar.className='ae-draft-tools';
    const message=document.createElement('p');message.dataset.aeDraftNotice='';message.setAttribute('role','status');
    message.setAttribute('aria-live','polite');
    message.textContent='Tu texto se guardará automáticamente mientras escribes.';
    const discard=document.createElement('button');discard.type='button';discard.className='ae-draft-discard';
    discard.dataset.aeDraftDiscard='';discard.hidden=true;discard.textContent='Descartar borrador';
    toolbar.append(message,discard);
    if(kind==='take')form.insertBefore(toolbar,$('aeTakeComposerStatus'));
    else form.prepend(toolbar);
    form.addEventListener('input',()=>schedule(kind));
    form.addEventListener('change',()=>schedule(kind));
    if(kind==='pick')form.addEventListener('click',event=>{
      if(event.target.closest('.cp-compose-modes,.cp-compose-add,.cp-compose-remove')){
        setTimeout(()=>schedule(kind),0);
      }
    });
    discard.addEventListener('click',()=>{
      if(!window.confirm('¿Descartar el borrador? Esta acción eliminará el texto guardado.'))return;
      cancelTimer(kind);
      const store=getStore(),owner=state[kind].owner;
      if(store&&owner)try{store.removeItem(key(kind,owner));}catch{}
      reset(kind);
      notice(kind,'Borrador descartado. Puedes empezar a escribir de nuevo.');
    });
    // Only the actual X closes a composer; Escape/backdrop never lose typing.
    dialog.addEventListener('cancel',event=>event.preventDefault(),true);
    dialog.addEventListener('click',event=>{
      if(event.target===dialog)event.stopImmediatePropagation();
    },true);
    close.addEventListener('click',event=>{
      const data=snapshot(kind);
      if(!meaningful(kind,data))return;
      const saved=save(kind);
      const question=saved
        ? 'Tu borrador está guardado en este navegador. ¿Cerrar y continuar después?'
        : 'El borrador NO se ha podido guardar. ¿Cerrar de todos modos?';
      if(!window.confirm(question)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    dialog.addEventListener('close',()=>save(kind));
  }
  function initialize() {
    addControls('take');addControls('pick');
    window.addEventListener('pagehide',()=>{save('take');save('pick');});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){save('take');save('pick');}
    });
    window.addEventListener('beforeunload',()=>{
      save('take');save('pick');
    });
  }
  window.aeDraftGuard={restore,save,clear};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
