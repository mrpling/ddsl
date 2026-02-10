const textarea = document.getElementById('expression');
const checkBtn = document.getElementById('check-btn');
const expandBtn = document.getElementById('expand-btn');
const copyBtn = document.getElementById('copy-btn');
const countEl = document.getElementById('count');
const resultsEl = document.getElementById('results');
const errorEl = document.getElementById('error');

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
    countText += `, capped at ${cap.toLocaleString()}`;
  }

  countEl.textContent = countText;
  countEl.classList.add('has-results');
  copyBtn.hidden = domains.length === 0;
}

function check() {
  const expression = textarea.value.trim();
  if (!expression) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    clearError();
    return;
  }

  try {
    const ast = DDSL.parse(expression);
    const total = DDSL.expansionSize(ast);
    const preview = DDSL.expand(ast, { maxExpansion: 10 });
    displayResults(preview, total, 10);
  } catch (err) {
    showError(err.message);
  }
}

const DEFAULT_MAX_EXPANSION = 100_000;

function expandAll() {
  const expression = textarea.value.trim();
  if (!expression) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    clearError();
    return;
  }

  try {
    const ast = DDSL.parse(expression);
    const total = DDSL.expansionSize(ast);
    const domains = DDSL.expand(ast);
    const wasCapped = total > DEFAULT_MAX_EXPANSION;
    displayResults(domains, total, wasCapped ? DEFAULT_MAX_EXPANSION : null);
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
