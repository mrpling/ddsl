/**
 * DDSL v0.1 — Expander
 *
 * Takes a parsed DDSL AST and expands it into the complete finite set
 * of domain names. Implements the semantics from Section 8 of the
 * specification.
 */

import type { DomainNode, LabelNode, ElementNode } from './types';

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
}

export interface PreviewResult {
  /** The (possibly truncated) list of domain names */
  domains: string[];
  /** The total number of domains the expression would expand to */
  total: number;
  /** Whether the results were truncated due to the limit */
  truncated: boolean;
}

/**
 * Calculate the total expansion size without actually expanding.
 * Useful for checking limits before committing to expansion.
 */
export function expansionSize(ast: DomainNode): number {
  let total = 1;

  for (const label of ast.labels) {
    const labelSize = labelExpansionSize(label);
    total *= labelSize;

    // Guard against overflow
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
      return Infinity;
    }
  }

  return total;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function labelExpansionSize(label: LabelNode): number {
  let size = 1;

  for (const element of label.elements) {
    size *= elementExpansionSize(element);

    if (!Number.isFinite(size) || size > Number.MAX_SAFE_INTEGER) {
      return Infinity;
    }
  }

  return size;
}

function elementExpansionSize(element: ElementNode): number {
  switch (element.type) {
    case 'literal':
      return 1;
    case 'alternation':
      return uniqueStrings(element.options).length;
    case 'charclass':
      return Math.pow(element.chars.length, element.repetition);
  }
}

/**
 * Expand a parsed DDSL AST into the full set of domain names.
 *
 * Section 8.4: All output domain names are lowercase, use '.' as the
 * label separator, and do not contain a trailing dot.
 *
 * Throws ExpansionError if the expansion would exceed maxExpansion.
 */
export function expand(ast: DomainNode, options?: ExpandOptions): string[] {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;

  // Check expansion size before expanding
  if (maxExpansion > 0 && maxExpansion !== Infinity) {
    const size = expansionSize(ast);
    if (size > maxExpansion) {
      throw new ExpansionError(
        `Expression would expand to ${size.toLocaleString()} domains, ` +
        `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
      );
    }
  }

  // Expand each label into its set of possible strings
  const labelSets = ast.labels.map(expandLabel);

  // Cartesian product across labels with deduplication, joined by '.'
  return [...new Set(cartesianProduct(labelSets).map(parts => parts.join('.')))];
}

/**
 * Preview an expansion with a capped result set.
 * Unlike expand(), this never throws on large expressions - it simply
 * truncates the results and indicates truncation in the response.
 *
 * Use this for UI previews where you want to show a sample of results
 * without risking errors on large expressions.
 */
export function preview(ast: DomainNode, limit: number): PreviewResult {
  const total = expansionSize(ast);
  const truncated = total > limit;

  // Expand each label into its set of possible strings
  const labelSets = ast.labels.map(expandLabel);

  // Cartesian product with cap
  const domains = [...new Set(cartesianProductCapped(labelSets, limit).map(parts => parts.join('.')))];

  return { domains, total, truncated };
}

/**
 * Expand a label into all possible string values.
 * A label's elements are concatenated, so we need the Cartesian product
 * of all elements within the label, then join each combination.
 */
function expandLabel(label: LabelNode): string[] {
  const elementSets = label.elements.map(expandElement);
  return cartesianProduct(elementSets).map(parts => parts.join(''));
}

/**
 * Expand a single element into its set of possible string values.
 */
function expandElement(element: ElementNode): string[] {
  switch (element.type) {
    case 'literal':
      return [element.value];

    case 'alternation':
      return uniqueStrings(element.options);

    case 'charclass':
      return expandCharClass(element.chars, element.repetition);
  }
}

/**
 * Expand a character class with repetition into all combinations.
 * e.g. chars=['a','b'], repetition=2 → ['aa','ab','ba','bb']
 */
function expandCharClass(chars: string[], repetition: number): string[] {
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

/**
 * Compute the Cartesian product of an array of string arrays.
 * e.g. [['a','b'], ['1','2']] → [['a','1'], ['a','2'], ['b','1'], ['b','2']]
 */
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

/**
 * Compute the Cartesian product with an optional cap on results.
 * Stops early once the limit is reached.
 */
function cartesianProductCapped(sets: string[][], limit: number): string[][] {
  if (sets.length === 0) return [[]];

  let result: string[][] = [[]];

  //allow each set to finish but cap to results for each set
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
