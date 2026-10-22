(function (root) {
    'use strict';

    // Este adaptador NO mantiene logos propios: usa exclusivamente NFL_TEAMS.
    // Debe cargarse después de assets/nfl-teams.js.
    const aliases = Object.freeze({
        ARZ: 'ARI', AZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU',
        JAC: 'JAX', KAN: 'KC', GNB: 'GB', GBP: 'GB', NWE: 'NE',
        NOR: 'NO', SFO: 'SF', TAM: 'TB', WSH: 'WAS', WDC: 'WAS',
        LVR: 'LV', OAK: 'LV', SD: 'LAC', SDG: 'LAC', STL: 'LAR',
        'WASHINGTON FOOTBALL TEAM': 'WAS', 'WASHINGTON REDSKINS': 'WAS'
    });
    const providerIds = new Map();

    function normalize(value) {
        return String(value == null ? '' : value)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    const normalizedAliases = Object.fromEntries(
        Object.entries(aliases).map(([key, value]) => [normalize(key), value])
    );

    function catalog() {
        if (typeof NFL_TEAMS !== 'undefined' && Array.isArray(NFL_TEAMS)) return NFL_TEAMS;
        if (Array.isArray(root.NFL_TEAMS)) return root.NFL_TEAMS;
        return [];
    }

    function candidates(input) {
        if (input == null) return [];
        if (typeof input !== 'object') return [input];
        const fields = [
            'teamId', 'TeamID', 'id', 'ID', 'key', 'Key', 'abbreviation',
            'Abbreviation', 'abbr', 'code', 'Code', 'team', 'Team',
            'teamName', 'TeamName', 'fullName', 'FullName',
            'displayName', 'DisplayName', 'name', 'Name'
        ];
        const values = fields.map(field => input[field]).filter(value =>
            value != null && typeof value !== 'object' && String(value).trim()
        );
        const city = input.city || input.City;
        const nickname = input.nickname || input.Nickname || input.Name;
        if (city && nickname) values.push(String(city) + ' ' + String(nickname));
        return values;
    }

    function getTeam(input) {
        const teams = catalog();
        if (!teams.length) return null;
        for (const raw of candidates(input)) {
            const needle = normalize(raw);
            if (!needle) continue;
            const canonicalId = providerIds.get(needle) || normalizedAliases[needle] || needle;
            const exact = teams.find(team =>
                normalize(team.id) === canonicalId || normalize(team.name) === needle
            );
            if (exact) return exact;
            // Ciudad o apodo solo si el resultado no es ambiguo (p. ej. "Los Angeles").
            if (needle.length < 4) continue;
            const matches = teams.filter(team => {
                const name = normalize(team.name);
                return name.startsWith(needle) || name.endsWith(needle);
            });
            if (matches.length === 1) return matches[0];
        }
        return null;
    }

    function getTeamId(input) {
        const team = getTeam(input);
        return team ? team.id : null;
    }

    // SportsDataIO y otros proveedores pueden enviar TeamID numérico.
    // No asumir que un TeamID externo equivale a un id interno.
    function registerProviderTeams(rows) {
        if (!Array.isArray(rows)) return 0;
        let registered = 0;
        rows.forEach(row => {
            if (!row || typeof row !== 'object') return;
            const team = getTeam({
                Key: row.Key || row.key || row.Abbreviation || row.abbreviation,
                FullName: row.FullName || row.fullName || row.DisplayName || row.displayName,
                Name: row.Name || row.name,
                City: row.City || row.city
            });
            if (!team) return;
            for (const field of ['TeamID', 'teamId', 'ID', 'id']) {
                if (row[field] != null) providerIds.set(normalize(row[field]), team.id);
            }
            registered += 1;
        });
        return registered;
    }

    function createTeam(input, options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        if (!doc) throw new Error('Se necesita un documento para renderizar equipos.');
        const team = getTeam(input);
        const clickable = typeof opts.onSelect === 'function';
        const element = doc.createElement(clickable ? 'button' : 'span');
        element.className = 'cam-quiniela-team';
        if (clickable) {
            element.type = 'button';
            element.disabled = Boolean(opts.locked);
            element.setAttribute('aria-pressed', String(Boolean(opts.selected)));
            if (!opts.locked && team) element.addEventListener('click', () => opts.onSelect(team.id));
        }
        if (opts.selected) element.classList.add('is-selected');
        if (opts.locked) element.classList.add('is-locked');
        if (team) {
            element.dataset.teamId = team.id;
            const image = doc.createElement('img');
            image.src = team.logo;
            image.alt = 'Logo de ' + team.name;
            image.width = 36;
            image.height = 36;
            image.decoding = 'async';
            image.loading = opts.eager ? 'eager' : 'lazy';
            image.className = 'cam-quiniela-team-logo';
            image.addEventListener('error', () => {
                element.dataset.logoError = 'true';
                image.hidden = true;
            });
            element.appendChild(image);
        } else {
            element.dataset.unknownTeam = 'true';
        }
        const name = doc.createElement('span');
        name.className = 'cam-quiniela-team-name';
        name.textContent = team ? team.name : 'Equipo por confirmar';
        element.appendChild(name);
        return element;
    }

    // Componente reutilizable: jornada, selección, resumen, historial y desglose.
    // Nunca asigna HTML externo y conserva ambos logos después del bloqueo.
    function createMatchup(game, options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        if (!doc) throw new Error('Se necesita un documento para renderizar partidos.');
        const away = game.awayTeam || game.AwayTeam || game.away_team || game.away_team_id || game.away_id || game.away;
        const home = game.homeTeam || game.HomeTeam || game.home_team || game.home_team_id || game.home_id || game.home;
        const selectedId = getTeamId(opts.selectedTeam || opts.selectedTeamId);
        const result = ['correct', 'incorrect', 'void'].includes(opts.pickResult) ? opts.pickResult : null;
        const block = doc.createElement('div');
        block.className = 'cam-quiniela-matchup';
        block.dataset.locked = String(Boolean(opts.locked));
        if (result) block.dataset.pickResult = result;
        const onSelect = opts.interactive && typeof opts.onSelect === 'function' && !opts.locked
            ? opts.onSelect : null;
        const make = input => createTeam(input, {
            document: doc, onSelect,
            selected: Boolean(selectedId && getTeamId(input) === selectedId),
            locked: Boolean(opts.locked),
            eager: Boolean(opts.eager)
        });
        block.appendChild(make(away));
        const at = doc.createElement('span');
        at.className = 'cam-quiniela-at';
        at.textContent = '@';
        at.setAttribute('aria-hidden', 'true');
        block.appendChild(at);
        block.appendChild(make(home));
        if (result || opts.locked) {
            const status = doc.createElement('span');
            status.className = 'cam-quiniela-status';
            status.textContent = result === 'correct' ? 'Pick acertado'
                : result === 'incorrect' ? 'Pick fallado'
                : result === 'void' ? 'Pick anulado' : 'Partido bloqueado';
            block.appendChild(status);
        }
        return block;
    }

    root.CamNFLQuinielaTeams = Object.freeze({
        getTeam, getTeamId, registerProviderTeams, createTeam, createMatchup
    });
})(typeof window !== 'undefined' ? window : globalThis);
