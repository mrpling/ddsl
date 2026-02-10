/**
 * DDSL v0.1 — Parser
 *
 * A recursive descent parser that transforms a DDSL expression string
 * into an AST (see types.ts). Implements the grammar from Section 7
 * of the specification.
 */

import type {
  DomainNode,
  LabelNode,
  ElementNode,
  LiteralNode,
  CharClassNode,
  AlternationNode,
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

function isLetter(ch: string): boolean {
  return LETTER.test(ch);
}

function isDigit(ch: string): boolean {
  return DIGIT.test(ch);
}

function isLiteralChar(ch: string): boolean {
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

export function parse(input: string): DomainNode {
  // Strip all whitespace (spaces, tabs, newlines, etc.) and normalise to lowercase
  const src = input.replace(/\s+/g, '').toLowerCase();

  if (src.length === 0) {
    throw new ParseError('Empty expression', 0);
  }

  let pos = 0;

  function peek(): string | undefined {
    return src[pos];
  }

  function advance(): string {
    return src[pos++];
  }

  function expect(ch: string): void {
    if (pos >= src.length || src[pos] !== ch) {
      throw new ParseError(
        `Expected '${ch}' but found ${pos >= src.length ? 'end of input' : `'${src[pos]}'`}`,
        pos,
      );
    }
    pos++;
  }

  /** domain = label, { ".", label } ; */
  function parseDomain(): DomainNode {
    const labels: LabelNode[] = [];
    labels.push(parseLabel());

    while (pos < src.length && peek() === '.') {
      advance(); // consume '.'
      labels.push(parseLabel());
    }

    return { type: 'domain', labels };
  }

  /** label = element, { element } ; */
  function parseLabel(): LabelNode {
    const elements: ElementNode[] = [];

    // Must have at least one element
    if (pos >= src.length || peek() === '.') {
      throw new ParseError('Empty label', pos);
    }

    while (pos < src.length && peek() !== '.') {
      elements.push(parseElement());
    }

    if (elements.length === 0) {
      throw new ParseError('Empty label', pos);
    }

    return { type: 'label', elements };
  }

  /** element = literal | char_class, repetition | alternation ; */
  function parseElement(): ElementNode {
    const ch = peek();

    if (ch === '[') {
      return parseCharClass();
    }

    if (ch === '{') {
      return parseAlternation();
    }

    if (ch !== undefined && isLiteralChar(ch)) {
      return parseLiteral();
    }

    throw new ParseError(
      `Unexpected character '${ch}'`,
      pos,
    );
  }

  /** literal = literal_char, { literal_char } ; */
  function parseLiteral(): LiteralNode {
    const start = pos;
    let value = '';

    while (pos < src.length) {
      const ch = peek()!;
      if (isLiteralChar(ch)) {
        value += advance();
      } else {
        break;
      }
    }

    if (value.length === 0) {
      throw new ParseError('Expected literal', start);
    }

    return { type: 'literal', value };
  }

  /**
   * alternation = "{", alt_item, { ",", alt_item }, "}" ;
   * alt_item    = literal ;
   */
  function parseAlternation(): AlternationNode {
    const start = pos;
    expect('{');

    const options: string[] = [];

    // Parse first alt_item
    options.push(parseAltItem());

    while (peek() === ',') {
      advance(); // consume ','
      options.push(parseAltItem());
    }

    expect('}');

    if (options.length < 2) {
      throw new ParseError(
        'Alternation must have at least two options',
        start,
      );
    }

    return { type: 'alternation', options };
  }

  /** alt_item = literal ; (returns just the string value) */
  function parseAltItem(): string {
    let value = '';
    while (pos < src.length) {
      const ch = peek()!;
      if (isLiteralChar(ch)) {
        value += advance();
      } else {
        break;
      }
    }
    if (value.length === 0) {
      throw new ParseError('Empty alternation item', pos);
    }
    return value;
  }

  /**
   * char_class  = "[", class_item, { class_item }, "]" ;
   * class_item  = letter | digit | letter, "-", letter | digit, "-", digit ;
   * (followed by)
   * repetition  = "{", number, "}" ;
   */
  function parseCharClass(): CharClassNode {
    const start = pos;
    expect('[');

    const charSet = new Set<string>();

    if (peek() === ']') {
      throw new ParseError('Empty character class', pos);
    }

    while (pos < src.length && peek() !== ']') {
      const ch = advance();

      if (!isLetter(ch) && !isDigit(ch)) {
        throw new ParseError(
          `Invalid character in character class: '${ch}'`,
          pos - 1,
        );
      }

      // Look ahead for a range: a-z or 0-9
      if (peek() === '-' && pos + 1 < src.length && src[pos + 1] !== ']') {
        advance(); // consume '-'
        const end = advance();

        // Both must be same type (letter-letter or digit-digit)
        if (isLetter(ch) && isLetter(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else if (isDigit(ch) && isDigit(end)) {
          for (const c of expandRange(ch, end)) {
            charSet.add(c);
          }
        } else {
          throw new ParseError(
            `Invalid range: '${ch}-${end}' (must be letter-letter or digit-digit)`,
            start,
          );
        }
      } else {
        charSet.add(ch);
      }
    }

    expect(']');

    // Now parse repetition: {n}
    if (peek() !== '{') {
      throw new ParseError(
        'Character class must be followed by a repetition like {3}',
        pos,
      );
    }

    expect('{');
    let numStr = '';
    while (pos < src.length && peek() !== '}') {
      const ch = advance();
      if (!isDigit(ch)) {
        throw new ParseError(`Expected digit in repetition, got '${ch}'`, pos - 1);
      }
      numStr += ch;
    }
    expect('}');

    if (numStr.length === 0) {
      throw new ParseError('Empty repetition count', pos);
    }

    const repetition = parseInt(numStr, 10);
    if (repetition === 0) {
      throw new ParseError('Repetition count must be at least 1', pos);
    }

    return {
      type: 'charclass',
      chars: Array.from(charSet).sort(),
      repetition,
    };
  }

  const ast = parseDomain();

  // Ensure we consumed all input
  if (pos < src.length) {
    throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
  }

  return ast;
}
