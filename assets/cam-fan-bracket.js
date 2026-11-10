/* CAM SPORTS · Cuadro libre de Liga MX. No altera los cruces oficiales ni la quiniela puntuable. */
(() => {
  'use strict';
  if(window.CamFanBracket)return;
  const slots=()=>({teams:Array(8).fill(null),semis:Array(4).fill(null),finalists:[null,null],champion:null});
  const txt=(tag,value,cls)=>{const node=document.createElement(tag);if(value!=null)node.textContent=String(value);if(cls)node.className=cls;return node;};
  const button=(label,cls,fn)=>{const node=txt('button',label,cls);node.type='button';node.addEventListener('click',fn);return node;};
  const client=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return null;}};
  const rerender=()=>window.camLiguilla?.render?.();
  let season=null,owner=null,model=slots(),opened=false,clubs=[],loading=false,loaded=false,cloudLoaded=false,saving=false,message='',messageError=false;
  // No se habilitan selecciones hasta que el estado oficial contenga ocho
  // clasificados distintos, con los puestos 1–8 confirmados.
  let qualifiedKey='',qualified=false,seededTeams=[];
  const officialSeeds=official=>{
    if(!official?.liguilla||!Array.isArray(official.seeds)||official.seeds.length!==8)return null;
    const seeds=[...official.seeds].sort((a,b)=>Number(a.seed)-Number(b.seed));
    if(seeds.some((t,i)=>Number(t.seed)!==i+1||!t.team_id))return null;
    if(new Set(seeds.map(t=>String(t.team_id))).size!==8)return null;
    return seeds;
  };
  const seededOrder=seeds=>[0,7,1,6,2,5,3,4].map(i=>String(seeds[i].team_id));
  const matchesOfficial=b=>valid(b)&&b.teams.every((id,i)=>String(id)===seededTeams[i]);
  function useOfficialSeeds(seeds,official){
    const key=String(official.liguilla.id)+'|'+seeds.map(t=>t.team_id).join(',');
    if(qualifiedKey===key)return;
    qualifiedKey=key;qualified=true;
    seededTeams=seededOrder(seeds);
    clubs=seeds.map(t=>({...t,id:String(t.team_id)}));
    loaded=true;loading=false;
    // Descarta selecciones antiguas hechas antes de conocerse los cruces.
    if(!matchesOfficial(model))model={...slots(),teams:[...seededTeams]};
    else clean(model);
  }
  const key=()=>['cam-sports','cuadro-libre','ligamx',season,owner||'invitado'].join(':');
  const storage=()=>{try{return JSON.parse(localStorage.getItem(key())||'null');}catch{return null;}};
  const valid=d=>d&&Array.isArray(d.teams)&&d.teams.length===8&&Array.isArray(d.semis)&&d.semis.length===4&&Array.isArray(d.finalists)&&d.finalists.length===2&&('champion' in d);
  const write=()=>{try{localStorage.setItem(key(),JSON.stringify(model));}catch{}};
  const id=v=>v==null||v===''?null:String(v);
  function clean(d){
    d.teams=d.teams.map(id);d.semis=d.semis.map(id);d.finalists=d.finalists.map(id);d.champion=id(d.champion);
    const used=new Set();
    d.teams=d.teams.map(x=>{if(!x||used.has(x))return null;used.add(x);return x;});
    for(let n=0;n<4;n++)if(![d.teams[n*2],d.teams[n*2+1]].includes(d.semis[n]))d.semis[n]=null;
    for(let n=0;n<2;n++)if(![d.semis[n*2],d.semis[n*2+1]].includes(d.finalists[n]))d.finalists[n]=null;
    if(!d.finalists.includes(d.champion))d.champion=null;
    return d;
  }
  function sync(snap,official,viewer){
    const newOwner=viewer?.id||null;
    if(season===snap.season&&owner===newOwner)return;
    season=snap.season;owner=newOwner;loaded=false;loading=false;cloudLoaded=false;clubs=[];message='';messageError=false;qualified=false;qualifiedKey='';seededTeams=[];opened=false;
    const local=storage();
    // Un visitante que inicia sesión no pierde las selecciones hechas antes de autenticarse.
    let guest=null;
    if(owner)try{guest=JSON.parse(localStorage.getItem(['cam-sports','cuadro-libre','ligamx',season,'invitado'].join(':'))||'null');}catch{}
    if(valid(local))model=clean(local);
    else if(valid(guest))model=clean(guest);
    else if(official?.seeds?.length===8){
      const s=[...official.seeds].sort((a,b)=>a.seed-b.seed);
      model={...slots(),teams:[0,7,1,6,2,5,3,4].map(n=>id(s[n]?.team_id))};
    }else model=slots();
    // La vista permanece bloqueada hasta recibir los ocho puestos oficiales.
  }
  const team=x=>clubs.find(t=>t.id===x)||null;
  const name=x=>team(x)?.short_name||team(x)?.name||x||'Por elegir';
  const full=x=>team(x)?.name||name(x);
  const complete=()=>model.teams.every(Boolean)&&model.semis.every(Boolean)&&model.finalists.every(Boolean)&&!!model.champion;
  const choices=()=>model.semis.filter(Boolean).length+model.finalists.filter(Boolean).length+(model.champion?1:0);
  function edit(fn){if(!qualified)return;fn();clean(model);write();message='';messageError=false;rerender();}
  async function loadCloud(){
    if(!owner||cloudLoaded)return;
    cloudLoaded=true;
    const previousOwner=owner,previousSeason=season;
    try{
      const c=client();if(!c)return;
      const {data,error}=await c.from('cam_liguilla_fan_brackets').select('bracket').eq('user_id',owner).eq('season',season).maybeSingle();
      if(error)throw error;
      if(previousOwner!==owner||previousSeason!==season)return;
      if(qualified&&data&&matchesOfficial(data.bracket)&&!storage()){model=clean(data.bracket);write();rerender();}
    }catch{ /* El borrador local sigue funcionando si falla el servicio. */ }
  }
  async function start(){
    if(!qualified)return;
    opened=true;
    if(owner&&!cloudLoaded)void loadCloud();
    rerender();
  }
  function selector(pos){
    const row=txt('div',null,'cam-fan-team-select');
    const label=txt('span',name(model.teams[pos]),'cam-fan-select');
    label.setAttribute('aria-label','Clasificado '+(pos+1)+' de cuartos');
    row.append(label);
    const selected=model.teams[pos]===model.semis[Math.floor(pos/2)]&&!!model.semis[Math.floor(pos/2)];
    const go=button(selected?'✓':'›','cam-fan-pass'+(selected?' is-selected':''),()=>edit(()=>{
      const pair=Math.floor(pos/2);model.semis[pair]=model.teams[pos];
    }));
    go.disabled=!qualified||!model.teams[pos]||!model.teams[Math.floor(pos/2)*2]||!model.teams[Math.floor(pos/2)*2+1];
    go.setAttribute('aria-label','Clasificar a '+name(model.teams[pos])+' a semifinales');
    go.setAttribute('aria-pressed',String(selected));
    row.append(go);return row;
  }
  function pairBox(index){
    const pair=txt('div',null,'cam-fan-pair');
    pair.append(txt('small','Cruce '+(index+1),'cam-fan-match-label'),selector(index*2),selector(index*2+1));
    return pair;
  }
  function advance(value,chosen,fn,aria){
    const selected=value&&value===chosen;
    const b=button(value?name(value):'Por definir','cam-fan-option'+(selected?' is-selected':''),()=>edit(fn));
    b.disabled=!value;b.setAttribute('aria-label',aria+' '+name(value));b.setAttribute('aria-pressed',String(!!selected));
    return b;
  }
  function semi(index){
    const a=model.semis[index*2],b=model.semis[index*2+1],node=txt('div',null,'cam-fan-pair');
    node.append(txt('small','Semifinal '+(index+1),'cam-fan-match-label'));
    node.append(advance(a,model.finalists[index],()=>{model.finalists[index]=a;},'Pasar a la final a'));
    node.append(advance(b,model.finalists[index],()=>{model.finalists[index]=b;},'Pasar a la final a'));
    return node;
  }
  function column(title,klass,nodes){
    const n=txt('section',null,'cam-fan-column '+klass);n.append(txt('h4',title,'cam-fan-column-title'),...nodes);return n;
  }
  function trophy(){
    const center=txt('section',null,'cam-fan-center');
    center.append(txt('span','CAM SPORTS · MI PRONÓSTICO','cam-fan-centre-kicker'),txt('h4','La final'));
    const pair=txt('div',null,'cam-fan-final-pair');
    for(const value of model.finalists)pair.append(advance(value,model.champion,()=>{model.champion=value;},'Elegir campeón:'));
    const champ=txt('div',null,'cam-fan-champion');
    champ.append(txt('span','★','cam-fan-star'),txt('small','MI CAMPEÓN'),txt('strong',model.champion?full(model.champion):'Por decidir'));
    center.append(pair,champ);return center;
  }
  async function save(){
    if(saving||!qualified)return;
    write();
    if(!owner){message='Guardado en este dispositivo. Inicia sesión para sincronizarlo con tu cuenta.';messageError=false;rerender();return;}
    saving=true;message='';rerender();
    try{
      const c=client();if(!c)throw Error('Sin conexión');
      const data={user_id:owner,season,bracket:model,updated_at:new Date().toISOString()};
      const {error}=await c.from('cam_liguilla_fan_brackets').upsert(data,{onConflict:'user_id,season'});
      if(error)throw error;
      message='Cuadro guardado en tu cuenta. Puedes volver y editarlo cuando quieras.';messageError=false;
    }catch{message='Tu cuadro se guardó en este dispositivo, pero no se pudo sincronizar con tu cuenta.';messageError=true;}
    finally{saving=false;rerender();}
  }
  function shareModel(){
    if(!qualified||!complete())return null;
    const entry=x=>({name:name(x),full:full(x),seed:model.teams.indexOf(x)+1});
    const side=n=>({
      pair:[entry(model.semis[n*2]),entry(model.semis[n*2+1])],winner:entry(model.finalists[n]),
      qfs:[0,1].map(i=>{const k=n*2+i;return {pair:[entry(model.teams[k*2]),entry(model.teams[k*2+1])],winner:entry(model.semis[k])};})
    });
    return {name:'Mi cuadro libre · Liga MX '+season,user:owner?String((typeof currentUser!=='undefined'&&currentUser?.username)||'').replace(/^@/,''):'',
      champion:entry(model.champion),runner:entry(model.finalists.find(x=>x!==model.champion)),sides:[side(0),side(1)],liguilla:null};
  }
  function share(source){
    const m=shareModel();
    if(m&&window.CamPickShare?.openBracket)window.CamPickShare.openBracket(m,{opener:source});
  }
  function panel(snap,official,viewer){
    if(!snap||snap.competition!=='ligamx')return null;
    sync(snap,official,viewer);
    const seeds=officialSeeds(official);
    if(seeds)useOfficialSeeds(seeds,official);
    else{qualified=false;qualifiedKey='';seededTeams=[];opened=false;clubs=[];loaded=false;}
    const root=txt('section',null,'cam-fan-shell');root.setAttribute('aria-label','Arma tu cuadro de Liga MX');
    const head=txt('div',null,'cam-fan-intro');
    const heading=txt('div',null,'cam-fan-intro-copy');
    heading.append(txt('p','LIGA MX · LA LIGUILLA','cam-fan-eyebrow'),txt('h3','Arma tu cuadro'),
      txt('p',qualified?'Elige quién avanza en cada ronda hasta llegar al campeón.':'Pronto estará disponible. Podrás armar tu cuadro cuando estén confirmados los 8 clasificados de la Liguilla.','cam-fan-lead'));
    const toggle=button(!qualified?'Próximamente':opened?'Ocultar cuadro':'Arma tu cuadro','cam-nfl-action cam-fan-toggle',()=>{if(!qualified)return;if(opened){opened=false;rerender();}else void start();});
    toggle.disabled=!qualified;
    if(!qualified)toggle.title='Disponible cuando se confirmen los ocho clasificados';
    toggle.setAttribute('aria-expanded',String(qualified&&opened));head.append(heading,toggle);root.append(head);
    if(!qualified||!opened)return root;
    const tree=txt('div',null,'cam-fan-tree');
    tree.append(column('Cuartos · lado A','cam-fan-left-quarter',[pairBox(0),pairBox(1)]),
      column('Semifinal A','cam-fan-left-semi',[semi(0)]),trophy(),
      column('Semifinal B','cam-fan-right-semi',[semi(1)]),
      column('Cuartos · lado B','cam-fan-right-quarter',[pairBox(2),pairBox(3)]));
    root.append(tree);
    const actions=txt('div',null,'cam-fan-actions');
    actions.append(txt('span',model.teams.filter(Boolean).length+'/8 equipos · '+choices()+'/7 decisiones','cam-fan-count'));
    const saveBtn=button(saving?'Guardando…':'Guardar mi cuadro','cam-nfl-action',save);saveBtn.disabled=!qualified||saving||!model.teams.some(Boolean);
    const shareBtn=button('Compartir en redes','cam-nfl-action cam-nfl-action-secondary',e=>share(e.currentTarget));
    shareBtn.disabled=!qualified||!complete()||!window.CamPickShare?.openBracket;
    shareBtn.title=complete()?'Genera tu imagen para Instagram, TikTok, X o historias':'Elige los ocho equipos y tu campeón para compartir';
    actions.append(saveBtn,shareBtn,button('Reiniciar','cam-fan-reset',()=>{
      edit(()=>{model={...slots(),teams:[...seededTeams]};});}));
    root.append(actions);
    if(message)root.append(txt('p',message,'cam-fan-status'+(messageError?' is-error':'')));
    root.append(txt('p','Cuadro libre de la comunidad: no son cruces oficiales ni genera puntos de quiniela.','cam-fan-disclaimer'));
    return root;
  }
  window.CamFanBracket=Object.freeze({panel,shareModel});
})();
