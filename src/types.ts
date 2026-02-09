/**
 * DDSL v0.1 — AST Node Types
 *
 * These types mirror the formal grammar defined in Section 7
 * of the DDSL v0.1 specification.
 */

/** A complete DDSL expression: one or more labels separated by dots. */
export interface DomainNode {
  type: 'domain';
  labels: LabelNode[];
}

/** A single label: one or more elements concatenated. */
export interface LabelNode {
  type: 'label';
  elements: ElementNode[];
}

/** An element within a label. */
export type ElementNode = LiteralNode | CharClassNode | AlternationNode;

/** A fixed string of literal characters. */
export interface LiteralNode {
  type: 'literal';
  value: string;
}

/** A character class with fixed repetition, e.g. [a-z]{3} */
export interface CharClassNode {
  type: 'charclass';
  chars: string[];      // expanded list of individual characters
  repetition: number;
}

/** An alternation between literal options, e.g. {car,bike} */
export interface AlternationNode {
  type: 'alternation';
  options: string[];
}
