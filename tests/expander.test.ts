import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser';
import { expand, preview, expansionSize, ExpansionError } from '../src/expander';

/**
 * Helper: parse + expand, return sorted results for deterministic comparison.
 * Section 8.1: order is not defined, so we sort for testing.
 */
function ddsl(expr: string): string[] {
  return expand(parse(expr)).sort();
}

describe('expander', () => {
  describe('spec examples (Section 6)', () => {
    it('6.1 literal domain', () => {
      expect(ddsl('example.com')).toEqual(['example.com']);
    });

    it('6.2 alternation', () => {
      expect(ddsl('{car,bike,train}.com')).toEqual([
        'bike.com',
        'car.com',
        'train.com',
      ]);
    });

    it('6.3 character class with repetition', () => {
      const result = ddsl('[a-z]{3}.ai');
      expect(result).toHaveLength(26 ** 3); // 17,576
      expect(result).toContain('aaa.ai');
      expect(result).toContain('zzz.ai');
      expect(result).toContain('cat.ai');
    });

    it('6.4 combined structure', () => {
      expect(ddsl('{fast,smart}{car,bike}.com')).toEqual([
        'fastbike.com',
        'fastcar.com',
        'smartbike.com',
        'smartcar.com',
      ]);
    });

    it('6.5 multi-label domain', () => {
      expect(ddsl('{api,dev}.{tools,cloud}')).toEqual([
        'api.cloud',
        'api.tools',
        'dev.cloud',
        'dev.tools',
      ]);
    });
  });

  describe('additional valid expressions (Section 9.1)', () => {
    it('numeric domain', () => {
      expect(ddsl('123.com')).toEqual(['123.com']);
    });

    it('hex-style domain', () => {
      expect(ddsl('0x.ai')).toEqual(['0x.ai']);
    });

    it('[a-z]{4}.ai produces correct count', () => {
      const result = ddsl('[a-z]{4}.ai');
      expect(result).toHaveLength(26 ** 4); // 456,976
    });
  });

  describe('output normalisation (Section 8.4)', () => {
    it('all output is lowercase', () => {
      const result = ddsl('EXAMPLE.COM');
      expect(result).toEqual(['example.com']);
    });

    it('no trailing dot', () => {
      const result = ddsl('example.com');
      expect(result.every(d => !d.endsWith('.'))).toBe(true);
    });

    it('uses dot as separator', () => {
      const result = ddsl('{api,dev}.{tools,cloud}');
      expect(result.every(d => d.includes('.'))).toBe(true);
    });
  });

  describe('expansion size', () => {
    it('calculates literal size', () => {
      const ast = parse('example.com');
      expect(expansionSize(ast)).toBe(1);
    });

    it('calculates alternation size', () => {
      const ast = parse('{car,bike,train}.com');
      expect(expansionSize(ast)).toBe(3);
    });

    it('calculates combined alternation size', () => {
      const ast = parse('{fast,smart}{car,bike}.com');
      expect(expansionSize(ast)).toBe(4);
    });

    it('calculates multi-label alternation size', () => {
      const ast = parse('{api,dev}.{tools,cloud}');
      expect(expansionSize(ast)).toBe(4);
    });

    it('calculates charclass size', () => {
      const ast = parse('[a-z]{3}.ai');
      expect(expansionSize(ast)).toBe(26 ** 3);
    });

    it('calculates large charclass size', () => {
      const ast = parse('[a-z]{10}.com');
      expect(expansionSize(ast)).toBe(26 ** 10);
    });

    it('deduplicates alternation options', () => {
      const ast = parse('{car,car}.com');
      expect(expansionSize(ast)).toBe(1);
    });
  });

  describe('expansion limits (Section 8.3)', () => {
    it('throws when expansion exceeds limit', () => {
      const ast = parse('[a-z]{10}.com');
      expect(() => expand(ast, { maxExpansion: 1_000_000 }))
        .toThrow(ExpansionError);
    });

    it('respects custom limit', () => {
      const ast = parse('[a-z]{3}.ai');
      expect(() => expand(ast, { maxExpansion: 100 }))
        .toThrow(ExpansionError);
    });

    it('allows expansion within limit', () => {
      const ast = parse('{car,bike}.com');
      expect(() => expand(ast, { maxExpansion: 10 })).not.toThrow();
    });

    it('disables limit with Infinity', () => {
      const ast = parse('[a-z]{3}.ai');
      expect(() => expand(ast, { maxExpansion: Infinity })).not.toThrow();
    });
  });

  describe('preview function', () => {
    it('returns truncated results with total count', () => {
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
      expect(result.total).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('handles large multi-label expressions', () => {
      // Note: preview() expands each label fully before capping the cartesian product,
      // so individual labels must fit in memory. Use multi-label expressions for large totals.
      const ast = parse('[a-z]{2}.[a-z]{2}.[a-z]{2}.com');
      expect(() => preview(ast, 10)).not.toThrow();
      const result = preview(ast, 10);
      expect(result.domains).toHaveLength(10);
      expect(result.total).toBe(26 ** 6); // 308,915,776
      expect(result.truncated).toBe(true);
    });
  });

  describe('determinism (Section 8.1)', () => {
    it('same expression always produces same set', () => {
      const a = ddsl('{fast,smart}{car,bike}.com');
      const b = ddsl('{fast,smart}{car,bike}.com');
      expect(a).toEqual(b);
    });
  });

  describe('set semantics (Section 8)', () => {
    it('removes duplicate alternation outputs', () => {
      expect(ddsl('{car,car}.com')).toEqual(['car.com']);
    });
  });
});
