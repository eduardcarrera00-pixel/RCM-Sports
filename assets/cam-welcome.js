/* CAM SPORTS · One-time welcome, five minutes after the first registration. */
(() => {
  'use strict';
  const KEY = 'cam_sports_first_registration_welcome';
  const $ = id => document.getElementById(id);
  let timer = null;
  let checking = false;
  let firstAccount = null;

  function readFirstAccount() {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  }
  function clearFirstAccount() {
    firstAccount = null;
    clearTimeout(timer);
    timer = null;
    try { sessionStorage.removeItem(KEY); } catch {}
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => void check(), Math.max(100, Math.min(ms, 2147483647)));
  }
  function show(preview = false) {
    const modal = $('camWelcomeDialog');
    if (!modal) return false;
    $('camWelcomePreviewLabel').hidden = !preview;
    if (!modal.open) modal.showModal();
    return true;
  }
  function canOpenAutomatically() {
    if (document.hidden || $('camWelcomeDialog')?.open) return false;
    if (document.querySelector('dialog[open]')) return false;
    if ($('userAuthModal') && !$('userAuthModal').classList.contains('hidden')) return false;
    return true;
  }
  async function check() {
    const id = firstAccount || readFirstAccount();
    if (!id || checking || typeof db === 'undefined' || !db) return;
    checking = true;
    try {
      const {data:account, error:accountError} = await db.auth.getUser();
      if (accountError) { schedule(10000); return; }
      if (!account?.user || account.user.is_anonymous || account.user.id !== id) {
        clearFirstAccount();
        return;
      }
      if (document.hidden) return; // Resumes on focus or when the tab becomes visible.
      const {data:welcome, error} = await db.from('ae_notifications')
        .select('id,created_at,read_at')
        .eq('recipient_id',id).eq('event_key','welcome').maybeSingle();
      if (error || !welcome) { schedule(10000); return; }
      if (welcome.read_at) { clearFirstAccount(); return; }
      const remaining = new Date(welcome.created_at).getTime() - Date.now();
      if (remaining > 0) { schedule(remaining + 100); return; }
      if (!canOpenAutomatically()) { schedule(2000); return; }
      // Conditional UPDATE atomically claims the welcome across tabs and devices.
      const claim = await db.from('ae_notifications')
        .update({read_at:new Date().toISOString()})
        .eq('id',welcome.id).eq('recipient_id',id).eq('event_key','welcome')
        .is('read_at',null).lte('created_at',new Date().toISOString())
        .select('id');
      if (claim.error) { schedule(10000); return; }
      clearFirstAccount();
      if (claim.data?.length) {
        show(false);
        window.dispatchEvent(new CustomEvent('cam-welcome-claimed'));
      }
    } catch (_) {
      schedule(10000);
    } finally {
      checking = false;
    }
  }
  function startNewAccount(id) {
    if (!id) return;
    firstAccount = id;
    try { sessionStorage.setItem(KEY,id); } catch {}
    schedule(150);
  }
  function showFromInbox() {
    clearFirstAccount();
    return show(false);
  }
  function init() {
    firstAccount = readFirstAccount();
    $('camWelcomeClose')?.addEventListener('click',()=>$('camWelcomeDialog')?.close());
    $('camWelcomeExplore')?.addEventListener('click',()=>$('camWelcomeDialog')?.close());
    $('camWelcomeDialog')?.addEventListener('click',e=>{
      if(e.target === $('camWelcomeDialog')) $('camWelcomeDialog').close();
    });
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden && (firstAccount || readFirstAccount()))void check();
    });
    window.addEventListener('focus',()=>{
      if(firstAccount || readFirstAccount())void check();
    });
    if(firstAccount) schedule(300);
    // A manual sign-out cancels only the automatic first-session popup.
    // A later login never initiates a new automatic welcome.
    if(typeof db !== 'undefined' && db?.auth?.onAuthStateChange) {
      db.auth.onAuthStateChange(event=>{
        if(event === 'SIGNED_OUT') clearFirstAccount();
      });
    }
  }
  window.camWelcome = {startNewAccount,showFromInbox,showPreview:()=>show(true)};
  if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();