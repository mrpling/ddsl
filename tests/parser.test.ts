import { describe, it, expect } from 'vitest';
import { parse, prepare, ParseError } from '../src/parser';

describe('parser', () => {
  describe('prepare utility', () => {
    it('strips spaces', () => {
      expect(prepare('  hello  ')).toBe('hello');
    });

    it('strips tabs and newlines', () => {
      expect(prepare('hello\tworld\n')).toBe('helloworld');
    });

    it('strips all whitespace', () => {
      expect(prepare('  { car , bike } . com  ')).toBe('{car,bike}.com');
    });
  });

  describe('literals', () => {
    it('parses simple literal', () => {
      const ast = parse('example.com');
      expect(ast.labels).toHaveLength(2);
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: 'example' });
      expect(ast.labels[0].elements[0].optional).toBe(false);
    });

    it('parses numeric domain', () => {
      const ast = parse('123.com');
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: '123' });
    });

    it('parses hyphenated domain', () => {
      const ast = parse('my-site.com');
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: 'my-site' });
    });
  });

  describe('alternation', () => {
    it('parses simple alternation', () => {
      const ast = parse('{car,bike}.com');
      expect(ast.labels[0].elements[0].primary.type).toBe('alternation');
      const alt = ast.labels[0].elements[0].primary as any;
      expect(alt.options).toHaveLength(2);
    });

    it('parses nested alternation', () => {
      const ast = parse('{smart{car,bike},fast{boat,plane}}.com');
      expect(ast.labels[0].elements[0].primary.type).toBe('alternation');
    });

    it('parses alternation with sequences', () => {
      const ast = parse('{foo[a-z]{2},bar}.com');
      const alt = ast.labels[0].elements[0].primary as any;
      expect(alt.options).toHaveLength(2);
      // First option has 2 elements: literal + charclass
      expect(alt.options[0]).toHaveLength(2);
    });

    it('rejects single-option alternation', () => {
      expect(() => parse('{car}.com')).toThrow(ParseError);
    });

    it('rejects empty alternation item', () => {
      expect(() => parse('{,car}.com')).toThrow(ParseError);
    });
  });

  describe('character class', () => {
    it('parses character class with fixed repetition', () => {
      const ast = parse('[a-z]{3}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.type).toBe('charclass');
      expect(cc.chars).toHaveLength(26);
      expect(cc.repetitionMin).toBe(3);
      expect(cc.repetitionMax).toBe(3);
    });

    it('parses character class with range repetition', () => {
      const ast = parse('[a-z]{2,4}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.repetitionMin).toBe(2);
      expect(cc.repetitionMax).toBe(4);
    });

    it('parses multiple ranges', () => {
      const ast = parse('[a-z0-9]{2}.com');
      const cc = ast.labels[0].elements[0].primary as any;
      expect(cc.chars).toHaveLength(36); // 26 + 10
    });

    it('rejects empty character class', () => {
      expect(() => parse('[]{3}.com')).toThrow(ParseError);
    });

    it('rejects missing repetition', () => {
      expect(() => parse('[a-z].com')).toThrow(ParseError);
    });

    it('rejects open-ended range', () => {
      expect(() => parse('[a-z]{3,}.com')).toThrow(ParseError);
    });

    it('rejects inverted range', () => {
      expect(() => parse('[a-z]{5,3}.com')).toThrow(ParseError);
    });
  });

  describe('grouping', () => {
    it('parses simple group', () => {
      const ast = parse('car(s).com');
      expect(ast.labels[0].elements).toHaveLength(2);
      expect(ast.labels[0].elements[1].primary.type).toBe('group');
    });

    it('parses group with multiple elements', () => {
      const ast = parse('(smart{car,bike}).com');
      const group = ast.labels[0].elements[0].primary as any;
      expect(group.type).toBe('group');
      expect(group.elements).toHaveLength(2);
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

    it('parses optional charclass', () => {
      const ast = parse('[0-9]{1}?-test.com');
      expect(ast.labels[0].elements[0].optional).toBe(true);
    });
  });

  describe('label validity (Section 8)', () => {
    it('rejects label with only optional elements', () => {
      expect(() => parse('(a)?.com')).toThrow(ParseError);
    });

    it('allows label with required + optional elements', () => {
      expect(() => parse('a(b)?.com')).not.toThrow();
    });

    it('rejects empty label', () => {
      expect(() => parse('.com')).toThrow(ParseError);
    });

    it('rejects double dot', () => {
      expect(() => parse('example..com')).toThrow(ParseError);
    });
  });

  describe('case normalization', () => {
    it('normalizes to lowercase', () => {
      const ast = parse('EXAMPLE.COM');
      expect(ast.labels[0].elements[0].primary).toEqual({ type: 'literal', value: 'example' });
    });

    it('normalizes alternation options', () => {
      const ast = parse('{CAR,BIKE}.COM');
      const alt = ast.labels[0].elements[0].primary as any;
      expect(alt.options[0][0].primary.value).toBe('car');
    });
  });

  describe('whitespace rejection', () => {
    it('rejects spaces', () => {
      expect(() => parse('hello world.com')).toThrow(ParseError);
    });

    it('rejects tabs', () => {
      expect(() => parse('hello\tworld.com')).toThrow(ParseError);
    });

    it('rejects newlines', () => {
      expect(() => parse('hello\nworld.com')).toThrow(ParseError);
    });
  });

  describe('spec examples (Section 10)', () => {
    it('10.1 literal', () => {
      expect(() => parse('example.com')).not.toThrow();
    });

    it('10.2 alternation', () => {
      expect(() => parse('{car,bike}.com')).not.toThrow();
    });

    it('10.3 character class with range', () => {
      expect(() => parse('[a-z]{3,4}.ai')).not.toThrow();
    });

    it('10.4 grouping and optional', () => {
      expect(() => parse('car(s)?.com')).not.toThrow();
    });

    it('10.5 nested alternation', () => {
      expect(() => parse('{smart{car,bike},fast{boat,plane}}.com')).not.toThrow();
    });

    it('10.6 prefix families', () => {
      expect(() => parse('{{pro,ultra}{car,bike},eco{car,bike}}.com')).not.toThrow();
    });

    it('10.7 mixing patterns and structured sequences', () => {
      expect(() => parse('{[a-z]{3},smart{car,bike}}.com')).not.toThrow();
    });

    it('10.8 combined real-world pattern', () => {
      expect(() => parse('{api,dev}(-v[0-9]{1})?.{ai,io}')).not.toThrow();
    });
  });
});
