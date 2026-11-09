/* CAM SPORTS · Private in-app alerts for community activity.
   9 nov 2026: los avisos ya no tienen botón en la cabecera. El número sin leer
   es un globito sobre el icono de Perfil (cabecera del teléfono y navegación
   del ordenador) y la campana vive en el perfil propio, junto a «Editar
   perfil». El panel es el mismo de siempre, abierto como hoja desde abajo en
   el teléfono y panel lateral en el ordenador; al abrirlo se marcan como
   leídos (los nuevos siguen resaltados mientras está abierto). Tocar el
   globito abre el perfil directamente con el panel. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let userId = null;
  let alerts = [];
  let loadToken = 0;
  let realtime = null;
  let authCheck = 0;
  let unreadTotal = 0;
  // Avisos que estaban sin leer al abrir el panel: siguen resaltados hasta cerrarlo.
  const fresh = new Set();
  const short = total => total > 9 ? '9+' : String(total);
  const profileButton = () => $('camNavProfile');
  function profileBadge() {
    const button = profileButton();
    if (!button) return null;
    let badge = button.querySelector('.cam-profile-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'cam-profile-badge';
      badge.hidden = true;
      badge.setAttribute('aria-hidden', 'true');
      (button.querySelector('.ae-nav-icon') || button).append(badge);
    }
    return badge;
  }
  // Globito sobre Perfil: nada con 0, «9+» con más de 9.
  function paintProfileBadge() {
    const total = userId ? unreadTotal : 0;
    const badge = profileBadge();
    if (badge) {
      badge.hidden = total === 0;
      badge.textContent = total === 0 ? '' : short(total);
    }
    const button = profileButton();
    if (button) {
      if (total) button.dataset.unread = String(total);
      else delete button.dataset.unread;
    }
    window.camMobileDock?.update?.();
  }
  const create = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = String(value);
    if (className) element.className = className;
    return element;
  };
  const dialog = () => $('aeNotificationsDialog');

  function reset() {
    alerts = [];
    unreadTotal = 0;
    fresh.clear();
    paintProfileBadge();
    $('aeNotificationsButton').hidden = true;
    $('aeNotificationsBadge').hidden = true;
    $('aeNotificationsBadge').textContent = '';
    $('aeNotificationsButton').setAttribute('aria-expanded', 'false');
    $('aeNotificationsButton').setAttribute('aria-label', 'Notificaciones');
    if (dialog()?.open) dialog().close();
    $('aeNotificationsList').replaceChildren();
  }

  function label(notification) {
    const who = '@' + (notification.actor_name || 'Usuario');
    const entry = {
      take_reply: 'respondió en tu Take',
      pick_reply: 'respondió en tu Pick',
      article_reply: 'respondió a tu comentario o noticia',
      take_vote: notification.vote_value === -1 ? 'votó en contra de tu Take' : 'votó a favor de tu Take',
      pick_vote: notification.vote_value === -1 ? 'votó en contra de tu Pick' : 'votó a favor de tu Pick',
      comment_vote: notification.vote_value === -1 ? 'votó en contra de tu comentario' : 'votó a favor de tu comentario',
      article_like: 'dio me gusta a tu noticia'
    };
    return who + ' ' + (entry[notification.event_key] || 'interactuó con tu publicación');
  }
  function dateLabel(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('es',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);
  }
  function paint(unread) {
    // Display absolutely nothing around the bell if there are no unread alerts.
    const total = Math.max(0, Number(unread) || 0);
    unreadTotal = total;
    paintProfileBadge();
    const badge = $('aeNotificationsBadge');
    badge.hidden = total === 0;
    badge.textContent = total === 0 ? '' : short(total);
    $('aeNotificationsButton').setAttribute('aria-label',
      total === 0 ? 'Notificaciones, ninguna sin leer'
        : total === 1 ? 'Notificaciones, 1 sin leer'
          : 'Notificaciones, ' + total + ' sin leer');
    const panel = $('aeNotificationsList');
    if (!panel || !dialog()?.open) return;
    // Preserve list positions when Realtime refreshes alerts.
    const panelScrollTop = panel.scrollTop;
    const scrollPositions = new Map(
      [...panel.querySelectorAll('[data-ae-notification-group]')]
        .map(list=>[list.dataset.aeNotificationGroup,list.scrollTop])
    );
    panel.replaceChildren();
    const reactionTypes = new Set(['take_vote','pick_vote','comment_vote','article_like']);
    const groups = [
      {
        id:'aeNotificationsReactionsTitle',
        title:'Reacciones',
        subtitle:'Votos y me gusta',
        items:alerts.filter(item=>reactionTypes.has(item.event_key)),
        empty:'Todavía no has recibido reacciones.'
      },
      {
        id:'aeNotificationsCommentsTitle',
        title:'Comentarios',
        subtitle:'Respuestas a tus publicaciones',
        items:alerts.filter(item=>!reactionTypes.has(item.event_key)),
        empty:'Todavía no has recibido comentarios.'
      }
    ];
    for (const group of groups) {
      const section = create('section',null,'ae-notifications-group');
      section.setAttribute('aria-labelledby',group.id);
      const heading = create('header',null,'ae-notifications-group-heading');
      const headingText = create('div',null,'ae-notifications-group-titles');
      const title = create('h3',group.title);
      title.id = group.id;
      headingText.append(title,create('p',group.subtitle));
      heading.append(headingText);
      // El encabezado solo nombra la lista; los avisos sin leer resaltan individualmente.
      section.append(heading);
      const list = create('div',null,'ae-notifications-list');
      list.setAttribute('role','list');
      list.dataset.aeNotificationGroup = group.id;
      list.setAttribute('aria-label','Lista de '+group.title.toLowerCase());
      list.tabIndex = 0;
      if (!group.items.length) {
        const empty = create('p',group.empty,'ae-notifications-empty');
        empty.setAttribute('role','listitem');
        list.append(empty);
      }
      for (const item of group.items) {
        const row = create('div',null,'ae-notification-row');
        row.setAttribute('role','listitem');
        const action = create('button',null,'ae-notification-entry'+(item.read_at&&!fresh.has(item.id)?'':' is-unread'));
        action.type = 'button';
        const icon = create('span',item.event_key.includes('vote') ? (item.vote_value === -1 ? '▼' : '▲') :
          item.event_key === 'article_like' ? '♥' : '↩','ae-notification-event-icon');
        icon.setAttribute('aria-hidden','true');
        const content = create('span',null,'ae-notification-text');
        content.append(create('strong',label(item)),create('small',item.context_title || 'Publicación de CAM SPORTS'));
        content.append(create('time',dateLabel(item.created_at)));
        const dot = create('span',null,'ae-notification-dot');
        dot.setAttribute('aria-hidden','true');
        action.append(icon,content,dot);
        action.addEventListener('click',()=>void openItem(item));
        row.append(action);
        list.append(row);
      }
      section.append(list);
      panel.append(section);
      list.scrollTop = scrollPositions.get(group.id) || 0;
    }
    panel.scrollTop = panelScrollTop;
    const all = $('aeNotificationsReadAll');
    all.disabled = total === 0;
    all.hidden = total === 0;
  }

  async function refresh() {
    if (!userId || typeof db === 'undefined' || !db) return;
    const uid = userId;
    const seq = ++loadToken;
    try {
      const availableAt = new Date().toISOString();
      const [recent,count] = await Promise.all([
        db.from('ae_notifications').select('id,recipient_id,event_key,target_kind,target_id,source_id,actor_name,context_title,vote_value,created_at,read_at')
          .eq('recipient_id',uid).neq('event_key','welcome').lte('created_at',availableAt).order('created_at',{ascending:false}).limit(70),
        db.from('ae_notifications').select('id',{count:'exact',head:true})
          .eq('recipient_id',uid).neq('event_key','welcome').is('read_at',null).lte('created_at',availableAt)
      ]);
      if (seq !== loadToken || userId !== uid) return;
      if (recent.error || count.error) throw recent.error || count.error;
      alerts = recent.data || [];
      $('aeNotificationsStatus').textContent = '';
      paint(Number(count.count)||0);
    } catch (error) {
      if (seq !== loadToken || userId !== uid) return;
      $('aeNotificationsStatus').textContent = 'No se pudieron cargar las notificaciones. Inténtalo de nuevo.';
    }
  }

  async function markRead(id) {
    if (!userId) return;
    const result = await db.from('ae_notifications')
      .update({read_at:new Date().toISOString()})
      .eq('recipient_id',userId).eq('id',id).is('read_at',null);
    if (result.error) throw result.error;
  }

  async function openTarget(item) {
    if (item.target_kind === 'article') {
      const url = new URL(location.href);
      url.searchParams.set('article',item.target_id);
      // Replies and comment votes lead directly to the comment in the article.
      if ((item.event_key === 'article_reply' || item.event_key === 'comment_vote') && item.source_id) {
        url.searchParams.set('comment',item.source_id);
      } else {
        url.searchParams.delete('comment');
      }
      history.pushState({article:item.target_id},'',url);
      if (typeof openArticleFromShareLink === 'function') await openArticleFromShareLink();
      return;
    }
    if (item.target_kind === 'pick') {
      if (typeof filterByCategory === 'function') filterByCategory('Picks');
      if (typeof window.aeOpenPickDetail === 'function') {
        window.aeOpenPickDetail(item.target_id);
      } else {
        const url = new URL(location.href);
        url.searchParams.set('pick',item.target_id);
        location.href = url.toString();
      }
      return;
    }
    if (item.target_kind === 'take') {
      const result = await db.from('ae_free_takes')
        .select('id,user_id,sport,title,body,hidden').eq('id',item.target_id).maybeSingle();
      if (result.error || !result.data || result.data.hidden) {
        $('aeNotificationsStatus').textContent = 'Este Take ya no está disponible.';
        return;
      }
      const take = result.data;
      if (typeof filterByCategory === 'function') filterByCategory(take.sport === 'nfl' ? 'NFL' : 'Fútbol');
      window.aeTakeReplies?.open({
        id:take.id,author_id:take.user_id,author:'Aficionado',title:take.title,
        body:take.body,sport:take.sport
      });
    }
  }
  async function openItem(item) {
    try {
      if (!item.read_at) await markRead(item.id);
      const panel = dialog();
      if (panel?.open) panel.close();
      // El panel se abre desde el perfil: se cierra para ver la publicación.
      if ($('aeProfileDialog')?.open) window.closeAeProfile?.();
      await refresh();
      await openTarget(item);
    } catch (error) {
      $('aeNotificationsStatus').textContent = 'No pudimos abrir la notificación. Vuelve a intentarlo.';
      if (!dialog().open) dialog().showModal();
    }
  }

  async function watch(id) {
    if (realtime) {
      const old = realtime; realtime = null;
      try { await db.removeChannel(old); } catch (_) {}
    }
    if (!id || userId !== id) return;
    try {
      realtime = db.channel('ae-alerts-'+id)
        .on('postgres_changes',{
          event:'*',schema:'public',table:'ae_notifications',
          filter:'recipient_id=eq.'+id
        },()=>void refresh()).subscribe();
    } catch (_) { /* Polling remains available when Realtime is offline. */ }
  }
  async function syncAccount() {
    if (typeof db === 'undefined' || !db) return;
    const seq = ++authCheck;
    try {
      const {data} = await db.auth.getUser();
      if (seq !== authCheck) return;
      // Anonymous Supabase sessions are not registered AE SPORTS accounts.
      const id = data?.user && !data.user.is_anonymous ? data.user.id : null;
      if (id === userId) return;
      userId = id;
      loadToken++;
      reset();
      if (id) {
        $('aeNotificationsButton').hidden = false;
        void refresh();
      }
      void watch(id);
    } catch (_) {}
  }
  // Marca como leídos todos los avisos hasta ahora (los de bienvenida no se cuentan).
  async function markAllRead() {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const response = await db.from('ae_notifications')
      .update({read_at:readAt})
      .eq('recipient_id',userId).neq('event_key','welcome').is('read_at',null).lte('created_at',readAt);
    if (response.error) throw response.error;
  }
  async function openPanel() {
    const panel = dialog();
    if (!panel || !userId) return;
    if (panel.open) { panel.close(); return; }
    fresh.clear();
    for (const item of alerts) if (!item.read_at) fresh.add(item.id);
    panel.showModal();
    $('aeNotificationsButton').setAttribute('aria-expanded','true');
    paint(unreadTotal);
    await refresh();
    for (const item of alerts) if (!item.read_at) fresh.add(item.id);
    if (!unreadTotal || !panel.open) return;
    try {
      await markAllRead();
      await refresh();
    } catch (_) {
      // «Marcar todas como leídas» queda visible para reintentar.
    }
  }
  // Tocar el globito de Perfil abre el perfil propio ya con el panel.
  function badgeHit(event) {
    const badge = profileBadge();
    if (!badge || badge.hidden || !event.clientX && !event.clientY) return false;
    // Margen hacia fuera del botón (arriba y a la derecha), casi nada hacia el
    // icono: tocar la silueta de Perfil sigue abriendo el perfil sin el panel.
    const r = badge.getBoundingClientRect();
    return event.clientX >= r.left - 2 && event.clientX <= r.right + 8 &&
      event.clientY >= r.top - 8 && event.clientY <= r.bottom + 2;
  }
  async function openFromProfileBadge() {
    if (typeof window.openAeProfile !== 'function') return;
    await window.openAeProfile();
    const own = $('aeProfileDialog')?.open && !$('camProfileEditOpen')?.hidden;
    if (own && !dialog()?.open) await openPanel();
  }
  function init() {
    $('aeNotificationsButton')?.addEventListener('click',()=>void openPanel());
    document.addEventListener('click',event=>{
      if (!userId || !unreadTotal || !event.target?.closest?.('#camNavProfile') || !badgeHit(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void openFromProfileBadge();
    },true);
    $('aeNotificationsClose')?.addEventListener('click',()=>dialog()?.close());
    dialog()?.addEventListener('close',()=>{
      fresh.clear();
      paint(unreadTotal);
      $('aeNotificationsButton').setAttribute('aria-expanded','false');
      const bell = $('aeNotificationsButton');
      if (bell?.getClientRects().length) bell.focus({preventScroll:true});
    });
    dialog()?.addEventListener('click',event=>{if (event.target === dialog()) dialog().close();});
    $('aeNotificationsReadAll')?.addEventListener('click',async()=>{
      if (!userId) return;
      const button=$('aeNotificationsReadAll');
      button.disabled=true;
      try {
        await markAllRead();
        await refresh();
      } catch (_) {
        $('aeNotificationsStatus').textContent = 'No pudimos marcar las notificaciones. Inténtalo de nuevo.';
      } finally { button.disabled=false; }
    });
    if (typeof db !== 'undefined' && db) {
      db.auth.onAuthStateChange(()=>setTimeout(()=>void syncAccount(),40));
      void syncAccount();
    }
    // Reconnects and old tabs still receive alerts if Realtime is interrupted.
    setInterval(()=>{if (!document.hidden) void syncAccount().then(()=>refresh());},30000);
    document.addEventListener('visibilitychange',()=>{if (!document.hidden)void syncAccount().then(()=>refresh());});
    window.addEventListener('focus',()=>{void syncAccount().then(()=>refresh());});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
