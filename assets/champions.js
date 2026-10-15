/* Champions League editorial rankings: read-only, never invent standings. 
 * This module uses the additive schema in PR #2 if installed in staging/production.
 * It intentionally does NOT load the abandoned Picks league.
 */
(() => {
    'use strict';
    const SEASON = '2026/27';
    let latest = null;
    let previousTeamIds = null;
    let clubs = new Map();
    let loading = false;

    function byId(id) { return document.getElementById(id); }
    function element(tag, text, className) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    function row(id, index) {
        const item = element('li', null, 'rcm-team');
        const club = clubs.get(String(id));
        item.append(element('strong', String(index + 1)));
        if (club) {
            const emblem = element('span',null,'ae-team-emblem');
            emblem.append(element('span',club.name.split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase(),'ae-logo-initials'));
            if (/^https:\/\//i.test(club.logo)) {
                const img = element('img'); img.src = club.logo;
                img.alt = club.name;
                img.width = 64; img.height = 64;
                img.decoding = 'async'; img.loading = 'eager';
                img.onload = () => emblem.classList.add('ae-logo-loaded');
                img.onerror = () => img.remove();
                emblem.append(img);
            }
            item.append(emblem, element('span', club.name,'ae-team-name'));
            if (Array.isArray(previousTeamIds) && previousTeamIds.length === 10) {
                const oldPos = previousTeamIds.findIndex(teamId => String(teamId) === String(id));
                const delta = oldPos < 0 ? null : oldPos - index;
                const trend = element('span', delta === null ? 'Nuevo' : delta > 0 ? '▲ ' + delta : delta < 0 ? '▼ ' + (-delta) : '–',
                    'ae-rank-trend ' + (delta === null ? 'ae-rank-new' : delta > 0 ? 'ae-rank-up' : delta < 0 ? 'ae-rank-down' : 'ae-rank-flat'));
                trend.setAttribute('aria-label',delta === null ? 'Nuevo equipo en el Top 10' : delta === 0 ? 'Sin cambios' : (delta > 0 ? 'Subió ' : 'Bajó ') + Math.abs(delta) + ' posiciones');
                item.append(trend);
            } else {
                const first = element('span', '–', 'ae-rank-trend ae-rank-flat');
                first.setAttribute('aria-label','No existe todavía una edición anterior para comparar');
                item.append(first);
            }
        } else {
            item.append(element('span', String(id), 'rcm-logo-fallback'), element('span', 'Club pendiente de catálogo'));
        }
        return item;
    }
    function render() {
        const preview = byId('homeChampionsList');
        const full = byId('championsList');
        const track = byId('championsTrack');
        preview.replaceChildren(); full.replaceChildren(); track.replaceChildren();
        const hasPublished = !!(latest && Array.isArray(latest.team_ids) && latest.team_ids.length === 10);
        byId('championsViewport').hidden = !hasPublished;
        const status = hasPublished ? '' : 'Todavía no hay una clasificación de Champions publicada.';
        byId('homeChampionsStatus').textContent = status;
        byId('championsStatus').textContent = status;
        byId('homeChampionsEdition').textContent = hasPublished ? latest.edition : '';
        byId('championsEdition').textContent = hasPublished ? latest.edition : '';
        if (hasPublished) {
            latest.team_ids.slice(0, 6).forEach((id,i) => preview.append(row(id,i)));
            latest.team_ids.forEach((id,i) => full.append(row(id,i)));
            // Two identical groups make a seamless visual loop. The canonical,
            // screen-reader-accessible Top 10 above is never duplicated.
            for (let copy = 0; copy < 2; copy++) {
                const group = element('ol', null, 'rcm-track-group');
                latest.team_ids.forEach((id,i) => group.append(row(id,i)));
                track.append(group);
            }
        }
    }
    function showError(message) {
        // The feature may not yet have been migrated: offer an accurate empty state.
        const status = 'La clasificación de Champions aún no está disponible. ' + message;
        byId('homeChampionsStatus').textContent = status;
        byId('championsStatus').textContent = status;
    }
    async function refreshChampions() {
        if (loading) return;
        loading = true;
        try {
            if (!db) throw new Error('Sin conexión con los datos publicados.');
            const [editionResult, clubsResult] = await Promise.all([
                db.from('champions_rankings').select('edition,team_ids,published_at,season')
                    .eq('season', SEASON).order('published_at', {ascending:false}).range(0,1),
                db.from('champions_clubs').select('id,name,logo,season').eq('season', SEASON)
            ]);
            if (editionResult.error || clubsResult.error) throw editionResult.error || clubsResult.error;
            latest = editionResult.data?.[0] || null;
            previousTeamIds = editionResult.data?.[1]?.team_ids || null;
            clubs = new Map((clubsResult.data || []).map(c => [String(c.id), c]));
            render();
        } catch(error) {
            latest = null; previousTeamIds = null; clubs.clear(); render();
            showError('Vuelve a consultar más tarde.');
        } finally { loading = false; }
    }
    window.renderChampionsVisibility = function renderChampionsVisibility() {
        const visible = currentCategory === 'Fútbol' && !currentTeam && !currentSearchQuery;
        byId('championsRankings').classList.toggle('hidden', !visible);
    };
    document.addEventListener('DOMContentLoaded', () => {
        render();
        renderChampionsVisibility();
        refreshChampions();
        // Fetch latest published ranking on return to the tab.
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshChampions();
        });
    });
})();
