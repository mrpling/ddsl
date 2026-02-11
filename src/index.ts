/**
 * DDSL v0.2 — Reference Implementation
 *
 * A declarative language for describing sets of domain names
 * using structural patterns.
 *
 * @see https://ddsl.app
 */

import { parse } from './parser';
import { expand } from './expander';
import type { ExpandOptions } from './expander';

// Re-export everything
export type {
  DomainNode,
  LabelNode,
  ElementNode,
  PrimaryNode,
  LiteralNode,
  CharClassNode,
  AlternationNode,
  GroupNode,
} from './types';

export { parse, prepare, ParseError } from './parser';
export { expand, preview, expansionSize, ExpansionError } from './expander';
export type { ExpandOptions, PreviewResult } from './expander';

/**
 * Parse and expand a DDSL expression in one step.
 *
 * @param expression - A valid DDSL v0.2 expression
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
 * ddsl('[a-z]{2,3}.ai');
 * // All 2 and 3 letter .ai domains
 * ```
 */
export function ddsl(expression: string, options?: ExpandOptions): string[] {
  return expand(parse(expression), options);
}
