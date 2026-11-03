// Syntax highlighting for the source and minified editors. A textarea can't
// colour its text, so each one gets a <pre> behind it with the same font,
// padding and wrapping, filled with highlighted HTML; the textarea's own text
// is transparent (the caret and selection still show). Editing, undo and
// everything app.js does with editor.value are untouched.
//
// The highlighter is the review app's (forge_admin js/codeView.js); keep the
// two alike. Loaded before app.js, which sets editor.value directly, so the
// value setter is wrapped to re-highlight on every programmatic change too.

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Comments, strings, numbers, keywords, and the Forge API (Ollee, E_*, B_*).
// Regex literals aren't recognised; good enough to read a script by.
const JS_TOKEN = new RegExp([
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))/.source,
  /('(?:\\[\s\S]|[^'\\\n])*'?|"(?:\\[\s\S]|[^"\\\n])*"?|`(?:\\[\s\S]|[^`\\])*`?)/.source,
  /(\b0[xX][\da-fA-F]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/.source,
  /\b(break|case|catch|class|const|continue|default|delete|do|else|false|finally|for|function|if|in|instanceof|let|new|null|of|return|switch|this|throw|true|try|typeof|undefined|var|void|while)\b/.source,
  /\b(Ollee|E_[A-Z_]+|B_[AL])\b/.source,
].join('|'), 'g');
const TOKEN_CLASSES = ['com', 'str', 'num', 'kw', 'api'];

function highlightJs(code) {
  let html = '';
  let last = 0;
  for (const m of code.matchAll(JS_TOKEN)) {
    if (!m[0]) continue;
    html += escapeHtml(code.slice(last, m.index));
    html += `<span class="tok-${TOKEN_CLASSES[m.slice(1).findIndex((g) => g !== undefined)]}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return html + escapeHtml(code.slice(last));
}

function attachHighlight(ta) {
  const wrap = document.createElement('div');
  wrap.className = 'code-editor';
  const pre = document.createElement('pre');
  pre.className = 'code-editor-highlight';
  pre.setAttribute('aria-hidden', 'true');
  ta.before(wrap);
  wrap.append(pre, ta);

  let queued = false;
  const sync = () => {
    queued = false;
    // A trailing newline needs something after it, or the last line has no height
    pre.innerHTML = `${highlightJs(ta.value)}\n `;
    syncLayout();
  };
  const queue = () => {
    if (!queued) { queued = true; requestAnimationFrame(sync); }
  };
  // The textarea's scrollbar narrows its text; match it so lines wrap alike
  const syncLayout = () => {
    const style = getComputedStyle(ta);
    const scrollbar = ta.offsetWidth - ta.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    pre.style.paddingRight = `${parseFloat(style.paddingRight) + scrollbar}px`;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  Object.defineProperty(ta, 'value', {
    configurable: true,
    get() { return proto.get.call(this); },
    set(v) { proto.set.call(this, v); queue(); },
  });
  const setRangeText = ta.setRangeText;
  ta.setRangeText = function (...args) { setRangeText.apply(this, args); queue(); };

  ta.addEventListener('input', queue);
  ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
  // Resizing the textarea (its drag handle, or the window) changes wrapping
  new ResizeObserver(queue).observe(ta);
  sync();
}

attachHighlight(document.getElementById('editor'));
attachHighlight(document.getElementById('editor-minified'));
