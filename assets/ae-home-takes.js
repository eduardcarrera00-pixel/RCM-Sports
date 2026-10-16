/* AE SPORTS — destacados reales de Takes en portada (15 oct 2026). */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = {general:'General',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Colegial'};
  let loading = false, lastLoad = 0, pending = false;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  function empty(list, text) {
    const item = element('li', text, 'ae-top-takes-empty');
    list.replaceChildren(item);
  }
  const dateLabel=value=>{
    if(!value)return '';
    const d=new Date(value);
    return Number.isFinite(d.getTime())
      ?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',year:'numeric'}).format(d).replace(/\./g,'')
      :'';
  };
  function card(t,n,negative){
    const item=element('li',undefined,'ae-top-take');
    const content=element('div',undefined,'ae-top-take-content');
    const header=element('div',undefined,'ae-home-take-head');
    const titleRow=element('div',undefined,'ae-home-take-title-row');
    const rank=element('span',String(n).padStart(2,'0'),'ae-top-take-number');
    const title=element('h4',undefined,'ae-top-take-title');
    const open=element('button',t.title||'Ver Take','ae-top-take-open');
    open.type='button';
    open.setAttribute('aria-label','Leer Take y ver su conversación: '+(t.title||'Publicación'));
    open.addEventListener('click',()=>window.aeTakeReplies?.open(t));
    title.append(open);
    titleRow.append(rank,title);
    const badge=element('span',labels[t.sport]||'Deportes','ae-top-take-sport');
    header.append(titleRow,badge);
    content.append(header);
    const excerpt=String(t.body||'').replace(/^NFL[^\n]*\n\n/,'').trim();
    if(excerpt)content.append(element('p',excerpt.length>160?excerpt.slice(0,157).trimEnd()+'…':excerpt,'ae-top-take-summary'));
    const bottom=element('div',undefined,'ae-take-reference-footer');
    const identity=element('div',undefined,'ae-take-reference-identity');
    const avatar=element('span','', 'ae-take-reference-avatar');
    avatar.setAttribute('aria-hidden','true');
    const author=element('button','@'+(t.author||'Comunidad'),'ae-top-take-author');
    author.type='button';
    author.setAttribute('aria-label','Ver historial de Takes de '+(t.author||'este usuario'));
    author.addEventListener('click',()=>{
      if(typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
    });
    identity.append(avatar,author);
    const when=dateLabel(t.created_at);
    if(when)identity.append(element('span','· '+when,'ae-take-reference-date'));
    const stats=element('div',undefined,'ae-top-take-votes');
    for(const [direction,symbol,value] of [
      ['up','▲',Number(t.upvotes||0)],['down','▼',Number(t.downvotes||0)]
    ]){
      const tally=element('span',symbol+' '+value,'ae-top-take-'+direction);
      tally.setAttribute('aria-label',(direction==='up'?'Votos positivos: ':'Votos negativos: ')+value);
      stats.append(tally);
    }
    const reply=element('button','Responder','ae-top-take-reply');
    reply.type='button';
    reply.setAttribute('aria-label','Responder al Take: '+(t.title||'Publicación'));
    reply.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
    stats.append(reply);
    bottom.append(identity,stats);
    content.append(bottom);
    item.append(content);
    item.addEventListener('click',event=>{
      if(!event.target.closest('button'))window.aeTakeReplies?.open(t);
    });
    return item;
  }
  function paint(data) {
    const positive = $('aeTopTakesPositive'), negative = $('aeTopTakesNegative');
    if (!positive || !negative) return;
    const eligibleSports = new Set(['nfl','laliga','premier','ligamx','champions']);
    const takes = (Array.isArray(data) ? data : []).filter(t=>eligibleSports.has(t.sport));
    const up = takes.filter(t => Number(t.upvotes) > 0)
      .sort((a,b)=>Number(b.upvotes)-Number(a.upvotes) || Number(a.downvotes)-Number(b.downvotes) || new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
    const down = takes.filter(t => Number(t.downvotes) > 0)
      .sort((a,b)=>Number(b.downvotes)-Number(a.downvotes) || Number(a.upvotes)-Number(b.upvotes) || new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
    positive.replaceChildren(...up.map((t,i)=>card(t,i+1,false)));
    negative.replaceChildren(...down.map((t,i)=>card(t,i+1,true)));
    if (!up.length) empty(positive,'Aún no hay Takes con votos positivos.');
    if (!down.length) empty(negative,'Aún no hay Takes con votos negativos.');
    const status = $('aeTopTakesStatus');
    if (status) status.textContent = '';
  }
  async function refresh(force=false) {
    const root = $('aeHomeTopTakes');
    if (!root || !window.db && typeof db === 'undefined') return;
    // Esta sección solo se muestra en portada. Nunca consultamos cada vez que cambia un filtro.
    if (typeof currentCategory !== 'undefined' && currentCategory !== 'Todos') return;
    if (loading) { pending = pending || force; return; }
    if (!force && Date.now() - lastLoad < 30000) return;
    loading = true;
    try {
      const result = await db.rpc('ae_public_take_feed', {p_sport:'all'});
      if (result.error) throw result.error;
      paint(result.data);
      lastLoad = Date.now();
    } catch (err) {
      const status=$('aeTopTakesStatus');
      if (status) status.textContent = 'No pudimos cargar los Takes destacados. Vuelve a intentarlo.';
    } finally {
      loading = false;
      if (pending) { pending = false; refresh(true); }
    }
  }
  window.refreshAeHomeTopTakes = refresh;
  document.addEventListener('DOMContentLoaded',()=>{
    refresh(true);
    const publish=$('aeHomeTakePublish'),choices=$('aeHomeTakeChoice');
    publish?.addEventListener('click',()=>{
      if(!choices)return;
      choices.hidden=!choices.hidden;
      publish.setAttribute('aria-expanded',String(!choices.hidden));
      if(!choices.hidden)choices.querySelector('button')?.focus();
    });
    choices?.querySelectorAll('button[data-ae-take-sport]').forEach(btn=>btn.addEventListener('click',()=>{
      choices.hidden=true;
      publish?.setAttribute('aria-expanded','false');
      window.aeOpenTakeComposer?.(btn.dataset.aeTakeSport);
    }));
    choices?.addEventListener('keydown',e=>{
      if(e.key==='Escape'){choices.hidden=true;publish?.setAttribute('aria-expanded','false');publish?.focus();}
    });
  });
  document.addEventListener('ae:takes-updated',()=>refresh(true));
  document.addEventListener('visibilitychange',()=>{if (!document.hidden) refresh();});
})();
