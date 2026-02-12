import { describe, it, expect } from 'vitest';
import { parse, parseDocument, prepareDocument } from '../src/parser';
import {
  expand,
  expandDocument,
  preview,
  expansionSize,
  documentExpansionSize,
  ExpansionError,
} from '../src/expander';

function ddsl(expr: string): string[] {
  return expand(parse(expr)).sort();
}

function ddslDoc(input: string): string[] {
  const lines = prepareDocument(input);
  const doc = parseDocument(lines);
  return expandDocument(doc).sort();
}

describe('expander', () => {
  describe('spec examples (Section 11)', () => {
    it('11.1 literal', () => {
      expect(ddsl('example.com')).toEqual(['example.com']);
    });

    it('11.2 alternation', () => {
      expect(ddsl('{car,bike}.com')).toEqual(['bike.com', 'car.com']);
    });

    it('11.3 character class with default repetition', () => {
      const result = ddsl('[a-z].ai');
      expect(result).toHaveLength(26);
      expect(result).toContain('a.ai');
      expect(result).toContain('z.ai');
    });

    it('11.4 character class with range', () => {
      const result = ddsl('[a-z]{3,4}.ai');
      expect(result).toHaveLength(26 ** 3 + 26 ** 4);
    });

    it('11.5 negated character class', () => {
      const result = ddsl('[^aeiou]{3}.com');
      // 31 chars (26 letters - 5 vowels + 10 digits = 31)
      expect(result).toHaveLength(31 ** 3);
    });

    it('11.6 grouping and optional', () => {
      expect(ddsl('car(s)?.com')).toEqual(['car.com', 'cars.com']);
    });

    it('11.7 group repetition', () => {
      expect(ddsl('(ab){2,3}.com')).toEqual(['abab.com', 'ababab.com']);
    });

    it('11.8 named character classes (CVC)', () => {
      const result = ddsl('[[:c:]][[:v:]][[:c:]].ai');
      // 21 consonants * 5 vowels * 21 consonants = 2205
      expect(result).toHaveLength(21 * 5 * 21);
    });

    it('11.9 mixed named and range classes', () => {
      const result = ddsl('[[:c:]0-9]{2}.io');
      // 21 consonants + 10 digits = 31
      expect(result).toHaveLength(31 ** 2);
    });

    it('11.10 negated named character class', () => {
      const result = ddsl('[^[:c:]]{2}.io');
      // universe (36) - consonants (21) = vowels + digits = 15
      expect(result).toHaveLength(15 ** 2);
    });

    it('11.11 nested alternation', () => {
      expect(ddsl('{smart{car,bike},fast{boat,plane}}.com')).toEqual([
        'fastboat.com',
        'fastplane.com',
        'smartbike.com',
        'smartcar.com',
      ]);
    });

    it('11.12 variables and multi-line document', () => {
      const result = ddslDoc(`
        @tlds = {com,net,org}
        @env = {dev,staging,prod}
        api.@env.example.@tlds
      `);
      // 3 envs * 3 tlds = 9
      expect(result).toHaveLength(9);
      expect(result).toContain('api.dev.example.com');
      expect(result).toContain('api.prod.example.org');
    });

    it('11.13 structured composition with variables', () => {
      const result = ddslDoc(`
        @tlds = {com,net}
        {smart{car,bike},fast{boat,plane}}.@tlds
      `);
      expect(result).toHaveLength(8);
      expect(result).toContain('smartcar.com');
      expect(result).toContain('fastplane.net');
    });

    it('11.14 combined features', () => {
      const result = ddslDoc(`
        @tlds = {ai,io}
        {api,dev}(-v[0-9]{1})?.@tlds
      `);
      // 2 bases * (1 + 10) * 2 tlds = 44
      expect(result).toHaveLength(44);
      expect(result).toContain('api.ai');
      expect(result).toContain('dev-v9.io');
    });
  });

  describe('document expansion', () => {
    it('unions multiple expressions', () => {
      const result = ddslDoc(`
        a.com
        b.com
      `);
      expect(result).toEqual(['a.com', 'b.com']);
    });

    it('deduplicates across expressions', () => {
      const result = ddslDoc(`
        a.com
        a.com
      `);
      expect(result).toEqual(['a.com']);
    });

    it('handles comments', () => {
      const result = ddslDoc(`
        # This is a comment
        a.com  # inline comment
      `);
      expect(result).toEqual(['a.com']);
    });
  });

  describe('v0.2 compatibility', () => {
    it('literal domain', () => {
      expect(ddsl('example.com')).toEqual(['example.com']);
    });

    it('simple alternation', () => {
      expect(ddsl('{car,bike,train}.com')).toEqual([
        'bike.com',
        'car.com',
        'train.com',
      ]);
    });

    it('character class with fixed repetition', () => {
      const result = ddsl('[a-z]{3}.ai');
      expect(result).toHaveLength(26 ** 3);
    });

    it('grouping and optional', () => {
      expect(ddsl('car(s)?.com')).toEqual(['car.com', 'cars.com']);
    });

    it('multi-label domain', () => {
      expect(ddsl('{api,dev}.{tools,cloud}')).toEqual([
        'api.cloud',
        'api.tools',
        'dev.cloud',
        'dev.tools',
      ]);
    });
  });

  describe('expansion size', () => {
    it('calculates literal size', () => {
      const ast = parse('example.com');
      expect(expansionSize(ast)).toBe(1);
    });

    it('calculates negated class size', () => {
      const ast = parse('[^aeiou]{3}.com');
      expect(expansionSize(ast)).toBe(31 ** 3);
    });

    it('calculates group repetition size', () => {
      const ast = parse('(ab){2,3}.com');
      expect(expansionSize(ast)).toBe(2); // ab*ab, ab*ab*ab
    });

    it('calculates document size', () => {
      const lines = prepareDocument('@tlds = {com,net}\na.@tlds\nb.@tlds');
      const doc = parseDocument(lines);
      expect(documentExpansionSize(doc)).toBe(4);
    });
  });

  describe('expansion limits', () => {
    it('throws when expansion exceeds limit', () => {
      const ast = parse('[a-z]{10}.com');
      expect(() => expand(ast, { maxExpansion: 1_000_000 }))
        .toThrow(ExpansionError);
    });

    it('allows expansion within limit', () => {
      const ast = parse('{car,bike}.com');
      expect(() => expand(ast, { maxExpansion: 10 })).not.toThrow();
    });
  });

  describe('preview function', () => {
    it('returns truncated results', () => {
      const ast = parse('[a-z]{3}.ai');
      const result = preview(ast, 100);
      expect(result.domains).toHaveLength(100);
      expect(result.total).toBe(26 ** 3);
      expect(result.truncated).toBe(true);
    });

    it('returns full results when under limit', () => {
      const ast = parse('{car,bike}.com');
      const result = preview(ast, 100);
      expect(result.domains).toHaveLength(2);
      expect(result.truncated).toBe(false);
    });
  });

  describe('deduplication', () => {
    it('removes duplicates from alternation', () => {
      expect(ddsl('{car,car}.com')).toEqual(['car.com']);
    });

    it('removes duplicates from optional', () => {
      const result = ddsl('car(car)?.com');
      expect(result).toContain('car.com');
      expect(result).toContain('carcar.com');
    });
  });

  describe('determinism', () => {
    it('same expression produces same set', () => {
      const a = ddsl('{fast,smart}{car,bike}.com');
      const b = ddsl('{fast,smart}{car,bike}.com');
      expect(a).toEqual(b);
    });
  });
});
