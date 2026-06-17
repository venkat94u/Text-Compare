/**
 * CompareText — Production Application
 * LCS-based diff engine with line, word, and character comparison.
 */

'use strict';

/* ==========================================================================
   Storage Module
   ========================================================================== */

const STORAGE_KEYS = {
  THEME: 'comparetext_theme',
  SETTINGS: 'comparetext_settings',
  TEXT_A: 'comparetext_text_a',
  TEXT_B: 'comparetext_text_b',
};

const Storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded — silently fail */
    }
  },

  getSettings() {
    return this.get(STORAGE_KEYS.SETTINGS) || {
      ignoreCase: false,
      ignoreSpaces: false,
      ignoreTabs: false,
      ignoreBlankLines: false,
      trimLines: false,
      ignorePunctuation: false,
      compareWhitespace: false,
      liveCompare: false,
      compareMode: 'line',
    };
  },

  saveSettings(settings) {
    this.set(STORAGE_KEYS.SETTINGS, settings);
  },

  saveTexts(textA, textB) {
    this.set(STORAGE_KEYS.TEXT_A, textA);
    this.set(STORAGE_KEYS.TEXT_B, textB);
  },
};

/* ==========================================================================
   Diff Engine — LCS & Myers Character Diff
   ========================================================================== */

/**
 * Compute Longest Common Subsequence table for two arrays.
 * Returns the LCS length table (n+1 × m+1).
 */
function buildLCSTable(a, b, equalsFn) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (equalsFn(a[i - 1], b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * Backtrack LCS table to produce diff operations.
 * Returns array of { type: 'equal'|'add'|'remove', value, indexA, indexB }
 */
function backtrackLCS(a, b, dp, equalsFn) {
  const ops = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && equalsFn(a[i - 1], b[j - 1])) {
      ops.unshift({ type: 'equal', value: a[i - 1], indexA: i - 1, indexB: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', value: b[j - 1], indexA: -1, indexB: j - 1 });
      j--;
    } else {
      ops.unshift({ type: 'remove', value: a[i - 1], indexA: i - 1, indexB: -1 });
      i--;
    }
  }
  return ops;
}

/**
 * Myers diff algorithm for character-level comparison.
 * Returns array of { type: 'equal'|'add'|'remove', chars: string }
 */
function myersDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map();
  v.set(1, 0);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        return backtrackMyers(a, b, trace, d);
      }
    }
  }
  return [{ type: 'remove', chars: a }, { type: 'add', chars: b }];
}

function backtrackMyers(a, b, trace, d) {
  const ops = [];
  let x = a.length;
  let y = b.length;

  for (let depth = d; depth >= 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    let prevK;

    if (k === -depth || (k !== depth && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.unshift({ type: 'equal', chars: a[x - 1] });
      x--;
      y--;
    }

    if (depth > 0) {
      if (x === prevX) {
        ops.unshift({ type: 'add', chars: b[y - 1] });
        y--;
      } else {
        ops.unshift({ type: 'remove', chars: a[x - 1] });
        x--;
      }
    }
  }
  return ops;
}

/**
 * Group consecutive Myers ops of same type into chunks.
 */
function groupCharOps(ops) {
  const grouped = [];
  for (const op of ops) {
    const last = grouped[grouped.length - 1];
    if (last && last.type === op.type) {
      last.chars += op.chars;
    } else {
      grouped.push({ type: op.type, chars: op.chars });
    }
  }
  return grouped;
}

/**
 * Detect moved lines: removed lines that appear as additions elsewhere.
 */
function detectMovedLines(ops) {
  const removed = ops.filter(o => o.type === 'remove').map(o => o.value);
  const added = ops.filter(o => o.type === 'add').map(o => o.value);
  const movedSet = new Set();

  const addedCounts = new Map();
  for (const line of added) {
    addedCounts.set(line, (addedCounts.get(line) || 0) + 1);
  }

  for (const line of removed) {
    const count = addedCounts.get(line);
    if (count && count > 0) {
      movedSet.add(line);
      addedCounts.set(line, count - 1);
    }
  }

  if (movedSet.size === 0) return ops;

  return ops.map(op => {
    if ((op.type === 'remove' || op.type === 'add') && movedSet.has(op.value)) {
      return { ...op, type: 'moved', movedFrom: op.type };
    }
    return op;
  });
}

/**
 * Pair adjacent remove+add ops as modified when values differ but are similar.
 */
function pairModifications(ops, equalsFn) {
  const result = [];
  let i = 0;

  while (i < ops.length) {
    const curr = ops[i];
    const next = ops[i + 1];

    if (
      curr.type === 'remove' &&
      next?.type === 'add' &&
      !equalsFn(curr.value, next.value)
    ) {
      result.push({
        type: 'modified',
        valueA: curr.value,
        valueB: next.value,
        indexA: curr.indexA,
        indexB: next.indexB,
      });
      i += 2;
    } else if (curr.type === 'moved' && next?.type === 'moved' && curr.value === next.value) {
      result.push({
        type: 'moved',
        value: curr.value,
        indexA: curr.indexA,
        indexB: next.indexB,
      });
      i += 2;
    } else {
      result.push(curr);
      i++;
    }
  }
  return result;
}

/**
 * Preprocess text according to comparison settings.
 */
function preprocessText(text, settings, forComparison = true) {
  let lines = text.split('\n');

  if (settings.trimLines) {
    lines = lines.map(l => l.trimEnd());
  }

  if (settings.ignoreBlankLines && forComparison) {
    lines = lines.filter(l => l.trim().length > 0);
  }

  return lines;
}

/**
 * Normalize a single token/line for comparison.
 */
function normalizeForCompare(str, settings) {
  let s = str;
  if (settings.ignoreCase) s = s.toLowerCase();
  if (settings.ignoreTabs) s = s.replace(/\t/g, ' ');
  if (settings.ignoreSpaces) s = s.replace(/\s+/g, '');
  if (settings.ignorePunctuation) s = s.replace(/[^\w\s]/g, '');
  if (settings.trimLines) s = s.trim();
  return s;
}

/**
 * Tokenize text into words preserving delimiters.
 */
function tokenizeWords(text) {
  const tokens = [];
  const regex = /(\S+|\s+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Check if two strings differ only in whitespace.
 */
function isWhitespaceOnlyDiff(a, b, settings) {
  if (settings.compareWhitespace) return false;
  const normA = a.replace(/\s/g, '');
  const normB = b.replace(/\s/g, '');
  return normA === normB && a !== b;
}

/**
 * Main comparison function.
 */
function compareTexts(textA, textB, settings) {
  const mode = settings.compareMode || 'line';

  if (mode === 'line') {
    return compareLines(textA, textB, settings);
  }
  if (mode === 'word') {
    return compareWords(textA, textB, settings);
  }
  return compareChars(textA, textB, settings);
}

/**
 * Split text into lines for index-based comparison (preserves editor line numbers).
 */
function splitLines(text, settings) {
  let lines = text.split('\n');
  if (settings.trimLines) {
    lines = lines.map(l => l.trimEnd());
  }
  return lines;
}

/**
 * Returns true when two lines share too few words — highlight the entire line instead
 * of character-level partial matches (avoids false positives like "CompareText" inside a path).
 */
function shouldWholeLineHighlight(strA, strB, settings) {
  const wordsA = tokenizeWords(strA).filter(t => !/^\s+$/.test(t));
  const wordsB = tokenizeWords(strB).filter(t => !/^\s+$/.test(t));

  if (wordsA.length === 0 || wordsB.length === 0) {
    return strA !== strB;
  }

  const countsB = new Map();
  for (const w of wordsB) {
    const n = normalizeForCompare(w, settings);
    countsB.set(n, (countsB.get(n) || 0) + 1);
  }

  let shared = 0;
  for (const w of wordsA) {
    const n = normalizeForCompare(w, settings);
    const count = countsB.get(n) || 0;
    if (count > 0) {
      shared++;
      countsB.set(n, count - 1);
    }
  }

  const ratio = shared / Math.max(wordsA.length, wordsB.length);
  return ratio < 0.5;
}

/**
 * Compare lines by index (line 1 vs line 1, line 2 vs line 2) — same as text-compare.com.
 */
function compareLinesByIndex(linesA, linesB, settings, inlineFn) {
  const equalsFn = (a, b) => normalizeForCompare(a, b, settings) === normalizeForCompare(b, a, settings);
  const maxLines = Math.max(linesA.length, linesB.length);
  const rows = [];

  for (let i = 0; i < maxLines; i++) {
    const lineA = linesA[i] ?? '';
    const lineB = linesB[i] ?? '';
    const hasA = i < linesA.length;
    const hasB = i < linesB.length;

    if (settings.ignoreBlankLines && lineA.trim() === '' && lineB.trim() === '') {
      continue;
    }

    if (equalsFn(lineA, lineB)) {
      rows.push({
        type: 'equal',
        textA: lineA,
        textB: lineB,
        lineNumA: hasA ? i + 1 : null,
        lineNumB: hasB ? i + 1 : null,
        inlineA: null,
        inlineB: null,
      });
    } else if (hasA && !hasB) {
      rows.push({
        type: 'removed',
        textA: lineA,
        textB: '',
        lineNumA: i + 1,
        lineNumB: null,
        inlineA: null,
        inlineB: null,
      });
    } else if (!hasA && hasB) {
      rows.push({
        type: 'added',
        textA: '',
        textB: lineB,
        lineNumA: null,
        lineNumB: i + 1,
        inlineA: null,
        inlineB: null,
      });
    } else {
      const wsOnly = isWhitespaceOnlyDiff(lineA, lineB, settings);
      rows.push({
        type: wsOnly ? 'whitespace' : 'modified',
        textA: lineA,
        textB: lineB,
        lineNumA: i + 1,
        lineNumB: i + 1,
        inlineA: inlineFn(lineA, lineB, 'A', settings),
        inlineB: inlineFn(lineA, lineB, 'B', settings),
      });
    }
  }

  return rows;
}

function compareLines(textA, textB, settings) {
  const linesA = splitLines(textA, settings);
  const linesB = splitLines(textB, settings);
  const rows = compareLinesByIndex(linesA, linesB, settings, wordDiffInline);
  const stats = computeStats(rows, textA, textB);
  return { rows, stats, mode: 'line', unified: buildUnifiedRows(rows) };
}

function compareWords(textA, textB, settings) {
  const linesA = splitLines(textA, settings);
  const linesB = splitLines(textB, settings);
  const rows = compareLinesByIndex(linesA, linesB, settings, wordDiffInline);
  const stats = computeStats(rows, textA, textB);
  return { rows, stats, mode: 'word', unified: buildUnifiedRows(rows) };
}

/**
 * Word-level inline diff for a single line pair (text-compare.com style).
 */
function wordDiffInline(strA, strB, side, settings) {
  if (shouldWholeLineHighlight(strA, strB, settings)) {
    if (side === 'A') {
      return strA ? [{ text: strA, cls: 'removed' }] : [];
    }
    return strB ? [{ text: strB, cls: 'added' }] : [];
  }

  const wordsA = tokenizeWords(strA);
  const wordsB = tokenizeWords(strB);
  const equalsFn = (a, b) => {
    if (/^\s+$/.test(a) && /^\s+$/.test(b)) {
      return settings.ignoreSpaces || a === b;
    }
    return normalizeForCompare(a, b, settings) === normalizeForCompare(b, a, settings);
  };

  const dp = buildLCSTable(wordsA, wordsB, equalsFn);
  let ops = backtrackLCS(wordsA, wordsB, dp, equalsFn);
  ops = pairModifications(ops, equalsFn);

  const parts = [];
  for (const op of ops) {
    switch (op.type) {
      case 'equal':
        parts.push({ text: op.value, cls: '' });
        break;
      case 'remove':
        if (side === 'A') {
          parts.push({ text: op.value, cls: 'removed' });
        }
        break;
      case 'add':
        if (side === 'B') {
          parts.push({ text: op.value, cls: 'added' });
        }
        break;
      case 'modified':
        parts.push({
          text: side === 'A' ? op.valueA : op.valueB,
          cls: 'modified',
        });
        break;
      default:
        break;
    }
  }

  return parts;
}

function compareChars(textA, textB, settings) {
  const linesA = splitLines(textA, settings);
  const linesB = splitLines(textB, settings);
  const rows = compareLinesByIndex(linesA, linesB, settings, charDiffInline);
  const stats = computeStats(rows, textA, textB);
  return { rows, stats, mode: 'char', unified: buildUnifiedRows(rows) };
}

function buildResult(ops, arrA, arrB, settings, mode) {
  const rows = [];
  let lineNumA = 1;
  let lineNumB = 1;

  for (const op of ops) {
    switch (op.type) {
      case 'equal':
        rows.push({
          type: 'equal',
          textA: op.value,
          textB: op.value,
          lineNumA: lineNumA++,
          lineNumB: lineNumB++,
          inlineA: null,
          inlineB: null,
        });
        break;

      case 'remove':
        rows.push({
          type: 'removed',
          textA: op.value,
          textB: '',
          lineNumA: lineNumA++,
          lineNumB: null,
          inlineA: null,
          inlineB: null,
        });
        break;

      case 'add':
        rows.push({
          type: 'added',
          textA: '',
          textB: op.value,
          lineNumA: null,
          lineNumB: lineNumB++,
          inlineA: null,
          inlineB: null,
        });
        break;

      case 'modified':
      case 'whitespace': {
        const inlineA = (mode === 'line' || mode === 'word' || mode === 'char') ? charDiffInline(op.valueA, op.valueB, 'A') : null;
        const inlineB = (mode === 'line' || mode === 'word' || mode === 'char') ? charDiffInline(op.valueA, op.valueB, 'B') : null;
        rows.push({
          type: op.type,
          textA: op.valueA,
          textB: op.valueB,
          lineNumA: lineNumA++,
          lineNumB: lineNumB++,
          inlineA,
          inlineB,
        });
        break;
      }

      case 'moved':
        rows.push({
          type: 'moved',
          textA: op.value,
          textB: op.value,
          lineNumA: op.indexA >= 0 ? lineNumA++ : null,
          lineNumB: op.indexB >= 0 ? lineNumB++ : null,
          inlineA: null,
          inlineB: null,
        });
        break;

      default:
        break;
    }
  }

  const textA = arrA.join(mode === 'line' ? '\n' : '');
  const textB = arrB.join(mode === 'line' ? '\n' : '');
  const stats = computeStats(rows, textA, textB);

  return { rows, stats, mode, unified: buildUnifiedRows(rows) };
}

/**
 * Character-level inline diff for a single line pair.
 */
function charDiffInline(strA, strB, side, settings) {
  if (shouldWholeLineHighlight(strA, strB, settings)) {
    if (side === 'A') {
      return strA ? [{ text: strA, cls: 'removed' }] : [];
    }
    return strB ? [{ text: strB, cls: 'added' }] : [];
  }

  let a = strA;
  let b = strB;
  if (settings?.ignoreCase) {
    a = strA.toLowerCase();
    b = strB.toLowerCase();
  }

  const rawOps = myersDiff(a, b);
  const grouped = groupCharOps(rawOps);
  const parts = [];
  let posA = 0;
  let posB = 0;

  for (const op of grouped) {
    const len = op.chars.length;
    if (op.type === 'equal') {
      parts.push({ text: strA.slice(posA, posA + len), cls: '' });
      posA += len;
      posB += len;
    } else if (op.type === 'remove') {
      if (side === 'A') {
        parts.push({ text: strA.slice(posA, posA + len), cls: 'removed' });
      }
      posA += len;
    } else if (op.type === 'add') {
      if (side === 'B') {
        parts.push({ text: strB.slice(posB, posB + len), cls: 'added' });
      }
      posB += len;
    }
  }

  return parts;
}

function buildUnifiedRows(rows) {
  const unified = [];
  for (const row of rows) {
    if (row.type === 'equal') {
      unified.push({ prefix: ' ', text: row.textA, type: 'equal', lineNumA: row.lineNumA, lineNumB: row.lineNumB });
    } else if (row.type === 'removed') {
      unified.push({ prefix: '-', text: row.textA, type: 'removed', lineNumA: row.lineNumA, lineNumB: null });
    } else if (row.type === 'added') {
      unified.push({ prefix: '+', text: row.textB, type: 'added', lineNumA: null, lineNumB: row.lineNumB });
    } else if (row.type === 'modified' || row.type === 'whitespace') {
      unified.push({ prefix: '-', text: row.textA, type: 'removed', lineNumA: row.lineNumA, lineNumB: null });
      unified.push({ prefix: '+', text: row.textB, type: 'added', lineNumA: null, lineNumB: row.lineNumB });
    } else if (row.type === 'moved') {
      unified.push({ prefix: '~', text: row.textA, type: 'moved', lineNumA: row.lineNumA, lineNumB: row.lineNumB });
    }
  }
  return unified;
}

function computeStats(rows, textA, textB) {
  let added = 0;
  let deleted = 0;
  let modified = 0;
  let unchanged = 0;

  for (const row of rows) {
    switch (row.type) {
      case 'added': added++; break;
      case 'removed': deleted++; break;
      case 'modified':
      case 'whitespace': modified++; break;
      case 'moved': modified++; break;
      case 'equal': unchanged++; break;
      default: break;
    }
  }

  const wordsA = textA.split(/\s+/).filter(Boolean);
  const wordsB = textB.split(/\s+/).filter(Boolean);
  const wordDp = buildLCSTable(wordsA, wordsB, (a, b) => a === b);
  const wordOps = backtrackLCS(wordsA, wordsB, wordDp, (a, b) => a === b);
  const wordsChanged = wordOps.filter(o => o.type !== 'equal').length;

  const charsA = textA.length;
  const charsB = textB.length;
  const charDp = buildLCSTable([...textA], [...textB], (a, b) => a === b);
  const lcsLen = charDp[charsA][charsB];
  const charsChanged = charsA + charsB - 2 * lcsLen;

  const totalLines = Math.max(
    rows.filter(r => r.lineNumA !== null).length,
    rows.filter(r => r.lineNumB !== null).length,
    1
  );
  const linesChanged = added + deleted + modified;

  const maxLen = Math.max(textA.length, textB.length, 1);
  const similarity = Math.round((lcsLen / maxLen) * 100);

  return {
    similarity,
    linesChanged,
    wordsChanged,
    charsChanged,
    added,
    deleted,
    modified,
    unchanged,
    totalLines,
    wordsA: wordsA.length,
    wordsB: wordsB.length,
    charsA,
    charsB,
  };
}

/* ==========================================================================
   Text Tools
   ========================================================================== */

const TextTools = {
  uppercase(text) {
    return text.toUpperCase();
  },

  lowercase(text) {
    return text.toLowerCase();
  },

  sentenceCase(text) {
    return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase());
  },

  titleCase(text) {
    return text.replace(/\b\w/g, c => c.toUpperCase());
  },

  trim(text) {
    return text.split('\n').map(l => l.trim()).join('\n').trim();
  },

  removeBlank(text) {
    return text.split('\n').filter(l => l.trim().length > 0).join('\n');
  },

  removeDupes(text) {
    const seen = new Set();
    return text.split('\n').filter(line => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    }).join('\n');
  },

  sort(text) {
    return text.split('\n').sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join('\n');
  },

  reverse(text) {
    return text.split('\n').reverse().join('\n');
  },

  normalizeSpaces(text) {
    return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n');
  },

  replaceTabs(text) {
    return text.replace(/\t/g, '    ');
  },

  numberLines(text) {
    return text.split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n');
  },

  apply(tool, text) {
    const fn = this[tool];
    return fn ? fn(text) : text;
  },
};

/* ==========================================================================
   DOM Utilities
   ========================================================================== */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineParts(parts) {
  if (!parts) return '';
  return parts.map(p => {
    const cls = p.cls ? `diff-inline ${p.cls}` : '';
    return cls ? `<span class="${cls}">${escapeHtml(p.text)}</span>` : escapeHtml(p.text);
  }).join('');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 200ms';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

/* ==========================================================================
   Router — path-based URLs (/tools/text-compare, /about, …)
   ========================================================================== */

const Router = {
  routes: {
    home: '/tools/text-compare',
    about: '/about',
    privacy: '/privacy',
    terms: '/terms',
  },

  filePaths: {
    home: 'tools/text-compare/index.html',
    about: 'about/index.html',
    privacy: 'privacy/index.html',
    terms: 'terms/index.html',
  },

  pathKeys: {
    home: 'tools/text-compare',
    about: 'about',
    privacy: 'privacy',
    terms: 'terms',
  },

  isFileProtocol() {
    return window.location.protocol === 'file:';
  },

  linkHref(pageId) {
    if (this.isFileProtocol()) {
      return this.fileLinkHref(pageId);
    }
    return this.routes[pageId] || this.routes.home;
  },

  fileLinkHref(pageId) {
    const pathname = window.location.pathname;
    const target = this.filePaths[pageId] || this.filePaths.home;

    if (pathname.includes('/tools/text-compare/')) {
      if (pageId === 'home') return './index.html';
      return `../../${target}`;
    }

    if (/\/(about|privacy|terms)\//.test(pathname)) {
      if (pageId === 'home') return '../tools/text-compare/index.html';
      const seg = this.pathKeys[pageId];
      if (pathname.includes(`/${seg}/`)) return './index.html';
      return `../${target}`;
    }

    return target;
  },

  resolveFileUrl(relativePath) {
    return new URL(relativePath, window.location.href).href;
  },

  isOnPage(pageId, pathname = window.location.pathname) {
    const key = this.pathKeys[pageId];
    return pathname.includes(`/${key}/`) || pathname.endsWith(`/${key}`);
  },

  isInRouteFolder(pathname = window.location.pathname) {
    return Object.values(this.pathKeys).some(key =>
      pathname.includes(`/${key}/`) || pathname.endsWith(`/${key}`)
    );
  },

  pageFromPath(pathname = window.location.pathname) {
    let path = pathname;
    if (path.endsWith('/index.html')) path = path.slice(0, -'/index.html'.length) || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

    for (const [pageId, key] of Object.entries(this.pathKeys)) {
      if (path.endsWith(`/${key}`) || path.includes(`/${key}/`)) {
        return pageId;
      }
    }

    if (path.endsWith('/index.html') && !this.isInRouteFolder(path)) return null;
    if (path === '/' || path === '') return null;
    return 'home';
  },

  navigate(pageId, replace = false) {
    const url = this.linkHref(pageId);

    if (this.isFileProtocol()) {
      if (this.isOnPage(pageId)) return;
      const resolved = this.resolveFileUrl(url);
      if (replace) location.replace(resolved);
      else location.assign(resolved);
      return;
    }

    if (replace) {
      history.replaceState({ pageId }, '', url);
    } else {
      history.pushState({ pageId }, '', url);
    }
  },

  initLinks() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.setAttribute('href', this.linkHref(link.dataset.page));
    });
  },

  resolveInitialPage() {
    const pageId = this.pageFromPath();

    if (pageId === null) {
      if (this.isFileProtocol()) {
        location.replace(this.resolveFileUrl(this.fileLinkHref('home')));
        return 'home';
      }
      this.navigate('home', true);
      return 'home';
    }

    if (!this.isFileProtocol()) {
      history.replaceState({ pageId }, '', this.linkHref(pageId));
    }

    return pageId;
  },

  currentPage() {
    return history.state?.pageId || this.pageFromPath() || 'home';
  },
};

/* ==========================================================================
   Application State
   ========================================================================== */

const App = {
  settings: Storage.getSettings(),
  compareResult: null,
  searchMatches: [],
  searchIndex: 0,
  compareDebounce: null,

  init() {
    this.cacheElements();
    this.initTheme();
    this.loadSavedTexts();
    this.bindSettings();
    this.bindEditors();
    this.bindToolbar();
    this.bindTextTools();
    this.bindNavigation();
    this.bindTabs();
    this.bindSearch();
    this.bindKeyboard();
    this.bindMobileMenu();
    this.updateLineNumbers('A');
    this.updateLineNumbers('B');

    if (this.settings.liveCompare) {
      this.runCompare();
    } else {
      this.renderEmpty();
    }
  },

  cacheElements() {
    this.els = {
      editorA: document.getElementById('editorA'),
      editorB: document.getElementById('editorB'),
      lineNumbersA: document.getElementById('lineNumbersA'),
      lineNumbersB: document.getElementById('lineNumbersB'),
      themeToggle: document.getElementById('themeToggle'),
      settingsPanel: document.getElementById('settingsPanel'),
      diffLeft: document.getElementById('diffLeft'),
      diffRight: document.getElementById('diffRight'),
      diffUnified: document.getElementById('diffUnified'),
      statisticsDetail: document.getElementById('statisticsDetail'),
      resultSearch: document.getElementById('resultSearch'),
      searchCount: document.getElementById('searchCount'),
      editTextsDropdown: document.getElementById('editTextsDropdown'),
      resultSummary: document.getElementById('resultSummary'),
    };
  },

  initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    this.els.themeToggle.checked = saved === 'dark';
    this.els.themeToggle.setAttribute('aria-checked', saved === 'dark');

    this.els.themeToggle.addEventListener('change', () => {
      const theme = this.els.themeToggle.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      this.els.themeToggle.setAttribute('aria-checked', theme === 'dark');
    });
  },

  loadSavedTexts() {
    const textA = Storage.get(STORAGE_KEYS.TEXT_A);
    const textB = Storage.get(STORAGE_KEYS.TEXT_B);
    if (textA) this.els.editorA.value = textA;
    if (textB) this.els.editorB.value = textB;
  },

  getSettingsFromUI() {
    return {
      ignoreCase: document.getElementById('settingIgnoreCase').checked,
      ignoreSpaces: document.getElementById('settingIgnoreSpaces').checked,
      ignoreTabs: document.getElementById('settingIgnoreTabs').checked,
      ignoreBlankLines: document.getElementById('settingIgnoreBlankLines').checked,
      trimLines: document.getElementById('settingTrimLines').checked,
      ignorePunctuation: document.getElementById('settingIgnorePunctuation').checked,
      compareWhitespace: document.getElementById('settingCompareWhitespace').checked,
      liveCompare: document.getElementById('settingLiveCompare').checked,
      compareMode: document.querySelector('input[name="compareMode"]:checked')?.value || 'line',
    };
  },

  applySettingsToUI() {
    const s = this.settings;
    document.getElementById('settingIgnoreCase').checked = s.ignoreCase;
    document.getElementById('settingIgnoreSpaces').checked = s.ignoreSpaces;
    document.getElementById('settingIgnoreTabs').checked = s.ignoreTabs;
    document.getElementById('settingIgnoreBlankLines').checked = s.ignoreBlankLines;
    document.getElementById('settingTrimLines').checked = s.trimLines;
    document.getElementById('settingIgnorePunctuation').checked = s.ignorePunctuation;
    document.getElementById('settingCompareWhitespace').checked = s.compareWhitespace;
    document.getElementById('settingLiveCompare').checked = s.liveCompare;
    const modeRadio = document.querySelector(`input[name="compareMode"][value="${s.compareMode}"]`);
    if (modeRadio) modeRadio.checked = true;
  },

  bindSettings() {
    this.applySettingsToUI();

    const settingInputs = this.els.settingsPanel.querySelectorAll('input');
    settingInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.settings = this.getSettingsFromUI();
        Storage.saveSettings(this.settings);
        if (this.settings.liveCompare) {
          this.scheduleCompare();
        }
      });
    });

    document.getElementById('btnSettings').addEventListener('click', () => {
      const panel = this.els.settingsPanel;
      const btn = document.getElementById('btnSettings');
      const isHidden = panel.hidden;
      panel.hidden = !isHidden;
      btn.setAttribute('aria-expanded', String(isHidden));
    });
  },

  bindEditors() {
    const editors = [
      { id: 'A', el: this.els.editorA, ln: this.els.lineNumbersA, panel: document.getElementById('editorPanelA') },
      { id: 'B', el: this.els.editorB, ln: this.els.lineNumbersB, panel: document.getElementById('editorPanelB') },
    ];

    editors.forEach(({ id, el, ln, panel }) => {
      el.addEventListener('input', () => {
        this.updateLineNumbers(id);
        this.saveTexts();
        if (this.settings.liveCompare) this.scheduleCompare();
      });

      el.addEventListener('scroll', () => {
        ln.scrollTop = el.scrollTop;
      });

      /* Drag and drop */
      panel.addEventListener('dragover', e => {
        e.preventDefault();
        panel.classList.add('drag-over');
      });

      panel.addEventListener('dragleave', () => {
        panel.classList.remove('drag-over');
      });

      panel.addEventListener('drop', e => {
        e.preventDefault();
        panel.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this.readFile(file, id);
      });
    });

    /* Editor action buttons */
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const editor = btn.dataset.editor;
        this.handleEditorAction(action, editor);
      });
    });

    /* File inputs */
    document.querySelectorAll('.file-input').forEach(input => {
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (file) this.readFile(file, input.dataset.editor);
        input.value = '';
      });
    });
  },

  handleEditorAction(action, editorId) {
    const el = editorId === 'A' ? this.els.editorA : this.els.editorB;

    switch (action) {
      case 'paste':
        navigator.clipboard.readText().then(text => {
          el.value += text;
          this.updateLineNumbers(editorId);
          this.saveTexts();
          if (this.settings.liveCompare) this.scheduleCompare();
          showToast('Text pasted', 'success');
        }).catch(() => showToast('Unable to paste — check clipboard permissions', 'error'));
        break;

      case 'copy':
        navigator.clipboard.writeText(el.value).then(() => {
          showToast('Text copied', 'success');
        }).catch(() => showToast('Unable to copy', 'error'));
        break;

      case 'clear':
        el.value = '';
        this.updateLineNumbers(editorId);
        this.saveTexts();
        if (this.settings.liveCompare) this.scheduleCompare();
        showToast('Editor cleared', 'info');
        break;

      default:
        break;
    }
  },

  readFile(file, editorId) {
    const allowed = ['.txt', '.log', '.csv', '.json', '.xml', '.html', '.css', '.js', '.md'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      showToast(`Unsupported file type: ${ext}`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const el = editorId === 'A' ? this.els.editorA : this.els.editorB;
      el.value = e.target.result;
      this.updateLineNumbers(editorId);
      this.saveTexts();
      if (this.settings.liveCompare) this.scheduleCompare();
      showToast(`Loaded ${file.name}`, 'success');
    };
    reader.onerror = () => showToast('Failed to read file', 'error');
    reader.readAsText(file);
  },

  updateLineNumbers(editorId) {
    const el = editorId === 'A' ? this.els.editorA : this.els.editorB;
    const ln = editorId === 'A' ? this.els.lineNumbersA : this.els.lineNumbersB;
    const lineCount = Math.max(el.value.split('\n').length, 1);
    ln.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  },

  saveTexts() {
    Storage.saveTexts(this.els.editorA.value, this.els.editorB.value);
  },

  scheduleCompare() {
    clearTimeout(this.compareDebounce);
    this.compareDebounce = setTimeout(() => this.runCompare(), 300);
  },

  runCompare(showNotification = false) {
    this.settings = this.getSettingsFromUI();
    const textA = this.els.editorA.value;
    const textB = this.els.editorB.value;

    if (!textA && !textB) {
      this.compareResult = null;
      this.renderEmpty();
      return;
    }

    this.compareResult = compareTexts(textA, textB, this.settings);
    this.renderDiff();
    this.updateSummary(this.compareResult.stats);
    this.renderStatisticsDetail(this.compareResult.stats);

    if (this.els.resultSearch.value) {
      this.performSearch(this.els.resultSearch.value);
    }

    if (showNotification) {
      showToast('Comparison complete', 'success');
      document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  renderEmpty() {
    this.els.diffLeft.innerHTML = '<p class="empty-state">Click <strong>Compare!</strong> above to see differences highlighted here.</p>';
    this.els.diffRight.innerHTML = '';
    this.els.diffUnified.innerHTML = '<p class="empty-state">Click <strong>Compare!</strong> to see the unified diff.</p>';
    this.els.statisticsDetail.innerHTML = '<p class="empty-state">Run a comparison to see detailed statistics.</p>';
    this.updateSummary(null);
  },

  updateSummary(stats) {
    const bar = this.els.resultSummary;
    if (!bar) return;

    if (!stats) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    document.getElementById('summarySimilarity').textContent = `${stats.similarity}%`;
    document.getElementById('summaryAdded').textContent = stats.added;
    document.getElementById('summaryRemoved').textContent = stats.deleted;
    document.getElementById('summaryModified').textContent = stats.modified;
  },

  renderDiff() {
    const { rows, unified } = this.compareResult;
    this.els.diffLeft.innerHTML = this.buildSideHtml(rows, 'A');
    this.els.diffRight.innerHTML = this.buildSideHtml(rows, 'B');
    this.els.diffUnified.innerHTML = this.buildUnifiedHtml(unified);
    this.syncScrollPanes();
  },

  buildSideHtml(rows, side) {
    return rows.map(row => {
      const textKey = side === 'A' ? 'textA' : 'textB';
      const lineKey = side === 'A' ? 'lineNumA' : 'lineNumB';
      const inlineKey = side === 'A' ? 'inlineA' : 'inlineB';
      const text = row[textKey];
      const lineNum = row[lineKey];
      const type = row.type === 'equal' ? '' : row.type;

      if (side === 'A' && row.type === 'added') {
        return `<div class="diff-line empty"><span class="diff-gutter"></span><span class="diff-text"></span></div>`;
      }
      if (side === 'B' && row.type === 'removed') {
        return `<div class="diff-line empty"><span class="diff-gutter"></span><span class="diff-text"></span></div>`;
      }

      const content = row[inlineKey]
        ? renderInlineParts(row[inlineKey])
        : escapeHtml(text);

      return `<div class="diff-line ${type}" data-line="${lineNum ?? ''}">
        <span class="diff-gutter">${lineNum ?? ''}</span>
        <span class="diff-text">${content || '&nbsp;'}</span>
      </div>`;
    }).join('');
  },

  buildUnifiedHtml(unified) {
    return unified.map(row => {
      const type = row.type === 'equal' ? '' : row.type;
      const gutter = row.lineNumA ?? row.lineNumB ?? '';
      return `<div class="diff-line ${type}">
        <span class="diff-gutter">${gutter}</span>
        <span class="diff-prefix">${row.prefix}</span>
        <span class="diff-text">${escapeHtml(row.text) || '&nbsp;'}</span>
      </div>`;
    }).join('');
  },

  syncScrollPanes() {
    const left = document.getElementById('diffPaneLeft');
    const right = document.getElementById('diffPaneRight');
    if (!left || !right) return;

    let syncing = false;
    const sync = (source, target) => {
      if (syncing) return;
      syncing = true;
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      syncing = false;
    };
    left.onscroll = () => sync(left, right);
    right.onscroll = () => sync(right, left);
  },

  updateStats() {
    /* Legacy hook — summary bar handled by updateSummary */
  },

  renderStatisticsDetail(stats) {
    if (!stats) return;

    const total = stats.added + stats.deleted + stats.modified + stats.unchanged || 1;

    this.els.statisticsDetail.innerHTML = `
      <div class="stats-detail-grid">
        <div class="stats-detail-card">
          <h3>Similarity</h3>
          <div class="value">${stats.similarity}%</div>
        </div>
        <div class="stats-detail-card">
          <h3>Original Lines</h3>
          <div class="value">${stats.totalLines}</div>
        </div>
        <div class="stats-detail-card">
          <h3>Original Words</h3>
          <div class="value">${stats.wordsA}</div>
        </div>
        <div class="stats-detail-card">
          <h3>Modified Words</h3>
          <div class="value">${stats.wordsB}</div>
        </div>
        <div class="stats-detail-card">
          <h3>Original Characters</h3>
          <div class="value">${stats.charsA.toLocaleString()}</div>
        </div>
        <div class="stats-detail-card">
          <h3>Modified Characters</h3>
          <div class="value">${stats.charsB.toLocaleString()}</div>
        </div>
      </div>
      <div class="stats-bar-chart">
        <h3>Change Breakdown</h3>
        ${this.buildBar('Added', stats.added, total, 'added')}
        ${this.buildBar('Deleted', stats.deleted, total, 'removed')}
        ${this.buildBar('Modified', stats.modified, total, 'modified')}
        ${this.buildBar('Unchanged', stats.unchanged, total, 'unchanged')}
      </div>
    `;
  },

  buildBar(label, value, total, cls) {
    const pct = Math.round((value / total) * 100);
    return `<div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="bar-value">${value}</span>
    </div>`;
  },

  bindToolbar() {
    document.getElementById('btnCompare').addEventListener('click', () => this.runCompare(true));

    document.getElementById('btnSwap').addEventListener('click', () => {
      const temp = this.els.editorA.value;
      this.els.editorA.value = this.els.editorB.value;
      this.els.editorB.value = temp;
      this.updateLineNumbers('A');
      this.updateLineNumbers('B');
      this.saveTexts();
      this.settings = this.getSettingsFromUI();
      if (this.settings.liveCompare) this.runCompare();
      showToast('Texts switched', 'success');
    });

    document.getElementById('btnClear').addEventListener('click', () => {
      this.els.editorA.value = '';
      this.els.editorB.value = '';
      this.updateLineNumbers('A');
      this.updateLineNumbers('B');
      this.saveTexts();
      this.compareResult = null;
      this.renderEmpty();
      showToast('All editors cleared', 'info');
    });

    if (this.els.editTextsDropdown) {
      this.bindDropdown(this.els.editTextsDropdown, 'btnEditTexts');
    }
  },

  bindDropdown(dropdown, btnId) {
    if (!dropdown) return;
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown.open').forEach(d => {
        if (d !== dropdown) d.classList.remove('open');
      });
      dropdown.classList.toggle('open');
      btn.setAttribute('aria-expanded', dropdown.classList.contains('open'));
    });

    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', e => e.stopPropagation());
    });
  },

  bindTextTools() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;

        ['A', 'B'].forEach(id => {
          const el = id === 'A' ? this.els.editorA : this.els.editorB;
          el.value = TextTools.apply(tool, el.value);
          this.updateLineNumbers(id);
        });

        this.saveTexts();
        document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
        if (this.settings.liveCompare) this.scheduleCompare();
        showToast(`Applied: ${btn.textContent.trim()}`, 'success');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
      document.querySelectorAll('.dropdown-toggle').forEach(b => b.setAttribute('aria-expanded', 'false'));
    });
  },

  bindNavigation() {
    Router.initLinks();

    const showPage = pageId => {
      if (!document.getElementById(pageId)) return;

      document.querySelectorAll('.page').forEach(p => {
        const isActive = p.id === pageId;
        p.classList.toggle('page-active', isActive);
        p.hidden = !isActive;
      });

      document.querySelectorAll('.nav-link, .footer-link[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === pageId);
      });

      document.getElementById('mobileNav').hidden = true;
      document.getElementById('mobileMenuBtn').setAttribute('aria-expanded', 'false');
    };

    const navigateTo = pageId => {
      if (Router.isFileProtocol()) {
        Router.navigate(pageId);
        return;
      }
      showPage(pageId);
      Router.navigate(pageId);
    };

    document.addEventListener('click', e => {
      const link = e.target.closest('[data-page]');
      if (!link) return;
      e.preventDefault();
      navigateTo(link.dataset.page);
    });

    window.addEventListener('popstate', () => {
      if (Router.isFileProtocol()) return;
      showPage(Router.currentPage());
    });

    showPage(Router.resolveInitialPage());
  },

  bindTabs() {
    const tabs = document.querySelectorAll('.result-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.result-panel').forEach(p => {
          p.classList.remove('active');
          p.hidden = true;
        });

        const panelId = tab.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        panel.classList.add('active');
        panel.hidden = false;
      });
    });
  },

  bindSearch() {
    this.els.resultSearch.addEventListener('input', () => {
      this.performSearch(this.els.resultSearch.value);
    });

    this.els.resultSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigateSearch(e.shiftKey ? -1 : 1);
      }
    });
  },

  performSearch(query) {
    document.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });

    this.searchMatches = [];
    this.searchIndex = 0;

    if (!query.trim()) {
      this.els.searchCount.textContent = '';
      return;
    }

    const containers = [this.els.diffLeft, this.els.diffRight, this.els.diffUnified];
    const lowerQuery = query.toLowerCase();

    containers.forEach(container => {
      this.highlightInNode(container, query, lowerQuery);
    });

    this.searchMatches = [...document.querySelectorAll('.search-highlight')];
    const count = this.searchMatches.length;
    this.els.searchCount.textContent = count ? `${count} match${count !== 1 ? 'es' : ''}` : 'No matches';

    if (count) {
      this.searchMatches[0].classList.add('active');
    }
  },

  highlightInNode(container, query, lowerQuery) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      const text = node.textContent;
      const lowerText = text.toLowerCase();
      let idx = lowerText.indexOf(lowerQuery);
      if (idx === -1) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;

      while (idx !== -1) {
        if (idx > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        lastIdx = idx + query.length;
        idx = lowerText.indexOf(lowerQuery, lastIdx);
      }

      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }

      node.parentNode.replaceChild(frag, node);
    }
  },

  navigateSearch(direction) {
    if (!this.searchMatches.length) return;

    this.searchMatches[this.searchIndex]?.classList.remove('active');
    this.searchIndex = (this.searchIndex + direction + this.searchMatches.length) % this.searchMatches.length;
    const el = this.searchMatches[this.searchIndex];
    el.classList.add('active');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.els.searchCount.textContent = `${this.searchIndex + 1} of ${this.searchMatches.length}`;
  },

  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.runCompare(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        document.getElementById('btnSwap').click();
      }
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        document.getElementById('btnClear').click();
      }
    });
  },

  bindMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('mobileNav');

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      nav.hidden = expanded;
    });
  },
};

/* ==========================================================================
   Bootstrap
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
