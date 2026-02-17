const textarea = document.getElementById('expression');
const checkBtn = document.getElementById('check-btn');
const expandBtn = document.getElementById('expand-btn');
const copyBtn = document.getElementById('copy-btn');
const countEl = document.getElementById('count');
const resultsEl = document.getElementById('results');
const errorEl = document.getElementById('error');
const lineStatusEl = document.getElementById('line-status');

const PREVIEW_LIMIT = 100;
const MAX_EXPANSION = 1_000_000;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultsEl.value = '';
  countEl.textContent = 'Error';
  countEl.classList.remove('has-results');
  copyBtn.hidden = true;
  lineStatusEl.textContent = '';
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

// Detect if input is document mode (has variables, comments, or multiple expressions)
function isDocumentMode(input) {
  const lines = input.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 1) return true;
  if (input.includes('#')) return true;
  if (input.includes('@') && input.includes('=')) return true;
  return false;
}

function getExpansionSize(raw) {
  if (isDocumentMode(raw)) {
    const lines = DDSL.prepareDocument(raw);
    const doc = DDSL.parseDocument(lines);
    return { size: DDSL.documentExpansionSize(doc), mode: 'document', doc };
  } else {
    const expression = DDSL.prepare(raw);
    const ast = DDSL.parse(expression);
    return { size: DDSL.expansionSize(ast), mode: 'expression', ast };
  }
}

function showLargeSizeWarning(size) {
  clearError();
  resultsEl.value = '';
  countEl.textContent = `Would expand to ${size.toLocaleString()} domains (exceeds 1M limit)`;
  countEl.classList.add('has-results');
  copyBtn.hidden = true;
  lineStatusEl.textContent = '';
}

function check() {
  const raw = textarea.value.trim();
  if (!raw) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    lineStatusEl.textContent = '';
    clearError();
    return;
  }

  try {
    const { size, mode, doc, ast } = getExpansionSize(raw);

    // Check if expansion is too large
    if (size > MAX_EXPANSION) {
      showLargeSizeWarning(size);
      return;
    }

    if (mode === 'document') {
      const result = DDSL.previewDocument(doc, PREVIEW_LIMIT);
      displayResults(result.domains, result.total, result.truncated ? PREVIEW_LIMIT : null);
    } else {
      const result = DDSL.preview(ast, PREVIEW_LIMIT);
      displayResults(result.domains, result.total, result.truncated ? PREVIEW_LIMIT : null);
    }
  } catch (err) {
    showError(err.message);
  }
}

function expandAll(bypassLimit = false) {
  const raw = textarea.value.trim();
  if (!raw) {
    countEl.textContent = 'Enter an expression to expand';
    countEl.classList.remove('has-results');
    resultsEl.value = '';
    copyBtn.hidden = true;
    lineStatusEl.textContent = '';
    clearError();
    return;
  }

  try {
    const { size, mode, doc, ast } = getExpansionSize(raw);

    // Check if expansion is too large and user hasn't confirmed
    if (!bypassLimit && size > MAX_EXPANSION) {
      const confirmed = confirm(
        `This expression would expand to ${size.toLocaleString()} domains, ` +
        `which exceeds the limit of ${MAX_EXPANSION.toLocaleString()}.\n\n` +
        `This may cause your browser to become unresponsive.\n\n` +
        `Continue anyway?`
      );
      if (!confirmed) {
        showLargeSizeWarning(size);
        return;
      }
    }

    if (mode === 'document') {
      const domains = DDSL.expandDocument(doc, { maxExpansion: Infinity });
      displayResults(domains, domains.length, null);
    } else {
      const domains = DDSL.expand(ast, { maxExpansion: Infinity });
      displayResults(domains, domains.length, null);
    }
  } catch (err) {
    showError(err.message);
  }
}

async function copyToClipboard() {
  const text = resultsEl.value;
  if (!text) return;

  const selStart = resultsEl.selectionStart;
  const selEnd = resultsEl.selectionEnd;
  const textToCopy = (selStart !== selEnd)
    ? text.substring(selStart, selEnd)
    : text;

  try {
    await navigator.clipboard.writeText(textToCopy);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
      updateCopyButton();
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

function updateLineStatus() {
  const text = resultsEl.value;
  if (!text) {
    lineStatusEl.textContent = '';
    updateCopyButton();
    return;
  }

  const selStart = resultsEl.selectionStart;
  const selEnd = resultsEl.selectionEnd;
  const textBeforeCursor = text.substring(0, selStart);
  const currentLine = textBeforeCursor.split('\n').length;
  const totalLines = text.split('\n').length;

  if (selStart !== selEnd) {
    // Text is selected
    const selectedText = text.substring(selStart, selEnd);
    const selectedLines = selectedText.split('\n').length;
    lineStatusEl.textContent = `${selectedLines} line${selectedLines === 1 ? '' : 's'} selected (Line ${currentLine} of ${totalLines})`;
  } else {
    lineStatusEl.textContent = `Line ${currentLine} of ${totalLines}`;
  }

  updateCopyButton();
}

function updateCopyButton() {
  const text = resultsEl.value;
  if (!text) {
    copyBtn.hidden = true;
    return;
  }

  copyBtn.hidden = false;
  const selStart = resultsEl.selectionStart;
  const selEnd = resultsEl.selectionEnd;

  if (selStart !== selEnd) {
    const selectedText = text.substring(selStart, selEnd);
    const selectedLines = selectedText.split('\n').length;
    copyBtn.textContent = `Copy Selection (${selectedLines})`;
  } else {
    copyBtn.textContent = 'Copy All';
  }
}

checkBtn.addEventListener('click', check);
expandBtn.addEventListener('click', () => expandAll());
copyBtn.addEventListener('click', copyToClipboard);
resultsEl.addEventListener('click', updateLineStatus);
resultsEl.addEventListener('keyup', updateLineStatus);
resultsEl.addEventListener('focus', updateLineStatus);
resultsEl.addEventListener('select', updateLineStatus);
resultsEl.addEventListener('input', updateLineStatus);
resultsEl.addEventListener('mouseup', updateLineStatus);

// Allow Ctrl+Enter to expand
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    expandAll();
  }
});
