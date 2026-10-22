// CAM SPORTS · Lee una captura de apuesta con IA (Gemini, plan gratuito) cuando el lector del teléfono no puede.
// La imagen se reenvía temporalmente a la IA y no se guarda en ningún sitio; solo se
// guardan los datos de la apuesta (partido, pronóstico, momio, fecha) para poder publicar.
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import {readTicketModel} from './retry-model.ts';

const allowedOrigins = new Set(['https://eduardcarrera00-pixel.github.io', 'https://aesportsclub.github.io', 'https://camsports.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500']);
// Modelo: AE_TICKET_MODEL si está definido; si no, el alias «último Flash».
// Si Google retira un modelo (404), se pide la lista de modelos y se usa el Flash
// más reciente que admita generateContent. Se recuerda mientras la función esté activa.
const PREFERRED_MODEL = Deno.env.get('AE_TICKET_MODEL') || 'gemini-flash-latest';
let activeModel: string | null = null;
const API = 'https://generativelanguage.googleapis.com/v1beta';
async function flashModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API}/models?pageSize=1000`, {headers: {'x-goog-api-key': apiKey}, signal: AbortSignal.timeout(5000)});
  if (!res.ok) return [];
  const list = (await res.json())?.models || [];
  // Primero los Flash (más recientes antes) y después los Flash-Lite, que suelen
  // seguir respondiendo cuando Google marca «high demand» en los Flash.
  const parse = (n: string) => n.match(/gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);
  const names = list
    .filter((m: {name?: string, supportedGenerationMethods?: string[]}) => m.name && parse(m.name.replace(/^models\//, '')) && (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m: {name: string}) => m.name.replace(/^models\//, ''));
  const rank = (n: string) => { const m = parse(n)!; return (m[2] ? 0 : 1000) + Number(m[1]); };
  return names.sort((a: string, b: string) => rank(b) - rank(a));
}
// Si la lista de modelos no responde, se prueba con estos alias.
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
const DAILY_LIMIT = 25;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Cache de reglas y ejemplos anonimizados en Supabase; jamás contiene imágenes privadas.
let referenceCache: {until:number, text:string} | null = null;
async function referenceText(admin:any):Promise<string>{
  if(referenceCache && Date.now()<referenceCache.until)return referenceCache.text;
  let text='';
  try{
    const {data,error}=await admin.from('cam_pick_ocr_layouts')
      .select('source_name,layout_type,fingerprint_terms,extraction_guide,example')
      .eq('enabled',true).order('id').limit(8);
    if(error)throw error;
    text=(data||[]).map((x:any)=>
      '\nFormato: '+String(x.source_name).slice(0,80)+' ('+x.layout_type+')'+
      '\nSeñales: '+(x.fingerprint_terms||[]).join(', ').slice(0,300)+
      '\nRegla: '+String(x.extraction_guide||'').slice(0,2500)+
      '\nEjemplo SOLO de estructura, NO de contenido real: '+JSON.stringify(x.example||{}).slice(0,2200)
    ).join('\n');
  }catch(e){console.error('Referencia OCR no disponible',e);}
  referenceCache={until:Date.now()+(text?600000:30000),text:text?'\n\nREFERENCIAS DE FORMATO: \n'+text:''};
  return referenceCache.text;
}


// Esquema de respuesta (formato OpenAPI que entiende Gemini).
const schema: any = {
  type: 'OBJECT',
  properties: {
    is_bet_slip: {type: 'BOOLEAN', description: 'true solo si la imagen es un boleto o apuesta de una casa de apuestas.'},
    bet_type: {type: 'STRING', enum: ['combinada', 'sencillas', 'separadas'], description: '"sencillas" si son apuestas individuales independientes, cada una con su propia cuota y sin cuota total (p. ej. pestaña "Sencillos", "Simples" o "Singles"). "combinada" para una sola apuesta o un parlay/múltiple.'},
    already_started: {type: 'BOOLEAN', description: 'true si algún partido del boleto aparece EN VIVO, con marcador, minuto o entrada en juego, o ya resuelto (palomita verde o tache rojo).'},
    problem: {type: 'STRING', description: 'Si no se puede leer con seguridad, explica en español qué falta (máx. 140 caracteres). Vacío si todo está claro.'},
    selections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          sport: {type: 'STRING', enum: ['Fútbol', 'NFL', 'NBA', 'MLB', 'NHL', 'Tenis', 'UFC', 'Otros']},
          league: {type: 'STRING', description: 'Liga o competición si aparece o se deduce sin duda (p. ej. Liga MX, Premier League, NFL).'},
          event: {type: 'STRING', description: 'Partido como "Equipo A vs Equipo B", nombres como aparecen.'},
          selection: {type: 'STRING', description: 'Pronóstico completo con mercado, línea y periodo, en español. Ej: "Más de 2.5 goles", "Lakers -4.5", "Patrick Mahomes más de 1.5 pases de touchdown".'},
          decimal_odds: {type: 'NUMBER', nullable: true, description: 'Cuota decimal exacta visible de esta selección o grupo CREAR APUESTA (p. ej. 1.95); conserva sus decimales para calcular la combinada.'},
          american_odds: {type: 'INTEGER', nullable: true, description: 'Momio americano de esta selección si se ve (ej. 150 o -120). null si solo hay total.'},
          event_date: {type: 'STRING', nullable: true, description: 'Fecha del partido YYYY-MM-DD si aparece en la captura. null si no aparece.'}
        },
        required: ['sport', 'event', 'selection']
      }
    },
    total_american_odds: {type: 'INTEGER', nullable: true, description: 'Momio americano total del boleto (combinada) o de la selección única. Si la casa muestra momio decimal o fraccionario, conviértelo. Si hay boost, usa el momio ORIGINAL tachado.'},
    total_decimal_odds: {type: 'NUMBER', nullable: true, description: 'Momio decimal total si aparece.'}
  },
  required: ['is_bet_slip', 'problem', 'selections']
};


// Estructura por boleto: una combinada es un boleto; CREAR APUESTA puede ser una selección de una combinada.
schema.properties.bets={
  type:'ARRAY',
  description:'Una entrada por boleto independiente. Un solo importe, ganancias y botón de cerrar apuesta al pie indican UN boleto combinado, aunque contenga varios CREAR APUESTA.',
  items:{type:'OBJECT',properties:{
    selections:schema.properties.selections,
    total_american_odds:{type:'INTEGER',nullable:true,description:'Cuota americana TOTAL de este boleto, no importe de dinero'},
    total_decimal_odds:{type:'NUMBER',nullable:true,description:'Cuota decimal TOTAL de este boleto si se ve (ej. 2.05)'}
  },required:['selections']}
};
schema.required=['is_bet_slip','problem','bets'];

const prompt = (today: string) => `Eres el lector de boletos de CAM SPORTS. Hoy es ${today} (America/Toronto).
Lee la(s) captura(s) de una casa de apuestas y devuelve los datos en el JSON pedido.
Reglas:
- Copia equipos y pronósticos tal como aparecen; traduce el mercado al español natural (Over → Más de, Under → Menos de, Moneyline → Gana, Both teams to score → Ambos anotan).
- No inventes nada. Si falta el partido, el pronóstico o el momio, explícalo en "problem".
- Ignora saldo, importe apostado, pago potencial, promociones y apuestas que aparezcan como perdidas o canceladas.
- Si hay varias selecciones de un mismo boleto (combinada/parlay), devuelve cada una y el momio total del boleto.
- Las fechas tipo "Hoy", "Mañana" o "Dom 26 oct" conviértelas a YYYY-MM-DD respecto a hoy. Si no hay fecha, usa null.
- En casas de México y España las fechas numéricas son día/mes: "20/10 • 14:00" es el 20 de octubre. "Momios" es la cuota total; si es decimal (2.75) conviértela a americana (+175).
- En apuestas de mercado Sí/No, escribe el mercado y la respuesta: "Penalti en el encuentro: Sí".
- Si el boleto aparece debajo de otra pantalla de la casa (filas de cuotas de mercados), lee solo el boleto o historial, no esas filas.
- Si son apuestas sencillas (varias apuestas individuales, cada una con su cuota y sin cuota total), marca bet_type="sencillas" y devuelve cada una con su momio. En "Equipo - Mercado" el pronóstico es "Mercado: Equipo" (p. ej. "Resultado Final (Tiempo Regular): Como").
- Ignora etiquetas como "PA", "Pago Anticipado", "Súper Pago Anticipado" (y su icono "$ 1 UP"), "Cuota de oro" o "EN VIVO" dentro del pronóstico. "1x2 Súper Pago Anticipado" es el mercado 1x2: escribe "1x2: Equipo". Si algún partido ya está en juego o terminado (marcador, minuto, "EN VIVO", palomita o tache), marca already_started=true.
- Devuelve bets[] agrupando POR BOLETO. Varios CREAR APUESTA con UN solo Importe/Ganancias y UN botón Cerrar apuesta al pie son UNA combinada: cada grupo es una selección con su partido, TODOS sus jugadores/condiciones y su decimal exacto. No los publiques como apuestas independientes. Solo separa boletos si cada uno tiene su propio importe y cierre/resumen. Las cifras 1+ remates/faltas son líneas, no cuotas. Si no se ve total pero están todos los grupos de partidos distintos, deja total null: calcularemos su producto sin usar importes de dinero.
- En Playdoit, Parlay ABIERTO contiene varias tarjetas en UN boleto. Usa Momios para el total, nunca Apuesta total/Ganancia Total. La fecha al pie es la de creación y no la del encuentro.
- Extrae todos los grupos y selecciones; no uses los ejemplos como si fueran el contenido del boleto actual.
- Si la imagen no es un boleto de apuestas, marca is_bet_slip=false.`;

const toAmerican = (d: number) => d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
const toDecimal = (a: number) => a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
const clean = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isoDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

Deno.serve(async req => {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers});
  if (origin && !allowedOrigins.has(origin)) return respond({error: 'Origen no permitido.'}, 403);
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers});
  if (req.method !== 'POST') return respond({error: 'Método no permitido.'}, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return respond({error: 'El lector con IA todavía no está configurado.'}, 503);
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});

  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const {data: auth} = await admin.auth.getUser(token);
    const user = auth?.user;
    if (!user || user.is_anonymous) return respond({error: 'Inicia sesión para leer tu captura.'}, 401);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const {count} = await admin.from('ae_pick_capture_reads').select('id', {count: 'exact', head: true}).eq('user_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) return respond({error: 'Llegaste al límite de lecturas de hoy. Inténtalo mañana.'}, 429);

    const body = await req.json().catch(() => null);
    const images: unknown[] = Array.isArray(body?.images) ? body.images : [];
    if (!images.length || images.length > 2) return respond({error: 'Envía una o dos capturas.'}, 400);
    const content: unknown[] = [];
    for (const image of images) {
      const m = typeof image === 'string' && image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[2].length * 0.75 > MAX_IMAGE_BYTES) return respond({error: 'Usa capturas PNG, JPG o WebP más pequeñas.'}, 400);
      content.push({inline_data: {mime_type: m[1], data: m[2]}});
    }
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto'}).format(new Date());
    content.push({text: prompt(today) + await referenceText(admin)});

    const request = JSON.stringify({contents: [{role: 'user', parts: content}], generationConfig: {temperature: 0, responseMimeType: 'application/json', responseSchema: schema}});
    const deadline = Date.now() + 90000;
    const call = (model: string) => fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST', headers: {'x-goog-api-key': apiKey, 'content-type': 'application/json'}, body: request, signal: AbortSignal.timeout(Math.max(1, Math.min(35000, deadline - Date.now())))
    });
    const {response: ai, model: MODEL} = await readTicketModel({
      preferred: activeModel || PREFERRED_MODEL,
      call: async (model: string) => {
        try { return await call(model); }
        catch (error) {
          if (error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name))
            return new Response(null, {status: 503});
          throw error;
        }
      },
      listModels: async () => { const found = await flashModels(apiKey).catch(() => []); return [...found, ...FALLBACK_MODELS.filter(m => !found.includes(m))]; }
    });
    if (ai.ok) activeModel = MODEL;
    if (ai.status === 429) return respond({error: 'La lectura avanzada está muy solicitada ahora. Inténtalo en un minuto.'}, 429);
    if (!ai.ok) {
      console.error('gemini', ai.status, (await ai.text()).slice(0, 300));
      return respond({error: 'La lectura avanzada no está disponible ahora. Inténtalo en unos minutos.'}, 502);
    }
    const out = await ai.json();
    let data: any = null;
    try {data = JSON.parse(out?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || '').join('') || 'null');} catch {data = null;}

    const fail = async (message: string) => {
      await admin.from('ae_pick_capture_reads').insert({user_id: user.id, status: 'failed', model: MODEL});
      return respond({ok: false, reason: message});
    };
    if (!data || !data.is_bet_slip) return await fail('La imagen no parece un boleto de apuestas.');

    // Respetar los límites del boleto: los grupos de un mismo parlay permanecen juntos.
    const bets:any[]=Array.isArray(data.bets)?data.bets:[];
    if(bets.length>20)return await fail('Hay demasiadas apuestas en la captura.');
    const betPrice=(b:any):number|null=>{
      if(Number.isInteger(b?.total_american_odds)&&Math.abs(b.total_american_odds)>=100&&Math.abs(b.total_american_odds)<=100000)return b.total_american_odds;
      if(typeof b?.total_decimal_odds==='number'&&b.total_decimal_odds>1&&b.total_decimal_odds<=1001)return toAmerican(b.total_decimal_odds);
      return null;
    };
    if(bets.length>1){
      if(data.problem&&String(data.problem).trim())return await fail(clean(data.problem,160));
      if(data.already_started)return await fail('Uno o más partidos ya empezaron o terminaron. Publica antes del inicio.');
      const independent:any[]=[];
      for(const [index,bet] of bets.entries()){
        const raw:Array<any>=Array.isArray(bet?.selections)?bet.selections:[];
        if(!raw.length||raw.length>20)return await fail('Faltan selecciones de la apuesta '+(index+1)+'.');
        const legs=raw.map((v:any)=>({
          sport:clean(v.sport,20)||'Otros',event:clean(v.event,160),
          selection:clean(v.selection,200),eventDate:isoDay(v.event_date)
        }));
        if(legs.some((v:any)=>v.event.length<3||v.selection.length<2))
          return await fail('Falta partido o mercado de la apuesta '+(index+1)+'.');
        const odds=betPrice(bet);
        if(odds===null)return await fail('No se lee la cuota total de la apuesta '+(index+1)+'.');
        const event=[...new Set(legs.map((v:any)=>v.event))].join(' / ');
        const selection=legs.length===1?legs[0].selection:
          legs.map((v:any,i:number)=>(i+1)+'. '+v.event+': '+v.selection).join(' / ');
        if(event.length>640||selection.length>2000)return await fail('La apuesta '+(index+1)+' es demasiado extensa.');
        const sports=[...new Set(legs.map((v:any)=>v.sport))];
        const dates=legs.map((v:any)=>v.eventDate).filter(Boolean).sort();
        independent.push({sport:sports.length===1?sports[0]:'Otros',event,selection,odds,
          eventDate:dates.at(-1)||null,selectionCount:legs.length});
      }
      if(!independent.some((v:any)=>v.odds>=100))
        return await fail('Ninguna apuesta tiene momio mínimo +100.');
      const saved=await admin.from('ae_pick_capture_reads').insert({
        user_id:user.id,status:'read',model:MODEL,singles:true,
        readings:independent.map(({event,selection,odds}:any)=>({event,selection,odds}))
      }).select('id').single();
      if(saved.error)throw saved.error;
      return respond({ok:true,readId:saved.data.id,singles:true,readings:independent,
        total:null,eventDate:null,dateSource:'',leagues:[]});
    }
    if(bets.length===1){
      data.selections=bets[0].selections;
      data.total_american_odds=bets[0].total_american_odds??data.total_american_odds;
      data.total_decimal_odds=bets[0].total_decimal_odds??data.total_decimal_odds;
    }
    const selections = (Array.isArray(data.selections) ? data.selections : []).slice(0, 20).map((s: Record<string, unknown>) => ({
      sport: clean(s.sport, 20) || 'Otros', league: clean(s.league, 60), event: clean(s.event, 160), selection: clean(s.selection, 200),
      odds: Number.isInteger(s.american_odds) && Math.abs(Number(s.american_odds)) >= 100 ? Number(s.american_odds) : null,
      decimal: typeof s.decimal_odds === 'number' && s.decimal_odds > 1 && s.decimal_odds <= 1001 ? s.decimal_odds : null,
      eventDate: isoDay(s.event_date)
    })).filter((s: {event: string, selection: string}) => s.event.length >= 3 && s.selection.length >= 2);
    if (data.problem && String(data.problem).trim()) return await fail(clean(data.problem, 160));
    if (!selections.length) return await fail('No encontramos el partido y el pronóstico en la captura.');
    if (data.already_started) return await fail('Uno o más partidos de este boleto ya empezaron o terminaron. Publica tus Picks antes del partido.');

    // Apuestas sencillas: cada una se publica como un Pick propio, con su momio.
    if (data.bet_type === 'sencillas' && selections.length > 1) {
      if (selections.some((s: {odds: number | null}) => !s.odds)) return await fail('No se lee el momio de cada apuesta sencilla.');
      const singles = selections.map((s: {sport: string, event: string, selection: string, odds: number, eventDate: string | null}) =>
        ({sport: s.sport, event: s.event, selection: s.selection, odds: s.odds, eventDate: s.eventDate}));
      if (!singles.some((s: {odds: number}) => s.odds >= 100)) return await fail('Ninguna apuesta sencilla tiene momio de al menos +100.');
      const days = singles.map((s: {eventDate: string | null}) => s.eventDate).filter(Boolean).sort();
      const saved = await admin.from('ae_pick_capture_reads').insert({
        user_id: user.id, status: 'read', model: MODEL, event_date: days.at(-1) || null, total: null, singles: true,
        readings: singles.map(({event, selection, odds}: {event: string, selection: string, odds: number}) => ({event, selection, odds}))
      }).select('id').single();
      if (saved.error) throw saved.error;
      return respond({ok: true, readId: saved.data.id, singles: true, readings: singles, total: null, eventDate: days.length === singles.length && new Set(days).size === 1 ? days[0] : null, dateSource: 'exact', leagues: selections.map((s: {league: string}) => s.league)});
    }

    let total = Number.isInteger(data.total_american_odds) && Math.abs(data.total_american_odds) >= 100 ? data.total_american_odds : null;
    if (!total && typeof data.total_decimal_odds === 'number' && data.total_decimal_odds > 1) total = toAmerican(data.total_decimal_odds);
    if (!total && selections.length === 1) total = selections[0].odds;
    if (!total && selections.length > 1 && new Set(selections.map((s: {event: string}) => s.event.toLowerCase())).size === selections.length
      && selections.every((s: {decimal: number | null, odds: number | null}) => s.decimal || s.odds)) {
      total = toAmerican(selections.reduce((p: number, s: {decimal: number | null, odds: number}) => p * (s.decimal || toDecimal(s.odds)), 1));
    }
    if (!total) return await fail('No pudimos leer el momio total del boleto.');
    if (total < 100) return await fail('El momio total debe ser al menos +100 para publicar un Pick.');

    const dates = selections.map((s: {eventDate: string | null}) => s.eventDate).filter(Boolean).sort();
    const eventDate = dates.at(-1) || null;
    let readings, totalOut = null;
    if (selections.length === 1) {
      readings = [{sport: selections[0].sport, event: selections[0].event, selection: selections[0].selection, odds: total}];
    } else if (selections.length === 2 && selections.every((s: {odds: number | null}) => s.odds)
      && selections[0].event.toLowerCase() !== selections[1].event.toLowerCase()
      && Math.abs(toAmerican(selections.reduce((p: number, s: {odds: number}) => p * toDecimal(s.odds), 1)) - total) <= 1) {
      readings = selections.map((s: {sport: string, event: string, selection: string, odds: number}) => ({sport: s.sport, event: s.event, selection: s.selection, odds: s.odds}));
      totalOut = {american: total, decimal: Number(toDecimal(total).toFixed(4))};
    } else {
      const events = [...new Set(selections.map((s: {event: string}) => s.event))];
      const sports = [...new Set(selections.map((s: {sport: string}) => s.sport))];
      readings = [{
        sport: sports.length === 1 ? sports[0] : 'Otros',
        event: events.join(' / ').slice(0, 640),
        selection: selections.map((s: {event: string, selection: string}, i: number) => `${i + 1}. ${s.event}: ${s.selection}`).join(' / ').slice(0, 2000),
        odds: total, selectionCount: selections.length
      }];
    }
    const leagues = selections.map((s: {league: string}) => s.league);
    const saved = await admin.from('ae_pick_capture_reads').insert({
      user_id: user.id, status: 'read', model: MODEL, event_date: eventDate, total: totalOut,
      readings: readings.map(({event, selection, odds}) => ({event, selection, odds}))
    }).select('id').single();
    if (saved.error) throw saved.error;
    return respond({ok: true, readId: saved.data.id, readings, total: totalOut, eventDate, dateSource: eventDate ? (selections.length > 1 ? 'last_event' : 'exact') : '', leagues});
  } catch (error) {
    console.error('read-ticket', error);
    return respond({error: 'No pudimos leer la captura. Inténtalo otra vez.'}, 500);
  }
});
