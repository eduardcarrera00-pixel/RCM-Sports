// Texto OCR real (Tesseract, 1400 px, modos 6 y 11) de boletos de TeamMéxico,
// Ecuabet, Playdoit, Draftea y una pestaña de apuestas sencillas. Sin imágenes,
// IDs de boleto ni importes: solo el texto que el lector usa para cotejar.
const assert = require('node:assert/strict');
const p = require('../assets/ae-pick-capture-parser.js');
const fx = require('./fixtures/real-ticket-ocr.json');
const scan = (lines, confidence = 90) => ({text: lines.join('\n'), confidence});
const DAY = '2026-10-20';

// 1) Parlay de Playdoit con 6 selecciones, mercados de dos filas y «PA».
let r = p.extractCardTicket(scan(fx.playdoit_parlay), DAY);
assert.equal(r.ok, true, r.reason);
assert.equal(r.readings.length, 1);
const parlay = r.readings[0];
assert.equal(parlay.selectionCount, 6);
assert.equal(parlay.odds, 778);
assert.equal(parlay.sport, 'Fútbol');
assert.equal(r.eventDate, '2026-10-21');
assert.equal(r.dateSource, 'last_event');
assert.equal(parlay.event, 'Guadalajara Chivas vs. Necaxa / Tigres UANL vs. Club Leon / Deportivo Toluca vs. Xolos de Tijuana / Atlas vs. America / Puebla vs. Monterrey / Pachuca vs. Cruz Azul');
for (const text of ['Resultado Final (Tiempo Regular): Guadalajara Chivas', '2° Mitad - total: Mas de 0.5', 'Ambos equipos marcan: Sí', 'Resultado Final (Tiempo Regular): Monterrey', 'Total: Mas de 2'])
  assert.ok(parlay.selection.includes(text), text);
assert.doesNotMatch(parlay.selection, /\(PA\)|\bPA\b|=|«/);

// 2) Si falta una selección, el total ya no cuadra y no se publica.
const missing = fx.playdoit_parlay.filter(l => !/^(Si|Ambos equipos marcan|Atlas vs\. America)/.test(l.trim()));
assert.equal(p.extractCardTicket(scan(missing), DAY).ok, false);

// 3) Boletos con partidos EN VIVO, con marcador o resueltos: nunca se publican.
for (const name of ['teammexico_live', 'ecuabet_two_live', 'ecuabet_seven_finished']) {
  r = p.extract(scan(fx[name]));
  assert.equal(r.ok, false, name);
  assert.match(r.reason, /empezaron|terminaron|jugaron/, name);
}

// 4) Los mismos boletos antes del partido (sin marcador ni «en vivo») sí se leen,
//    incluidos los nombres repartidos en dos columnas.
const pregame = lines => lines
  .map(l => /\d{1,2}\/\d{1,2}/.test(l) ? l : l.replace(/\s+\d{1,2}:\d{1,2}\s*$/, ''))
  .map(l => l.replace(/\s+(?:Sth|5th|3rd)\s*$/i, ''))
  .filter(l => !/^\s*(?:\d{1,2}:\d{1,2}|\(Primer partido.*\)|\d{1,2}'|inning|Inning|bottom)\s*$/i.test(l.trim()))
  .map(l => l.replace(/\s{2,}(?:inning|Inning|bottom)\s*$/, '').replace(/\s{2,}\d{1,2}'\s*$/, ''));
r = p.extractCardTicket(scan(pregame(fx.teammexico_live)), DAY);
assert.equal(r.ok, true, r.reason);
assert.equal(r.readings[0].selectionCount, 5);
assert.equal(r.readings[0].odds, 876);
assert.match(r.readings[0].event, /Tomateros de Culiacan vs\. Mayos de Navojoa/);
assert.match(r.readings[0].event, /Naranjeros de Hermosillo vs\. Jaguares de Nayarit/);
assert.match(r.readings[0].selection, /Handicap \(incl\. extra innings\): Aguilas de Mexicali \(\+1\.5\)/);
r = p.extractCardTicket(scan(pregame(fx.ecuabet_seven_finished)), DAY);
assert.equal(r.ok, true, r.reason);
assert.equal(r.readings[0].selectionCount, 7);
assert.match(r.readings[0].event, /VfB Stuttgart vs\. Atlético de Madrid/);
assert.match(r.readings[0].event, /Paris Saint-Germain vs\. FC Barcelona/);
assert.match(r.readings[0].selection, /1x2: Napoli/);
r = p.extractCardTicket(scan(pregame(fx.ecuabet_two_live)), DAY);
assert.equal(r.ok, true, r.reason);
assert.deepEqual(r.readings.map(x => [x.event, x.selection, x.odds]), [
  ['Vasco da Gama vs. Boca Juniors', 'Se clasifica: Boca Juniors', 220],
  ['Real Madrid vs. RB Leipzig', '1x2: Real Madrid', -370]
]);
assert.equal(r.total.american, 306);

// 5) Un partido ya jugado (fecha anterior a hoy) no se publica.
assert.match(p.extractCardTicket(scan(pregame(fx.ecuabet_two_live)), '2026-10-21').reason, /ya se jugaron/);

// 6) Pestaña de sencillos: cada apuesta es independiente, con su propio momio.
r = p.extract(scan(fx.sencillos_psm11));
assert.equal(r.ok, true, r.reason);
assert.equal(r.singles, true);
assert.deepEqual(r.readings.map(x => [x.event, x.selection, x.odds]), [
  ['Como vs. Manchester United', 'Resultado Final (Tiempo Regular): Como', 120],
  ['Lille vs. Galatasaray', 'Resultado Final (Tiempo Regular): Lille', 118],
  ['Aston Villa vs. Viking', 'Resultado Final (Tiempo Regular): Viking', 975],
  ['Bayern Munich vs. Arsenal', 'Resultado Final (Tiempo Regular): Arsenal', 220],
  ['Real Betis vs. Feyenoord Rotterdam', 'Resultado Final (Tiempo Regular): Feyenoord Rotterdam', 365]
]);
assert.ok(r.readings.every(x => x.sport === 'Fútbol'));
// Con momios ilegibles (modo 6) no se adivina nada: se pasa al otro modo o a la IA.
assert.notEqual(p.extract(scan(fx.sencillos_psm6)).ok, true);
// Una apuesta suelta no es una lista de sencillos.
assert.equal(p.extractSinglesSlip(scan(fx.sencillos_psm11.slice(0, 4))), null);

// 7) Draftea (logos y «Mañana») no se lee en el teléfono; queda para la lectura avanzada.
assert.notEqual(p.extract(scan(fx.draftea)).ok, true);

console.log('PASS: boletos reales de TeamMéxico, Ecuabet, Playdoit y sencillos (en vivo, resueltos, columnas, PA, totales y una publicación por apuesta).');
