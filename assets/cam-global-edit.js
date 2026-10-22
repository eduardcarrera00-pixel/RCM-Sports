/* CAM SPORTS · Edición global: interruptor visual para editores verificados.
 * El estado nunca se guarda en el navegador: cada sesión comienza apagada.
 * Los RPC de subida/restauración conservan su autorización de Supabase.
 */
(() => {
  'use strict';
  if (window.camGlobalEditMode) return;

  let active = false;
  let verifiedUserId = null;
  let pending = false;

  const button = () => document.getElementById('camGlobalEditToggle');
  const editor = () => {
    try {
      return typeof currentAdmin !== 'undefined' && currentAdmin &&
        typeof currentAdmin.id === 'string' ? currentAdmin : null;
    } catch { return null; }
  };
  const client = () => {
    try { return typeof db !== 'undefined' ? db : null; }
    catch { return null; }
  };
  const isActive = () => Boolean(active && verifiedUserId && editor()?.id === verifiedUserId);

  function paint() {
    const permitted = Boolean(editor());
    const enabled = isActive();
    const control = button();
    if (control) {
      control.hidden = !permitted;
      control.disabled = pending;
      control.setAttribute('aria-pressed', String(enabled));
      control.setAttribute('aria-label', enabled ? 'Desactivar modo edición' : 'Activar modo edición');
      control.title = enabled ? 'Desactivar modo edición' : 'Activar modo edición';
      control.classList.toggle('is-active', enabled);
    }
    document.documentElement.classList.toggle('cam-global-edit-active', enabled);
    window.camSiteImages?.refresh();
    window.camSiteTexts?.refresh();
  }

  function deactivate() {
    active = false;
    verifiedUserId = null;
    paint();
  }

  function sync() {
    if (!editor() || (verifiedUserId && editor().id !== verifiedUserId)) {
      active = false;
      verifiedUserId = null;
    }
    paint();
  }

  async function toggle() {
    if (pending) return;
    const authorizedEditor = editor();
    if (!authorizedEditor) { deactivate(); return; }
    if (isActive()) { deactivate(); return; }

    const sb = client();
    if (!sb?.auth?.getUser || !sb?.from) { deactivate(); return; }
    pending = true;
    paint();
    try {
      // No confíes en clases CSS, localStorage ni un currentAdmin forzado:
      // confirma la sesión y la pertenencia real a la tabla editors en Supabase.
      const { data: session, error: authError } = await sb.auth.getUser();
      if (authError || !session?.user?.id || session.user.id !== authorizedEditor.id) {
        throw new Error('Sesión de editor no válida');
      }
      const { data: permission, error: roleError } = await sb.from('editors')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (roleError || permission?.user_id !== session.user.id ||
        editor()?.id !== session.user.id) {
        throw new Error('No tienes permisos de edición');
      }
      verifiedUserId = session.user.id;
      active = true;
    } catch {
      active = false;
      verifiedUserId = null;
    } finally {
      pending = false;
      paint();
    }
  }

  function init() {
    const control = button();
    if (control) control.addEventListener('click', toggle);
    sync();
    // No revivir el modo al cerrar sesión ni al iniciar otra cuenta.
    const sb = client();
    sb?.auth?.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED' ||
          (event === 'SIGNED_IN' && verifiedUserId && session?.user?.id !== verifiedUserId)) {
        deactivate();
      }
    });
    // Si se revoca el permiso mientras la pestaña sigue abierta, apagar
    // los controles al volver. Los RPC de guardado verifican el rol igualmente.
    const revalidate = async () => {
      if (!isActive() || pending || document.hidden) return;
      const id = verifiedUserId, api = client();
      try {
        const { data: session, error: sessionError } = await api.auth.getUser();
        if (sessionError || session?.user?.id !== id) { deactivate(); return; }
        const { data: permission, error: roleError } = await api.from('editors')
          .select('user_id').eq('user_id', id).maybeSingle();
        if (roleError || permission?.user_id !== id) deactivate();
      } catch { deactivate(); }
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
  }

  window.camGlobalEditMode = Object.freeze({ isActive, sync, toggle, deactivate });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
