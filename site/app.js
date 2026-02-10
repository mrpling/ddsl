const textarea = document.getElementById('expression');
const checkBtn = document.getElementById('check-btn');
const expandBtn = document.getElementById('expand-btn');
const copyBtn = document.getElementById('copy-btn');
const countEl = document.getElementById('count');
const resultsEl = document.getElementById('results');
const errorEl = document.getElementById('error');

const PREVIEW_LIMIT = 10;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultsEl.value = '';
  countEl.textContent = 'Error';
  countEl.classList.remove('has-results');
  copyBtn.hidden = true;
}

function clearError() {
  errorEl.hidden = true;
}

function displayResults(domains, total, cap = null) {
  clearError();
  resultsEl.value = domains.join('\n');

  let countText = `Expands to ${total.toLocaleString()} domain${total === 1 ? '' : 's'}`;
  if (cap !== null && domains.length < total) {
    countText += `, showing first ${cap.toLocaleString()}`;
  }

  countEl.textContent = countText;
  countEl.classList.add('has-results');
  copyBtn.hidden = domains.length === 0;
}

function check() {
  const raw = textarea.value.trim();
  if (!raw) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    clearError();
    return;
  }

  try {
    // Preprocess input (strip whitespace) before parsing
    const expression = DDSL.prepare(raw);
    const ast = DDSL.parse(expression);
    // Use preview() which never throws on large expressions
    const result = DDSL.preview(ast, PREVIEW_LIMIT);
    displayResults(result.domains, result.total, result.truncated ? PREVIEW_LIMIT : null);
  } catch (err) {
    showError(err.message);
  }
}

function expandAll() {
  const raw = textarea.value.trim();
  if (!raw) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    clearError();
    return;
  }

  try {
    // Preprocess input (strip whitespace) before parsing
    const expression = DDSL.prepare(raw);
    const ast = DDSL.parse(expression);
    // expand() throws ExpansionError if too large
    const domains = DDSL.expand(ast);
    displayResults(domains, domains.length, null);
  } catch (err) {
    showError(err.message);
  }
}

async function copyToClipboard() {
  const text = resultsEl.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

checkBtn.addEventListener('click', check);
expandBtn.addEventListener('click', expandAll);
copyBtn.addEventListener('click', copyToClipboard);

// Allow Ctrl+Enter to expand
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    expandAll();
  }
});
