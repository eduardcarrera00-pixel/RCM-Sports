/* AE SPORTS · Popular/Unpopular Takes (10) + récord histórico por puntos. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const make=(tag,text,cls)=>{
    const n=document.createElement(tag);
    if(text!==undefined&&text!==null)n.textContent=String(text);
    if(cls)n.className=cls;
    return n;
  };
  let loading=false,pending=false,lastFetch=0,sequence=0;

  const count=(t,key)=>Math.max(0,Number(t[key])||0);
  const open=t=>window.aeTakeReplies?.open(t);
  const date=value=>{
    const d=new Date(value);
    return Number.isFinite(d.getTime())
      ?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric'}).format(d).replace(/\./g,'')
      :'';
  };

  async function vote(t,direction,button){
    if(typeof db==='undefined'||!db)return;
    try{
      const auth=await db.auth.getUser();
      if(!auth.data?.user){
        if(typeof openUserAuthModal==='function')openUserAuthModal();
        return;
      }
      if(auth.data.user.id===t.author_id)return;
      button.disabled=true;
      const response=await db.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:direction});
      if(response.error)throw response.error;
      document.dispatchEvent(new Event('ae:takes-updated'));
    }catch(e){
      window.alert(e.message||'No se pudo guardar tu voto.');
    }finally{button.disabled=false;}
  }
  function communityCard(t,kind,replyCounts,viewerId){
    const item=make('li',null,'ae-top-take ae-community-popular-take');
    item.dataset.kind=kind;
    const content=make('div',null,'ae-top-take-content');
    const header=make('div',null,'ae-home-take-head');
    const titleRow=make('div',null,'ae-home-take-title-row');
    titleRow.append(make('span',String(t.rank_number||'').padStart(2,'0'),'ae-top-take-number'));
    const title=make('h4',null,'ae-top-take-title');
    const openBtn=make('button',t.title||'Ver Take','ae-top-take-open');
    openBtn.type='button';
    openBtn.addEventListener('click',()=>open(t));
    openBtn.setAttribute('aria-label','Leer Take y abrir conversación: '+(t.title||'Publicación'));
    title.append(openBtn);titleRow.append(title);
    header.append(titleRow,make('span',t.competition|| (t.sport==='nfl'?'NFL':'Fútbol'),'ae-top-take-sport'));
    content.append(header);
    const excerpt=String(t.body||'').replace(/^NFL[^\n]*\n\n/,'').trim();
    if(excerpt)content.append(make('p',excerpt.length>160?excerpt.slice(0,157).trimEnd()+'…':excerpt,'ae-top-take-summary'));

    const bottom=make('div',null,'ae-take-reference-footer');
    const identity=make('div',null,'ae-take-reference-identity');
    const avatar=make('span','','ae-take-reference-avatar');
    avatar.setAttribute('aria-hidden','true');
    const author=make('button','@'+(t.author||'Comunidad'),'ae-top-take-author');
    author.type='button';
    author.setAttribute('aria-label','Ver perfil de '+(t.author||'la comunidad'));
    author.addEventListener('click',()=>window.openAePublicProfile?.(t.author_id));
    identity.append(avatar,author);
    const when=date(t.created_at);
    if(when)identity.append(make('span','· '+when,'ae-take-reference-date'));
    bottom.append(identity);
    const stats=make('div',null,'ae-top-take-votes');
    if(!(viewerId&&t.author_id&&String(viewerId)===String(t.author_id))){
      for(const [dir,label,value,cls] of [
        [1,'▲',count(t,'upvotes'),'ae-top-take-up'],
        [-1,'▼',count(t,'downvotes'),'ae-top-take-down']
      ]){
        const b=make('button',label+' '+value,cls);
        b.type='button';
        b.setAttribute('aria-label',(dir===1?'Apoyar':'Cuestionar')+' este Take. Votos actuales: '+value);
        b.addEventListener('click',()=>vote(t,dir,b));
        stats.append(b);
      }
    }
    const replyCount=replyCounts?.get(String(t.id));
    if(Number.isFinite(replyCount)){
      const indicator=make('span',null,'ae-top-take-reply-count');
      indicator.setAttribute('aria-label',replyCount===1?'1 respuesta':replyCount+' respuestas');
      indicator.title=replyCount===1?'1 respuesta':replyCount+' respuestas';
      const bubble=make('i',null,'fa-regular fa-comment');
      bubble.setAttribute('aria-hidden','true');
      indicator.append(bubble,make('strong',String(replyCount)));
      stats.append(indicator);
    }
    const reply=make('button','Responder','ae-top-take-reply');
    reply.type='button';
    reply.setAttribute('aria-label','Responder al Take: '+(t.title||'Publicación'));
    reply.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
    stats.append(reply);
    bottom.append(stats);content.append(bottom);
    item.append(content);
    item.addEventListener('click',event=>{
      if(!event.target.closest('button'))open(t);
    });
    return item;
  }
  function historicalCard(t){
    const btn=make('button',null,'ae-discovery-take');
    btn.type='button';
    btn.setAttribute('aria-label','Leer el Take histórico: '+(t.title||'Publicación'));
    btn.addEventListener('click',()=>open(t));
    btn.append(make('span','RÉCORD HISTÓRICO · '+(t.competition||'Deportes'),'ae-discovery-sport'));
    btn.append(make('strong',t.title||'Take de la comunidad','ae-discovery-title'));
    const excerpt=String(t.body||'').trim();
    if(excerpt)btn.append(make('span',excerpt.length>170?excerpt.slice(0,167).trimEnd()+'…':excerpt,'ae-discovery-excerpt'));
    const foot=make('span',null,'ae-discovery-meta');
    foot.append(make('span','@'+String(t.author||'Aficionado').replace(/^@+/,'')));
    foot.append(make('span',Number(t.points||0)+' '+(Number(t.points)===1?'punto':'puntos'),'ae-discovery-score'));
    btn.append(foot);
    return btn;
  }
  function empty(target,message,isList=false){
    if(target)target.replaceChildren(make(isList?'li':'p',message,'ae-discovery-empty'));
  }
  function render(data,replyCounts,viewerId){
    const positive=$('aeHomeTakesPositiveList'),negative=$('aeHomeTakesNegativeList'),historic=$('aeHomeTakeHistoricTake');
    if(!positive||!negative||!historic)return;
    const rows=Array.isArray(data)?data:[];
    function ranked(kind,target,message){
      const list=rows.filter(r=>r?.kind===kind&&r.id)
        .sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,10);
      if(!list.length){empty(target,message,true);return;}
      target.replaceChildren(...list.map(t=>communityCard(t,kind,replyCounts,viewerId)));
    }
    ranked('positive',positive,'Todavía no hay Takes con votos positivos.');
    ranked('negative',negative,'Todavía no hay Takes con votos negativos.');
    const winner=rows.find(r=>r?.kind==='historical'&&Number(r.points)>0);
    if(winner)historic.replaceChildren(historicalCard(winner));
    else empty(historic,'Aún no hay un Take acertado con puntos asignados por los administradores.');
  }
  async function refresh(force=false){
    if(!$('aeHomeTakeHighlights')||typeof db==='undefined'||!db||$('editorialBottom')?.hidden)return;
    if(typeof currentCategory!=='undefined'&&currentCategory!=='Todos')return;
    if(loading){pending=true;return;}
    if(!force&&Date.now()-lastFetch<30000)return;
    const request=++sequence;
    loading=true;
    try{
      const [result,session]=await Promise.all([
        db.rpc('ae_home_take_showcase'),
        db.auth.getUser().catch(()=>({data:{user:null}}))
      ]);
      if(result.error)throw result.error;
      if(request!==sequence)return;
      const rows=Array.isArray(result.data)?result.data:[];
      const takeIds=[...new Set(rows.filter(t=>t?.id && (t.kind==='positive'||t.kind==='negative')).map(t=>String(t.id)))];
      let replyCounts=new Map();
      if(takeIds.length){
        const countsResult=await db.rpc('ae_public_take_reply_counts',{p_take_ids:takeIds});
        if(countsResult.error){
          // Rankings still work if the count endpoint is temporarily unavailable.
          console.warn('No se pudo consultar el número de respuestas de los Takes.',countsResult.error);
          replyCounts=null;
        }else{
          replyCounts=new Map((countsResult.data||[]).map(r=>[String(r.take_id),Math.max(0,Number(r.reply_count)||0)]));
        }
      }
      if(request!==sequence)return;
      render(rows,replyCounts,session.data?.user?.id||null);
      lastFetch=Date.now();
    }catch(error){
      empty($('aeHomeTakesPositiveList'),'No se pudieron cargar los Popular Takes.',true);
      empty($('aeHomeTakesNegativeList'),'No se pudieron cargar los Unpopular Takes.',true);
      empty($('aeHomeTakeHistoricTake'),'No se pudo cargar el Take histórico.');
    }finally{
      loading=false;
      if(pending){pending=false;void refresh(true);}
    }
  }
  window.refreshAeHomeTakeDiscoveries=refresh;
  document.addEventListener('DOMContentLoaded',()=>void refresh(true));
  document.addEventListener('ae:takes-updated',()=>void refresh(true));
  if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange(()=>setTimeout(()=>void refresh(true),0));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();