/**
 * DDSL v0.2 — Expander
 *
 * Takes a parsed DDSL AST and expands it into the complete finite set
 * of domain names. Implements the semantics from Section 9 of the
 * specification.
 */

import type { DomainNode, LabelNode, ElementNode, PrimaryNode } from './types';

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
    // Optional adds one more branch (the empty case)
    // But we need to count unique outputs, so it's primarySize + 1
    // unless primary can produce empty, in which case it's just primarySize
    return primarySize + 1;
  }

  return primarySize;
}

function primaryExpansionSize(primary: PrimaryNode): number {
  switch (primary.type) {
    case 'literal':
      return 1;

    case 'alternation': {
      // Sum of all option sizes (each option is a sequence)
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
      // Sum of sizes for each repetition count from min to max
      let total = 0;
      for (let r = primary.repetitionMin; r <= primary.repetitionMax; r++) {
        total += Math.pow(primary.chars.length, r);
        if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
          return Infinity;
        }
      }
      return total;
    }

    case 'group':
      return sequenceExpansionSize(primary.elements);
  }
}

/**
 * Expand a parsed DDSL AST into the full set of domain names.
 *
 * Section 9.4: All output domain names are lowercase, use '.' as the
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
 */
function expandLabel(label: LabelNode): string[] {
  return expandSequence(label.elements);
}

/**
 * Expand a sequence of elements into all possible string values.
 */
function expandSequence(elements: ElementNode[]): string[] {
  const elementSets = elements.map(expandElement);
  return cartesianProduct(elementSets).map(parts => parts.join(''));
}

/**
 * Expand a single element into its set of possible string values.
 */
function expandElement(element: ElementNode): string[] {
  const primaryStrings = expandPrimary(element.primary);

  if (element.optional) {
    // Add empty string option for optional elements
    const result = ['', ...primaryStrings];
    // Deduplicate in case primary already produces empty
    return [...new Set(result)];
  }

  return primaryStrings;
}

/**
 * Expand a primary node into its set of possible string values.
 */
function expandPrimary(primary: PrimaryNode): string[] {
  switch (primary.type) {
    case 'literal':
      return [primary.value];

    case 'alternation': {
      // Expand each option (sequence) and combine
      const results: string[] = [];
      for (const option of primary.options) {
        results.push(...expandSequence(option));
      }
      // Deduplicate
      return [...new Set(results)];
    }

    case 'charclass':
      return expandCharClass(primary.chars, primary.repetitionMin, primary.repetitionMax);

    case 'group':
      return expandSequence(primary.elements);
  }
}

/**
 * Expand a character class with repetition range into all combinations.
 * e.g. chars=['a','b'], min=1, max=2 → ['a','b','aa','ab','ba','bb']
 */
function expandCharClass(chars: string[], min: number, max: number): string[] {
  const results: string[] = [];

  for (let rep = min; rep <= max; rep++) {
    if (rep === 0) {
      results.push('');
    } else {
      results.push(...expandCharClassFixed(chars, rep));
    }
  }

  return results;
}

/**
 * Expand a character class with fixed repetition.
 */
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
