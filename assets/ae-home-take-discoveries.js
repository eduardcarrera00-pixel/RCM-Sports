/* AE SPORTS · Portada: Takes curiosos y el Take histórico más apoyado. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const sportLabel={nfl:'NFL',football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League'};
  const allowed=new Set(Object.keys(sportLabel));
  let inFlight=false, queued=false, lastFetch=0, loadId=0;

  function make(tag,text,className){
    const n=document.createElement(tag);
    if(text!==undefined&&text!==null)n.textContent=String(text);
    if(className)n.className=className;
    return n;
  }
  function dateValue(t){return new Date(t.created_at||0).getTime()||0;}
  function votes(t){return Math.max(0,Number(t.upvotes)||0);}
  function doubts(t){return Math.max(0,Number(t.downvotes)||0);}
  function openTake(t){window.aeTakeReplies?.open(t);}
  function makeCard(t,historic=false){
    const card=make('button',null,'ae-discovery-take');
    card.type='button';
    card.setAttribute('aria-label','Leer Take: '+(t.title||'Publicación'));
    card.addEventListener('click',()=>openTake(t));
    const eyebrow=make('span',(t.competition||sportLabel[t.sport]||'Comunidad'),'ae-discovery-sport');
    const title=make('strong',t.title||'Take de la comunidad','ae-discovery-title');
    const excerpt=String(t.body||'').trim();
    card.append(eyebrow,title);
    if(excerpt)card.append(make('span',excerpt.length>(historic?170:95)?excerpt.slice(0,historic?167:92).trimEnd()+'…':excerpt,'ae-discovery-excerpt'));
    const footer=make('span',null,'ae-discovery-meta');
    footer.append(make('span','@'+String(t.author||'Aficionado').replace(/^@+/,'')));
    footer.append(make('span','▲ '+votes(t)+'  ·  ▼ '+doubts(t),'ae-discovery-score'));
    card.append(footer);
    return card;
  }
  function showMessage(target,text){
    if(!target)return;
    target.replaceChildren(make('p',text,'ae-discovery-empty'));
  }
  function render(data){
    const curious=$('aeHomeTakesCuriousList'),historic=$('aeHomeTakeHistoricTake');
    if(!curious||!historic)return;
    const takes=(Array.isArray(data)?data:[]).filter(t=>t&&t.id&&allowed.has(t.sport)&&String(t.title||'').trim());
    const allTime=takes.filter(t=>votes(t)>0)
      .sort((a,b)=>votes(b)-votes(a)||doubts(a)-doubts(b)||dateValue(a)-dateValue(b));
    const winner=allTime[0];
    if(winner)historic.replaceChildren(makeCard(winner,true));
    else showMessage(historic,'Aún no hay un Take con votos positivos para destacar.');

    // Curiosidad = debate: priorizar Takes con opiniones divididas;
    // después, participación y novedad. Sin ejemplos ni contenidos ficticios.
    const options=takes.filter(t=>t.id!==winner?.id)
      .sort((a,b)=>Math.min(votes(b),doubts(b))-Math.min(votes(a),doubts(a))
        ||(votes(b)+doubts(b))-(votes(a)+doubts(a))
        ||dateValue(b)-dateValue(a))
      .slice(0,3);
    if(options.length){
      curious.replaceChildren(...options.map(t=>{
        const li=make('li');
        li.append(makeCard(t));
        return li;
      }));
    }else showMessage(curious,'Cuando haya nuevos Takes, aparecerán aquí las conversaciones de la comunidad.');
  }
  async function refresh(force=false){
    const root=$('aeHomeTakeHighlights');
    if(!root||!db||$('editorialBottom')?.hidden)return;
    if(typeof currentCategory!=='undefined'&&currentCategory!=='Todos')return;
    if(inFlight){queued=queued||force;return;}
    if(!force&&Date.now()-lastFetch<45000)return;
    const seq=++loadId;
    inFlight=true;
    try {
      const result=await db.rpc('ae_public_take_feed',{p_sport:'all'});
      if(result.error)throw result.error;
      if(seq!==loadId)return;
      render(result.data);
      lastFetch=Date.now();
    }catch(error){
      showMessage($('aeHomeTakesCuriousList'),'No pudimos cargar los Takes curiosos. Actualiza la página para reintentarlo.');
      showMessage($('aeHomeTakeHistoricTake'),'No pudimos cargar el Take histórico.');
    }finally{
      inFlight=false;
      if(queued){queued=false;void refresh(true);}
    }
  }
  window.refreshAeHomeTakeDiscoveries=refresh;
  document.addEventListener('DOMContentLoaded',()=>void refresh(true));
  document.addEventListener('ae:takes-updated',()=>void refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();