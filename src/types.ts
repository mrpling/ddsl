/**
 * DDSL v0.3 — AST Node Types
 *
 * These types mirror the formal grammar defined in Section 7
 * of the DDSL v0.3 specification.
 */

/** A complete DDSL document with variable definitions and expressions. */
export interface DocumentNode {
  type: 'document';
  variables: VariableDefNode[];
  expressions: DomainNode[];
}

/** A variable definition: @name = sequence */
export interface VariableDefNode {
  type: 'vardef';
  name: string;
  elements: ElementNode[];
}

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
export type PrimaryNode = LiteralNode | CharClassNode | AlternationNode | GroupNode | VarRefNode;

/** A fixed string of literal characters. */
export interface LiteralNode {
  type: 'literal';
  value: string;
}

/**
 * A character class with optional negation and repetition.
 * Supports named classes [:v:] and [:c:] and negation [^...]
 */
export interface CharClassNode {
  type: 'charclass';
  chars: string[];           // expanded list of individual characters
  negated: boolean;          // true if [^...]
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
 * A group containing a sequence with optional repetition.
 * group = "(", sequence, ")", [ repetition ] ;
 */
export interface GroupNode {
  type: 'group';
  elements: ElementNode[];
  repetitionMin: number;
  repetitionMax: number;
}

/**
 * A variable reference: @name
 */
export interface VarRefNode {
  type: 'varref';
  name: string;
}
