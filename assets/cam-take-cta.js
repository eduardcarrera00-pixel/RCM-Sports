/* CAM SPORTS · Toda la cabecera «Demuestra tu conocimiento» abre el compositor de Takes.
 *
 * El botón #aeSportTakePublish sigue funcionando igual (su onclick no se toca). Esto
 * sólo añade que tocar cualquier punto de la tarjeta —título, texto o fondo— haga lo
 * mismo, en NFL y en Fútbol, en teléfono y en ordenador.
 *
 * Se ignoran los clics sobre otros controles (enlaces, botones, campos) por si la
 * cabecera llega a tener alguno, y la selección de texto con el ratón no dispara nada.
 */
(() => {
  'use strict';
  if (window.camTakeCta) return;

  const HEAD = '#freeTakes > .ae-takes-head';
  const CONTROLS = 'a[href],button,input,select,textarea,label,[role="button"],[contenteditable="true"]';

  const open = () => {
    const button = document.getElementById('aeSportTakePublish');
    if (button) { button.click(); return; }            // conserva el onclick existente
    if (typeof window.aeOpenTakeComposer === 'function') window.aeOpenTakeComposer();
  };

  document.addEventListener('click', (event) => {
    const head = event.target.closest && event.target.closest(HEAD);
    if (!head) return;
    // El propio botón ya abre el diálogo: no duplicar.
    if (event.target.closest('#aeSportTakePublish')) return;
    if (event.target.closest(CONTROLS)) return;
    // Si el usuario estaba seleccionando texto, no es un clic de acción.
    const selection = window.getSelection && window.getSelection();
    if (selection && String(selection).trim() && selection.containsNode && selection.containsNode(head, true)) return;
    event.preventDefault();
    open();
  });

  window.camTakeCta = { open };
})();
