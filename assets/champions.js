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
    let editorBusy = false;

    function byId(id) { return document.getElementById(id); }
    function element(tag, text, className) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    function syncEditorButton() {
        const button = byId('championsEditButton');
        if (button) button.classList.toggle('hidden', !currentAdmin);
    }
    function renderEditorPositions(dialog, selected, participating) {
        const parent = dialog.querySelector('#aeChampionsPositions');
        parent.replaceChildren();
        selected.forEach((id,index) => {
            const line = element('div',null,'rcm-ranking-edit-row');
            const label = element('label',String(index+1));label.htmlFor='ae-champions-'+index;
            const choose = element('select');choose.id='ae-champions-'+index;
            choose.setAttribute('aria-label','Club en posición '+(index+1));
            const empty=element('option','Seleccionar club');empty.value='';choose.append(empty);
            participating.forEach(club=>{
                const opt=element('option',club.name);opt.value=String(club.id);
                opt.disabled=selected.includes(String(club.id))&&String(club.id)!==String(id);
                choose.append(opt);
            });
            choose.value=id||'';
            choose.onchange=()=>{selected[index]=choose.value;renderEditorPositions(dialog,selected,participating);dialog.querySelector('#ae-champions-'+index)?.focus();};
            line.append(label,choose);
            for(const [move,arrow] of [[-1,'↑'],[1,'↓']]){
                const control=element('button',arrow);control.type='button';
                control.disabled=index+move<0||index+move>9;
                control.setAttribute('aria-label',(move<0?'Subir':'Bajar')+' club en posición '+(index+1));
                control.onclick=()=>{[selected[index],selected[index+move]]=[selected[index+move],selected[index]];renderEditorPositions(dialog,selected,participating);dialog.querySelector('#ae-champions-'+(index+move))?.focus();};
                line.append(control);
            }
            parent.append(line);
        });
    }
    window.openChampionsEditor = async function openChampionsEditor() {
        if (!currentAdmin||!db||editorBusy||byId('aeChampionsEditor')) return;
        const dialog=element('dialog',null,'rcm-dialog ae-champions-editor');dialog.id='aeChampionsEditor';
        dialog.setAttribute('aria-label','Editar Power Rankings Champions League');
        const title=element('h2','Editar Champions League');
        const status=element('p','Cargando clubes y borrador…');status.id='aeChampionsEditorStatus';status.setAttribute('role','status');
        const close=element('button','Cerrar');close.type='button';close.onclick=()=>dialog.close();
        dialog.append(title,status,close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
        try {
            const [{data:catalog,error:catErr},{data:draft,error:draftErr}]=await Promise.all([
                db.from('champions_clubs').select('id,name,season,participating').eq('season',SEASON).eq('participating',true).order('name'),
                db.from('champions_ranking_drafts').select('*').eq('season',SEASON).eq('user_id',currentAdmin.id).maybeSingle()
            ]);
            if(catErr||draftErr) throw catErr||draftErr;
            const participating=catalog||[];
            if(participating.length<10)throw new Error('No hay suficientes clubes habilitados.');
            const selected=(draft?.team_ids||latest?.team_ids||[]).map(String);
            while(selected.length<10)selected.push('');
            const editionLabel=element('label','Jornada o edición');editionLabel.htmlFor='aeChampionsEditionInput';
            const edition=element('input');edition.id='aeChampionsEditionInput';edition.maxLength=100;edition.value=draft?.edition||latest?.edition||'';
            const positions=element('div',null,'ae-champions-positions');positions.id='aeChampionsPositions';
            const save=element('button','Guardar borrador');save.type='button';
            const publish=element('button','Publicar las diez posiciones');publish.type='button';
            const submit=async isPublic=>{
                if(editorBusy)return;
                const name=edition.value.trim();
                if(!name){status.textContent='Escribe una jornada.';return;}
                if(selected.length!==10||selected.some(id=>!participating.some(c=>String(c.id)===id))||new Set(selected).size!==10){
                    status.textContent='Selecciona diez clubes diferentes.';return;
                }
                editorBusy=true;
                dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
                status.textContent=isPublic?'Publicando la clasificación…':'Guardando borrador…';
                try {
                    const res=isPublic
                        ? await db.rpc('ae_publish_champions_ranking',{p_season:SEASON,p_edition:name,p_team_ids:[...selected],p_expected_latest_id:latest?.id||null})
                        : await db.from('champions_ranking_drafts').upsert({user_id:currentAdmin.id,season:SEASON,edition:name,team_ids:[...selected]},{onConflict:'user_id,season'});
                    if(res.error)throw res.error;
                    if(isPublic){
                        await refreshChampions();
                        if(!latest||latest.edition!==name||JSON.stringify(latest.team_ids.map(String))!==JSON.stringify(selected))throw new Error('Publicación no confirmada. Comprueba la lectura pública.');
                    }
                    status.textContent=isPublic?'Ranking publicado correctamente.':'Borrador privado guardado.';
                } catch(e){
                    status.textContent='No se pudo guardar: '+(e.message||'Error de conexión');
                } finally {
                    editorBusy=false;
                    dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);
                    renderEditorPositions(dialog,selected,participating);
                }
            };
            save.onclick=()=>submit(false);publish.onclick=()=>submit(true);
            dialog.append(editionLabel,edition,positions,save,publish);
            renderEditorPositions(dialog,selected,participating);
            status.textContent='Selecciona las 10 posiciones. Guardar borrador no publica los cambios.';
        } catch(e){status.textContent='No se pudo abrir el editor: '+(e.message||'Error');}
    };

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
                db.from('champions_rankings').select('id,edition,team_ids,published_at,season')
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
        syncEditorButton();
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
