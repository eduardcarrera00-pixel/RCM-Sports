// Boletos «Historial» tipo Playdoit: Selección+momio / Mercado / Partido+fecha / Momios / Apuesta total.
// Datos inventados con la misma estructura; no se guardan capturas ni OCR de usuarios.
const assert = require('node:assert/strict');
const p = require('../assets/ae-pick-capture-parser.js');

const data = (rows, confidence = 92) => ({
  confidence,
  blocks: [{paragraphs: [{lines: rows.map(text => ({text, confidence, words: text.split(/\s+/).map(w => ({text: w, confidence}))}))}]}]
});
const TODAY = '2026-10-20';
const read = rows => p.extractMomiosTicket(data(rows), TODAY);

// 1) Simple, con una fila de mercado visible encima del boleto (no es la apuesta).
let r = read([
  'Sí                  2.75 No                 1.40',
  'Marcar un penalti',
  'BOLETO 1 HISTORIAL 2',
  '— PSG vs. FC Barcelona   ABIERTO',
  'Sí                                             2.75',
  'Penalti en el encuentro',
  'PSG vs. FC Barcelona                            20/10 • 14:00',
  'Momios                                          2.75',
  'Apuesta total                                               $25.00',
  'Ganancia Total                                                 $68.75',
  '20/10 - 12:02 ID: 5551084936'
]);
assert.equal(r.ok, true, r.reason);
assert.deepEqual(r.readings.map(x => [x.event, x.selection, x.sport, x.odds]), [['PSG vs. FC Barcelona', 'Penalti en el encuentro: Sí', 'Fútbol', 175]]);
assert.equal(r.eventDate, '2026-10-20');
assert.equal(r.total, null);

// 2) OCR que separa selección/momio y partido/fecha en filas distintas.
r = read(['PSG vs. FC Barcelona', 'ABIERTO', 'Sí', '2.75', 'Penalti en el encuentro', 'PSG vs. FC Barcelona', '20/10 + 14:00', 'Momios', '2.75', 'Apuesta total', '$25.00']);
assert.equal(r.ok, true, r.reason);
assert.equal(r.readings[0].odds, 175);

// 3) Combinada de dos: cada selección con su momio y total coherente.
r = read([
  'Combinada (2)   ABIERTO',
  'América        1.80', 'Resultado final', 'América vs. Chivas   25/10 • 19:00',
  'Más de 2.5     2.10', 'Total de goles', 'Real Madrid vs. Sevilla   26/10 • 14:00',
  'Momios   3.78', 'Apuesta total   $50.00', 'Ganancia Total   $189.00'
]);
assert.equal(r.ok, true, r.reason);
assert.deepEqual(r.readings.map(x => [x.event, x.selection, x.odds]), [
  ['América vs. Chivas', 'Resultado final: América', -125],
  ['Real Madrid vs. Sevilla', 'Total de goles: Más de 2.5', 110]
]);
assert.equal(r.total.american, 278);
assert.equal(r.eventDate, '2026-10-26');

// 4) Total que no coincide con las selecciones → se rechaza.
r = read(['Combinada', 'América   1.80', 'Resultado final', 'América vs. Chivas   25/10 • 19:00',
  'Más de 2.5   2.10', 'Total de goles', 'Real Madrid vs. Sevilla   26/10 • 14:00', 'Momios   5.00', 'Apuesta total   $50.00']);
assert.equal(r.ok, false);

// 5) Boleto ya resuelto → no se publica.
r = read(['PSG vs. FC Barcelona   GANADA', 'Sí   2.75', 'Penalti en el encuentro', 'PSG vs. FC Barcelona   20/10 • 14:00', 'Momios   2.75', 'Ganancia Total   $68.75']);
assert.equal(r.ok, false);
assert.match(r.reason, /resuelto/);

// 6) Momio poco legible → no se adivina.
r = p.extractMomiosTicket(data(['PSG vs. FC Barcelona', 'Sí   2.75', 'Penalti en el encuentro', 'PSG vs. FC Barcelona   20/10 • 14:00', 'Momios   2.75', 'Apuesta total   $25.00'], 70), TODAY);
assert.equal(r.ok, false);

// 7) Fecha de enero leída en diciembre → año siguiente.
r = p.extractMomiosTicket(data(['Sí   2.75', 'Penalti en el encuentro', 'PSG vs. FC Barcelona   03/01 • 14:00', 'Momios   2.75', 'Apuesta total   $25.00']), '2026-12-28');
assert.equal(r.eventDate, '2027-01-03');

// 8) Otros formatos no se ven afectados: sin «Momios» no aplica.
assert.equal(read(['Bet Slip', 'Lakers vs Celtics', 'Lakers -4.5  -110']), null);

// 9) Vía extract(): el formato se reconoce de principio a fin.
r = p.extract(data(['— PSG vs. FC Barcelona   ABIERTO', 'Sí   2.75', 'Penalti en el encuentro', 'PSG vs. FC Barcelona   20/10 • 14:00', 'Momios   2.75', 'Apuesta total   $25.00']));
assert.equal(r.ok, true, r.reason);

console.log('PASS: boletos «Momios / Apuesta total» (simple, filas separadas, combinada, total incoherente, resuelto, baja confianza, cambio de año).');
