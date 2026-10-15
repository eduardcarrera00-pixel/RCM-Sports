/* AE SPORTS weekly ballot. Uses published Supabase pick_editions/sports_picks.
 * No demo votes, fake odds or localStorage tallies.
 * Community-generated daily Picks are a separate feature, not implemented by this ballot.
 */
(() => {
    'use strict';
    let active = null;
    let options = [];
    let totals = new Map();
    let busy = false;
    let refreshId = 0;
    const box = () => document.getElementById('weeklyPickOptions');
    function el(tag, label, className) {
        const item = document.createElement(tag);
        if (label != null) item.textContent = label;
        if (className) item.className = className;
        return item;
    }
    function showEmpty(message = 'Todavía no hay una votación semanal publicada.') {
        const root = box(); if (!root) return;
        root.replaceChildren(el('p',message,'ae-pick-empty'));
        const btn = el('button','Explorar publicaciones de Picks →');
        btn.type='button'; btn.onclick=()=>filterByCategory('Picks');
        root.append(btn);
    }
    function render() {
        const root = box(); if (!root) return;
        if (!active || options.length !== 2) return showEmpty();
        root.replaceChildren();
        root.append(el('p',active.edition,'ae-ballot-edition'));
        root.append(el('p','Elige una de estas dos opciones. Cada cuenta puede apoyar una opción por edición.','ae-ballot-description'));
        const closed = new Date(active.closes_at).getTime() <= Date.now() || options.some(p=>p.outcome!=='pending');
        const group = el('div',null,'ae-ballot-options');
        for(const pick of options) {
            const tally = totals.get(String(pick.id));
            const picked = !!tally?.my_vote;
            const button = el('button',null,'ae-ballot-choice');
            button.type='button'; button.disabled = busy || closed;
            button.setAttribute('aria-pressed',String(picked));
            button.append(el('span',pick.title,'ae-ballot-choice-name'));
            if (pick.description) button.append(el('span',pick.description,'ae-ballot-choice-description'));
            if (tally) button.append(el('span',`${Number(tally.votes)} ${Number(tally.votes)===1?'voto':'votos'}`,'ae-ballot-votes'));
            button.onclick = () => choose(pick);
            group.append(button);
        }
        root.append(group);
        root.append(el('p',closed?'Votación cerrada.':'La selección se guarda al iniciar sesión.','ae-pick-fineprint'));
        if (active.closes_at) {
            root.append(el('p','Cierre: '+new Date(active.closes_at).toLocaleString('es',{dateStyle:'medium',timeStyle:'short'}),'ae-pick-fineprint'));
        }
        const more = el('button','Ir a Picks →','ae-ballot-secondary');
        more.type='button'; more.onclick=()=>filterByCategory('Picks'); root.append(more);
    }
    async function load() {
        if (busy) return;
        if (!db) { showEmpty('No se pudo conectar con las votaciones.'); return; }
        const request = ++refreshId;
        try {
            const {data:editions,error:e} = await db.from('pick_editions').select('id,edition,starts_at,closes_at')
                .lte('starts_at',new Date().toISOString()).order('starts_at',{ascending:false}).range(0,0);
            if (e) throw e;
            if (request !== refreshId) return;
            active = editions?.[0] || null;
            if(!active){options=[];totals.clear();render();return;}
            const [pickResponse,voteResponse] = await Promise.all([
                db.from('sports_picks').select('id,edition_id,position,title,description,outcome').eq('edition_id',active.id).order('position'),
                db.rpc('rcm_pick_totals')
            ]);
            if (pickResponse.error || voteResponse.error) throw pickResponse.error || voteResponse.error;
            if(request !== refreshId) return;
            options = (pickResponse.data || []).sort((a,b)=>a.position-b.position);
            totals = new Map((voteResponse.data || []).map(t=>[String(t.pick_id),t]));
            render();
        } catch {
            if (request !== refreshId) return;
            active=null;options=[];totals.clear();
            showEmpty('El panel semanal estará disponible cuando se publique una edición válida.');
        }
    }
    async function choose(pick) {
        if (busy || !active || !db) return;
        try {
            const {data,error} = await db.auth.getUser();
            if (error || !data?.user) {
                if (typeof openUserAuthModal==='function') openUserAuthModal();
                notifyCommunity('Inicia sesión y vuelve a elegir tu Pick.');
                return;
            }
            busy = true; render();
            const result = await db.rpc('rcm_choose_pick',{p_edition_id:active.id,p_pick_id:pick.id});
            if(result.error) throw result.error;
            notifyCommunity('Tu voto semanal quedó registrado.');
        } catch(error) {
            notifyCommunity('No se pudo guardar la selección: ' + (error.message || 'comprueba tu conexión'),true);
        } finally {
            busy=false; await load();
        }
    }
    document.addEventListener('DOMContentLoaded',()=>{
        load();
        document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
        if (db) db.auth.onAuthStateChange(()=>setTimeout(load,0));
    });
})();
