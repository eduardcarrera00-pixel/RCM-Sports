/* CAM SPORTS · La liguilla de la Liga MX en la Quiniela de Fútbol.
   Un solo recuadro, «Arma tu cuadro»:
   1. Antes de conocerse los 8 (cam_liguilla_candidates): cada aficionado elige a
      los 8 que cree que clasificarán; se cierra al empezar la última jornada.
   2. Con la liguilla abierta (cam_liguilla_state): el cuadro con puntos, de
      cuartos a campeón, que se comparte en redes y sale en el perfil.
   3. Ronda a ronda: cada serie con su ida, su vuelta (1X2 de siempre) y «¿Quién pasa?».
   Una o dos llamadas al abrir Liga MX. Sin temporizadores: se refresca al volver
   a la pestaña, igual que la quiniela. */
(() => {
  'use strict';
  const quiniela=document.getElementById('camFootballQuiniela');
  // Un elemento con id=camLiguilla aparece como window.camLiguilla en el navegador;
  // solo una API ya inicializada (no ese elemento) debe impedir cargar el módulo.
  if(!quiniela||(window.camLiguilla&&typeof window.camLiguilla.refresh==='function'))return;

  const client=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return null;}};
  const api=()=>window.camFootballQuiniela;
  const isAdmin=()=>{try{return typeof currentAdmin!=='undefined'&&!!currentAdmin;}catch{return false;}};
  const viewer=()=>{try{return typeof currentUser!=='undefined'?currentUser:null;}catch{return null;}};
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const btn=(text,cls,onClick)=>{const b=el('button',text,cls);b.type='button';if(onClick)b.addEventListener('click',onClick);return b;};
  const now=()=>Date.now();
  const clock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).replace('.','');
  const day=value=>new Date(value).toLocaleDateString('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short'}).replace(/\./g,'');
  // «viernes 20 nov, 20:00» y «22 nov»: lo que se lee en la cabecera del evento.
  const longClock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',weekday:'long',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\./g,'').replace(/^(\p{L}+),\s*/u,'$1 ');
  const shortDay=value=>new Date(value).toLocaleDateString('es',{timeZone:'America/Toronto',day:'numeric',month:'short'}).replace(/\./g,'');
  const plusDays=(value,n)=>Date.parse(value)+n*864e5;
  const CHECK='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const LOCK='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const BRACKET_ICON='<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h9v8H4M4 28h9v8H4M13 12h6v20h-6M19 22h7"/><path d="M30 15h8v4c0 3-2 5-4 5s-4-2-4-5Z"/><path d="M34 24v5M30.5 31h7"/></g></svg>';
  const QF=[[1,8],[2,7],[3,6],[4,5]];
  const ROUNDS={
    qf:{title:'Cuartos de final',short:'Cuartos',left:8},
    sf:{title:'Semifinales',short:'Semifinales',left:4},
    final:{title:'La Final',short:'Final',left:2}
  };
  const STAGE_OF={qf:'semis',sf:'final',final:'champion'};

  // Estado
  let state=null,seasonLoaded=null,userLoaded=undefined,stale=true,loading=false,request=0,loadError='';
  let draft=null,saving=false,note='',noteKind='',roundView=null,board=null,boardOpen=false,adminTable=null,adminMessage='';
  // «Mis 8»: la tabla y la ventana llegan de cam_liguilla_candidates mientras no hay liguilla.
  let cand=null,q8=[],q8Saving=false,q8Note='',q8Kind='',q8Expanded=false;
  let animate='';
  const openLegs=new Set();

  // Reutilizar el contenedor de La semana: evita dos cuadros al cambiar de liga.
  const section=window.camLiguillaNode||document.getElementById('camLiguilla')||el('section',null,'cam-liguilla');
  window.camLiguillaNode=section;
  section.classList.add('cam-liguilla');
  section.id='camLiguilla';section.hidden=true;section.setAttribute('aria-labelledby','camLiguillaTitle');
  (quiniela.querySelector('.cam-nfl-top')||quiniela.firstElementChild)?.after(section);
  function place(complete){
    const target=complete
      ?(quiniela.querySelector('.cam-nfl-top')||quiniela.firstElementChild)
      :document.querySelector('#camFootballSemanaBody .cam-ns-head');
    if(target&&section.previousElementSibling!==target)target.after(section);
  }
  // Vista previa del cuadro mientras no se abre: los cruces llevan al trofeo.
  // Referencia con los 8 primeros de la tabla de hoy (o huecos si no hay tabla). No se puede tocar.
  const TROPHY='<svg viewBox="0 0 48 60" aria-hidden="true" focusable="false"><path d="M13 6h22v10c0 8.6-4.9 14.5-11 14.5S13 24.6 13 16Z" fill="currentColor" fill-opacity=".14"/><path d="M13 6h22v10c0 8.6-4.9 14.5-11 14.5S13 24.6 13 16ZM13 10H7c0 6.6 2.9 10.6 8.4 11.6M35 10h6c0 6.6-2.9 10.6-8.4 11.6M24 30.5v8.5M18.5 39h11M16 44h16l1.5 7h-19ZM12 54h24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m24 11.5 1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5Z" fill="currentColor"/></svg>';
  function previewBracket(teams){
    const list=[...(teams||[])].sort((a,b)=>(Number(a.rank)||99)-(Number(b.rank)||99)).slice(0,8);
    const full=list.length===8,bySeed=seed=>full?list[seed-1]:null;
    const nameOf=t=>t?.short_name||t?.name||'';
    // De arriba abajo como un cuadro de verdad: si ganan los favoritos, 1.º-4.º y 2.º-3.º en semis.
    const PAIRS=[[[1,8],[4,5]],[[2,7],[3,6]]];
    const wrap=el('figure',null,'cam-lg-pv');
    const art=el('div',null,'cam-lg-pv-art');art.setAttribute('role','img');
    art.setAttribute('aria-label',(full
      ?'Vista previa del cuadro con la tabla de hoy: '+PAIRS.flat().map(([h,l])=>h+'.º '+nameOf(bySeed(h))+' contra '+l+'.º '+nameOf(bySeed(l))).join('; ')
      :'Vista previa del cuadro de la liguilla')+'. Próximamente: se abre al terminar la jornada 17.');
    const heads=el('div',null,'cam-lg-pv-heads');
    heads.append(el('span','Cuartos'),el('span','Semis'),el('span','Final'));
    const row=seed=>{
      const t=bySeed(seed),r=el('span',null,'cam-lg-pv-team'+(t?'':' is-ghost'));
      r.append(el('span',String(seed),'cam-lg-pv-seed'));
      if(t)r.append(crest(t.team_id,20,t));else r.append(el('span',null,'cam-lg-pv-dot'));
      r.append(el('span',t?(t.abbreviation||nameOf(t)):'—','cam-lg-pv-abbr'),el('span',t?nameOf(t):'—','cam-lg-pv-name'));
      return r;
    };
    const ghost=cls=>{const m=el('span',null,'cam-lg-pv-match is-empty'+(cls?' '+cls:''));m.append(el('span',null,'cam-lg-pv-slot'),el('span',null,'cam-lg-pv-slot'));return m;};
    const tree=el('div',null,'cam-lg-pv-tree');
    const qf=el('div',null,'cam-lg-pv-col is-qf'),sf=el('div',null,'cam-lg-pv-col is-sf'),fin=el('div',null,'cam-lg-pv-col is-final');
    for(const pair of PAIRS){
      const g=el('div',null,'cam-lg-pv-pair');
      for(const [h,l] of pair){const m=el('span',null,'cam-lg-pv-match');m.append(row(h),row(l));g.append(m);}
      qf.append(g);
      const cell=el('div',null,'cam-lg-pv-cell');cell.append(ghost());sf.append(cell);
    }
    const cup=el('span',null,'cam-lg-pv-cup');cup.innerHTML=TROPHY;
    fin.append(cup,ghost('is-final'),el('span','Campeón','cam-lg-pv-champ'));
    const soon=el('div',null,'cam-lg-pv-soon');
    soon.append(el('strong','Próximamente'),el('span','Al terminar la J17'));
    tree.append(qf,sf,fin,soon);
    art.append(heads,tree);wrap.append(art);
    if(full)wrap.append(el('figcaption','Referencia con la tabla de hoy.','cam-lg-pv-caption'));
    return wrap;
  }
  // Cabecera compacta de La Liguilla: título a la izquierda y torneo abreviado a la derecha.
  // Las elecciones, el cierre real y el guardado de «Tus 8» se mantienen independientes.
  function eventHero(step,{name,when}){
    const hero=el('header',null,'cam-lg-event');
    const top=el('div',null,'cam-lg-event-name');
    const h=el('h3','La Liguilla','cam-lg-event-title');h.id='camLiguillaTitle';
    const season=String(name||W()?.name||('Apertura '+new Date().getFullYear())).replace(/\b20(\d{2})\b/g,'$1');
    top.append(h,el('p',season,'cam-lg-event-kicker'));hero.append(top);
    const steps=el('ol',null,'cam-lg-steps');steps.setAttribute('aria-label','Pasos de la liguilla');
    ['Tus 8','Tu cuadro','Ronda a ronda'].forEach((label,i)=>{
      const n=i+1,li=el('li',null,n<step?'is-done':n===step?'is-now':'');
      if(n===step)li.setAttribute('aria-current','step');
      const dot=el('span',n<step?null:String(n),'cam-lg-step-dot');dot.setAttribute('aria-hidden','true');
      if(n<step)dot.innerHTML=CHECK;
      const sub=when?.[i];
      li.append(dot,el('b',label),sub instanceof Node?sub:el('span',sub||'','cam-lg-step-when'));
      steps.append(li);
    });
    hero.append(steps);
    return hero;
  }
  // El cuadro siempre visible; la fecha y la explicación plegable van debajo.
  function teaser(teams,title){
    const wrap=el('div',null,'cam-lg-upcoming');
    const box=el('details',null,'cam-lg-teaser');
    const sum=el('summary',null,'cam-lg-teaser-sum');
    const icon=el('span',null,'cam-lg-teaser-icon');icon.innerHTML=BRACKET_ICON;
    const text=el('span',null,'cam-lg-teaser-text');
    text.append(el('strong',title),el('span','De cuartos al campeón. Las sorpresas valen más.'),el('span','Ver cómo será','cam-lg-teaser-more'));
    sum.append(icon,text);box.append(sum);
    const body=el('div',null,'cam-lg-teaser-body');
    const how=el('ul',null,'cam-lg-how');
    for(const line of ['Eliges quién gana cada cruce, de cuartos al campeón.',
      'Cada acierto suma puntos en la quiniela; una sorpresa vale más.',
      'Lo compartes en redes y queda en tu perfil.'])how.append(el('li',line));
    body.append(how);box.append(body);
    wrap.append(previewBracket(teams),box);
    return wrap;
  }
  // Sin liguilla ni ventana de «mis 8» (o mientras carga): el recuadro espera.
  function pendingPanel(){
    const wrap=el('div',null,'cam-lg-bracket cam-lg-pending');
    wrap.append(eventHero(1,{when:['Pronto','','']}));
    wrap.append(el('p',loading?'Cargando…':'Próximamente: se abre cuando se confirmen los 8 clasificados.','cam-lg-sub'));
    wrap.append(previewBracket([]));return wrap;
  }

  // ------------------------------------------------------------- Datos derivados
  const L=()=>state?.liguilla||null;
  const seeds=()=>state?.seeds||[];
  const team=id=>seeds().find(s=>s.team_id===id)||null;
  const seedOf=id=>team(id)?.seed||null;
  const idOf=seed=>seeds().find(s=>s.seed===seed)?.team_id||null;
  const shortName=id=>{const t=team(id);return t?.short_name||t?.name||id||'';};
  const fullName=id=>{const t=team(id);return t?.name||t?.short_name||id||'';};
  const odds=(id,stage)=>(state?.odds||[]).find(o=>o.team_id===id&&o.stage===stage)||null;
  const pts=(id,stage)=>odds(id,stage)?.points??null;
  const isOpen=()=>!!L()&&!!state.liguilla.open&&Date.parse(L().closes_at)>now();
  const qfPair=i=>[idOf(QF[i][0]),idOf(QF[i][1])];
  function semiPairs(semis){
    if(!semis||semis.some(x=>!x))return null;
    const w=semis.map(seedOf);
    if(w.some(x=>!x))return null;
    if(L()?.reseed!==false){
      const s=[...w].sort((a,b)=>a-b);
      return [[idOf(s[0]),idOf(s[3])],[idOf(s[1]),idOf(s[2])]];
    }
    const p=(a,b)=>a<b?[idOf(a),idOf(b)]:[idOf(b),idOf(a)];
    return [p(w[0],w[3]),p(w[1],w[2])];
  }
  const finalPair=f=>f&&f[0]&&f[1]?[...f].sort((a,b)=>seedOf(a)-seedOf(b)):null;
  function saved(){
    const out={semis:[null,null,null,null],finals:[null,null],champion:null};
    for(const p of state?.mine?.bracket||[]){
      if(p.stage==='semis')out.semis[p.slot]=p.team_id;
      else if(p.stage==='final')out.finals[p.slot]=p.team_id;
      else if(p.stage==='champion')out.champion=p.team_id;
    }
    return out;
  }
  const savedPick=(stage,slot)=>(state?.mine?.bracket||[]).find(p=>p.stage===stage&&p.slot===slot)||null;
  const count=b=>b.semis.filter(Boolean).length+b.finals.filter(Boolean).length+(b.champion?1:0);
  const potential=b=>b.semis.reduce((n,id)=>n+(id?pts(id,'semis')||0:0),0)
    +b.finals.reduce((n,id)=>n+(id?pts(id,'final')||0:0),0)+(b.champion?pts(b.champion,'champion')||0:0);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function clean(b){
    const sp=semiPairs(b.semis);
    b.finals=b.finals.map((id,i)=>sp&&sp[i].includes(id)?id:null);
    const fp=finalPair(b.finals);
    if(!fp||!fp.includes(b.champion))b.champion=null;
    return b;
  }
  const draftKey=()=>'cam:liguilla:'+(viewer()?.id||'anon')+':'+(L()?.id||0);
  function storeDraft(){try{localStorage.setItem(draftKey(),JSON.stringify(draft));}catch{}}
  function recoverDraft(){
    draft=saved();
    try{
      // Un invitado que inicia sesión no pierde el cuadro que armó antes.
      let raw=JSON.parse(localStorage.getItem(draftKey())||'null');
      if(!raw&&viewer()?.id&&!count(draft))raw=JSON.parse(localStorage.getItem('cam:liguilla:anon:'+(L()?.id||0))||'null');
      if(raw&&Array.isArray(raw.semis)&&raw.semis.length===4&&Array.isArray(raw.finals)&&raw.finals.length===2){
        const valid=raw.semis.every((id,i)=>!id||qfPair(i).includes(id));
        if(valid)draft=clean({semis:raw.semis,finals:raw.finals,champion:raw.champion||null});
      }
    }catch{}
  }
  const series=round=>(state?.series||[]).filter(s=>s.round===round).sort((a,b)=>a.slot-b.slot);
  const legOf=(s,id)=>(s.legs||[]).find(g=>g.id===id)||null;
  const mySeriesPick=id=>(state?.mine?.series||[]).find(p=>p.series_id===id)||null;
  const allLegIds=()=>new Set((state?.series||[]).flatMap(s=>[s.leg1_id,s.leg2_id]).filter(Boolean));

  // ------------------------------------------------------------- Carga
  async function load(season){
    const c=client();if(!c)return;
    const ticket=++request;loading=true;
    const finishEntrance=window.camPageLoader?.begin?.();
    try{
      const {data,error}=await c.rpc('cam_liguilla_state',{p_season:season});
      if(ticket!==request)return;
      if(error)throw error;
      state=data&&typeof data==='object'&&!Array.isArray(data)&&data.liguilla?data:null;
      if(state){recoverDraft();cand=null;}
      else{
        draft=null;
        const r=await c.rpc('cam_liguilla_candidates',{p_season:season});
        if(ticket!==request)return;
        cand=!r.error&&r.data&&typeof r.data==='object'&&r.data.window?r.data:null;
        recoverQualifiers();
      }
      seasonLoaded=season;userLoaded=viewer()?.id||null;stale=false;loadError='';
    }catch{
      if(ticket!==request)return;
      loadError='No se pudo cargar la liguilla. Vuelve a abrir la sección para reintentarlo.';
    }finally{if(ticket===request){loading=false;render();}finishEntrance?.();}
  }
  function sync(){
    const s=api()?.snapshot?.();
    if(!s||!s.loaded||s.loading)return;
    if(s.competition!=='ligamx'){hide();return;}
    const who=viewer()?.id||null;
    if(stale||seasonLoaded!==s.season||userLoaded!==who){if(!loading)load(s.season);return;}
    render();
  }
  function hide(){section.hidden=true;quiniela.classList.remove('cam-liguilla-round');}

  // ------------------------------------------------------------- Piezas comunes
  // Escudo del club (ESPN). Si no hay o no carga: un escudo azul y dorado con sus siglas, nunca un hueco.
  function shield(t,id){
    const ab=String(t?.abbreviation||t?.short_name||t?.name||id||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase();
    return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46">'
      +'<path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8Z" fill="#0B2233" stroke="#BE9270" stroke-width="2.4" stroke-linejoin="round"/>'
      +'<path d="M8 11.5 20 7.6l12 3.9" fill="none" stroke="#E8BF79" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>'
      +'<text x="20" y="28" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="'+(ab.length>2?10.5:13)+'" fill="#E8BF79">'+ab+'</text></svg>');
  }
  function crest(id,size=30,info=null){
    const t=info||team(id)||cteam(id);const img=el('img',null,'cam-lg-crest');img.alt='';img.width=size;img.height=size;img.loading='lazy';img.decoding='async';
    const fallback=()=>{if(img.dataset.fallback)return;img.dataset.fallback='1';img.src=shield(t,id);};
    img.addEventListener('error',fallback);
    if(t?.logo)img.src=t.logo;else fallback();
    return img;
  }
  function pointsChip(text,cls=''){return el('span',text,'cam-lg-pts'+(cls?' '+cls:''));}
  // Un equipo dentro de un cruce: escudo, nombre corto y, debajo, su lugar en la tabla y los puntos.
  function teamButton(id,{chosen,decided,disabled,pointsText,result,onPick,label}){
    const b=el('button',null,'cam-lg-team'+(chosen?' is-chosen':'')+(decided&&!chosen?' is-behind':''));
    b.type='button';b.setAttribute('aria-pressed',String(!!chosen));b.disabled=!!disabled;b.dataset.team=id;
    const name=el('span',null,'cam-lg-name');
    const meta=el('small',null,'cam-lg-team-meta');meta.append(el('span',(seedOf(id)||'')+'.º','cam-lg-seed'));
    if(result)meta.append(result);else if(pointsText)meta.append(pointsChip(pointsText));
    name.append(el('strong',shortName(id)),meta);
    b.append(crest(id,26),name);
    b.setAttribute('aria-label',label||fullName(id));
    if(onPick)b.addEventListener('click',onPick);
    return b;
  }
  function message(){
    const p=el('p',note,'cam-lg-note'+(noteKind?' is-'+noteKind:''));p.setAttribute('role','status');p.setAttribute('aria-live','polite');return p;
  }

  // ------------------------------------------------------------- Tu liguilla
  function bracketPanel(){
    const open=isOpen(),b=open?draft:saved(),mine=saved(),done=count(mine)===7;
    const wrap=el('div',null,'cam-lg-bracket');
    const mine8=Array.isArray(state.mine?.qualifiers)?state.mine.qualifiers.map(String):null;
    const hits=mine8?el('span','Acertaste '+mine8.filter(id=>!!seedOf(id)).length+' de 8','cam-lg-step-when cam-lg-q8-hits'):'Cerrado';
    wrap.append(eventHero(open?2:3,{name:L().name,
      when:[hits,open?'Ahora':'Cerrado',open?'Desde el '+shortDay(L().closes_at):'Ahora'],
      closes:open?longClock(L().closes_at):null,closesWhat:'al empezar los cuartos'}));
    const head=el('header',null,'cam-lg-head');
    const sh=el('div',null,'cam-lg-sec-head');sh.append(el('h4',open?'Arma tu cuadro':'Tu cuadro','cam-lg-sec-title'));head.append(sh);
    if(open)head.append(el('p','Toca quién pasa en cada cruce.','cam-lg-sub'));
    const meter=el('div',null,'cam-lg-meter');
    const track=el('div',null,'cam-lg-track');track.setAttribute('aria-hidden','true');
    const n=count(b);for(let i=0;i<7;i++)track.append(el('i',null,i<n?'is-on':''));
    meter.append(track,el('span',n+' de 7','cam-lg-count'));
    if(open){
      const pot=el('p',null,'cam-lg-potential');pot.append('Si aciertas todo: ',el('b',String(potential(b))),' pts');meter.append(pot);
    }else{
      const won=(state.mine?.bracket||[]).reduce((s,p)=>s+(p.awarded_points||0),0);
      const alive=(state.mine?.bracket||[]).filter(p=>!p.settled_at).reduce((s,p)=>s+p.points,0);
      const pot=el('p',null,'cam-lg-potential');pot.append('Llevas ',el('b',String(won)),' pts'+(alive?' · '+alive+' en juego':''));meter.append(pot);
    }
    head.append(meter);wrap.append(head);
    if(!open&&!count(mine)){
      wrap.append(el('p','No armaste tu cuadro esta vez. Sigue la liguilla ronda a ronda aquí abajo: cada serie da puntos.','cam-lg-empty'));
      wrap.append(rankingBlock());
      return wrap;
    }
    const boardEl=el('div',null,'cam-lg-board');
    // Cuartos
    const qf=el('section',null,'cam-lg-round');qf.append(roundHead('Cuartos','pasa a semis'));
    const qfList=el('div',null,'cam-lg-matches');
    QF.forEach((_,i)=>{
      const pair=qfPair(i);
      qfList.append(matchCard(pair,b.semis[i],'semis',i,open,null,(id)=>{
        draft.semis[i]=draft.semis[i]===id?null:id;afterPick();
      }));
    });
    qf.append(qfList);boardEl.append(qf);
    // Semis
    const sf=el('section',null,'cam-lg-round');sf.append(roundHead('Semifinales','pasa a la final'));
    const sfList=el('div',null,'cam-lg-matches');const sp=semiPairs(b.semis);
    if(sp)sp.forEach((pair,i)=>sfList.append(matchCard(pair,b.finals[i],'final',i,open,null,(id)=>{
      draft.finals[i]=draft.finals[i]===id?null:id;afterPick();
    })));
    else sfList.append(el('p',L().reseed!==false
      ?'Elige los cuatro de cuartos y aparecen los cruces: el mejor de la tabla que siga vivo juega contra el peor.'
      :'Elige los cuatro de cuartos y aparecen los cruces de semifinales.','cam-lg-wait'));
    sf.append(sfList);boardEl.append(sf);
    // Final
    const fi=el('section',null,'cam-lg-round');fi.append(roundHead('Final','campeón'));
    const fiList=el('div',null,'cam-lg-matches');const fp=finalPair(b.finals);
    if(fp)fiList.append(matchCard(fp,b.champion,'champion',0,open,null,(id)=>{
      draft.champion=draft.champion===id?null:id;animate=draft.champion?'crown':'';afterPick();
    }));
    else fiList.append(el('p','Elige a tus dos finalistas.','cam-lg-wait'));
    fi.append(fiList);boardEl.append(fi);
    // Campeón
    const champ=el('div',null,'cam-lg-champion'+(b.champion&&animate==='crown'?' is-crowned':''));champ.setAttribute('aria-live','polite');
    champ.append(el('span','Tu campeón','cam-lg-champion-label'),el('span',null,'cam-lg-champion-rule'));
    if(b.champion){
      champ.append(el('strong',fullName(b.champion),'cam-lg-champion-name'));
      const pick=savedPick('champion',0);
      champ.append(el('span',open?'+'+(pts(b.champion,'champion')||0)+' pts si levanta el título'
        :pick?.settled_at?(pick.awarded_points>0?'¡Campeón! +'+pick.awarded_points+' pts':'Se quedó en el camino'):'+'+pick?.points+' pts si gana la final','cam-lg-champion-sub'));
    }else champ.append(el('strong','Todavía sin elegir','cam-lg-champion-name is-empty'));
    boardEl.append(champ);animate='';
    wrap.append(boardEl);
    // Una sola nota con las reglas de los cruces, en vez de repetirla bajo cada uno.
    wrap.append(el('p','Si empatan en el global, pasa el mejor de la tabla; en la final, prórroga y penales.'
      +(L().reseed!==false?' En semis, el mejor que siga vivo juega contra el peor.':''),'cam-lg-hint cam-lg-board-note'));
    // Acciones
    if(open){
      const actions=el('div',null,'cam-lg-actions');
      const dirty=!same(draft,mine),who=viewer();
      const save=btn(!who?'Inicia sesión para guardar':saving?'Guardando…':'Guardar mi cuadro','cam-nfl-action cam-lg-save',saveBracket);
      save.disabled=!!who&&(saving||!dirty||!count(draft));
      const share=btn('Compartir mi cuadro','cam-nfl-action cam-nfl-action-secondary cam-lg-share',e=>shareBracket(e.currentTarget));
      share.disabled=count(draft)!==7||!window.CamPickShare?.openBracket;
      const reset=btn('Empezar de nuevo','cam-lg-link',()=>{draft={semis:[null,null,null,null],finals:[null,null],champion:null};storeDraft();note='';render();});
      reset.disabled=!count(draft);
      actions.append(save,share,reset);
      wrap.append(actions);
      wrap.append(el('p',!who&&count(draft)===7?'Inicia sesión para que tu cuadro cuente para la quiniela y salga en tu perfil. Ya puedes compartirlo.'
        :done&&!dirty?'Cuadro guardado: sale en tu perfil. Puedes cambiarlo hasta el cierre.'
        :dirty&&count(draft)?'Tienes cambios sin guardar.'
        :'Faltan '+(7-count(draft))+' elecciones para poder compartirlo.','cam-lg-hint'));
      wrap.append(message());
    }
    wrap.append(rules());
    wrap.append(rankingBlock());
    return wrap;
  }
  function roundHead(name,detail){const h=el('h4',null,'cam-lg-round-head');h.append(el('span',name),el('small',detail));return h;}
  function matchCard(pair,chosen,stage,slot,open,foot,pick){
    const card=el('div',null,'cam-lg-match');
    for(const id of pair){
      if(!id)continue;
      const picked=chosen===id;let result=null;
      if(!open){
        const sp=savedPick(stage,slot);
        if(picked&&sp)result=!sp.settled_at?pointsChip('en juego · +'+sp.points,'is-live')
          :sp.awarded_points>0?pointsChip('+'+sp.awarded_points,'is-hit'):pointsChip('0 · fuera','is-miss');
        else result=el('span',null,'cam-lg-pts is-blank');
      }
      card.append(teamButton(id,{chosen:picked,decided:chosen!=null,disabled:!open,
        pointsText:open?'+'+(pts(id,stage)??'–'):null,result,
        label:fullName(id)+', '+seedOf(id)+'.º de la tabla'+(open?', '+(pts(id,stage)??0)+' puntos si acierta':''),
        onPick:open?()=>pick(id):null}));
    }
    if(foot)card.append(el('p',foot,'cam-lg-foot'));
    return card;
  }
  function afterPick(){
    clean(draft);storeDraft();note='';render();
  }
  async function saveBracket(){
    if(!viewer()){window.openUserAuthModal?.();return;}
    if(saving||!isOpen())return;
    saving=true;note='';render();
    try{
      const {data,error}=await client().rpc('cam_liguilla_save_bracket',{p_liguilla:L().id,p_semis:draft.semis,
        p_finalists:draft.finals,p_champion:draft.champion});
      if(error)throw error;
      // Lo guardado pasa a ser la verdad; el borrador local ya no hace falta.
      const rows=[];
      draft.semis.forEach((id,i)=>id&&rows.push({stage:'semis',slot:i,team_id:id,points:pts(id,'semis'),awarded_points:0,settled_at:null}));
      draft.finals.forEach((id,i)=>id&&rows.push({stage:'final',slot:i,team_id:id,points:pts(id,'final'),awarded_points:0,settled_at:null}));
      if(draft.champion)rows.push({stage:'champion',slot:0,team_id:draft.champion,points:pts(draft.champion,'champion'),awarded_points:0,settled_at:null});
      state.mine={...(state.mine||{series:[]}),bracket:rows};
      try{localStorage.removeItem(draftKey());}catch{}
      note=count(draft)===7?'Cuadro guardado: '+(data?.potential??potential(draft))+' pts posibles. Ya puedes compartirlo.':'Guardado a medias: te faltan '+(7-count(draft))+' elecciones.';
      noteKind='ok';
    }catch(error){note=error?.message||'No se pudo guardar. Inténtalo de nuevo.';noteKind='error';}
    finally{saving=false;render();}
  }
  function shareModel(){
    // Lo que se ve en el recuadro: el borrador mientras está abierto, lo guardado después.
    const b=isOpen()&&draft?draft:saved();if(count(b)!==7)return null;
    const sp=semiPairs(b.semis),fp=finalPair(b.finals);
    const t=id=>({name:shortName(id),full:fullName(id),seed:seedOf(id)});
    const sides=sp.map((pair,i)=>({pair:pair.map(t),winner:t(b.finals[i]),
      qfs:QF.map((q,qi)=>({pair:qfPair(qi).map(t),winner:t(b.semis[qi]),w:b.semis[qi]})).filter(x=>pair.includes(x.w))}));
    return {name:L().name||'Liguilla',user:(viewer()?.username||'').replace(/^@/,''),
      champion:t(b.champion),runner:t(fp.find(id=>id!==b.champion)),sides,liguilla:L().id};
  }
  function shareBracket(opener){
    const model=shareModel();
    if(!model||!window.CamPickShare?.openBracket)return;
    window.CamPickShare.openBracket(model,{opener});
  }
  function rules(){
    const d=el('details',null,'cam-lg-rules');d.append(el('summary','¿Cómo puntúa tu cuadro?'));
    const fav=[...(state.odds||[])].filter(o=>o.stage==='semis').sort((a,b)=>b.probability-a.probability)[0];
    const dark=[...(state.odds||[])].filter(o=>o.stage==='champion').sort((a,b)=>a.probability-b.probability)[0];
    d.append(el('p','Cada acierto paga según lo difícil que era: 3 × log₂(1/probabilidad), redondeado, de 1 a 20 puntos. Cada vez que la probabilidad se parte por la mitad, ganas 3 puntos más.'));
    if(fav&&dark)d.append(el('p','Por ejemplo: '+shortName(fav.team_id)+' a semis paga '+fav.points+(fav.points===1?' punto':' puntos')+'; '+shortName(dark.team_id)+' campeón paga '+dark.points+'.'));
    d.append(el('p','Las probabilidades salen de la tabla final y de las cuotas de la ida de cuartos, calculando los 128 caminos posibles hasta el campeón. Se congelaron al abrir: son las mismas para todos.'));
    d.append(el('p','El cuadro solo suma: un fallo vale 0. Los puntos van a la clasificación de la quiniela (temporada y mes) y a tus parties el día que se decide cada ronda.'));
    return d;
  }
  function rankingBlock(){
    const box=el('div',null,'cam-lg-ranking');
    const toggle=btn(boardOpen?'Ocultar clasificación de cuadros':'Ver clasificación de cuadros','cam-lg-link',async()=>{
      boardOpen=!boardOpen;
      if(boardOpen&&!board){render();await loadBoard();}
      render();
    });
    toggle.setAttribute('aria-expanded',String(boardOpen));
    const players=Number(state.players||0);
    box.append(el('p',players?(players===1?'1 aficionado armó su cuadro.':players+' aficionados armaron su cuadro.'):'Sé el primero en armar tu cuadro.','cam-lg-players'),toggle);
    if(boardOpen){
      if(!board)box.append(el('p','Cargando clasificación…','cam-lg-hint'));
      else if(!board.length)box.append(el('p','Todavía no hay cuadros guardados.','cam-lg-hint'));
      else{
        const wrap=el('div',null,'cam-lg-table-wrap');wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Clasificación de cuadros');wrap.tabIndex=0;
        const table=el('table',null,'cam-lg-table');
        const head=el('tr');for(const h of ['#','Usuario','Aciertos','Pts'])head.append(el('th',h));
        const thead=el('thead');thead.append(head);table.append(thead);
        const body=el('tbody');
        for(const r of board.slice(0,20)){
          const tr=el('tr');if(r.user_id===viewer()?.id)tr.className='is-me';
          tr.append(el('td',String(r.rank_position)),el('td','@'+String(r.username||'Aficionado').replace(/^@+/,'')),
            el('td',String(r.hits??0)),el('td',String(r.points??0)));
          body.append(tr);
        }
        table.append(body);wrap.append(table);box.append(wrap);
      }
    }
    return box;
  }
  async function loadBoard(){
    try{const {data,error}=await client().rpc('cam_liguilla_leaderboard',{p_liguilla:L().id});if(error)throw error;board=Array.isArray(data)?data:[];}
    catch{board=[];}
  }

  // ------------------------------------------------------------- «Mis 8» (antes de abrir)
  const W=()=>cand?.window||null;
  const candTeams=()=>Array.isArray(cand?.teams)?cand.teams:[];
  function cteam(id){return candTeams().find(t=>String(t.team_id)===String(id))||null;}
  const q8Open=()=>!!W()&&!!W().open&&Date.parse(W().closes_at)>now();
  const q8Key=who=>'cam:liguilla:mis8:'+(who||'anon')+':'+(W()?.id||0);
  const q8Saved=()=>Array.isArray(cand?.mine)?cand.mine.map(String):null;
  // Los que ya están matemáticamente dentro van fijos en los 8 de todos: nadie los elige ni
  // los quita. Cada aficionado elige solo los lugares que faltan; `q8` guarda solo esos.
  const fixedIds=()=>candTeams().filter(t=>t.status==='in').map(t=>String(t.team_id));
  const isFixed=id=>fixedIds().includes(String(id));
  const slots=()=>Math.max(0,8-fixedIds().length);
  const ownPicks=list=>[...new Set((list||[]).map(String))].filter(id=>cteam(id)&&cteam(id).status==='alive');
  const fullEight=()=>[...fixedIds(),...q8];
  const sameSet=(a,b)=>a.length===b.length&&[...a].sort().join()===[...b].sort().join();
  function recoverQualifiers(){
    q8=ownPicks(q8Saved());q8Note='';
    if(q8.length)return;
    // Primero lo de esta cuenta y después lo que hizo como invitado en este aparato.
    for(const who of [...new Set([viewer()?.id||'anon','anon'])]){
      try{
        const raw=JSON.parse(localStorage.getItem(q8Key(who))||'null');
        if(Array.isArray(raw)){
          q8=ownPicks(raw).slice(0,slots());
          if(q8.length)return;
        }
      }catch{}
    }
  }
  // Si desde la última vez un elegido quedó eliminado o ya entró por su cuenta, deja de contar como elección.
  function tidyQ8(){
    const gone=q8.filter(id=>cteam(id)?.status==='out').map(id=>cteam(id).short_name||cteam(id).name);
    q8=ownPicks(q8);
    if(gone.length&&!q8Note){q8Note=gone.join(' y ')+(gone.length===1?' ya quedó eliminado':' ya quedaron eliminados')+': elige otro.';q8Kind='error';}
  }
  function storeQ8(){try{localStorage.setItem(q8Key(viewer()?.id),JSON.stringify(fullEight()));}catch{}}
  function toggleQ8(id){
    if(!q8Open()||q8Saving||isFixed(id))return;
    const i=q8.indexOf(id);
    if(i>=0)q8.splice(i,1);else if(q8.length<slots())q8.push(id);
    storeQ8();q8Note='';render();
    section.querySelector('.cam-lg-q8-team[data-team="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
  }
  async function saveQ8(){
    const eight=fullEight();
    if(q8Saving||!q8Open()||q8.length!==slots()||eight.length!==8)return;
    storeQ8();
    if(!viewer()){
      q8Note='Guardado en este dispositivo. Inicia sesión para que tus 8 salgan en tu perfil.';q8Kind='ok';render();return;
    }
    q8Saving=true;q8Note='';render();
    try{
      const {error}=await client().rpc('cam_liguilla_save_qualifiers',{p_window:W().id,p_teams:eight});
      if(error)throw error;
      cand.mine=[...eight];
      try{localStorage.removeItem(q8Key(viewer()?.id));localStorage.removeItem(q8Key('anon'));}catch{}
      q8Note='Tus 8 están guardados y salen en tu perfil.';q8Kind='ok';
    }catch(error){q8Note=error?.message||'No se pudo guardar. Inténtalo de nuevo.';q8Kind='error';}
    finally{q8Saving=false;render();}
  }
  // Una ficha por equipo, en dos columnas. `fixed`: ya dentro, no se toca. `showStatus`: tras el cierre.
  function q8Team(t,{chosen,disabled,fixed,readonly,showStatus}){
    const still=fixed||readonly;
    const b=el(still?'div':'button',null,'cam-lg-q8-team'+(chosen?' is-chosen':'')+(fixed?' is-fixed':'')+(readonly?' is-readonly':'')+(t.status==='out'?' is-out':''));
    b.dataset.team=String(t.team_id);
    if(!still){b.type='button';b.disabled=!!disabled;b.setAttribute('aria-pressed',String(!!chosen));}
    const name=el('span',null,'cam-lg-name');
    const status=t.status==='in'?'Clasificado':t.status==='out'?'Eliminado':'En juego';
    const meta=el('small',(t.rank?t.rank+'.º · ':'')+t.points+' pts');
    if(showStatus)meta.append(' · ',el('span',status,'cam-lg-q8-status is-'+(t.status||'alive')));
    name.append(el('strong',t.short_name||t.name||t.team_id),meta);
    b.append(crest(t.team_id,26,t),name);
    const mark=el('span',null,'cam-lg-q8-mark');mark.setAttribute('aria-hidden','true');
    if(fixed)mark.innerHTML=LOCK;else if(chosen)mark.innerHTML=CHECK;
    b.append(mark);
    if(fixed)b.title='Ya está dentro';
    const said=(t.name||t.short_name)+', '+(t.rank?t.rank+'.º con ':'')+t.points+' puntos';
    if(fixed){b.setAttribute('role','listitem');b.setAttribute('aria-label',said+', ya clasificado: va en tus 8');}
    else if(readonly){b.setAttribute('role','listitem');b.setAttribute('aria-label',said+', '+status.toLowerCase());}
    else b.setAttribute('aria-label',said+', '+status.toLowerCase()+(chosen?', elegido':''));
    return b;
  }
  const listText=a=>a.length<2?a.join(''):a.slice(0,-1).join(', ')+' y '+a[a.length-1];
  function qualifiersPanel(){
    const open=q8Open(),saved=q8Saved();
    if(open)tidyQ8();
    const fixed=fixedIds(),need=slots();
    const wrap=el('div',null,'cam-lg-bracket cam-lg-q8');
    const closes=W()?.closes_at;
    wrap.append(eventHero(open?1:2,{name:W()?.name,
      when:[open?'Ahora':'Cerrado',open&&closes?'Desde el '+shortDay(plusDays(closes,2)):'Al terminar la J17',closes?'Desde el '+shortDay(plusDays(closes,5)):''],
      closes:open&&closes?longClock(closes):null,closesWhat:'al empezar la última jornada'}));
    if(!candTeams().length){
      wrap.append(el('p','La tabla de la Liga MX no está disponible ahora mismo. Vuelve a entrar en unos minutos.','cam-lg-wait'));
      return wrap;
    }
    const body=el('section',null,'cam-lg-q8-body');body.setAttribute('aria-label',open?'Elige quiénes clasifican':'Clasificados elegidos');
    if(open){
      const track=el('div',null,'cam-lg-track is-eight');track.setAttribute('aria-hidden','true');
      for(let i=0;i<8;i++)track.append(el('i',null,i<fixed.length?'is-fixed':i<fixed.length+q8.length?'is-on':''));
      body.append(track);
      if(need===8||need===0)body.append(el('p',need===8?'Toca los 8 equipos que crees que juegan la Liguilla.'
        :'Ya se conocen los 8: van solos en tu lista.','cam-lg-sub'));
      if(fixed.length){
        const list=el('div',null,'cam-lg-q8-list is-fixed');list.setAttribute('role','list');list.setAttribute('aria-label','Ya clasificados: van en tus 8');
        for(const id of fixed){const t=cteam(id);if(t)list.append(q8Team(t,{fixed:true}));}
        body.append(list);
      }
      const choices=el('div',null,'cam-lg-qualifiers-body');
      if(need){
        const dropdown=el('details',null,'cam-lg-qualifiers');dropdown.open=q8Expanded;
        const summary=el('summary',null,'cam-lg-qualifiers-summary');
        const title=el('span','Elige quiénes clasifican','cam-lg-qualifiers-title');title.id='camLiguillaQ8Title';
        const count=el('span',null,'cam-lg-count');count.append(el('b',String(Math.min(q8.length,need))),' de '+need);
        const arrow=el('span',null,'cam-lg-qualifiers-arrow');arrow.setAttribute('aria-hidden','true');
        arrow.innerHTML='<svg viewBox="0 0 16 16" focusable="false"><path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        summary.append(title,count,arrow);dropdown.append(summary,choices);
        dropdown.addEventListener('toggle',()=>{if(dropdown.isConnected)q8Expanded=dropdown.open;});body.append(dropdown);
        const list=el('div',null,'cam-lg-q8-list');list.setAttribute('role','group');
        list.setAttribute('aria-label',need===8?'Elige a tus 8 clasificados':'Elige '+(need===1?'el que falta':'los '+need+' que faltan'));
        for(const t of candTeams().filter(t=>t.status==='alive')){
          const chosen=q8.includes(String(t.team_id));
          const b=q8Team(t,{chosen,disabled:q8Saving||(!chosen&&q8.length>=need)});
          b.addEventListener('click',()=>toggleQ8(String(t.team_id)));
          list.append(b);
        }
        choices.append(list);
      }
      if(need){
        const eight=fullEight(),dirty=!sameSet(eight,saved||[]),over=q8.length-need,who=viewer();
        const actions=el('div',null,'cam-lg-actions');
        const save=btn(q8Saving?'Guardando…':q8.length===need&&who&&!dirty?'Tus 8 están guardados':'Guardar mis 8',
          'cam-nfl-action cam-lg-q8-save',saveQ8);
        save.disabled=q8Saving||q8.length!==need||(!!who&&!dirty);
        actions.append(save);
        if(!who)actions.append(btn('Iniciar sesión','cam-lg-link',()=>window.openUserAuthModal?.()));
        if(q8.length){const clear=btn('Quitar mis elecciones','cam-lg-link',()=>{q8=[];storeQ8();q8Note='';render();});clear.disabled=q8Saving;actions.append(clear);}
        choices.append(actions);
        choices.append(el('p',over>0?'Otro equipo ya entró por su cuenta: quita '+(over===1?'uno':over)+' de tus elegidos.'
          :dirty&&q8.length===need?(who?'Tienes cambios sin guardar.':'Pulsa «Guardar mis 8».')
          :'Puedes cambiarlos hasta el cierre.','cam-lg-hint'));
        const p=el('p',q8Note,'cam-lg-note'+(q8Kind?' is-'+q8Kind:''));p.setAttribute('role','status');p.setAttribute('aria-live','polite');choices.append(p);
      }
    }else{
      const mine=saved||[];
      if(mine.length){
        const list=el('div',null,'cam-lg-q8-list');list.setAttribute('role','list');list.setAttribute('aria-label','Tus 8');
        for(const id of mine){const t=cteam(id);if(t)list.append(q8Team(t,{readonly:true,showStatus:true}));}
        body.append(list);
      }else body.append(el('p','No elegiste tus 8 esta vez. El cuadro se abre en cuanto se confirmen los 8 clasificados.','cam-lg-sub'));
    }
    wrap.append(body);
    wrap.append(teaser(candTeams().filter(t=>t.status!=='out'),
      open&&closes?'Tu cuadro se abre el '+shortDay(plusDays(closes,2)):'Tu cuadro se abre al terminar la J17'));
    return wrap;
  }

  // ------------------------------------------------------------- Ronda a ronda
  function currentRound(){
    for(const r of ['final','sf','qf'])if(series(r).length)return r;
    return null;
  }
  function roundsPanel(){
    const active=currentRound();if(!active)return null;
    const shown=roundView&&series(roundView).length?roundView:active;
    const fin=shown==='final';
    const wrap=el('section',null,'cam-lg-rounds'+(fin?' is-final':''));
    wrap.setAttribute('aria-labelledby','camLiguillaRoundTitle');
    const stage=el('div',null,'cam-lg-stage');
    const rail=el('ol',null,'cam-lg-rail');rail.setAttribute('aria-label','Avance de la liguilla');
    const order=['qf','sf','final'],idx=order.indexOf(active);
    order.forEach((r,i)=>{
      const li=el('li',null,i<idx?'is-done':i===idx?'is-now':'');
      const label=ROUNDS[r].short,state_=i<idx?'Jugada':i===idx?'En curso':'Después';
      if(series(r).length){
        const b=btn(null,'cam-lg-rail-btn',()=>{roundView=r;render();});
        b.setAttribute('aria-pressed',String(r===shown));b.append(el('b',label),el('span',state_));li.append(b);
      }else li.append(el('b',label),el('span',state_));
      rail.append(li);
    });
    const main=el('div',null,'cam-lg-stage-main');
    const left=el('div',null,'cam-lg-left');left.setAttribute('aria-hidden','true');left.append(String(ROUNDS[shown].left),el('small','quedan'));
    const titles=el('div');const h=el('h3',ROUNDS[shown].title);h.id='camLiguillaRoundTitle';titles.append(h);
    const legs=series(shown).flatMap(s=>s.legs||[]).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    titles.append(el('p',legs.length?datesText(series(shown)):'Fechas por confirmar','cam-lg-stage-dates'));
    main.append(left,titles);
    stage.append(rail,main);wrap.append(stage);
    const body=el('div',null,'cam-lg-series-list'+(fin?' is-solo':''));
    body.append(el('p',fin?'Si empatan en el global: prórroga y penales. «¿Quién pasa?» los incluye.'
      :'Si empatan en el global, pasa el mejor de la tabla. «¿Quién pasa?» cierra al empezar la ida; acertar suma y fallar resta, como el 1X2.','cam-lg-rounds-hint'));
    series(shown).forEach(s=>body.append(seriesCard(s)));
    wrap.append(body);
    return wrap;
  }
  function datesText(list){
    const firsts=list.map(s=>legOf(s,s.leg1_id)).filter(Boolean).map(g=>g.kickoff);
    const seconds=list.map(s=>legOf(s,s.leg2_id)).filter(Boolean).map(g=>g.kickoff);
    const span=values=>{const days=[...new Set(values.sort().map(day))];return days.length>2?days[0]+' a '+days[days.length-1]:days.join(' y ');};
    return [firsts.length?'Ida '+span(firsts):'',seconds.length?'vuelta '+span(seconds):''].filter(Boolean).join(' · ');
  }
  function seriesCard(s){
    const fin=s.round==='final';
    const card=el('article',null,'cam-lg-series'+(fin?' is-final':'')+(s.status==='decided'?' is-decided':''));
    card.dataset.series=String(s.id);
    const top=el('div',null,'cam-lg-series-top');
    top.append(el('span',fin?'La Final':ROUNDS[s.round].short+' · serie '+(s.slot+1)),el('span',seedOf(s.high_id)+'.º vs '+seedOf(s.low_id)+'.º'));
    card.append(top);
    const title=el('h4',null,'cam-lg-series-title');
    const side=id=>{const span=el('span',null,'cam-lg-series-team');span.append(crest(id,28),el('strong',fullName(id)));return span;};
    title.append(side(s.high_id),el('span','vs','cam-lg-vs'),side(s.low_id));card.append(title);
    card.append(passBox(s));
    // El 1X2 de la ida y la vuelta va plegado: «¿Quién pasa?» es lo primero. Se abre solo
    // en cuanto hay algo que ver (en vivo o con marcador) o si ya elegiste en alguno.
    const g1=legOf(s,s.leg1_id),g2=legOf(s,s.leg2_id),snap=api()?.snapshot?.();
    const busy=[g1,g2].some(g=>g&&(g.status==='live'||g.status==='final'||snap?.mine?.get?.(g.id)));
    const legs=el('details',null,'cam-lg-legs');legs.open=!!busy||openLegs.has(s.id);
    legs.addEventListener('toggle',()=>{if(legs.open)openLegs.add(s.id);else openLegs.delete(s.id);});
    legs.append(el('summary','Marcador de ida y vuelta','cam-lg-legs-sum'),legRow(s,'Ida',s.leg1_id),legRow(s,'Vuelta',s.leg2_id));
    card.append(legs);
    const played=[g1,g2].some(g=>g&&g.status==='final');
    if(played||s.status==='decided'||s.status==='penalties')card.append(el('p',seriesFoot(s),'cam-lg-series-foot'));
    if(isAdmin()&&s.status==='penalties')card.append(adminWinner(s));
    return card;
  }
  function passBox(s){
    const box=el('div',null,'cam-lg-pass');
    const head=el('div',null,'cam-lg-pass-head');
    const leg1=legOf(s,s.leg1_id);
    const open=s.status==='open'&&leg1&&leg1.status==='scheduled'&&Date.parse(leg1.kickoff)>now()&&s.points_high!=null;
    head.append(el('b','¿Quién pasa?'),el('span',!leg1?'Se abre al confirmarse la ida':open?'Cierra '+clock(leg1.kickoff):'Cerrado'));
    box.append(head);
    const mine=mySeriesPick(s.id);
    const opts=el('div',null,'cam-lg-pass-options');
    for(const id of [s.high_id,s.low_id]){
      const value=id===s.high_id?s.points_high:s.points_low;
      const chosen=mine?.team_id===id;
      const b=el('button',null,'cam-lg-opt'+(chosen?' is-chosen':''));b.type='button';b.disabled=!open;b.setAttribute('aria-pressed',String(chosen));
      b.append(el('span',shortName(id)));
      let tag=value==null?'–':'+'+value;
      if(chosen&&mine.settled_at)tag=(mine.awarded_points>0?'+':'−')+Math.abs(mine.awarded_points);
      b.append(el('em',tag,chosen&&mine.settled_at?(mine.awarded_points>0?'is-hit':'is-miss'):''));
      b.setAttribute('aria-label','Pasa '+fullName(id)+(value!=null?': '+value+' puntos si aciertas, '+value+' menos si fallas':''));
      b.addEventListener('click',()=>pickSeries(s,chosen?null:id));
      opts.append(b);
    }
    box.append(opts);
    return box;
  }
  async function pickSeries(s,id){
    if(!viewer()){window.openUserAuthModal?.();return;}
    try{
      const {error}=await client().rpc('cam_liguilla_save_series_pick',{p_series:s.id,p_team:id});
      if(error)throw error;
      const rest=(state.mine?.series||[]).filter(p=>p.series_id!==s.id);
      if(id)rest.push({series_id:s.id,team_id:id,awarded_points:0,settled_at:null});
      state.mine={...(state.mine||{bracket:[]}),series:rest};
      note=id?'Guardado: pasa '+shortName(id)+'.':'Quitaste tu elección de esta serie.';noteKind='ok';
    }catch(error){note=error?.message||'No se pudo guardar.';noteKind='error';}
    render();
    section.querySelector('[data-series="'+s.id+'"] .cam-lg-opt[aria-pressed="true"]')?.focus({preventScroll:true});
  }
  function legRow(s,label,id){
    const row=el('div',null,'cam-lg-leg');
    const g=id?legOf(s,id):null;
    const top=el('div',null,'cam-lg-leg-top');
    if(!g){top.append(el('span',null),el('span'));top.firstChild.append(el('b',label),' · por confirmar');row.append(top);return row;}
    const left=el('span');left.append(el('b',label),' · '+clock(g.kickoff));
    const snap=api()?.snapshot?.();const mine=snap?.mine?.get?.(g.id)||null;
    const openGame=!!api()?.isOpen?.(g);
    let status=g.status==='final'?g.home_score+' – '+g.away_score:g.status==='live'?'En vivo':openGame?(mine?'Guardado':'Abierto'):Date.parse(g.kickoff)<=now()?'Cerrado':g.odds_locked_at?'Cerrado':'Preparando puntos';
    top.append(left,el('span',status,'cam-lg-leg-status'));row.append(top);
    const grid=el('div',null,'cam-lg-x3');
    for(const [pick,name,value] of [['home',shortName(g.home_id),g.points_home],['draw','Empate',g.points_draw],['away',shortName(g.away_id),g.points_away]]){
      const chosen=mine===pick;
      const b=el('button',null,'cam-lg-opt'+(chosen?' is-chosen':'')+(g.status==='final'&&g.outcome?(g.outcome===pick?' is-winner':' is-loser'):''));
      b.type='button';b.disabled=!openGame;b.setAttribute('aria-pressed',String(chosen));
      b.append(el('span',name),el('em',value==null?'–':'+'+value));
      b.setAttribute('aria-label',label+': '+name+(value!=null?', '+value+' puntos':''));
      b.addEventListener('click',async()=>{if(!viewer()){window.openUserAuthModal?.();return;}await api()?.save?.(g.id,pick);});
      grid.append(b);
    }
    row.append(grid);
    return row;
  }
  function seriesFoot(s){
    const g1=legOf(s,s.leg1_id),g2=legOf(s,s.leg2_id);
    const goals=id=>[g1,g2].filter(g=>g&&g.status==='final').reduce((n,g)=>n+(g.home_id===id?g.home_score:g.away_score),0);
    const played=[g1,g2].some(g=>g&&g.status==='final');
    const agg=played?'Global: '+shortName(s.high_id)+' '+goals(s.high_id)+' – '+goals(s.low_id)+' '+shortName(s.low_id)+'. ':'';
    if(s.status==='decided')return agg+'Pasa '+fullName(s.winner_id)+'.';
    if(s.status==='penalties')return agg+'Empate en el global: se decide en los penales.';
    return agg+(s.round==='final'?'Si empatan en el global: prórroga y penales.':'Si empatan en el global, pasa '+shortName(s.high_id)+' por terminar mejor en la tabla.');
  }
  function adminWinner(s){
    const box=el('div',null,'cam-lg-admin-winner');
    box.append(el('p','Administrar · ¿quién ganó los penales?'));
    const reason=el('input');reason.type='text';reason.placeholder='Motivo (p. ej. Penales 4-3)';reason.setAttribute('aria-label','Motivo');
    box.append(reason);
    for(const id of [s.high_id,s.low_id])box.append(btn('Gana '+shortName(id),'cam-nfl-action cam-nfl-action-secondary',async()=>{
      try{const {error}=await client().rpc('cam_liguilla_admin_winner',{p_series:s.id,p_team:id,p_reason:reason.value});if(error)throw error;
        note='Serie decidida: pasa '+shortName(id)+'.';noteKind='ok';stale=true;sync();}
      catch(error){note=error?.message||'No se pudo guardar.';noteKind='error';render();}
    }));
    return box;
  }

  // ------------------------------------------------------------- Abrir (administración)
  function torontoISO(local){
    // «2026-11-25T19:00» en hora de Toronto → instante exacto.
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local||'');if(!m)return null;
    const guess=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
    const offset=at=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Toronto',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(at));
      const v=k=>+p.find(x=>x.type===k).value;return Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'))-at;};
    const first=guess-offset(guess);return new Date(guess-offset(first)).toISOString();
  }
  function torontoLocal(iso){
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(iso));
    const v=k=>p.find(x=>x.type===k).value;return v('year')+'-'+v('month')+'-'+v('day')+'T'+v('hour')+':'+v('minute');
  }
  function adminPanel(){
    const d=el('details',null,'cam-lg-admin');d.open=!state;
    const status=el('p','','cam-lg-note');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    d.append(el('summary',state?'Administrar · Rehacer la apertura (nadie ha guardado su cuadro)':'Administrar · Abrir «Tu liguilla»'));
    d.append(el('p','Cuando termine la jornada 17, carga la tabla oficial, revisa los 8 y abre el cuadro. Se cerrará solo en el primer partido de cuartos y los puntos quedan congelados al abrir.','cam-lg-hint'));
    const loadBtn=btn(adminTable?'Volver a cargar la tabla':'Cargar tabla de ESPN','cam-nfl-action cam-nfl-action-secondary',async()=>{
      adminMessage='Cargando tabla…';render();
      try{const {data,error}=await client().rpc('cam_liguilla_admin_table');if(error)throw error;
        adminTable=(Array.isArray(data)?data:[]).map(r=>({team_id:String(r.team_id),name:r.name,played:+r.played,points:+r.points,goal_diff:+r.goal_diff,rank:+r.rank}));
        adminTable.start=await firstKickoff(adminTable.slice(0,8));
        adminMessage='Tabla cargada. Revisa el orden antes de abrir.';}
      catch(error){adminMessage=error?.message||'No se pudo cargar la tabla.';}
      render();
    });
    d.append(loadBtn);
    const rows=adminTable?adminTable.slice(0,8):state?seeds().map(s=>({team_id:s.team_id,name:s.name,played:s.played,points:s.points,goal_diff:s.goal_diff})):null;
    if(rows){
      const form=el('form',null,'cam-lg-admin-form');form.noValidate=true;
      const options=(adminTable||rows);
      const grid=el('div',null,'cam-lg-admin-grid');
      for(const h of ['#','Equipo','PJ','Pts','DG'])grid.append(el('span',h,'cam-lg-admin-th'));
      rows.forEach((r,i)=>{
        grid.append(el('span',String(i+1)+'.º','cam-lg-admin-seed'));
        const sel=el('select');sel.name='team'+i;sel.setAttribute('aria-label','Puesto '+(i+1));
        for(const o of options){const opt=el('option',o.name);opt.value=o.team_id;if(o.team_id===r.team_id)opt.selected=true;sel.append(opt);}
        sel.addEventListener('change',()=>{const o=options.find(x=>x.team_id===sel.value),f=form.elements;if(o){f.namedItem('played'+i).value=o.played;f.namedItem('points'+i).value=o.points;f.namedItem('gd'+i).value=o.goal_diff;}});
        grid.append(sel);
        for(const [k,v,label] of [['played',r.played,'Partidos'],['points',r.points,'Puntos'],['gd',r.goal_diff,'Diferencia']]){
          const input=el('input');input.type='number';input.name=k+i;input.value=String(v??'');input.inputMode='numeric';input.setAttribute('aria-label',label+' del '+(i+1)+'.º');grid.append(input);
        }
      });
      form.append(grid);
      const name=el('input');name.name='lgName';name.value=state?.liguilla?.name||W()?.name||'Apertura '+(api()?.snapshot?.()?.season||new Date().getFullYear());
      const start=el('input');start.type='datetime-local';start.name='lgStart';
      const startISO=adminTable?.start||state?.liguilla?.starts_at||null;if(startISO)start.value=torontoLocal(startISO);
      const reseed=el('input');reseed.type='checkbox';reseed.name='lgReseed';reseed.checked=state?.liguilla?.reseed!==false;
      const field=(label,input)=>{const l=el('label',label,'cam-lg-admin-field');l.append(input);return l;};
      form.append(field('Nombre',name),field('Primer partido de cuartos (hora de Toronto)',start));
      const chk=el('label',null,'cam-lg-admin-check');chk.append(reseed,el('span','Reclasificar en semifinales (el mejor que sigue vivo contra el peor)'));form.append(chk);
      const submit=btn('Abrir «Tu liguilla»','cam-nfl-action');submit.type='submit';
      // Confirmar sin repintar: lo que el administrador escribió se queda en el formulario.
      const confirm=el('div',null,'cam-lg-admin-confirm');confirm.hidden=true;
      confirm.append(el('p','Se congelan las probabilidades y los puntos. En cuanto alguien guarde su cuadro ya no se puede rehacer.','cam-lg-hint'),
        btn('Cancelar','cam-lg-link',()=>{confirm.hidden=true;submit.textContent='Abrir «Tu liguilla»';}));
      form.append(submit,confirm);
      form.addEventListener('submit',async e=>{
        e.preventDefault();
        const f=form.elements,v=n=>f.namedItem(n)?.value,say=text=>{status.textContent=text;};
        const iso=torontoISO(v('lgStart'));
        if(!iso){say('Pon la fecha y la hora del primer partido de cuartos.');return;}
        if(confirm.hidden){confirm.hidden=false;submit.textContent='Sí, abrir con estos 8';say('');return;}
        const teams=rows.map((_,i)=>({team_id:v('team'+i),played:+v('played'+i),points:+v('points'+i),goal_diff:+v('gd'+i)}));
        submit.disabled=true;say('Abriendo…');
        try{
          const {error}=await client().rpc('cam_liguilla_admin_open',{p_season:api()?.snapshot?.()?.season,p_name:String(v('lgName')||'').trim(),
            p_starts_at:iso,p_teams:teams,p_reseed:!!f.namedItem('lgReseed')?.checked});
          if(error)throw error;
          adminMessage='«Tu liguilla» está abierta.';adminTable=null;stale=true;sync();
        }catch(error){submit.disabled=false;confirm.hidden=true;submit.textContent='Abrir «Tu liguilla»';say(error?.message||'No se pudo abrir.');}
      });
      d.append(form);
    }
    status.textContent=adminMessage;d.append(status);
    return d;
  }
  async function firstKickoff(top8){
    // Primer saque entre dos rivales de cuartos (en casa del peor sembrado), si ESPN ya lo publicó.
    try{
      const {data}=await client().from('cam_football_games').select('kickoff,home_id,away_id')
        .eq('competition','ligamx').gt('kickoff',new Date().toISOString()).order('kickoff',{ascending:true}).limit(80);
      const ids=top8.map(r=>r.team_id);
      const hit=(data||[]).filter(g=>QF.some(([h,l])=>g.home_id===ids[l-1]&&g.away_id===ids[h-1]))
        .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff))[0];
      return hit?.kickoff||null;
    }catch{return null;}
  }

  // ------------------------------------------------------------- Pintar
  function render(){
    const snap=api()?.snapshot?.();
    if(!snap||snap.competition!=='ligamx'){hide();return;}
    const admin=isAdmin();
    const complete=!!state&&series('final').length>0&&series('final').every(s=>s.status==='decided');
    section.dataset.complete=String(complete);
    section.hidden=false;
    const focusKey=document.activeElement&&section.contains(document.activeElement)?keyOf(document.activeElement):null;
    const parts=[];
    // Un solo recuadro: «mis 8» antes de abrir, el cuadro con puntos después.
    if(!state)parts.push(cand?qualifiersPanel():pendingPanel());
    if(loadError)parts.push(el('p',loadError,'cam-lg-note is-error'));
    if(state){
      parts.push(bracketPanel());
      const rounds=roundsPanel();if(rounds)parts.push(rounds);
      if(!isOpen())parts.push(message());
    }
    if(admin&&(!state||(isOpen()&&!Number(state.players||0))))parts.push(adminPanel());
    if(complete){
      const archive=el('details',null,'cam-lg-archive');
      archive.append(el('summary','Liguilla · '+(L().name||'Liga MX')+' · Mi cuadro y resultados'),...parts);
      section.replaceChildren(archive);
    }else section.replaceChildren(...parts);
    place(complete);
    if(!complete)window.camFootballSemana?.render?.();
    // Durante la liguilla, la ronda reemplaza a la lista de la jornada (mismos partidos).
    const legs=allLegIds(),round=snap.games||[];
    quiniela.classList.toggle('cam-liguilla-round',!!state&&round.length>0&&round.every(g=>legs.has(g.id)));
    if(focusKey){const again=section.querySelector(focusKey);again?.focus?.({preventScroll:true});}
  }
  function keyOf(node){
    const b=node.closest('button');if(!b)return null;
    const card=b.closest('[data-series]');
    if(b.classList.contains('cam-lg-q8-team'))return '.cam-lg-q8-team[data-team="'+CSS.escape(b.dataset.team)+'"]';
    if(b.dataset.team){const round=b.closest('.cam-lg-round');const i=[...section.querySelectorAll('.cam-lg-round')].indexOf(round);
      return '.cam-lg-round:nth-of-type('+(i+1)+') .cam-lg-team[data-team="'+CSS.escape(b.dataset.team)+'"]';}
    if(card)return null;
    return null;
  }

  document.addEventListener('cam:football-quiniela-data',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)stale=true;});
  window.addEventListener('focus',()=>{stale=true;});
  window.addEventListener('cam:admin-state-change',()=>render());
  window.camLiguilla=Object.freeze({refresh:()=>{stale=true;sync();},render,state:()=>state,shareModel});
  sync();
})();
