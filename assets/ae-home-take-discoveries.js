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
  // La portada usa la misma anatomía de tarjeta en Recientes, Populares e Impopulares.
  // Conserva las votaciones, perfiles y respuestas sin una segunda fila de acciones.
  function communityCard(t,kind,replyCounts,viewerId){
    const item=make('li',null,'ae-top-take ae-community-popular-take cam-hj-take cam-home-take-unified');
    item.dataset.kind=kind;

    const top=make('span',null,'cam-hj-kicker');
    const league=String(t.competition||'').trim()||(t.sport==='nfl'?'NFL':'Fútbol');
    top.append(make('span',league,'cam-hj-league'));
    const created=new Date(t.created_at);
    if(Number.isFinite(created.getTime())){
      const day=make('time',created.toLocaleDateString('es',{day:'numeric',month:'short'}).replace(/\./g,''),'cam-hj-when');
      day.dateTime=t.created_at||'';
      top.append(day);
    }
    item.append(top);

    const title=make('button',t.title||'Ver Take','cam-hj-card-title cam-home-take-open');
    title.type='button';
    title.setAttribute('aria-label','Leer Take y abrir conversación: '+(t.title||'Publicación'));
    title.addEventListener('click',()=>open(t));
    item.append(title);

    const excerpt=String(t.body||'').replace(/^NFL[^\n]*\n\n/,'').replace(/\s+/g,' ').trim();
    if(excerpt)item.append(make('span',excerpt,'cam-hj-excerpt'));

    const footer=make('div',null,'cam-hj-take-foot');
    const author=make('button','@'+String(t.author||'aficionado').replace(/^@+/,''),'cam-hj-author cam-home-take-author');
    author.type='button';
    author.dataset.camAuthorId=String(t.author_id||'');
    author.setAttribute('aria-label','Ver perfil de '+(t.author||'la comunidad'));
    author.addEventListener('click',()=>{if(t.author_id)window.openAePublicProfile?.(t.author_id);});
    footer.append(author);

    const stats=make('span',null,'cam-hj-votes cam-home-take-stats');
    const own=Boolean(viewerId&&t.author_id&&String(viewerId)===String(t.author_id));
    for(const [direction,label,key,css] of [
      [1,'▲','upvotes','is-up'],
      [-1,'▼','downvotes','is-down']
    ]){
      const value=count(t,key);
      const button=make('button',label+' '+value,css+' cam-home-take-vote');
      button.type='button';
      button.disabled=own;
      button.setAttribute('aria-label',(direction===1?'Apoyar':'Cuestionar')+' este Take. Votos actuales: '+value+(own?'. No puedes votar tu propio Take.':''));
      button.addEventListener('click',()=>vote(t,direction,button));
      stats.append(button);
    }
    const comments=make('button',null,'cam-home-take-comments');
    comments.type='button';
    comments.setAttribute('aria-label','Responder al Take y ver su conversación');
    const bubble=make('i',null,'fa-regular fa-comment');
    bubble.setAttribute('aria-hidden','true');
    comments.append(bubble);
    // Una consulta fallida no se presenta como cero comentarios.
    const replies=replyCounts?.get(String(t.id));
    if(replyCounts){
      const replyTotal=Math.max(0,Number(replies)||0);
      comments.append(make('span',String(replyTotal)));
      comments.setAttribute('aria-label','Abrir conversación: '+replyTotal+' '+(replyTotal===1?'respuesta':'respuestas'));
    }
    comments.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
    stats.append(comments);
    footer.append(stats);
    item.append(footer);

    item.addEventListener('click',event=>{
      if(!event.target.closest('button'))open(t);
    });
    return item;
  }
  // Placa del Salón de la fama: medalla con los puntos + el Take.
  function historicalCard(t){
    const btn=make('button',null,'ae-discovery-take cam-take-record');
    btn.type='button';
    const points=Number(t.points||0);
    const pointsLabel=points===1?'punto':'puntos';
    btn.setAttribute('aria-label','Leer el Take histórico: '+(t.title||'Publicación')+'. '+points+' '+pointsLabel+'.');
    btn.addEventListener('click',()=>open(t));
    const medal=make('span',null,'cam-take-record-medal');
    medal.setAttribute('aria-hidden','true');
    medal.append(make('strong',points),make('small',points===1?'pt':'pts'));
    const body=make('span',null,'cam-take-record-body');
    body.append(make('span',t.competition||(t.sport==='nfl'?'NFL':t.sport?'Fútbol':'Deportes'),'ae-discovery-sport cam-take-record-chip'));
    body.append(make('strong',t.title||'Take de la comunidad','ae-discovery-title'));
    const excerpt=String(t.body||'').replace(/\r\n/g,'\n').replace(/^NFL(?: · [^\n]*)?\n\n/,'').trim();
    if(excerpt)body.append(make('span',excerpt.length>170?excerpt.slice(0,167).trimEnd()+'…':excerpt,'ae-discovery-excerpt'));
    const foot=make('span',null,'ae-discovery-meta cam-take-record-byline');
    const historicAuthor=make('span','@'+String(t.author||'Aficionado').replace(/^@+/,''),'cam-take-record-author');
    historicAuthor.dataset.camAuthorId=String(t.author_id||'');
    foot.append(historicAuthor);
    const when=date(t.created_at);
    if(when)foot.append(make('span',when,'cam-take-record-date'));
    body.append(foot);
    btn.append(medal,body);
    return btn;
  }
  // Sin récord todavía: placa vacía con invitación a publicar.
  function emptyHistoric(target,message,sport){
    if(!target)return;
    const box=make('div',null,'cam-take-record-empty');
    const medal=make('span',null,'cam-take-record-medal is-empty');
    medal.setAttribute('aria-hidden','true');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    const cup=document.createElementNS('http://www.w3.org/2000/svg','path');
    cup.setAttribute('d','M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0V3.5ZM7 5.5H4v1.2A3.3 3.3 0 0 0 7.3 10M17 5.5h3v1.2a3.3 3.3 0 0 1-3.3 3.3');
    cup.setAttribute('fill','none');cup.setAttribute('stroke','currentColor');
    cup.setAttribute('stroke-width','1.6');cup.setAttribute('stroke-linecap','round');cup.setAttribute('stroke-linejoin','round');
    svg.append(cup);medal.append(svg);
    const copy=make('div',null,'cam-take-record-empty-copy');
    copy.append(make('strong','El récord está libre','cam-take-record-empty-title'),make('p',message,'ae-discovery-empty'));
    const cta=make('button',null,'cam-take-record-cta');
    cta.type='button';
    cta.append(document.createTextNode('Publicar mi Take'));
    const chevron=make('span','›','cam-chevron');chevron.setAttribute('aria-hidden','true');cta.append(chevron);
    cta.addEventListener('click',()=>{
      if(typeof window.aeOpenTakeComposer==='function')window.aeOpenTakeComposer(sport);
      else $('aeHomeTakePublish')?.click();
    });
    copy.append(cta);
    box.append(medal,copy);
    target.replaceChildren(box);
  }
  // Portada y deportes comparten la misma placa y la conversación original.
  window.aeTakeHistoricCard={create:historicalCard,empty:emptyHistoric};
  function empty(target,message,isList=false){
    if(target)target.replaceChildren(make(isList?'li':'p',message,'ae-discovery-empty'));
  }
  function render(data,replyCounts,viewerId,recentRows){
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
    const recent=$('aeHomeTakesRecentList');
    if(recent){
      const unique=[...new Map((Array.isArray(recentRows)?recentRows:[]).filter(t=>t?.id).map(t=>[String(t.id),t])).values()].slice(0,12);
      if(unique.length)recent.replaceChildren(...unique.map((t,i)=>communityCard({...t,rank_number:i+1},'recent',replyCounts,viewerId)));
      else empty(recent,'Todavía no hay Takes recientes.',true);
    }
    const winner=rows.find(r=>r?.kind==='historical'&&Number(r.points)>0);
    $('aeHomeTakeHistoric').dataset.camContentState=winner?'ready':'empty';
    if(winner)historic.replaceChildren(historicalCard(winner));
    else emptyHistoric(historic,'Aún sin Takes puntuados.');
  }
  async function refresh(force=false){
    if(!$('aeHomeTakeHighlights')||typeof db==='undefined'||!db||$('editorialBottom')?.hidden)return;
    if(typeof currentCategory!=='undefined'&&currentCategory!=='Todos')return;
    if(loading){pending=true;return;}
    if(!force&&Date.now()-lastFetch<30000)return;
    const request=++sequence;
    loading=true;
    const finishEntrance=window.camPageLoader?.begin?.();
    try{
      const [result,newest,session]=await Promise.all([
        db.rpc('ae_home_take_showcase'),
        db.rpc('ae_public_take_feed',{p_sport:'all'}),
        db.auth.getUser().catch(()=>({data:{user:null}}))
      ]);
      if(result.error)throw result.error;
      if(newest.error)throw newest.error;
      if(request!==sequence)return;
      const rows=Array.isArray(result.data)?result.data:[];
      const recentRows=Array.isArray(newest.data)?newest.data:[];
      const takeIds=[...new Set([...rows.filter(t=>t?.id && (t.kind==='positive'||t.kind==='negative')),...recentRows.slice(0,12)].map(t=>String(t.id)))];
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
      render(rows,replyCounts,session.data?.user?.id||null,recentRows);
      lastFetch=Date.now();
    }catch(error){
      empty($('aeHomeTakesRecentList'),'No se pudieron cargar los Takes recientes.',true);
      empty($('aeHomeTakesPositiveList'),'No se pudieron cargar los Takes populares.',true);
      empty($('aeHomeTakesNegativeList'),'No se pudieron cargar los Takes impopulares.',true);
      $('aeHomeTakeHistoric').dataset.camContentState='error';
      empty($('aeHomeTakeHistoricTake'),'No se pudo cargar el Take histórico.');
    }finally{
      loading=false;
      if(pending){pending=false;void refresh(true);}
      finishEntrance?.();
    }
  }
  window.refreshAeHomeTakeDiscoveries=refresh;
  document.addEventListener('DOMContentLoaded',()=>void refresh(true));
  document.addEventListener('ae:takes-updated',()=>void refresh(true));
  if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange(()=>setTimeout(()=>void refresh(true),0));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();
