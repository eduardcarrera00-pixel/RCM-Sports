/* AE SPORTS · Portada: votos positivos/negativos y récord histórico por puntos. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let inFlight=false, queued=false, lastFetch=0, loadId=0;

  function node(tag,text,className){
    const n=document.createElement(tag);
    if(text!==undefined&&text!==null)n.textContent=String(text);
    if(className)n.className=className;
    return n;
  }
  function votes(t,field){return Math.max(0,Number(t[field])||0);}
  function openTake(t){window.aeTakeReplies?.open(t);}
  function card(t,kind){
    const historic=kind==='historical';
    const btn=node('button',null,'ae-discovery-take');
    btn.type='button';
    btn.setAttribute('aria-label','Leer Take y su conversación: '+(t.title||'Publicación'));
    btn.addEventListener('click',()=>openTake(t));

    btn.append(node('span',t.competition|| (t.sport==='nfl'?'NFL':'Fútbol'),'ae-discovery-sport'));
    btn.append(node('strong',t.title||'Take de la comunidad','ae-discovery-title'));

    const excerpt=String(t.body||'').trim();
    if(excerpt){
      const max=historic?180:100;
      btn.append(node('span',excerpt.length>max?excerpt.slice(0,max-3).trimEnd()+'…':excerpt,'ae-discovery-excerpt'));
    }

    const foot=node('span',null,'ae-discovery-meta');
    foot.append(node('span','@'+String(t.author||'Aficionado').replace(/^@+/,'')));
    const label=historic
      ?Number(t.points||0)+' '+(Number(t.points)===1?'punto':'puntos')
      :kind==='positive'
        ?'▲ '+votes(t,'upvotes')+' apoyos'
        :'▼ '+votes(t,'downvotes')+' rechazos';
    foot.append(node('span',label,'ae-discovery-score'));
    btn.append(foot);
    return btn;
  }
  function empty(target,text,isList=false){
    if(!target)return;
    const item=node(isList?'li':'p',text,'ae-discovery-empty');
    target.replaceChildren(item);
  }
  function render(data){
    const positive=$('aeHomeTakesPositiveList');
    const negative=$('aeHomeTakesNegativeList');
    const historic=$('aeHomeTakeHistoricTake');
    if(!positive||!negative||!historic)return;

    const rows=Array.isArray(data)?data:[];
    function votesList(kind,target,message){
      const selection=rows.filter(x=>x&&x.kind===kind&&x.id)
        .sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,3);
      if(!selection.length){empty(target,message,true);return;}
      target.replaceChildren(...selection.map(t=>{
        const li=node('li');
        li.append(card(t,kind));
        return li;
      }));
    }
    votesList('positive',positive,'Todavía no hay Takes con votos positivos.');
    votesList('negative',negative,'Todavía no hay Takes con votos negativos.');

    const champion=rows.find(x=>x&&x.kind==='historical'&&Number(x.points)>0);
    if(champion)historic.replaceChildren(card(champion,'historical'));
    else empty(historic,'Aún no hay un Take acertado con puntos asignados por los administradores.');
  }
  async function refresh(force=false){
    const root=$('aeHomeTakeHighlights');
    if(!root||typeof db==='undefined'||!db||$('editorialBottom')?.hidden)return;
    if(typeof currentCategory!=='undefined'&&currentCategory!=='Todos')return;
    if(inFlight){queued=queued||force;return;}
    if(!force&&Date.now()-lastFetch<45000)return;
    const seq=++loadId;
    inFlight=true;
    try{
      const result=await db.rpc('ae_home_take_showcase');
      if(result.error)throw result.error;
      if(seq!==loadId)return;
      render(result.data);
      lastFetch=Date.now();
    }catch(error){
      empty($('aeHomeTakesPositiveList'),'No se pudieron cargar los votos. Actualiza la página.',true);
      empty($('aeHomeTakesNegativeList'),'No se pudieron cargar los votos. Actualiza la página.',true);
      empty($('aeHomeTakeHistoricTake'),'No se pudo cargar el Take con más puntos.');
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