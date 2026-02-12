import { describe, it, expect } from 'vitest';
import { parse, parseDocument, prepare, prepareDocument, ParseError } from '../src/parser';

describe('parser', () => {
  describe('prepare utility', () => {
    it('strips spaces', () => {
      expect(prepare('  hello  ')).toBe('hello');
    });

    it('strips tabs and newlines', () => {
      expect(prepare('hello\tworld\n')).toBe('helloworld');
    });
  });

  describe('prepareDocument utility', () => {
    it('strips comments', () => {
      const lines = prepareDocument('example.com # comment');
      expect(lines).toEqual(['example.com']);
    });

    it('removes empty lines', () => {
      const lines = prepareDocument('a.com\n\nb.com');
      expect(lines).toEqual(['a.com', 'b.com']);
    });

    it('trims whitespace', () => {
      const lines = prepareDocument('  example.com  ');
      expect(lines).toEqual(['example.com']);
    });

    it('normalizes to lowercase', () => {
      const lines = prepareDocument('EXAMPLE.COM');
      expect(lines).toEqual(['example.com']);
    });

    it('handles full-line comments', () => {
      const lines = prepareDocument('# comment\nexample.com');
      expect(lines).toEqual(['example.com']);
    });
  });

  describe('literals', () => {
    it('parses simple literal', () => {
      const ast = parse('example.com');
      expect(ast.labels).toHaveLength(2);
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: 'example' });
    });

    it('parses numeric domain', () => {
      const ast = parse('123.com');
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: '123' });
    });
  });

  describe('alternation', () => {
    it('parses simple alternation', () => {
      const ast = parse('{car,bike}.com');
      expect(ast.labels[0].elements[0].primary.type).toBe('alternation');
    });

    it('parses nested alternation', () => {
      const ast = parse('{smart{car,bike},fast{boat,plane}}.com');
      expect(ast.labels[0].elements[0].primary.type).toBe('alternation');
    });

    it('rejects single-option alternation', () => {
      expect(() => parse('{car}.com')).toThrow(ParseError);
    });
  });

  describe('character class', () => {
    it('parses with fixed repetition', () => {
      const ast = parse('[a-z]{3}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.type).toBe('charclass');
      expect(cc.chars).toHaveLength(26);
      expect(cc.repetitionMin).toBe(3);
      expect(cc.repetitionMax).toBe(3);
    });

    it('parses with range repetition', () => {
      const ast = parse('[a-z]{2,4}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.repetitionMin).toBe(2);
      expect(cc.repetitionMax).toBe(4);
    });

    it('defaults repetition to {1}', () => {
      const ast = parse('[a-z].com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.repetitionMin).toBe(1);
      expect(cc.repetitionMax).toBe(1);
    });

    it('parses negated class', () => {
      const ast = parse('[^aeiou]{3}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.negated).toBe(true);
      expect(cc.chars).toHaveLength(31); // 36 - 5 vowels
    });

    it('parses named class [:v:]', () => {
      const ast = parse('[[:v:]]{2}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.chars).toEqual(['a', 'e', 'i', 'o', 'u']);
    });

    it('parses named class [:c:]', () => {
      const ast = parse('[[:c:]]{2}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.chars).toHaveLength(21);
    });

    it('parses mixed named and range classes', () => {
      const ast = parse('[[:c:]0-9]{2}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.chars).toHaveLength(31); // 21 consonants + 10 digits
    });

    it('parses negated named class', () => {
      const ast = parse('[^[:c:]]{2}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.negated).toBe(true);
      expect(cc.chars).toHaveLength(15); // 5 vowels + 10 digits
    });
  });

  describe('grouping', () => {
    it('parses simple group', () => {
      const ast = parse('car(s).com');
      expect(ast.labels[0].elements[1].primary.type).toBe('group');
    });

    it('parses group with repetition', () => {
      const ast = parse('(ab){2,3}.com');
      const group = ast.labels[0].elements[0].primary as any;
      expect(group.type).toBe('group');
      expect(group.repetitionMin).toBe(2);
      expect(group.repetitionMax).toBe(3);
    });

    it('rejects empty group', () => {
      expect(() => parse('car().com')).toThrow(ParseError);
    });
  });

  describe('optional operator', () => {
    it('parses optional group', () => {
      const ast = parse('car(s)?.com');
      expect(ast.labels[0].elements[1].optional).toBe(true);
    });

    it('parses optional alternation', () => {
      const ast = parse('({fast,smart})?car.com');
      expect(ast.labels[0].elements[0].optional).toBe(true);
    });
  });

  describe('document parsing', () => {
    it('parses variable definition', () => {
      const lines = prepareDocument('@tlds = {com,net}\nexample.@tlds');
      const doc = parseDocument(lines);
      expect(doc.variables).toHaveLength(1);
      expect(doc.variables[0].name).toBe('tlds');
      expect(doc.expressions).toHaveLength(1);
    });

    it('parses multiple expressions', () => {
      const lines = prepareDocument('a.com\nb.com');
      const doc = parseDocument(lines);
      expect(doc.expressions).toHaveLength(2);
    });

    it('rejects undefined variable', () => {
      const lines = prepareDocument('example.@undefined');
      expect(() => parseDocument(lines)).toThrow(ParseError);
    });

    it('rejects variable redefinition', () => {
      const lines = prepareDocument('@a = {com,net}\n@a = {org,io}');
      expect(() => parseDocument(lines)).toThrow(ParseError);
    });

    it('allows variable referencing previous variable', () => {
      const lines = prepareDocument('@a = {com,net}\n@b = @a\nexample.@b');
      expect(() => parseDocument(lines)).not.toThrow();
    });
  });

  describe('spec examples (Section 11)', () => {
    it('11.1 literal', () => {
      expect(() => parse('example.com')).not.toThrow();
    });

    it('11.2 alternation', () => {
      expect(() => parse('{car,bike}.com')).not.toThrow();
    });

    it('11.3 character class with default repetition', () => {
      expect(() => parse('[a-z].ai')).not.toThrow();
    });

    it('11.4 character class with range', () => {
      expect(() => parse('[a-z]{3,4}.ai')).not.toThrow();
    });

    it('11.5 negated character class', () => {
      expect(() => parse('[^aeiou]{3}.com')).not.toThrow();
    });

    it('11.6 grouping and optional', () => {
      expect(() => parse('car(s)?.com')).not.toThrow();
    });

    it('11.7 group repetition', () => {
      expect(() => parse('(ab){2,3}.com')).not.toThrow();
    });

    it('11.8 named character classes', () => {
      expect(() => parse('[[:c:]][[:v:]][[:c:]].ai')).not.toThrow();
    });

    it('11.9 mixed named and range classes', () => {
      expect(() => parse('[[:c:]0-9]{2}.io')).not.toThrow();
    });

    it('11.10 negated named character class', () => {
      expect(() => parse('[^[:c:]]{2}.io')).not.toThrow();
    });

    it('11.11 nested alternation', () => {
      expect(() => parse('{smart{car,bike},fast{boat,plane}}.com')).not.toThrow();
    });
  });
});
