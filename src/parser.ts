/**
 * DDSL v0.2 — Parser
 *
 * A recursive descent parser that transforms a DDSL expression string
 * into an AST (see types.ts). Implements the grammar from Section 7
 * of the specification.
 */

import type {
  DomainNode,
  LabelNode,
  ElementNode,
  PrimaryNode,
  LiteralNode,
  CharClassNode,
  AlternationNode,
  GroupNode,
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

/**
 * Prepare user input for parsing by stripping whitespace.
 * Use this in application code before calling parse().
 *
 * @example
 * ```ts
 * const cleaned = prepare('  {car, bike}.com  ');
 * const ast = parse(cleaned);
 * ```
 */
export function prepare(input: string): string {
  return input.replace(/\s+/g, '');
}

/**
 * Check if a label can produce empty strings (for validation).
 * A label is invalid if all elements are optional or can produce empty.
 */
function canProduceEmpty(elements: ElementNode[]): boolean {
  return elements.every(el => {
    if (el.optional) return true;
    const p = el.primary;
    if (p.type === 'charclass' && p.repetitionMin === 0) return true;
    if (p.type === 'group') return canProduceEmpty(p.elements);
    if (p.type === 'alternation') {
      return p.options.every(opt => canProduceEmpty(opt));
    }
    return false;
  });
}

export function parse(input: string): DomainNode {
  // Section 5.3: normalise to lowercase
  const src = input.toLowerCase();

  if (src.length === 0) {
    throw new ParseError('Empty expression', 0);
  }

  // Check for whitespace (Section 5.4)
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

  /** label = sequence ; */
  function parseLabel(): LabelNode {
    const startPos = pos;

    // Must have at least one element
    if (pos >= src.length || peek() === '.') {
      throw new ParseError('Empty label', pos);
    }

    const elements = parseSequence();

    if (elements.length === 0) {
      throw new ParseError('Empty label', startPos);
    }

    // Section 8: Label validity - must produce at least one character
    if (canProduceEmpty(elements)) {
      throw new ParseError(
        'Label must produce at least one character in every expansion branch',
        startPos,
      );
    }

    return { type: 'label', elements };
  }

  /** sequence = element, { element } ; */
  function parseSequence(): ElementNode[] {
    const elements: ElementNode[] = [];

    while (pos < src.length) {
      const ch = peek()!;
      // Stop at sequence terminators
      if (ch === '.' || ch === ',' || ch === ')' || ch === '}') {
        break;
      }
      elements.push(parseElement());
    }

    return elements;
  }

  /** element = primary, [ "?" ] ; */
  function parseElement(): ElementNode {
    const primary = parsePrimary();
    let optional = false;

    if (peek() === '?') {
      advance(); // consume '?'
      optional = true;
    }

    return { primary, optional };
  }

  /** primary = literal | char_class, repetition | alternation | group ; */
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

  /** group = "(", sequence, ")" ; */
  function parseGroup(): GroupNode {
    const start = pos;
    expect('(');

    const elements = parseSequence();

    if (elements.length === 0) {
      throw new ParseError('Empty group', start);
    }

    expect(')');

    return { type: 'group', elements };
  }

  /**
   * alternation = "{", sequence, { ",", sequence }, "}" ;
   */
  function parseAlternation(): AlternationNode {
    const start = pos;
    expect('{');

    const options: ElementNode[][] = [];

    // Parse first sequence
    const firstSeq = parseSequence();
    if (firstSeq.length === 0) {
      throw new ParseError('Empty alternation item', pos);
    }
    options.push(firstSeq);

    while (peek() === ',') {
      advance(); // consume ','
      const seq = parseSequence();
      if (seq.length === 0) {
        throw new ParseError('Empty alternation item', pos);
      }
      options.push(seq);
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

  /**
   * char_class  = "[", class_item, { class_item }, "]" ;
   * class_item  = letter | digit | letter, "-", letter | digit, "-", digit ;
   * (followed by)
   * repetition  = "{", number, "}" | "{", number, ",", number, "}" ;
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

    // Now parse repetition: {n} or {min,max}
    if (peek() !== '{') {
      throw new ParseError(
        'Character class must be followed by a repetition like {3} or {2,5}',
        pos,
      );
    }

    expect('{');
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

    let repetitionMin = parseInt(numStr, 10);
    let repetitionMax = repetitionMin;

    // Check for range: {min,max}
    if (peek() === ',') {
      advance(); // consume ','
      let maxStr = '';
      while (pos < src.length && peek() !== '}') {
        const ch = advance();
        if (!isDigit(ch)) {
          throw new ParseError(`Expected digit in repetition max, got '${ch}'`, pos - 1);
        }
        maxStr += ch;
      }
      if (maxStr.length === 0) {
        throw new ParseError('Empty repetition max (open-ended ranges not supported)', pos);
      }
      repetitionMax = parseInt(maxStr, 10);
    }

    expect('}');

    // Validate: 0 <= min <= max
    if (repetitionMin > repetitionMax) {
      throw new ParseError(
        `Invalid repetition range: min (${repetitionMin}) > max (${repetitionMax})`,
        start,
      );
    }

    return {
      type: 'charclass',
      chars: Array.from(charSet).sort(),
      repetitionMin,
      repetitionMax,
    };
  }

  const ast = parseDomain();

  // Ensure we consumed all input
  if (pos < src.length) {
    throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
  }

  return ast;
}
