/* CAM SPORTS · Analítica de visitas y procedencia. Sin IP, cookies ni servicios externos. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Navegadores automáticos (pruebas de GitHub, Lighthouse, rastreadores) no cuentan como visitas.
  const AUTOMATED = navigator.webdriver === true ||
    /HeadlessChrome|Lighthouse|PhantomJS|Googlebot|bingbot|crawler|spider/i.test(navigator.userAgent || '');
  const OPT_OUT = Boolean(AUTOMATED || navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1');
  const SESSION_KEY = 'cam_site_session_v1';
  const VISITOR_KEY = 'cam_site_visitor_v1';
  const SESSION_WINDOW = 30 * 60 * 1000;
  const VISITOR_WINDOW = 30 * 24 * 60 * 60 * 1000;
  const sections = {'Todos':'Inicio','Picks':'Picks','NFL':'NFL','Fútbol':'Fútbol',
    'Opiniones':'Opiniones','Fútbol Americano Colegial':'Colegial','NBA':'NBA',
    'Tenis':'Tenis','Ciclismo':'Ciclismo'};
  const safe = (v,length=80) => String(v||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,length);
  const uuid = () => (window.crypto?.randomUUID?.()||null);

  function visitorId() {
    const now=Date.now();
    try {
      const existing=JSON.parse(localStorage.getItem(VISITOR_KEY)||'null');
      if(existing?.id&&existing?.expires>now&&/^[0-9a-f-]{36}$/i.test(existing.id))return existing.id;
    } catch {}
    const id=uuid();
    if(!id)return null;
    try {localStorage.setItem(VISITOR_KEY,JSON.stringify({id,expires:now+VISITOR_WINDOW}));}catch {}
    return id;
  }
  function sessionId() {
    const now=Date.now();
    let previous=null;
    try {previous=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch {}
    const id=previous?.id&&now-previous.at<SESSION_WINDOW&&now>=previous.at&&
      /^[0-9a-f-]{36}$/i.test(previous.id)?previous.id:uuid();
    if(!id)return null;
    try {sessionStorage.setItem(SESSION_KEY,JSON.stringify({id,at:now}));}catch {}
    return id;
  }
  function normalizeSource(value) {
    const str=safe(value,60).toLowerCase();
    if(!str)return 'Desconocido';
    const platforms=[
      [/instagram|instagr|ig\.me/,'Instagram'],[/tiktok/,'TikTok'],
      [/facebook|fb\.com|fb\.me|m\.facebook/,'Facebook'],
      [/whatsapp|wa\.me/,'WhatsApp'],
      [/^(?:x|twitter|(?:[a-z0-9.-]*\.)?twitter\.com|(?:[a-z0-9.-]*\.)?x\.com|t\.co)$/,'X'],
      [/youtube|youtu\.be/,'YouTube'],
      [/linkedin|lnkd\.in/,'LinkedIn'],
      [/reddit/,'Reddit'],[/google/,'Google'],[/bing/,'Bing'],
      [/duckduckgo/,'DuckDuckGo'],[/telegram|t\.me/,'Telegram']
    ];
    for(const [pattern,label] of platforms)if(pattern.test(str))return label;
    return safe(value,60);
  }
  function origin() {
    const params=new URL(location.href).searchParams;
    const campaign=safe(params.get('utm_campaign'),80);
    const medium=safe(params.get('utm_medium'),40);
    const utmSource=safe(params.get('utm_source'),60);
    if(utmSource)return {source:normalizeSource(utmSource),medium,campaign};
    if(document.referrer) {
      try {
        const from=new URL(document.referrer);
        const host=from.hostname.toLowerCase().replace(/^www\./,'');
        if(host&&host!==location.hostname.toLowerCase().replace(/^www\./,'')) {
          const normalized=normalizeSource(host);
          return {source:normalized===host?'Referido: '+safe(host,48):normalized,medium,campaign};
        }
      } catch {}
    }
    return {source:'Desconocido',medium,campaign};
  }

  let entryOrigin=origin();
  function track(section='Inicio') {
    if(OPT_OUT||typeof db==='undefined'||!db?.rpc)return;
    const session=sessionId(),visitor=visitorId();
    if(!session||!visitor)return;
    const payload={p_session_id:session,p_visitor_id:visitor,
      p_source:entryOrigin.source,p_medium:entryOrigin.medium,
      p_campaign:entryOrigin.campaign,p_section:sections[section]||'Inicio'};
    // No bloquear la navegación; los fallos de red no se vuelcan a un registro público.
    db.rpc('cam_track_site_visit',payload).then(({error})=>{
      if(error)console.warn('CAM estadísticas: visita no registrada',error.code||error.message);
    }).catch(()=>{});
  }

  const number = value => Number(value||0).toLocaleString('es-ES');
  const element=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  function metric(label,value) {
    const node=element('div','cam-analytics-metric');
    node.append(element('small',null,label),element('strong',null,number(value)));
    return node;
  }
  function ranked(id,records,empty) {
    const parent=$(id);if(!parent)return;
    parent.replaceChildren();
    if(!records?.length){parent.append(element('p','cam-analytics-empty',empty));return;}
    const peak=Math.max(1,...records.map(r=>Number(r.visits||0)));
    records.forEach((r,i)=>{
      const item=element('li','cam-analytics-rank');
      const top=element('div','cam-analytics-rank-top');
      top.append(element('span',null,(i+1)+'. '+String(r.name||'Otro')),element('strong',null,number(r.visits)));
      const bg=element('div','cam-analytics-track');
      const bar=element('span','cam-analytics-fill');
      bar.style.width=(100*Number(r.visits||0)/peak).toFixed(1)+'%';
      bg.append(bar);item.append(top,bg);parent.append(item);
    });
  }
  function days(records) {
    const parent=$('camAnalyticsDays');if(!parent)return;
    parent.replaceChildren();
    const peak=Math.max(1,...(records||[]).map(d=>Number(d.visits||0)));
    for(const d of records||[]){
      const item=element('div','cam-analytics-day');
      const date=new Date(String(d.date)+'T12:00:00');
      const dateLabel=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'}).format(date);
      const bar=element('span','cam-analytics-day-bar');
      bar.style.height=Math.max(2,100*Number(d.visits||0)/peak)+'%';
      bar.title=dateLabel+': '+number(d.visits)+' visitas';
      item.setAttribute('aria-label',bar.title);
      item.append(bar,element('small',null,String(date.getDate())));
      parent.append(item);
    }
  }
  function render(data) {
    const stats=$('camAnalyticsStats');
    stats.replaceChildren(
      metric('Hoy',data.today_visits),
      metric('Últimos 7 días',data.last7_visits),
      metric('Últimos 30 días',data.last30_visits),
      metric('Visitantes aprox. (30 días)',data.unique30)
    );
    $('camAnalyticsTotal').textContent=number(data.total_visits);
    days(data.daily);
    ranked('camAnalyticsSources',data.sources,'Todavía no hay visitas con origen registrado.');
    ranked('camAnalyticsSections',data.sections,'Todavía no hay actividad por secciones.');
    ranked('camAnalyticsCampaigns',data.campaigns,'Todavía no hay enlaces con campañas UTM.');
  }
  async function open() {
    if(typeof currentAdmin==='undefined'||!currentAdmin)return;
    const dialog=$('camAnalyticsDialog');
    if(!dialog)return;
    if(!dialog.open)dialog.showModal();
    const status=$('camAnalyticsStatus');
    status.textContent='Cargando estadísticas…';
    try {
      const {data,error}=await db.rpc('cam_analytics_summary');
      if(error)throw error;
      if(!dialog.open)return;
      render(data||{});
      status.textContent='Datos desde que se activó el contador · Hora de Toronto';
    } catch(e) {
      status.textContent='No se pudieron cargar las estadísticas. Revisa la conexión o los permisos de administrador.';
    }
  }
  function syncAdmin() {
    const entry=$('camAnalyticsEntry');
    const isAdmin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
    if(entry)entry.hidden=!isAdmin;
    if(!isAdmin&&$('camAnalyticsDialog')?.open)$('camAnalyticsDialog').close();
  }
  window.camAnalytics={syncAdmin,trackSection:track};

  document.addEventListener('DOMContentLoaded',()=>{
    track('Inicio');
    $('camAnalyticsOpen')?.addEventListener('click',open);
    $('camAnalyticsClose')?.addEventListener('click',()=>$('camAnalyticsDialog')?.close());
    $('camAnalyticsRefresh')?.addEventListener('click',open);
    $('camAnalyticsDialog')?.addEventListener('click',event=>{
      if(event.target===$('camAnalyticsDialog'))event.target.close();
    });
    syncAdmin();
  });
})();