// AE SPORTS · Lee una captura de apuesta con IA cuando el lector del teléfono no puede.
// La imagen se reenvía una sola vez a la IA y no se guarda en ningún sitio; solo se
// guardan los datos de la apuesta (partido, pronóstico, momio, fecha) para poder publicar.
import {createClient} from '@supabase/supabase-js';

const allowedOrigins = new Set(['https://eduardcarrera00-pixel.github.io', 'https://aesportsclub.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500']);
const MODEL = Deno.env.get('AE_TICKET_MODEL') || 'claude-haiku-5-5';
const DAILY_LIMIT = 25;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const tool = {
  name: 'ticket',
  description: 'Datos de la apuesta deportiva leída en la captura.',
  input_schema: {
    type: 'object',
    properties: {
      is_bet_slip: {type: 'boolean', description: 'true solo si la imagen es un boleto o apuesta de una casa de apuestas.'},
      problem: {type: 'string', description: 'Si no se puede leer con seguridad, explica en español qué falta (máx. 140 caracteres). Vacío si todo está claro.'},
      selections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sport: {type: 'string', enum: ['Fútbol', 'NFL', 'NBA', 'MLB', 'NHL', 'Tenis', 'UFC', 'Otros']},
            league: {type: 'string', description: 'Liga o competición si aparece o se deduce sin duda (p. ej. Liga MX, Premier League, NFL).'},
            event: {type: 'string', description: 'Partido como "Equipo A vs Equipo B", nombres como aparecen.'},
            selection: {type: 'string', description: 'Pronóstico completo con mercado, línea y periodo, en español. Ej: "Más de 2.5 goles", "Lakers -4.5", "Patrick Mahomes más de 1.5 pases de touchdown".'},
            american_odds: {type: ['integer', 'null'], description: 'Momio americano de esta selección si se ve (ej. 150 o -120). null si solo hay total.'},
            event_date: {type: ['string', 'null'], description: 'Fecha del partido YYYY-MM-DD si aparece en la captura. null si no aparece.'}
          },
          required: ['sport', 'event', 'selection', 'american_odds', 'event_date']
        }
      },
      total_american_odds: {type: ['integer', 'null'], description: 'Momio americano total del boleto (combinada) o de la selección única. Si la casa muestra momio decimal o fraccionario, conviértelo. Si hay boost, usa el momio ORIGINAL tachado.'},
      total_decimal_odds: {type: ['number', 'null'], description: 'Momio decimal total si aparece.'}
    },
    required: ['is_bet_slip', 'problem', 'selections', 'total_american_odds']
  }
};

const prompt = (today: string) => `Eres el lector de boletos de AE SPORTS. Hoy es ${today} (America/Toronto).
Lee la(s) captura(s) de una casa de apuestas y devuelve los datos con la herramienta "ticket".
Reglas:
- Copia equipos y pronósticos tal como aparecen; traduce el mercado al español natural (Over → Más de, Under → Menos de, Moneyline → Gana, Both teams to score → Ambos anotan).
- No inventes nada. Si falta el partido, el pronóstico o el momio, explícalo en "problem".
- Ignora saldo, importe apostado, pago potencial, promociones y apuestas que aparezcan como perdidas o canceladas.
- Si hay varias selecciones de un mismo boleto (combinada/parlay), devuelve cada una y el momio total del boleto.
- Las fechas tipo "Hoy", "Mañana" o "Dom 26 oct" conviértelas a YYYY-MM-DD respecto a hoy. Si no hay fecha, usa null.
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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
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
      content.push({type: 'image', source: {type: 'base64', media_type: m[1], data: m[2]}});
    }
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto'}).format(new Date());
    content.push({type: 'text', text: prompt(today)});

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
      body: JSON.stringify({model: MODEL, max_tokens: 1500, tools: [tool], tool_choice: {type: 'tool', name: 'ticket'}, messages: [{role: 'user', content}]})
    });
    if (!ai.ok) {
      console.error('anthropic', ai.status, (await ai.text()).slice(0, 300));
      return respond({error: 'El lector con IA no está disponible ahora. Inténtalo en unos minutos.'}, 502);
    }
    const out = await ai.json();
    const data = out?.content?.find((c: {type: string}) => c.type === 'tool_use')?.input;

    const fail = async (message: string) => {
      await admin.from('ae_pick_capture_reads').insert({user_id: user.id, status: 'failed', model: MODEL});
      return respond({ok: false, reason: message});
    };
    if (!data || !data.is_bet_slip) return await fail('La imagen no parece un boleto de apuestas.');
    const selections = (Array.isArray(data.selections) ? data.selections : []).slice(0, 20).map((s: Record<string, unknown>) => ({
      sport: clean(s.sport, 20) || 'Otros', league: clean(s.league, 60), event: clean(s.event, 160), selection: clean(s.selection, 200),
      odds: Number.isInteger(s.american_odds) && Math.abs(Number(s.american_odds)) >= 100 ? Number(s.american_odds) : null,
      eventDate: isoDay(s.event_date)
    })).filter((s: {event: string, selection: string}) => s.event.length >= 3 && s.selection.length >= 2);
    if (data.problem && String(data.problem).trim()) return await fail(clean(data.problem, 160));
    if (!selections.length) return await fail('No encontramos el partido y el pronóstico en la captura.');

    let total = Number.isInteger(data.total_american_odds) && Math.abs(data.total_american_odds) >= 100 ? data.total_american_odds : null;
    if (!total && typeof data.total_decimal_odds === 'number' && data.total_decimal_odds > 1) total = toAmerican(data.total_decimal_odds);
    if (!total && selections.length === 1) total = selections[0].odds;
    if (!total && selections.length === 2 && selections.every((s: {odds: number | null}) => s.odds)) {
      total = toAmerican(selections.reduce((p: number, s: {odds: number}) => p * toDecimal(s.odds), 1));
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
