/**
 * DDSL v0.3 — Expander
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
}

export interface PreviewResult {
  /** The (possibly truncated) list of domain names */
  domains: string[];
  /** The total number of domains the expression would expand to */
  total: number;
  /** Whether the results were truncated due to the limit */
  truncated: boolean;
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
 * Throws ExpansionError if total expansion size exceeds maxExpansion.
 */
export function preview(ast: DomainNode, limit: number, options?: ExpandOptions): PreviewResult {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
  const total = expansionSize(ast);

  if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
    throw new ExpansionError(
      `Expression would expand to ${total.toLocaleString()} domains, ` +
      `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
    );
  }

  const truncated = total > limit;
  const labelSets = ast.labels.map(expandLabel);
  const domains = [...new Set(cartesianProductCapped(labelSets, limit).map(parts => parts.join('.')))];

  return { domains, total, truncated };
}

/**
 * Preview a document expansion with a capped result set.
 * Throws ExpansionError if total expansion size exceeds maxExpansion.
 */
export function previewDocument(doc: DocumentNode, limit: number, options?: ExpandOptions): PreviewResult {
  const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;

  setVariables(doc.variables);

  try {
    const total = calcDocumentSize(doc);

    if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
      throw new ExpansionError(
        `Document would expand to ${total.toLocaleString()} domains, ` +
        `which exceeds the limit of ${maxExpansion.toLocaleString()}`,
      );
    }

    const truncated = total > limit;
    const allDomains: string[] = [];
    let remaining = limit;

    for (const expr of doc.expressions) {
      if (remaining <= 0) break;

      // Pass Infinity to inner preview since we already checked total
      const result = preview(expr, remaining, { maxExpansion: Infinity });
      for (const s of result.domains) {
        allDomains.push(s);
      }
      remaining -= result.domains.length;
    }

    return {
      domains: [...new Set(allDomains)].slice(0, limit),
      total,
      truncated,
    };
  } finally {
    clearVariables();
  }
}

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
