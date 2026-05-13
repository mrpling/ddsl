const textarea = document.getElementById('expression');
const checkBtn = document.getElementById('check-btn');
const expandBtn = document.getElementById('expand-btn');
const copyBtn = document.getElementById('copy-btn');
const countEl = document.getElementById('count');
const resultsEl = document.getElementById('results');
const errorEl = document.getElementById('error');
const lineStatusEl = document.getElementById('line-status');
const limitInput = document.getElementById('limit-input');
const sampleToggle = document.getElementById('sample-toggle');
const seedInput = document.getElementById('seed-input');
const seedGroup = document.getElementById('seed-group');
const paginationEl = document.getElementById('pagination');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

const MAX_EXPANSION = 1_000_000;

let currentOffset = 0;
let currentParsed = null;

function getLimit() {
  return Math.max(1, parseInt(limitInput.value, 10) || 50);
}

function getSeed() {
  return sampleToggle.checked ? (parseInt(seedInput.value, 10) || 0) : undefined;
}

function updateSeedState() {
  const on = sampleToggle.checked;
  seedInput.disabled = !on;
  seedGroup.classList.toggle('muted', !on);
}

sampleToggle.addEventListener('change', updateSeedState);
updateSeedState();

function hidePagination() {
  paginationEl.hidden = true;
}

function updatePagination(truncated) {
  if (!truncated && currentOffset === 0) {
    hidePagination();
    return;
  }
  paginationEl.hidden = false;
  prevBtn.disabled = currentOffset === 0;
  nextBtn.disabled = !truncated;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  resultsEl.value = '';
  countEl.textContent = 'Error';
  countEl.classList.remove('has-results');
  copyBtn.hidden = true;
  lineStatusEl.textContent = '';
  hidePagination();
}

function clearError() {
  errorEl.hidden = true;
}

function displayResults(domains, total, cap = null, seed = undefined, offset = 0) {
  clearError();
  resultsEl.value = domains.join('\n');

  let countText = `Expands to ${total.toLocaleString()} domain${total === 1 ? '' : 's'}`;
  if (cap !== null && domains.length < total) {
    if (seed !== undefined) {
      countText += `, sampled ${cap.toLocaleString()} (seed ${seed})`;
    } else if (offset > 0) {
      countText += `, showing ${(offset + 1).toLocaleString()}–${(offset + domains.length).toLocaleString()}`;
    } else {
      countText += `, showing first ${cap.toLocaleString()}`;
    }
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
    const { lines, lineNumbers } = DDSL.prepareDocument(raw);
    const doc = DDSL.parseDocument(lines, lineNumbers);
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
  hidePagination();
}

function runCheck() {
  if (!currentParsed) return;
  const { mode, doc, ast } = currentParsed;
  const limit = getLimit();
  const seed = getSeed();
  const previewOpts = { offset: currentOffset };
  if (seed !== undefined) previewOpts.seed = seed;

  try {
    const result = mode === 'document'
      ? DDSL.previewDocument(doc, limit, previewOpts)
      : DDSL.preview(ast, limit, previewOpts);

    displayResults(result.domains, result.total, limit, result.seed, currentOffset);
    updatePagination(result.truncated);
  } catch (err) {
    showError(err.message);
  }
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
    hidePagination();
    currentParsed = null;
    return;
  }

  try {
    currentParsed = getExpansionSize(raw);
    currentOffset = 0;

    if (currentParsed.size > MAX_EXPANSION) {
      showLargeSizeWarning(currentParsed.size);
      currentParsed = null;
      return;
    }

    runCheck();
  } catch (err) {
    showError(err.message);
    currentParsed = null;
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
    hidePagination();
    currentParsed = null;
    return;
  }

  try {
    const parsed = getExpansionSize(raw);

    if (!bypassLimit && parsed.size > MAX_EXPANSION) {
      const confirmed = confirm(
        `This expression would expand to ${parsed.size.toLocaleString()} domains, ` +
        `which exceeds the limit of ${MAX_EXPANSION.toLocaleString()}.\n\n` +
        `This may cause your browser to become unresponsive.\n\n` +
        `Continue anyway?`
      );
      if (!confirmed) {
        showLargeSizeWarning(parsed.size);
        return;
      }
    }

    const domains = parsed.mode === 'document'
      ? DDSL.expandDocument(parsed.doc, { maxExpansion: Infinity })
      : DDSL.expand(parsed.ast, { maxExpansion: Infinity });

    displayResults(domains, domains.length, null);
    hidePagination();
  } catch (err) {
    showError(err.message);
  }
}

prevBtn.addEventListener('click', () => {
  currentOffset = Math.max(0, currentOffset - getLimit());
  runCheck();
});

nextBtn.addEventListener('click', () => {
  currentOffset += getLimit();
  runCheck();
});

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
