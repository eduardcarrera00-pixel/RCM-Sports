# Proveedor y dominio — investigación del 14/10/2026

## Selección técnica propuesta

**SportsGameOdds + `draftkings`**, sujeta a validar la cuenta real, licencia y reglas antes de activar. El adaptador ya está escrito; no se conectó una clave real ni se contrató un plan.

| Proveedor | Cobertura y liquidación | Coste publicado | Decisión |
|---|---|---|---|
| SportsGameOdds | NFL y `UEFA_CHAMPIONS_LEAGUE`; odds por casa y resultados por período; `finalized` identifica datos finalizados. Moneyline, spreads, totales y props documentados; cobertura efectiva depende de plan/casa/evento | Amateur: gratis, 2.500 objetos/mes, 10 solicitudes/min, actualización de 10 min. Rookie: $99/mes, 100.000 objetos, 50/min, 3 min. Pro: $299/mes, objetos ilimitados y 300/min, subminuto; confirmar moneda/impuestos en checkout | Preferido por períodos de resultados y fuente de odds identificable |
| The Odds API | NFL/UCL, casas identificadas, h2h, spreads/totals y mercados adicionales. Endpoint de scores para deportes cubiertos; completados hasta 3 días. No se ha certificado que su marcador baste para separar regulación/prórroga de UCL | USD: gratis 500 créditos/mes; $30/20.000; $59/100.000; $119/5 millones | Alternativa económica para evaluar; no cambiar automáticamente de fuente |
| SportsDataIO | Documenta scores, estadísticas y odds, NFL y Champions, líneas y props. DraftKings entre sus casas anunciadas | Solicitar cotización del paquete concreto; no se verificó una tarifa pública equivalente | Alternativa empresarial; no se implementó otro adaptador |

Fuentes oficiales: [SGO precios](https://sportsgameodds.com/pricing), [SGO períodos](https://sportsgameodds.com/docs/data-types/periods), [SGO bookmaker IDs](https://sportsgameodds.com/docs/data-types/bookmakers), [SGO endpoint](https://sportsgameodds.com/docs/endpoints/getEvents), [The Odds API precios](https://the-odds-api.com/), [The Odds API scores](https://the-odds-api.com/liveapi/guides/v4/), [SportsDataIO fútbol](https://sportsdata.io/help/soccer-guide), [SportsDataIO cobertura](https://sportsdata.io/developers/competition-coverage).

La cobertura comercial anunciada no garantiza que DraftKings publique todas las selecciones de cada encuentro. Sin sus dos/tres cuotas válidas, la aplicación no abre ese encuentro. No usa promedios ni otra casa de reserva. `bookOdds` es consenso; se lee exclusivamente `byBookmaker.draftkings.odds`. En fútbol, `results.game` puede incluir prórroga y penaltis: se requiere `results.reg`. Fuentes: [ejemplo oficial de cuotas](https://sportsgameodds.com/docs/basics/quickstart), [liquidación](https://sportsgameodds.com/blog/how-to-settle-bets-with-an-odds-api).

## Coste operativo estimado

SGO factura/cuota por objetos devueltos, no solo por llamadas. Como cálculo de planificación, 30 eventos devueltos por ciclo × 144 ciclos diarios × 30 días = **129.600 objetos/mes**, antes de sumar revisiones de resultados. Esa carga supera Rookie. No es un benchmark del servicio ni una previsión de tráfico real.

El plan gratuito sirve para comprobar integración con consultas controladas; no asumir que sostiene una liga permanente cada diez minutos. El worker limita inicialmente su contador a 2.000 objetos/mes y deja los resultados pendientes al agotar el presupuesto. El contador es una estimación local: una interrupción abrupta o usos externos pueden diferir del consumo real. Revisar el endpoint oficial `/account/usage`, presupuesto y panel del proveedor antes de activar cron. No existe subida de plan ni compra automática.

La actualización frontend lee Supabase, no consulta al proveedor por visitante. Los costes de Supabase/Edge/Cron dependen del plan del propietario, no inspeccionado con acceso privado en esta entrega.

## Condiciones por cerrar antes de activación

Los [términos SGO, versión 23/06/2026](https://sportsgameodds.com/terms) permiten uso en aplicaciones con valor independiente, pero restringen feeds, volcados, redistribución, rebranding de datos y obras derivadas. También reservan derechos de terceros y asignan al operador responsabilidades territoriales. **No se ha confirmado que snapshots históricos permanentes, puntuación derivada y su visualización estén autorizados para este producto**. Pedir confirmación escrita específica, incluida conservación tras cancelar suscripción. Se mantiene atribución factual de fuente; AE SPORTS nombra la plataforma, no se presenta como creador de las cuotas.

No se consiguió verificar en texto accesible la versión completa vigente de [reglas NFL DraftKings](https://sportsbook.draftkings.com/help/sport-rules/football) y [fútbol DraftKings](https://sportsbook.draftkings.com/help/sport-rules/soccer). Confirmar overtime/empate y aplazamientos, abandonos y cancelaciones para la jurisdicción/casa exacta. Por eso la función exige `AE_PROVIDER_APPROVED` y `AE_BOOK_RULES_APPROVED`; no basta con añadir una clave.

Los [términos de The Odds API](https://the-odds-api.com/terms-and-conditions.html) también requieren revisión específica del uso y almacenamiento si se cambia de proveedor. No se emitió una autorización legal ni comercial para ninguno.

## Dominios

Precios estándar de [Porkbun](https://porkbun.com/products/domains), USD/año, no premium, consultados en la fecha indicada. **No son cotizaciones de compra de esos nombres concretos.** Promociones, renovación y disponibilidad deben confirmarse en la búsqueda final del registrador.

| Nombre | Registro / renovación publicados | Disponibilidad comprobable | Valoración |
|---|---:|---|---|
| aesports.io | 28,12 / 51,80 | Consulta RDAP sin registro encontrado (404); no confirma registrabilidad ni precio premium | Preferencia del propietario; corto, sin guion, renovación alta |
| aesports.com | 11,08 inicial estándar; renovación a confirmar | RDAP Verisign devuelve registro existente | No disponible como registro ordinario; adquisición secundaria no cotizada |
| aesports.gg | 51,80 / 51,80 | RDAP 404; disponibilidad final sin confirmar | Corto; puede asociarse a esports |
| aesports.ca | 8,66 / 9,13 promocionales | RDAP 404; disponibilidad final sin confirmar | Requiere cumplir presencia canadiense |
| ae-sports.com | 11,08 inicial estándar; renovación a confirmar | RDAP Verisign devuelve registro existente | Guion menos cómodo; adquisición secundaria no cotizada |
| aesports.news | 9,78 / 29,35 | Consulta RDAP bloqueada (403); sin confirmación | Apropiado para medio, aunque la liga amplía el producto |

Consultas de registro: `https://rdap.org/domain/<nombre>`; para .com, servicio autoritativo `https://rdap.verisign.com/com/v1/domain/<nombre>`. No encontrar un registro, especialmente en ccTLD, no prueba que el nombre pueda registrarse: puede haber reservas, premium o cobertura RDAP incompleta. No se obtuvo un checkout del registrador que confirme disponibilidad/precio exactos de aesports.io. **No hay ningún dominio comprado ni activado.**

Todos son técnicamente compatibles con DNS/GitHub Pages si se adquieren y se cumplen sus condiciones. Para `.ca`, consultar [requisitos oficiales CIRA](https://www.cira.ca/en/resources/documents/domains/canadian-presence-requirements-registrants/); no se ha supuesto residencia ni elegibilidad del propietario.

## Colisiones de nombre y recomendación

Existen negocios con nombres muy próximos en el sector: [AE Sports Management](https://aesportsmanagement.com/), [AE Sports Management International](https://www.aesportsmanagementinternational.com/), [AE Sports Performance](https://aesportsperformance.com/), [AE Sports International](https://aesportsinternational.com/) y [AE Sports Images](https://www.aesportsimages.com/), este último dedicado a fotografía e imagen deportiva. Además, [EA SPORTS](https://www.ea.com/sports) es una marca distinta con letras similares.

Esto indica riesgo comercial de confusión y de posicionamiento; **no demuestra por sí solo infracción ni disponibilidad jurídica**. No se realizó una búsqueda registral exhaustiva por país/clase ni se da el nombre por liberado. Antes de comprar el dominio o aprobar un logo definitivo, revisar registros de marcas en los territorios objetivo.

Recomendación: mantener la URL actual durante las pruebas; tratar aesports.io como candidato preferido sujeto a disponibilidad real, coste final y revisión de nombre. Si falla, estudiar un nombre más distintivo (por ejemplo con una segunda palabra propia); no se anuncian alternativas no comprobadas como disponibles. Las instrucciones de DNS, HTTPS, Auth y Pages están en [AE-SPORTS.md](AE-SPORTS.md).

## Champions

La lista de 36 clubes de `08_catalogo_champions_2026_27.sql` se conserva de la entrega anterior y coincide con la lista pública consultada de [UEFA 2026/27](https://www.uefa.com/uefachampionsleague/news/02a8-2171a88881a0-c70193b972c6-1000--meet-the-2026-27-champions-league-league-phase-teams/). Se usan IDs estables y URLs de escudos UEFA; no se crea un ranking de ejemplo. Una web de pruebas con imágenes simuladas no acredita disponibilidad permanente del CDN: verificar los escudos en el navegador de staging.
