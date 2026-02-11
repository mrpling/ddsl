/**
 * DDSL v0.2 — AST Node Types
 *
 * These types mirror the formal grammar defined in Section 7
 * of the DDSL v0.2 specification.
 */

/** A complete DDSL expression: one or more labels separated by dots. */
export interface DomainNode {
  type: 'domain';
  labels: LabelNode[];
}

/** A single label: a sequence of elements concatenated. */
export interface LabelNode {
  type: 'label';
  elements: ElementNode[];
}

/**
 * An element within a label.
 * element = primary, [ "?" ] ;
 */
export interface ElementNode {
  primary: PrimaryNode;
  optional: boolean;
}

/** A primary element (before optional ? is applied). */
export type PrimaryNode = LiteralNode | CharClassNode | AlternationNode | GroupNode;

/** A fixed string of literal characters. */
export interface LiteralNode {
  type: 'literal';
  value: string;
}

/**
 * A character class with repetition, e.g. [a-z]{3} or [a-z]{3,5}
 * repetition = "{", number, "}" | "{", number, ",", number, "}" ;
 */
export interface CharClassNode {
  type: 'charclass';
  chars: string[];           // expanded list of individual characters
  repetitionMin: number;
  repetitionMax: number;
}

/**
 * An alternation between sequences, e.g. {car,bike} or {smart{car,bike},fast}
 * alternation = "{", sequence, { ",", sequence }, "}" ;
 */
export interface AlternationNode {
  type: 'alternation';
  options: ElementNode[][];  // each option is a sequence of elements
}

/**
 * A group containing a sequence, e.g. (abc) or (smart{car,bike})
 * group = "(", sequence, ")" ;
 */
export interface GroupNode {
  type: 'group';
  elements: ElementNode[];
}
