/* AE SPORTS · Cambiar SOLO la comunidad de un Take propio: NFL ↔ Fútbol.
 * La base de datos verifica la autoría y conserva el contenido, votos y respuestas. */
(() => {
  'use strict';
  let opening = false;
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const name = sport => sport === 'nfl' ? 'NFL' : 'Fútbol';
  const allowed = sport => sport === 'nfl' || sport === 'football'
    || ['laliga','premier','ligamx','champions'].includes(sport);

  async function open(take, afterSave) {
    if (opening || !take || !take.id || !allowed(take.sport)) return;
    opening = true;
    try {
      if (typeof db === 'undefined' || !db) throw new Error('No hay conexión.');
      const response = await db.auth.getUser();
      if (response.error) throw response.error;
      const viewer = response.data?.user;
      if (!viewer) {
        if (typeof openUserAuthModal === 'function') openUserAuthModal();
        return;
      }
      if (!take.author_id || viewer.id !== take.author_id) {
        throw new Error('Solo puedes cambiar de comunidad tus propios Takes.');
      }

      // Un único editor modal activo. No editamos el título, el cuerpo ni los votos.
      document.getElementById('aeTakeCategoryDialog')?.close();
      const dialog = make('dialog', null, 'ae-take-category-dialog');
      dialog.id = 'aeTakeCategoryDialog';
      dialog.setAttribute('aria-labelledby','aeTakeCategoryTitle');
      dialog.setAttribute('aria-describedby','aeTakeCategoryHelp');
      const header = make('div', null, 'ae-take-category-header');
      header.append(make('span','AE SPORTS · MIS TAKES','ae-take-category-kicker'));
      header.append(make('h2','Cambiar comunidad'));
      header.querySelector('h2').id = 'aeTakeCategoryTitle';
      const description = make('p','Solo puedes mover este Take entre NFL y Fútbol. El título, el contenido, los votos y los comentarios no se modificarán.');
      description.id = 'aeTakeCategoryHelp';
      const subject = make('strong',take.title || 'Tu Take','ae-take-category-subject');
      const form = make('form', null, 'ae-take-category-form');
      const choices = make('fieldset', null, 'ae-take-category-choices');
      choices.append(make('legend','¿En qué comunidad debe aparecer?'));
      const initialSport = take.sport === 'nfl' ? 'nfl' : 'football';
      const radios = [];
      for (const [value,label] of [['nfl','NFL'],['football','Fútbol']]) {
        const option = make('label',null,'ae-take-category-choice');
        const input = make('input');
        input.type='radio';input.name='destination';input.value=value;
        input.checked=value===initialSport;
        const text = make('span',label);
        option.append(input,text);
        choices.append(option);
        radios.push(input);
      }
      const status = make('p','', 'ae-take-category-status');
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      const actions = make('div',null,'ae-take-category-actions');
      const cancel = make('button','Cancelar','ae-take-category-cancel');
      cancel.type='button';
      const save = make('button','Guardar cambio','ae-take-category-save');
      save.type='submit';
      save.disabled = initialSport === 'nfl';
      actions.append(cancel,save);
      form.append(choices,status,actions);
      dialog.append(header,description,subject,form);
      const updateSave = () => {
        const selected = radios.find(r => r.checked)?.value;
        save.disabled = selected === initialSport;
        status.textContent='';
      };
      radios.forEach(r=>r.addEventListener('change',updateSave));
      // Si el Take ya era de fútbol (o una categoría anterior de Fútbol),
      // también permitimos cambiarlo a NFL; guardar se activa al variar.
      save.disabled=true;
      cancel.addEventListener('click',()=>dialog.close());
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        const destination=radios.find(r=>r.checked)?.value;
        if (!destination || destination===initialSport) return;
        save.disabled=true;cancel.disabled=true;
        radios.forEach(r=>r.disabled=true);
        status.textContent='Cambiando comunidad…';
        try {
          const result = await db.rpc('ae_change_take_sport',{
            p_take_id:take.id,
            p_sport:destination
          });
          if (result.error) throw result.error;
          if (result.data !== destination) throw new Error('No se confirmó el cambio.');
          take.sport=destination;
          if(typeof afterSave === 'function') afterSave(destination);
          dialog.close();
          window.dispatchEvent(new CustomEvent('ae:take-category-changed',{
            detail:{id:take.id,sport:destination}
          }));
          document.dispatchEvent(new Event('ae:takes-updated'));
        } catch(error) {
          status.textContent='No se pudo cambiar la comunidad. '+(error.message||'Inténtalo de nuevo.');
          cancel.disabled=false;
          radios.forEach(r=>r.disabled=false);
          updateSave();
          status.textContent='No se pudo cambiar la comunidad. '+(error.message||'Inténtalo de nuevo.');
        }
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      radios.find(r=>r.checked)?.focus();
    } catch(error) {
      const feedback = document.getElementById('aeDiscussionStatus') || document.getElementById('aeProfileStatus');
      if (feedback) feedback.textContent = error.message || 'No se pudo abrir el editor.';
    } finally {
      opening=false;
    }
  }
  window.aeTakeCategoryEdit={open};
})();