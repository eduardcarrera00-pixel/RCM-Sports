const assert=require('node:assert/strict');
const {extract,extractBetBuilder}=require('../assets/ae-pick-capture-parser.js');
const scan=lines=>({text:lines.join('\n'),confidence:92});
const today='2026-10-23';

// Caliente «CREAR APUESTA»: un momio total y cinco condiciones del mismo partido,
// con los equipos en filas separadas (fecha en una, hora en la otra).
const clasico=['© CREAR APUESTA 11.00',
 'Raphinha: 2+ remates a puerta | SusTiTUTO+ |','Jugador - Remates a puerta',
 'Kylian Mbappe: 2+ remates a puerta | SUSTITUTO+ |','Jugador - Remates a puerta ~',
 'Fermin Lopez - 2+ faltas cometidas SUSTITUTO+','Jugador - Faltas concedidas',
 'Antonio Rudiger - 1+ faltas cometidas','Jugador - Faltas concedidas',
 'Arda Guler: 2+ faltas recibidas SUSTITUTO+','Jugador - Recibira falta',
 '| Barcelona Dom 25 oct','# Real Madrid 21:00'];
let r=extractBetBuilder(scan(clasico),today);
assert.equal(r.ok,true,r.reason);
const read=r.readings[0];
assert.equal(read.odds,1000,'11.00 decimal son +1000');
assert.equal(read.visible,'11.00');
assert.equal(read.selectionCount,5);
assert.equal(read.event,'Barcelona vs. Real Madrid');
assert.equal(read.sport,'Fútbol');
assert.equal(r.eventDate,'2026-10-25');
for(const t of ['Raphinha: 2+ remates a puerta','Kylian Mbappe','Fermin Lopez','Antonio Rudiger','Arda Guler'])assert.ok(read.selection.includes(t),t);
assert.doesNotMatch(read.selection,/SUSTITUTO|sustituto/i,'La etiqueta de sustituto no es parte del pronóstico');
// El mismo boleto dentro de una captura con la interfaz del teléfono alrededor.
assert.equal(extractBetBuilder(scan(['1:50 i','< You WA cee','2026-10-23, 1:50 AM',...clasico,'+','Reply... ¥ A (2)']),today).ok,true);
// Y por el camino normal del lector.
assert.equal(extract(scan(clasico)).readings[0].odds,1000);

const vary=(from,to)=>clasico.map(l=>l===from?to:l).filter(l=>l!==null);
// Sin momio total no se publica, ni con el momio mejorado del boost.
assert.equal(extractBetBuilder(scan(vary('© CREAR APUESTA 11.00','© CREAR APUESTA')),today).ok,false);
assert.match(extractBetBuilder({...scan(clasico),hasBoostedTicketPrice:true},today).reason,/momio total/);
assert.match(extractBetBuilder(scan(['© CREAR APUESTA 11.00 13.50',...clasico.slice(1)]),today).reason,/momio total/);
// Falta el mercado de una selección: se pierde una pata, así que no pasa.
assert.equal(extractBetBuilder(scan(vary('Jugador - Faltas concedidas',null)),today).ok,false);
// Partido ya empezado, resuelto o de un día pasado.
assert.match(extractBetBuilder(scan(vary('# Real Madrid 21:00','# Real Madrid 2 - 1')),today).reason,/ya empez/);
assert.match(extractBetBuilder(scan(vary('| Barcelona Dom 25 oct','| Barcelona EN VIVO')),today).reason,/ya empez/);
assert.match(extractBetBuilder(scan(vary('| Barcelona Dom 25 oct','| Barcelona Lun 20 oct')),today).reason,/ya se jug/);
// Sin fecha a la vista no se adivina.
assert.match(extractBetBuilder(scan(vary('| Barcelona Dom 25 oct','| Barcelona')),today).reason,/fecha/);
// Dos apuestas creadas en una captura no se mezclan.
assert.equal(extractBetBuilder(scan(clasico.concat(clasico)),today).ok,false);
// Un boleto que no es un constructor de apuestas sigue su propio camino.
assert.equal(extractBetBuilder(scan(['My Bets','Same Game Parlay +240']),today),null);

// Variante con el partido en una sola fila y fecha corta.
const codere=['Crea tu apuesta 3.40',
 'Más de 2.5 goles','Partido - Total de goles',
 'Ambos equipos anotan: Sí','Equipos - Ambos anotan',
 'Atletico vs. Sevilla 26/10 14:00'];
r=extractBetBuilder(scan(codere),today);
assert.equal(r.ok,true,r.reason);
assert.equal(r.readings[0].event,'Atletico vs. Sevilla');
assert.equal(r.readings[0].odds,240);
assert.equal(r.readings[0].selectionCount,2);
assert.equal(r.eventDate,'2026-10-26');
console.log('PASS: apuestas creadas (bet builder) con un momio total, equipos en filas separadas, fecha del partido, boost, mercados sueltos y partidos ya empezados.');
