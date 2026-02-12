/**
 * DDSL v0.3 — Reference Implementation
 *
 * A declarative language for describing sets of domain names
 * using structural patterns.
 *
 * @see https://ddsl.app
 */

import { parse, parseDocument, prepareDocument } from './parser';
import { expand, expandDocument, setVariables, clearVariables } from './expander';
import type { ExpandOptions } from './expander';

// Re-export types
export type {
  DocumentNode,
  VariableDefNode,
  DomainNode,
  LabelNode,
  ElementNode,
  PrimaryNode,
  LiteralNode,
  CharClassNode,
  AlternationNode,
  GroupNode,
  VarRefNode,
} from './types';

export { parse, parseDocument, prepare, prepareDocument, ParseError } from './parser';
export {
  expand,
  expandDocument,
  preview,
  previewDocument,
  expansionSize,
  documentExpansionSize,
  setVariables,
  clearVariables,
  ExpansionError,
} from './expander';
export type { ExpandOptions, PreviewResult } from './expander';

/**
 * Parse and expand a DDSL expression in one step.
 *
 * @param expression - A valid DDSL v0.3 expression
 * @param options - Expansion options (e.g. maxExpansion limit)
 * @returns Array of domain name strings
 *
 * @example
 * ```ts
 * import { ddsl } from 'ddsl';
 *
 * ddsl('{car,bike}.com');
 * // ['car.com', 'bike.com']
 *
 * ddsl('car(s)?.com');
 * // ['car.com', 'cars.com']
 *
 * ddsl('[^aeiou]{3}.com');
 * // All 3-letter domains using consonants and digits
 * ```
 */
export function ddsl(expression: string, options?: ExpandOptions): string[] {
  return expand(parse(expression), options);
}

/**
 * Parse and expand a DDSL document (multi-line with variables) in one step.
 *
 * @param input - A valid DDSL v0.3 document
 * @param options - Expansion options (e.g. maxExpansion limit)
 * @returns Array of domain name strings
 *
 * @example
 * ```ts
 * import { ddslDocument } from 'ddsl';
 *
 * ddslDocument(`
 *   @tlds = {com,net}
 *   # API endpoints
 *   api.example.@tlds
 *   cdn.example.@tlds
 * `);
 * // ['api.example.com', 'api.example.net', 'cdn.example.com', 'cdn.example.net']
 * ```
 */
export function ddslDocument(input: string, options?: ExpandOptions): string[] {
  const lines = prepareDocument(input);
  const doc = parseDocument(lines);
  return expandDocument(doc, options);
}
