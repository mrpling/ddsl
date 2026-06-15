/**
 * DDSL Expander
 *
 * Takes a parsed DDSL AST and expands it into the complete finite set
 * of domain names. Implements the semantics from Section 10 of the
 * specification.
 */

import type {
  DocumentNode,
  DomainNode,
  LabelNode,
  ElementNode,
  PrimaryNode,
  VariableDefNode,
} from './types';

export class ExpansionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpansionError';
  }
}

/** Default maximum expansion size (can be overridden). */
const DEFAULT_MAX_EXPANSION = 1_000_000;

export interface ExpandOptions {
  /**
   * Maximum number of domain names to produce. If the expression would
   * expand beyond this limit, an ExpansionError is thrown.
   * Set to 0 or Infinity to disable.
   * Default: 1,000,000
   */
  maxExpansion?: number;
  /**
   * Seed for deterministic sampling. When provided, results are sampled
   * from across the expansion space rather than taken from the prefix.
   * The same seed always produces the same sample.
   */
  seed?: number;
  /**
   * Number of results to skip before collecting `limit` items.
   * Use with a fixed `seed` to paginate through a deterministic sample,
   * or without a seed to paginate through the prefix ordering.
   */
  offset?: number;
}

export interface PreviewResult {
  /** The (possibly truncated) list of domain names */
  domains: string[];
  /** The total number of domains the expression would expand to */
  total: number;
  /** Whether the results were truncated due to the limit */
  truncated: boolean;
  /** The seed used for deterministic sampling, if any */
  seed?: number;
  /** The offset used, if any */
  offset?: number;
}

// Variable storage for expansion
let variableMap: Map<string, ElementNode[]> = new Map();

/**
 * Set variables for expansion (called before expanding expressions).
 */
export function setVariables(variables: VariableDefNode[]): void {
  variableMap = new Map();
  for (const v of variables) {
    variableMap.set(v.name, v.elements);
  }
}

/**
 * Clear variables after expansion.
 */
export function clearVariables(): void {
  variableMap = new Map();
}

/**
 * Calculate the total expansion size without actually expanding.
 */
export function expansionSize(ast: DomainNode): number {
  let total = 1;

  for (const label of ast.labels) {
    const labelSize = labelExpansionSize(label);
    total *= labelSize;

    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
      return Infinity;
    }
  }

  return total;
}

/**
 * Calculate expansion size for a document (sum of all expressions).
 */
export function documentExpansionSize(doc: DocumentNode): number {
  setVariables(doc.variables);
  try {
    return calcDocumentSize(doc);
  } finally {
    clearVariables();
  }
}

/**
 * Internal helper to calculate document size (assumes variables are already set).
 */
function calcDocumentSize(doc: DocumentNode): number {
  let total = 0;

  for (const expr of doc.expressions) {
    const size = expansionSize(expr);
    total += size;

    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
      return Infinity;
    }
  }

  return total;
}

function labelExpansionSize(label: LabelNode): number {
  return sequenceExpansionSize(label.elements);
}

function sequenceExpansionSize(elements: ElementNode[]): number {
  let size = 1;

  for (const element of elements) {
    size *= elementExpansionSize(element);

    if (!Number.isFinite(size) || size > Number.MAX_SAFE_INTEGER) {
      return Infinity;
    }
  }

  return size;
}

function elementExpansionSize(element: ElementNode): number {
  const primarySize = primaryExpansionSize(element.primary);

  if (element.optional) {
    return primarySize + 1;
  }

  return primarySize;
}

function primaryExpansionSize(primary: PrimaryNode): number {
  switch (primary.type) {
    case 'literal':
      return 1;

    case 'alternation': {
      let total = 0;
      for (const option of primary.options) {
        total += sequenceExpansionSize(option);
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
          return Infinity;
        }
      }
      return total;
    }

    case 'charclass': {
      let total = 0;
      for (let r = primary.repetitionMin; r <= primary.repetitionMax; r++) {
        total += Math.pow(primary.chars.length, r);
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
          return Infinity;
        }
      }
      return total;
    }

    case 'group': {
      const innerSize = sequenceExpansionSize(primary.elements);
      let total = 0;
      for (let r = primary.repetitionMin; r <= primary.repetitionMax; r++) {
        total += Math.pow(innerSize, r);
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
          return Infinity;
        }
      }
      return total;
    }

    case 'varref': {
      const varElements = variableMap.get(primary.name);
      if (!varElements) {
        return 0;
      }
      return sequenceExpansionSize(varElements);
    }
  }
}

/**
 * Expand a parsed DDSL AST into the full set of domain names.
 */
export function expand(ast: DomainNode, options?: ExpandOptions): string[] {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;

  if (maxExpansion > 0 && maxExpansion !== Infinity) {
    const size = expansionSize(ast);
    if (size > maxExpansion) {
      throw new ExpansionError(
        `Expression would expand to ${size.toLocaleString()} domains, ` +
        `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
      );
    }
  }

  const labelSets = ast.labels.map(expandLabel);
  return [...new Set(cartesianProduct(labelSets).map(parts => parts.join('.')))];
}

/**
 * Expand a DDSL document into the full set of domain names.
 */
export function expandDocument(doc: DocumentNode, options?: ExpandOptions): string[] {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;

  setVariables(doc.variables);

  try {
    if (maxExpansion > 0 && maxExpansion !== Infinity) {
      const size = calcDocumentSize(doc);
      if (size > maxExpansion) {
        throw new ExpansionError(
          `Document would expand to ${size.toLocaleString()} domains, ` +
          `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
        );
      }
    }

    const allDomains: Set<string> = new Set();

    for (const expr of doc.expressions) {
      const domains = expand(expr, { maxExpansion: Infinity });
      for (const d of domains) {
        allDomains.add(d);
      }
    }

    return [...allDomains];
  } finally {
    clearVariables();
  }
}

/**
 * Preview an expansion with a capped result set.
 *
 * Without `seed` or `offset`: returns the first `limit` domains in expansion order.
 * With `offset` (no seed): returns the next `limit` domains starting at that position -
 *   use the same `limit` and incrementing `offset` to paginate.
 * With `seed`: samples `limit` domains deterministically from across the full space.
 * With `seed` + `offset`: paginates through a seeded sample (same seed, skip `offset` unique results).
 *
 * Throws ExpansionError if total expansion size exceeds maxExpansion.
 */
export function preview(ast: DomainNode, limit: number, options?: ExpandOptions): PreviewResult {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
  const seed = options?.seed;
  const offset = options?.offset ?? 0;
  const total = expansionSize(ast);

  if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
    throw new ExpansionError(
      `Expression would expand to ${total.toLocaleString()} domains, ` +
      `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
    );
  }

  const atIndex = (idx: number) => domainAtIndex(ast, idx);

  if (seed !== undefined && total > limit && Number.isFinite(total)) {
    const domains = sampleFromSpace(total, limit, seed, atIndex, offset);
    const result: PreviewResult = { domains, total, truncated: true, seed };
    if (offset > 0) result.offset = offset;
    return result;
  }

  if (offset > 0) {
    const seen = new Set<string>();
    for (let i = offset; i < offset + limit && i < total; i++) {
      seen.add(atIndex(i));
    }
    return {
      domains: [...seen],
      total,
      truncated: offset + limit < total,
      offset,
    };
  }

  const labelSets = ast.labels.map(expandLabel);
  const seen = new Set<string>();
  for (const combo of cartesianProductGen(labelSets)) {
    seen.add(combo.join('.'));
    if (seen.size > limit) break;
  }
  const truncated = seen.size > limit;
  const domains = [...seen].slice(0, limit);

  return { domains, total, truncated };
}

/**
 * Preview a document expansion with a capped result set.
 *
 * Without `seed` or `offset`: returns the first `limit` domains in expansion order.
 * With `offset` (no seed): paginates through the combined document index space.
 * With `seed`: samples `limit` domains deterministically across all expressions,
 *   proportionally weighted by each expression's expansion size.
 * With `seed` + `offset`: paginates through a seeded sample.
 *
 * Throws ExpansionError if total expansion size exceeds maxExpansion.
 */
export function previewDocument(doc: DocumentNode, limit: number, options?: ExpandOptions): PreviewResult {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
  const seed = options?.seed;
  const offset = options?.offset ?? 0;

  setVariables(doc.variables);

  try {
    const total = calcDocumentSize(doc);

    if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
      throw new ExpansionError(
        `Document would expand to ${total.toLocaleString()} domains, ` +
        `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
      );
    }

    const useSeeded = seed !== undefined && total > limit && Number.isFinite(total);
    const useOffset = offset > 0 && Number.isFinite(total);

    if (useSeeded || useOffset) {
      const exprSizes = doc.expressions.map(expansionSize);
      const atIndex = (idx: number): string => {
        let remaining = idx;
        for (let i = 0; i < doc.expressions.length; i++) {
          if (remaining < exprSizes[i]) {
            return domainAtIndex(doc.expressions[i], remaining);
          }
          remaining -= exprSizes[i];
        }
        return '';
      };

      if (useSeeded) {
        const domains = sampleFromSpace(total, limit, seed!, atIndex, offset);
        const result: PreviewResult = { domains, total, truncated: true, seed };
        if (offset > 0) result.offset = offset;
        return result;
      }

      // Unseeded offset pagination
      const seen = new Set<string>();
      for (let i = offset; i < offset + limit && i < total; i++) {
        seen.add(atIndex(i));
      }
      return {
        domains: [...seen],
        total,
        truncated: offset + limit < total,
        offset,
      };
    }

    const allDomains = new Set<string>();

    for (const expr of doc.expressions) {
      const result = preview(expr, limit + 1, { maxExpansion: Infinity });
      for (const d of result.domains) {
        allDomains.add(d);
      }
      if (allDomains.size > limit) break;
    }

    const truncated = allDomains.size > limit;

    return {
      domains: [...allDomains].slice(0, limit),
      total,
      truncated,
    };
  } finally {
    clearVariables();
  }
}

// ---------------------------------------------------------------------------
// Deterministic sampling - index-based domain lookup
// ---------------------------------------------------------------------------

// Mulberry32 PRNG - returns a function yielding floats in [0, 1).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// Suffix products: sp[i] = sizes[i] × sizes[i+1] × … × sizes[n-1], sp[n] = 1.
// Used to decompose a flat index into per-component indices for Cartesian products.
function suffixProducts(sizes: number[]): number[] {
  const sp = new Array<number>(sizes.length + 1);
  sp[sizes.length] = 1;
  for (let i = sizes.length - 1; i >= 0; i--) {
    sp[i] = sp[i + 1] * sizes[i];
  }
  return sp;
}

function domainAtIndex(ast: DomainNode, index: number): string {
  const sizes = ast.labels.map(labelExpansionSize);
  const sp = suffixProducts(sizes);
  const parts: string[] = [];
  for (let i = 0; i < sizes.length; i++) {
    parts.push(labelAtIndex(ast.labels[i], Math.floor(index / sp[i + 1]) % sizes[i]));
  }
  return parts.join('.');
}

function labelAtIndex(label: LabelNode, index: number): string {
  return sequenceAtIndex(label.elements, index);
}

function sequenceAtIndex(elements: ElementNode[], index: number): string {
  if (elements.length === 0) return '';
  const sizes = elements.map(elementExpansionSize);
  const sp = suffixProducts(sizes);
  let result = '';
  for (let i = 0; i < elements.length; i++) {
    result += elementAtIndex(elements[i], Math.floor(index / sp[i + 1]) % sizes[i]);
  }
  return result;
}

function elementAtIndex(element: ElementNode, index: number): string {
  if (element.optional) {
    // index 0 = '' (absent), indices 1…primarySize = primary[index-1]
    return index === 0 ? '' : primaryAtIndex(element.primary, index - 1);
  }
  return primaryAtIndex(element.primary, index);
}

function primaryAtIndex(primary: PrimaryNode, index: number): string {
  switch (primary.type) {
    case 'literal':
      return primary.value;

    case 'charclass':
      return charClassAtIndex(primary.chars, primary.repetitionMin, primary.repetitionMax, index);

    case 'alternation': {
      let remaining = index;
      for (const option of primary.options) {
        const size = sequenceExpansionSize(option);
        if (remaining < size) return sequenceAtIndex(option, remaining);
        remaining -= size;
      }
      return '';
    }

    case 'group':
      return groupAtIndex(primary.elements, primary.repetitionMin, primary.repetitionMax, index);

    case 'varref': {
      const varElements = variableMap.get(primary.name);
      if (!varElements) return '';
      return sequenceAtIndex(varElements, index);
    }
  }
}

function charClassAtIndex(chars: string[], min: number, max: number, index: number): string {
  let remaining = index;
  for (let rep = min; rep <= max; rep++) {
    const repSize = rep === 0 ? 1 : Math.pow(chars.length, rep);
    if (remaining < repSize) return charClassFixedAtIndex(chars, rep, remaining);
    remaining -= repSize;
  }
  return '';
}

// Treat index as a base-C number of length rep (big-endian).
function charClassFixedAtIndex(chars: string[], rep: number, index: number): string {
  if (rep === 0) return '';
  const C = chars.length;
  const parts = new Array<string>(rep);
  let remaining = index;
  for (let i = rep - 1; i >= 0; i--) {
    parts[i] = chars[remaining % C];
    remaining = Math.floor(remaining / C);
  }
  return parts.join('');
}

function groupAtIndex(elements: ElementNode[], min: number, max: number, index: number): string {
  const B = sequenceExpansionSize(elements);
  let remaining = index;
  for (let rep = min; rep <= max; rep++) {
    const repSize = rep === 0 ? 1 : Math.pow(B, rep);
    if (remaining < repSize) {
      if (rep === 0) return '';
      const parts = new Array<string>(rep);
      let idx = remaining;
      for (let j = rep - 1; j >= 0; j--) {
        parts[j] = sequenceAtIndex(elements, idx % B);
        idx = Math.floor(idx / B);
      }
      return parts.join('');
    }
    remaining -= repSize;
  }
  return '';
}

// Sample limit unique domains from [0, total) using a seeded PRNG.
// offset skips the first N unique results so pages can be fetched consistently.
// maxAttempts caps retries for the (rare) case where sampled indices collide.
function sampleFromSpace(
  total: number,
  limit: number,
  seed: number,
  atIndex: (idx: number) => string,
  offset: number = 0,
): string[] {
  const rng = mulberry32(seed);
  const seen = new Set<string>();
  // Skip past the first `offset` unique results.
  const skipAttempts = (offset + limit) * 3;
  for (let attempt = 0; attempt < skipAttempts && seen.size < offset; attempt++) {
    seen.add(atIndex(Math.floor(rng() * total)));
  }
  // Collect the next `limit` unique results.
  const page: string[] = [];
  const collectAttempts = limit * 3;
  for (let attempt = 0; attempt < collectAttempts && page.length < limit; attempt++) {
    const domain = atIndex(Math.floor(rng() * total));
    if (!seen.has(domain)) {
      seen.add(domain);
      page.push(domain);
    }
  }
  return page;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function expandLabel(label: LabelNode): string[] {
  return expandSequence(label.elements);
}

function expandSequence(elements: ElementNode[]): string[] {
  const elementSets = elements.map(expandElement);
  return cartesianProduct(elementSets).map(parts => parts.join(''));
}

function expandElement(element: ElementNode): string[] {
  const primaryStrings = expandPrimary(element.primary);

  if (element.optional) {
    const result = ['', ...primaryStrings];
    return [...new Set(result)];
  }

  return primaryStrings;
}

function expandPrimary(primary: PrimaryNode): string[] {
  switch (primary.type) {
    case 'literal':
      return [primary.value];

    case 'alternation': {
      const results: string[] = [];
      for (const option of primary.options) {
        results.push(...expandSequence(option));
      }
      return [...new Set(results)];
    }

    case 'charclass':
      return expandCharClass(primary.chars, primary.repetitionMin, primary.repetitionMax);

    case 'group':
      return expandGroup(primary.elements, primary.repetitionMin, primary.repetitionMax);

    case 'varref': {
      const varElements = variableMap.get(primary.name);
      if (!varElements) {
        return [];
      }
      return expandSequence(varElements);
    }
  }
}

function expandCharClass(chars: string[], min: number, max: number): string[] {
  let results: string[] = [];

  for (let rep = min; rep <= max; rep++) {
    if (rep === 0) {
      results.push('');
    } else {
      results = results.concat(expandCharClassFixed(chars, rep));
    }
  }

  return results;
}

function expandCharClassFixed(chars: string[], repetition: number): string[] {
  if (repetition === 0) return [''];

  let results = chars.map(c => c);
  for (let i = 1; i < repetition; i++) {
    const next: string[] = [];
    for (const existing of results) {
      for (const ch of chars) {
        next.push(existing + ch);
      }
    }
    results = next;
  }
  return results;
}

function expandGroup(elements: ElementNode[], min: number, max: number): string[] {
  const innerStrings = expandSequence(elements);
  const results: string[] = [];

  for (let rep = min; rep <= max; rep++) {
    if (rep === 0) {
      results.push('');
    } else {
      const expanded = expandGroupFixed(innerStrings, rep);
      for (const s of expanded) {
        results.push(s);
      }      
    }
  }

  return results;
}

function expandGroupFixed(strings: string[], repetition: number): string[] {
  if (repetition === 0) return [''];
  if (repetition === 1) return strings;

  let results = [...strings];
  for (let i = 1; i < repetition; i++) {
    const next: string[] = [];
    for (const existing of results) {
      for (const s of strings) {
        next.push(existing + s);
      }
    }
    results = next;
  }
  return results;
}

function cartesianProduct(sets: string[][]): string[][] {
  if (sets.length === 0) return [[]];

  let result: string[][] = [[]];

  for (const set of sets) {
    const next: string[][] = [];
    for (const existing of result) {
      for (const item of set) {
        next.push([...existing, item]);
      }
    }
    result = next;
  }

  return result;
}

function cartesianProductCapped(sets: string[][], limit: number): string[][] {
  if (sets.length === 0) return [[]];

  let result: string[][] = [[]];

  for (const set of sets) {
    const next: string[][] = [];
    outer: for (const existing of result) {
      for (const item of set) {
        next.push([...existing, item]);
        if (next.length >= limit) break outer;
      }
    }
    result = next;
  }

  return result;
}

function* cartesianProductGen(sets: string[][]): Generator<string[]> {
  if (sets.length === 0) {
    yield [];
    return;
  }
  const [first, ...rest] = sets;
  for (const item of first) {
    for (const combo of cartesianProductGen(rest)) {
      yield [item, ...combo];
    }
  }
}
