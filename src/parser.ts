/**
 * DDSL v0.3 — Parser
 *
 * A recursive descent parser that transforms a DDSL expression string
 * into an AST (see types.ts). Implements the grammar from Section 7
 * of the specification.
 */

import type {
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

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(`Parse error at position ${position}: ${message}`);
    this.name = 'ParseError';
  }
}

const LETTER = /^[a-z]$/;
const DIGIT = /^[0-9]$/;

// Character class universe (Section 5.5)
const VOWELS = ['a', 'e', 'i', 'o', 'u'];
const CONSONANTS = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z'];
const UNIVERSE = [...'abcdefghijklmnopqrstuvwxyz0123456789'];

function isLetter(ch: string): boolean {
  return LETTER.test(ch);
}

function isDigit(ch: string): boolean {
  return DIGIT.test(ch);
}

function isLiteralChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === '-';
}

function isVarNameChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === '-';
}

/**
 * Expand a character range like 'a'-'z' or '0'-'9' into an array of
 * individual characters.
 */
function expandRange(start: string, end: string): string[] {
  const s = start.charCodeAt(0);
  const e = end.charCodeAt(0);
  if (s > e) {
    throw new Error(`Invalid range: ${start}-${end}`);
  }
  const result: string[] = [];
  for (let i = s; i <= e; i++) {
    result.push(String.fromCharCode(i));
  }
  return result;
}

/**
 * Prepare user input for parsing by stripping whitespace.
 * Use this in application code before calling parse().
 */
export function prepare(input: string): string {
  return input.replace(/\s+/g, '');
}

/**
 * Prepare a multi-line document for parsing.
 * Strips comments, trims lines, removes empty lines, normalizes case.
 */
export function prepareDocument(input: string): string[] {
  return input
    .split('\n')
    .map(line => {
      // Strip comments
      const commentIdx = line.indexOf('#');
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx);
      }
      // Trim whitespace
      return line.trim().toLowerCase();
    })
    .filter(line => line.length > 0);
}

/**
 * Check if a label can produce empty strings (for validation).
 */
function canProduceEmpty(elements: ElementNode[]): boolean {
  return elements.every(el => {
    if (el.optional) return true;
    const p = el.primary;
    if (p.type === 'charclass' && p.repetitionMin === 0) return true;
    if (p.type === 'group') {
      if (p.repetitionMin === 0) return true;
      return canProduceEmpty(p.elements);
    }
    if (p.type === 'alternation') {
      return p.options.some(opt => canProduceEmpty(opt));
    }
    return false;
  });
}

/**
 * Substitute variable references in a line using already-defined variables.
 * This is a purely textual substitution, per v0.3 spec.
 */
function substituteVariables(line: string, varStrings: Map<string, string>): string {
  let result = '';
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (ch !== '@') {
      result += ch;
      i++;
      continue;
    }

    // Consume '@' and variable name
    i++;
    let name = '';
    while (i < line.length && isVarNameChar(line[i])) {
      name += line[i];
      i++;
    }

    if (name.length === 0) {
      throw new ParseError('Empty variable name', i);
    }

    const value = varStrings.get(name);
    if (value === undefined) {
      throw new ParseError(`Undefined variable @${name}`, i);
    }

    result += value;
  }

  return result;
}

/**
 * Parse a multi-line DDSL document.
 */
export function parseDocument(lines: string[]): DocumentNode {
  const variables: VariableDefNode[] = [];
  const expressions: DomainNode[] = [];
  const varStrings = new Map<string, string>();

  for (const line of lines) {
    if (line.startsWith('@')) {
      // Variable definition
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        // Could be a variable reference at start of expression
        const substituted = substituteVariables(line, varStrings);
        const domain = parseExpression(substituted, new Map());
        expressions.push(domain);
      } else {
        const name = line.slice(1, eqIdx).trim().toLowerCase();
        const value = line.slice(eqIdx + 1).trim();

        if (name.length === 0) {
          throw new ParseError('Empty variable name', 0);
        }

        if (varStrings.has(name)) {
          throw new ParseError(`Variable @${name} is already defined`, 0);
        }

        const substituted = substituteVariables(value, varStrings);
        if (substituted.length === 0) {
          throw new ParseError('Empty variable definition', 0);
        }

        // Parse the value as a sequence (after textual substitution)
        const elements = parseSequenceString(substituted, new Map());

        varStrings.set(name, substituted);
        variables.push({ type: 'vardef', name, elements });
      }
    } else {
      // Expression
      const substituted = substituteVariables(line, varStrings);
      const domain = parseExpression(substituted, new Map());
      expressions.push(domain);
    }
  }

  return { type: 'document', variables, expressions };
}

/**
 * Parse a sequence string (used for variable values).
 */
function parseSequenceString(input: string, varMap: Map<string, ElementNode[]>): ElementNode[] {
  const src = input.toLowerCase();

  if (/\s/.test(src)) {
    const pos = src.search(/\s/);
    throw new ParseError('Whitespace is not permitted', pos);
  }

  let pos = 0;

  function peek(): string | undefined {
    return src[pos];
  }

  function advance(): string {
    return src[pos++];
  }

  // Lookahead to check if '{' starts a repetition ({digits} or {digits,digits})
  function isRepetitionAhead(): boolean {
    if (src[pos] !== '{') return false;
    let i = pos + 1;
    if (i >= src.length || !isDigit(src[i])) return false;
    while (i < src.length && isDigit(src[i])) i++;
    if (i >= src.length) return false;
    if (src[i] === '}') return true;
    if (src[i] !== ',') return false;
    i++;
    if (i >= src.length || !isDigit(src[i])) return false;
    while (i < src.length && isDigit(src[i])) i++;
    return i < src.length && src[i] === '}';
  }

  const elements = parseSequenceInner();

  if (pos < src.length) {
    throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
  }

  return elements;

  function parseSequenceInner(): ElementNode[] {
    const elements: ElementNode[] = [];

    while (pos < src.length) {
      const ch = peek()!;
      if (ch === '.' || ch === ',' || ch === ')' || ch === '}') {
        break;
      }
      elements.push(parseElement());
    }

    return elements;
  }

  function parseElement(): ElementNode {
    const primary = parsePrimary();
    let optional = false;

    if (peek() === '?') {
      advance();
      optional = true;
    }

    return { primary, optional };
  }

  function parsePrimary(): PrimaryNode {
    const ch = peek();

    if (ch === '[') {
      return parseCharClass();
    }

    if (ch === '{') {
      return parseAlternation();
    }

    if (ch === '(') {
      return parseGroup();
    }

    if (ch === '@') {
      return parseVarRef();
    }

    if (ch !== undefined && isLiteralChar(ch)) {
      return parseLiteral();
    }

    throw new ParseError(`Unexpected character '${ch}'`, pos);
  }

  function parseLiteral(): LiteralNode {
    let value = '';
    while (pos < src.length) {
      const ch = peek()!;
      if (isLiteralChar(ch)) {
        value += advance();
      } else {
        break;
      }
    }
    return { type: 'literal', value };
  }

  function parseVarRef(): VarRefNode {
    advance(); // consume '@'
    let name = '';
    while (pos < src.length && isVarNameChar(peek()!)) {
      name += advance();
    }
    if (name.length === 0) {
      throw new ParseError('Empty variable name', pos);
    }
    if (!varMap.has(name)) {
      throw new ParseError(`Undefined variable @${name}`, pos);
    }
    return { type: 'varref', name };
  }

  function parseGroup(): GroupNode {
    const start = pos;
    advance(); // consume '('

    const elements = parseSequenceInner();

    if (elements.length === 0) {
      throw new ParseError('Empty group', start);
    }

    if (peek() !== ')') {
      throw new ParseError(`Expected ')' but found ${peek() ?? 'end of input'}`, pos);
    }
    advance(); // consume ')'

    // Check for repetition (only if { is followed by digits pattern)
    let repetitionMin = 1;
    let repetitionMax = 1;

    if (isRepetitionAhead()) {
      const rep = parseRepetition();
      repetitionMin = rep.min;
      repetitionMax = rep.max;
    }

    return { type: 'group', elements, repetitionMin, repetitionMax };
  }

  function parseAlternation(): AlternationNode {
    const start = pos;
    advance(); // consume '{'

    const options: ElementNode[][] = [];

    const firstSeq = parseSequenceInner();
    if (firstSeq.length === 0) {
      throw new ParseError('Empty alternation item', pos);
    }
    options.push(firstSeq);

    while (peek() === ',') {
      advance();
      const seq = parseSequenceInner();
      if (seq.length === 0) {
        throw new ParseError('Empty alternation item', pos);
      }
      options.push(seq);
    }

    if (peek() !== '}') {
      throw new ParseError(`Expected '}' but found ${peek() ?? 'end of input'}`, pos);
    }
    advance();

    if (options.length < 2) {
      throw new ParseError('Alternation must have at least two options', start);
    }

    return { type: 'alternation', options };
  }

  function parseCharClass(): CharClassNode {
    const start = pos;
    advance(); // consume '['

    let negated = false;
    if (peek() === '^') {
      negated = true;
      advance();
    }

    const charSet = new Set<string>();

    if (peek() === ']') {
      throw new ParseError('Empty character class', pos);
    }

    while (pos < src.length && peek() !== ']') {
      // Check for named class [:v:] or [:c:]
      if (peek() === '[' && pos + 1 < src.length && src[pos + 1] === ':') {
        advance(); // consume '['
        advance(); // consume ':'

        let className = '';
        while (pos < src.length && peek() !== ':') {
          className += advance();
        }

        if (peek() !== ':' || src[pos + 1] !== ']') {
          throw new ParseError('Invalid named class syntax', pos);
        }
        advance(); // consume ':'
        advance(); // consume ']'

        if (className === 'v') {
          VOWELS.forEach(c => charSet.add(c));
        } else if (className === 'c') {
          CONSONANTS.forEach(c => charSet.add(c));
        } else {
          throw new ParseError(`Unknown named class [:${className}:]`, start);
        }
        continue;
      }

      const ch = advance();

      if (!isLetter(ch) && !isDigit(ch)) {
        throw new ParseError(`Invalid character in character class: '${ch}'`, pos - 1);
      }

      // Look ahead for a range
      if (peek() === '-' && pos + 1 < src.length && src[pos + 1] !== ']') {
        advance(); // consume '-'
        const end = advance();

        if (isLetter(ch) && isLetter(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else if (isDigit(ch) && isDigit(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else {
          throw new ParseError(`Invalid range: '${ch}-${end}'`, start);
        }
      } else {
        charSet.add(ch);
      }
    }

    if (peek() !== ']') {
      throw new ParseError('Unterminated character class', start);
    }
    advance(); // consume ']'

    // Apply negation if needed
    let chars: string[];
    if (negated) {
      chars = UNIVERSE.filter(c => !charSet.has(c));
    } else {
      chars = Array.from(charSet);
    }
    chars.sort();

    // Check for repetition (only if { is followed by digits pattern)
    let repetitionMin = 1;
    let repetitionMax = 1;

    if (isRepetitionAhead()) {
      const rep = parseRepetition();
      repetitionMin = rep.min;
      repetitionMax = rep.max;
    }

    return { type: 'charclass', chars, negated, repetitionMin, repetitionMax };
  }

  function parseRepetition(): { min: number; max: number } {
    const start = pos;
    advance(); // consume '{'

    let numStr = '';
    while (pos < src.length && peek() !== '}' && peek() !== ',') {
      const ch = advance();
      if (!isDigit(ch)) {
        throw new ParseError(`Expected digit in repetition, got '${ch}'`, pos - 1);
      }
      numStr += ch;
    }

    if (numStr.length === 0) {
      throw new ParseError('Empty repetition count', pos);
    }

    let min = parseInt(numStr, 10);
    let max = min;

    if (peek() === ',') {
      advance();
      let maxStr = '';
      while (pos < src.length && peek() !== '}') {
        const ch = advance();
        if (!isDigit(ch)) {
          throw new ParseError(`Expected digit in repetition max, got '${ch}'`, pos - 1);
        }
        maxStr += ch;
      }
      if (maxStr.length === 0) {
        throw new ParseError('Empty repetition max', pos);
      }
      max = parseInt(maxStr, 10);
    }

    if (peek() !== '}') {
      throw new ParseError('Unterminated repetition', start);
    }
    advance();

    if (min > max) {
      throw new ParseError(`Invalid repetition range: min (${min}) > max (${max})`, start);
    }

    return { min, max };
  }
}

/**
 * Parse a single DDSL expression with variable map.
 */
function parseExpression(input: string, varMap: Map<string, ElementNode[]>): DomainNode {
  const src = input.toLowerCase();

  if (src.length === 0) {
    throw new ParseError('Empty expression', 0);
  }

  if (/\s/.test(src)) {
    const pos = src.search(/\s/);
    throw new ParseError('Whitespace is not permitted', pos);
  }

  let pos = 0;

  function peek(): string | undefined {
    return src[pos];
  }

  function advance(): string {
    return src[pos++];
  }

  // Lookahead to check if '{' starts a repetition ({digits} or {digits,digits})
  function isRepetitionAhead(): boolean {
    if (src[pos] !== '{') return false;
    let i = pos + 1;
    if (i >= src.length || !isDigit(src[i])) return false;
    while (i < src.length && isDigit(src[i])) i++;
    if (i >= src.length) return false;
    if (src[i] === '}') return true;
    if (src[i] !== ',') return false;
    i++;
    if (i >= src.length || !isDigit(src[i])) return false;
    while (i < src.length && isDigit(src[i])) i++;
    return i < src.length && src[i] === '}';
  }

  function parseDomain(): DomainNode {
    const labels: LabelNode[] = [];
    labels.push(parseLabel());

    while (pos < src.length && peek() === '.') {
      advance();
      labels.push(parseLabel());
    }

    return { type: 'domain', labels };
  }

  function parseLabel(): LabelNode {
    const startPos = pos;

    if (pos >= src.length || peek() === '.') {
      throw new ParseError('Empty label', pos);
    }

    const elements = parseSequence();

    if (elements.length === 0) {
      throw new ParseError('Empty label', startPos);
    }

    if (canProduceEmpty(elements)) {
      throw new ParseError(
        'Label must produce at least one character in every expansion branch',
        startPos,
      );
    }

    return { type: 'label', elements };
  }

  function parseSequence(): ElementNode[] {
    const elements: ElementNode[] = [];

    while (pos < src.length) {
      const ch = peek()!;
      if (ch === '.' || ch === ',' || ch === ')' || ch === '}') {
        break;
      }
      elements.push(parseElement());
    }

    return elements;
  }

  function parseElement(): ElementNode {
    const primary = parsePrimary();
    let optional = false;

    if (peek() === '?') {
      advance();
      optional = true;
    }

    return { primary, optional };
  }

  function parsePrimary(): PrimaryNode {
    const ch = peek();

    if (ch === '[') {
      return parseCharClass();
    }

    if (ch === '{') {
      return parseAlternation();
    }

    if (ch === '(') {
      return parseGroup();
    }

    if (ch === '@') {
      return parseVarRef();
    }

    if (ch !== undefined && isLiteralChar(ch)) {
      return parseLiteral();
    }

    throw new ParseError(`Unexpected character '${ch}'`, pos);
  }

  function parseLiteral(): LiteralNode {
    let value = '';
    while (pos < src.length) {
      const ch = peek()!;
      if (isLiteralChar(ch)) {
        value += advance();
      } else {
        break;
      }
    }
    return { type: 'literal', value };
  }

  function parseVarRef(): VarRefNode {
    advance(); // consume '@'
    let name = '';
    while (pos < src.length && isVarNameChar(peek()!)) {
      name += advance();
    }
    if (name.length === 0) {
      throw new ParseError('Empty variable name', pos);
    }
    if (!varMap.has(name)) {
      throw new ParseError(`Undefined variable @${name}`, pos);
    }
    return { type: 'varref', name };
  }

  function parseGroup(): GroupNode {
    const start = pos;
    advance(); // consume '('

    const elements = parseSequence();

    if (elements.length === 0) {
      throw new ParseError('Empty group', start);
    }

    if (peek() !== ')') {
      throw new ParseError(`Expected ')' but found ${peek() ?? 'end of input'}`, pos);
    }
    advance();

    let repetitionMin = 1;
    let repetitionMax = 1;

    if (isRepetitionAhead()) {
      const rep = parseRepetition();
      repetitionMin = rep.min;
      repetitionMax = rep.max;
    }

    return { type: 'group', elements, repetitionMin, repetitionMax };
  }

  function parseAlternation(): AlternationNode {
    const start = pos;
    advance(); // consume '{'

    const options: ElementNode[][] = [];

    const firstSeq = parseSequence();
    if (firstSeq.length === 0) {
      throw new ParseError('Empty alternation item', pos);
    }
    options.push(firstSeq);

    while (peek() === ',') {
      advance();
      const seq = parseSequence();
      if (seq.length === 0) {
        throw new ParseError('Empty alternation item', pos);
      }
      options.push(seq);
    }

    if (peek() !== '}') {
      throw new ParseError(`Expected '}' but found ${peek() ?? 'end of input'}`, pos);
    }
    advance();

    if (options.length < 2) {
      throw new ParseError('Alternation must have at least two options', start);
    }

    return { type: 'alternation', options };
  }

  function parseCharClass(): CharClassNode {
    const start = pos;
    advance(); // consume '['

    let negated = false;
    if (peek() === '^') {
      negated = true;
      advance();
    }

    const charSet = new Set<string>();

    if (peek() === ']') {
      throw new ParseError('Empty character class', pos);
    }

    while (pos < src.length && peek() !== ']') {
      // Check for named class [:v:] or [:c:]
      if (peek() === '[' && pos + 1 < src.length && src[pos + 1] === ':') {
        advance(); // consume '['
        advance(); // consume ':'

        let className = '';
        while (pos < src.length && peek() !== ':') {
          className += advance();
        }

        if (peek() !== ':' || src[pos + 1] !== ']') {
          throw new ParseError('Invalid named class syntax', pos);
        }
        advance(); // consume ':'
        advance(); // consume ']'

        if (className === 'v') {
          VOWELS.forEach(c => charSet.add(c));
        } else if (className === 'c') {
          CONSONANTS.forEach(c => charSet.add(c));
        } else {
          throw new ParseError(`Unknown named class [:${className}:]`, start);
        }
        continue;
      }

      const ch = advance();

      if (!isLetter(ch) && !isDigit(ch)) {
        throw new ParseError(`Invalid character in character class: '${ch}'`, pos - 1);
      }

      if (peek() === '-' && pos + 1 < src.length && src[pos + 1] !== ']') {
        advance(); // consume '-'
        const end = advance();

        if (isLetter(ch) && isLetter(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else if (isDigit(ch) && isDigit(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else {
          throw new ParseError(`Invalid range: '${ch}-${end}'`, start);
        }
      } else {
        charSet.add(ch);
      }
    }

    if (peek() !== ']') {
      throw new ParseError('Unterminated character class', start);
    }
    advance();

    let chars: string[];
    if (negated) {
      chars = UNIVERSE.filter(c => !charSet.has(c));
    } else {
      chars = Array.from(charSet);
    }
    chars.sort();

    let repetitionMin = 1;
    let repetitionMax = 1;

    if (isRepetitionAhead()) {
      const rep = parseRepetition();
      repetitionMin = rep.min;
      repetitionMax = rep.max;
    }

    return { type: 'charclass', chars, negated, repetitionMin, repetitionMax };
  }

  function parseRepetition(): { min: number; max: number } {
    const start = pos;
    advance(); // consume '{'

    let numStr = '';
    while (pos < src.length && peek() !== '}' && peek() !== ',') {
      const ch = advance();
      if (!isDigit(ch)) {
        throw new ParseError(`Expected digit in repetition, got '${ch}'`, pos - 1);
      }
      numStr += ch;
    }

    if (numStr.length === 0) {
      throw new ParseError('Empty repetition count', pos);
    }

    let min = parseInt(numStr, 10);
    let max = min;

    if (peek() === ',') {
      advance();
      let maxStr = '';
      while (pos < src.length && peek() !== '}') {
        const ch = advance();
        if (!isDigit(ch)) {
          throw new ParseError(`Expected digit in repetition max, got '${ch}'`, pos - 1);
        }
        maxStr += ch;
      }
      if (maxStr.length === 0) {
        throw new ParseError('Empty repetition max', pos);
      }
      max = parseInt(maxStr, 10);
    }

    if (peek() !== '}') {
      throw new ParseError('Unterminated repetition', start);
    }
    advance();

    if (min > max) {
      throw new ParseError(`Invalid repetition range: min (${min}) > max (${max})`, start);
    }

    return { min, max };
  }

  const ast = parseDomain();

  if (pos < src.length) {
    throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
  }

  return ast;
}

/**
 * Parse a single DDSL expression (no variables).
 */
export function parse(input: string): DomainNode {
  return parseExpression(input, new Map());
}
