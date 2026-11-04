/** Whitespace-only CSS compression. Keep strings, selectors and values intact. */
export function minifyCss(input) {
  const chunks = [];
  let previous = '';
  let pendingSpace = false;
  let i = 0;
  const push = chunk => {
    if (pendingSpace) {
      if (previous && !'{};'.includes(previous) && !'{};'.includes(chunk[0])) chunks.push(' ');
      pendingSpace = false;
    }
    chunks.push(chunk);
    previous = chunk[chunk.length - 1];
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      i = end === -1 ? input.length : end + 2;
      pendingSpace = true;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < input.length && input[j] !== ch) j += input[j] === '\\' ? 2 : 1;
      push(input.slice(i, j + 1));
      i = j + 1;
    } else if (/\s/.test(ch)) {
      while (i < input.length && /\s/.test(input[i])) i++;
      pendingSpace = true;
    } else if ('{};'.includes(ch)) {
      pendingSpace = false;
      if (ch === '}' && previous === ';') chunks.pop();
      chunks.push(ch);
      previous = ch;
      i++;
    } else {
      push(ch);
      i++;
    }
  }
  return chunks.join('').trim() + '\n';
}
