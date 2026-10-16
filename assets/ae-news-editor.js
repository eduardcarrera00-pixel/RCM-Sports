/* Visual news editor. The textarea remains as a fallback if JavaScript fails. */
(() => {
  'use strict';
  const source = document.getElementById('pubBody');
  if (!source) return;
  const wrap = document.createElement('div');
  wrap.className = 'ae-news-editor';
  const toolbar = document.createElement('div');
  toolbar.className = 'ae-editor-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Formato del artículo');
  const editor = document.createElement('div');
  editor.id = 'aeNewsEditor';
  editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox');
  editor.setAttribute('aria-multiline', 'true');
  editor.setAttribute('aria-label', 'Contenido completo del artículo');
  editor.setAttribute('aria-describedby', 'aeEditorHelp aeEditorCount');
  editor.setAttribute('spellcheck', 'true');
  editor.lang = 'es';
  const help = document.createElement('p');
  help.id = 'aeEditorHelp';
  help.textContent = 'Escribe tu noticia y selecciona el texto para darle formato. Puedes pegar texto desde Word o Docs.';
  const count = document.createElement('p');
  count.id = 'aeEditorCount';
  let dirty = false;
  let savedSelection = null;
  function text() { return (editor.innerText || editor.textContent || '').replace(/\u200b/g, '').trim(); }
  function sync() {
    source.value = text();
    const words = source.value ? source.value.split(/\s+/).length : 0;
    count.textContent = words + (words === 1 ? ' palabra' : ' palabras') + ' · ' + Math.max(1, Math.ceil(words / 220)) + ' min de lectura';
  }
  function set(html) {
    editor.innerHTML = typeof cleanBody === 'function' ? cleanBody(html) : '';
    dirty = false;
    savedSelection = null;
    sync();
  }
  function remember() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) savedSelection = selection.getRangeAt(0).cloneRange();
  }
  function restore() {
    editor.focus();
    const selection = window.getSelection();
    if (savedSelection && editor.contains(savedSelection.commonAncestorContainer)) {
      selection.removeAllRanges(); selection.addRange(savedSelection);
    }
  }
  const commands = [
    ['Negrita', 'bold'], ['Cursiva', 'italic'], ['Título', 'formatBlock', 'h2'],
    ['Subtítulo', 'formatBlock', 'h3'], ['Párrafo', 'formatBlock', 'p'],
    ['Lista', 'insertUnorderedList'], ['Lista numerada', 'insertOrderedList'],
    ['Cita', 'formatBlock', 'blockquote'], ['Quitar formato', 'removeFormat'],
    ['Deshacer', 'undo'], ['Rehacer', 'redo']
  ];
  for (const [label, command, value] of commands) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => {
      restore(); document.execCommand(command, false, value || null);
      dirty = true; sync(); remember();
    });
    toolbar.append(button);
  }
  editor.addEventListener('input', () => { dirty = true; sync(); });
  editor.addEventListener('focus', () => document.execCommand?.('defaultParagraphSeparator', false, 'p'));
  document.addEventListener('selectionchange', remember);
  editor.addEventListener('paste', event => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    // Keep formatting but discard scripts, tracking attributes and pasted images.
    const raw = clipboard.getData('text/html');
    if (raw && window.DOMPurify) {
      const safe = DOMPurify.sanitize(raw, {ALLOWED_TAGS:['p','br','strong','em','b','i','h2','h3','ul','ol','li','blockquote'], ALLOWED_ATTR:[]});
      document.execCommand('insertHTML', false, safe);
    } else document.execCommand('insertText', false, clipboard.getData('text/plain'));
    dirty = true; sync(); remember();
  });
  wrap.append(toolbar, editor, help, count);
  source.after(wrap);
  source.hidden = true; source.required = false;
  const label = source.previousElementSibling;
  if (label?.tagName === 'LABEL') {
    label.id ||= 'aeNewsEditorLabel';
    editor.setAttribute('aria-labelledby', label.id);
  }
  for (const item of document.querySelectorAll('#publishModal label')) {
    const control = item.nextElementSibling;
    if (!item.htmlFor && control?.matches('input[id],textarea[id],select[id]')) item.htmlFor = control.id;
  }
  source.form?.addEventListener('reset', () => set(''));
  window.aeNewsEditor = {
    set, isDirty: () => dirty,
    html: () => {
      if (!text()) return '';
      const copy = editor.cloneNode(true);
      for (const div of copy.querySelectorAll('div')) {
        const paragraph = document.createElement('p');
        paragraph.append(...div.childNodes); div.replaceWith(paragraph);
      }
      return cleanBody(copy.innerHTML);
    },
    focus: () => editor.focus()
  };
  set('');
})();
