/* CAM SPORTS · Private in-app alerts, including a one-time new-member welcome. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let userId = null;
  let alerts = [];
  let loadToken = 0;
  let realtime = null;
  let authCheck = 0;
  const create = (tag, value, className) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = String(value);
    if (className) element.className = className;
    return element;
  };
  const dialog = () => $('aeNotificationsDialog');

  function reset() {
    alerts = [];
    $('aeNotificationsButton').hidden = true;
    $('aeNotificationsBadge').hidden = true;
    $('aeNotificationsBadge').textContent = '';
    $('aeNotificationsButton').setAttribute('aria-expanded', 'false');
    $('aeNotificationsButton').setAttribute('aria-label', 'Notificaciones');
    if (dialog()?.open) dialog().close();
    $('aeNotificationsList').replaceChildren();
    if ($('camWelcomeAdminPreview')) $('camWelcomeAdminPreview').hidden = true;
  }

  function label(notification) {
    if (notification.event_key === 'welcome') return '¡Bienvenido a CAM SPORTS!';
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
    const badge = $('aeNotificationsBadge');
    badge.hidden = total === 0;
    badge.textContent = total === 0 ? '' : total > 99 ? '99+' : String(total);
    $('aeNotificationsButton').setAttribute('aria-label',
      total === 0 ? 'Notificaciones, ninguna sin leer'
        : total === 1 ? 'Notificaciones, 1 sin leer'
          : 'Notificaciones, ' + total + ' sin leer');
    const panel = $('aeNotificationsList');
    if (!panel || !dialog()?.open) return;
    // Preserve the two readers' scroll positions when Realtime refreshes alerts.
    const scrollPositions = new Map(
      [...panel.querySelectorAll('[data-ae-notification-group]')]
        .map(list=>[list.dataset.aeNotificationGroup,list.scrollTop])
    );
    panel.replaceChildren();
    const reactionTypes = new Set(['take_vote','pick_vote','comment_vote','article_like']);
    const groups = [
      {
        id:'aeNotificationsWelcomeTitle',
        title:'Bienvenida',
        subtitle:'Tu inicio en CAM SPORTS',
        items:alerts.filter(item=>item.event_key==='welcome'),
        empty:'Tu comunidad te espera.'
      },
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
        items:alerts.filter(item=>!reactionTypes.has(item.event_key) && item.event_key!=='welcome'),
        empty:'Todavía no has recibido comentarios.'
      }
    ];
    // Two independent editorial lists, with the same global unread counter.
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
        const action = create('button',null,'ae-notification-entry'+(item.read_at?'':' is-unread'));
        action.type = 'button';
        const icon = create('span',item.event_key === 'welcome' ? '✦' :
          item.event_key.includes('vote') ? (item.vote_value === -1 ? '▼' : '▲') :
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
          .eq('recipient_id',uid).lte('created_at',availableAt).order('created_at',{ascending:false}).limit(70),
        db.from('ae_notifications').select('id',{count:'exact',head:true})
          .eq('recipient_id',uid).is('read_at',null).lte('created_at',availableAt)
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
    if (item.event_key === 'welcome') {
      window.camWelcome?.showFromInbox();
      return;
    }
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
        void verifyAdminPreview(id);
      }
      void watch(id);
    } catch (_) {}
  }
  async function verifyAdminPreview(id) {
    const button = $('camWelcomeAdminPreview');
    if (!button || userId !== id) return;
    button.hidden = true;
    try {
      const permission = await db.from('editors').select('user_id').eq('user_id',id).maybeSingle();
      if (userId === id && !permission.error && permission.data) {
        button.hidden = false;
        // Give existing admins an immediate one-time look without altering their inbox.
        let previewFirstTime = false;
        try {
          const key = 'cam_sports_admin_welcome_preview_' + id;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key,'1');
            previewFirstTime = true;
          }
        } catch (_) { /* Manual preview remains available. */ }
        if (previewFirstTime) setTimeout(()=>{
          if (userId === id && !document.hidden &&
              !document.querySelector('dialog[open]') &&
              ($('userAuthModal')?.classList.contains('hidden') ?? true)) {
            window.camWelcome?.showPreview();
          }
        },1800);
      }
    } catch (_) { /* Only verified editors see the preview button. */ }
  }
  function init() {
    $('aeNotificationsButton')?.addEventListener('click',()=>{
      const panel = dialog();
      if (!panel) return;
      if (panel.open) { panel.close(); return; }
      panel.showModal();
      $('aeNotificationsButton').setAttribute('aria-expanded','true');
      paint(alerts.filter(x=>!x.read_at).length);
      void refresh();
    });
    $('aeNotificationsClose')?.addEventListener('click',()=>dialog()?.close());
    $('camWelcomeAdminPreview')?.addEventListener('click',()=>{
      if ($('camWelcomeAdminPreview').hidden) return;
      dialog()?.close();
      window.camWelcome?.showPreview();
    });
    window.addEventListener('cam-welcome-claimed',()=>void refresh());
    dialog()?.addEventListener('close',()=>{
      $('aeNotificationsButton').setAttribute('aria-expanded','false');
      $('aeNotificationsButton').focus({preventScroll:true});
    });
    dialog()?.addEventListener('click',event=>{if (event.target === dialog()) dialog().close();});
    $('aeNotificationsReadAll')?.addEventListener('click',async()=>{
      if (!userId) return;
      const button=$('aeNotificationsReadAll');
      button.disabled=true;
      try {
        const response=await db.from('ae_notifications')
          .update({read_at:new Date().toISOString()}).eq('recipient_id',userId).is('read_at',null);
        if(response.error) throw response.error;
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
