import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const scope = createContext({});
runInContext(
    readFileSync(new URL('../assets/nfl-teams.js', import.meta.url), 'utf8') +
        '\n' +
        readFileSync(new URL('../assets/cam-nfl-quiniela-logos.js', import.meta.url), 'utf8') +
        '\n globalThis.teamsForTest = NFL_TEAMS;',
    scope
);
const { teamsForTest: teams, CamNFLQuinielaTeams: ui } = scope;

assert.equal(teams.length, 32, 'El catálogo debe tener los 32 equipos NFL');
for (const team of teams) {
    assert.deepEqual(
        [ui.getTeam(team.id)?.id, ui.getTeam(team.id)?.logo],
        [team.id, team.logo],
        'Debe reutilizar el mismo logo existente para ' + team.id
    );
}
for (const [alias, expected] of Object.entries({
    ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', GNB: 'GB',
    NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB',
    WSH: 'WAS', SDG: 'LAC', STL: 'LAR', LVR: 'LV',
    'Chicago Bears': 'CHI', Patriots: 'NE'
})) assert.equal(ui.getTeamId(alias), expected, alias);

assert.equal(ui.getTeamId('Los Angeles'), null, 'Nunca adivinar nombres ambiguos');
assert.equal(ui.getTeamId(987654), null, 'No adivinar TeamID externos');
assert.equal(ui.registerProviderTeams([{ TeamID: 987654, Key: 'CHI', FullName: 'Chicago Bears' }]), 1);
assert.equal(ui.getTeamId(987654), 'CHI');

function documentStub() {
    return {
        createElement(tagName) {
            return {
                tagName, children: [], dataset: {}, attributes: {}, handlers: {},
                classList: {
                    values: new Set(),
                    add(name) { this.values.add(name); },
                    contains(name) { return this.values.has(name); }
                },
                appendChild(child) { this.children.push(child); },
                setAttribute(name, value) { this.attributes[name] = value; },
                addEventListener(name, callback) { this.handlers[name] = callback; }
            };
        }
    };
}
const document = documentStub();
let chosen = null;
const game = { AwayTeam: 'CHI', HomeTeam: 'NE' };
const current = ui.createMatchup(game, {
    document, selectedTeamId: 'CHI', interactive: true,
    onSelect: id => { chosen = id; }
});
assert.equal(current.children.length, 3);
assert.equal(current.children[0].tagName, 'button');
assert.equal(current.children[2].tagName, 'button');
assert.equal(current.children[0].children[0].src, ui.getTeam('CHI').logo);
assert.equal(current.children[2].children[0].src, ui.getTeam('NE').logo);
assert.equal(current.children[0].attributes['aria-pressed'], 'true');
assert.equal(current.children[2].attributes['aria-pressed'], 'false');
assert.ok(current.children[0].classList.contains('is-selected'));
current.children[2].handlers.click();
assert.equal(chosen, 'NE', 'La selección debe enviar el id canónico');

for (const [result, label] of [
    ['correct', 'Pick acertado'], ['incorrect', 'Pick fallado'], ['void', 'Pick anulado']
]) {
    const past = ui.createMatchup(game, {
        document, selectedTeamId: 'CHI', locked: true, pickResult: result
    });
    assert.equal(past.children[0].children[0].src, ui.getTeam('CHI').logo);
    assert.equal(past.children[2].children[0].src, ui.getTeam('NE').logo);
    assert.equal(past.children[3].textContent, label);
    assert.equal(past.dataset.pickResult, result);
    assert.equal(past.children[0].tagName, 'span', 'Un pick bloqueado no se puede cambiar');
}
console.log('Quiniela NFL: catálogo, aliases, selección, bloqueo y resultados OK');
