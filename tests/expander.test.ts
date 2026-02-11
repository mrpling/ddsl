import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser';
import { expand, preview, expansionSize, ExpansionError } from '../src/expander';

/**
 * Helper: parse + expand, return sorted results for deterministic comparison.
 * Section 9.1: order is not defined, so we sort for testing.
 */
function ddsl(expr: string): string[] {
  return expand(parse(expr)).sort();
}

describe('expander', () => {
  describe('spec examples (Section 10)', () => {
    it('10.1 literal domain', () => {
      expect(ddsl('example.com')).toEqual(['example.com']);
    });

    it('10.2 alternation', () => {
      expect(ddsl('{car,bike}.com')).toEqual([
        'bike.com',
        'car.com',
      ]);
    });

    it('10.3 character class with range', () => {
      const result = ddsl('[a-z]{2,3}.ai');
      // 26^2 + 26^3 = 676 + 17576 = 18252
      expect(result).toHaveLength(26 ** 2 + 26 ** 3);
      expect(result).toContain('aa.ai');
      expect(result).toContain('zz.ai');
      expect(result).toContain('aaa.ai');
      expect(result).toContain('zzz.ai');
    });

    it('10.4 grouping and optional', () => {
      expect(ddsl('car(s)?.com')).toEqual([
        'car.com',
        'cars.com',
      ]);
    });

    it('10.5 nested alternation', () => {
      expect(ddsl('{smart{car,bike},fast{boat,plane}}.com')).toEqual([
        'fastboat.com',
        'fastplane.com',
        'smartbike.com',
        'smartcar.com',
      ]);
    });

    it('10.6 prefix families', () => {
      expect(ddsl('{{pro,ultra}{car,bike},eco{car,bike}}.com')).toEqual([
        'ecobike.com',
        'ecocar.com',
        'probike.com',
        'procar.com',
        'ultrabike.com',
        'ultracar.com',
      ]);
    });

    it('10.7 mixing patterns and structured sequences', () => {
      const result = ddsl('{[a-z]{2},smart{car,bike}}.com');
      // 26^2 = 676 two-letter domains + 2 structured = 678
      expect(result).toHaveLength(676 + 2);
      expect(result).toContain('aa.com');
      expect(result).toContain('smartcar.com');
      expect(result).toContain('smartbike.com');
    });

    it('10.8 combined real-world pattern', () => {
      const result = ddsl('{api,dev}(-v[0-9]{1})?.{ai,io}');
      // 2 bases * (1 + 10 versions) * 2 tlds = 2 * 11 * 2 = 44
      expect(result).toHaveLength(44);
      expect(result).toContain('api.ai');
      expect(result).toContain('api.io');
      expect(result).toContain('api-v0.ai');
      expect(result).toContain('dev-v9.io');
    });
  });

  describe('v0.1 compatibility', () => {
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
      expect(result).toContain('aaa.ai');
      expect(result).toContain('cat.ai');
    });

    it('combined structure in label', () => {
      expect(ddsl('{fast,smart}{car,bike}.com')).toEqual([
        'fastbike.com',
        'fastcar.com',
        'smartbike.com',
        'smartcar.com',
      ]);
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

  describe('output normalisation (Section 9.4)', () => {
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

  describe('deduplication (Section 5.2)', () => {
    it('removes duplicate alternation outputs', () => {
      expect(ddsl('{car,car}.com')).toEqual(['car.com']);
    });

    it('removes duplicates from optional branches', () => {
      // car + optional empty = car, car
      const result = ddsl('car(car)?.com');
      expect(result).toContain('car.com');
      expect(result).toContain('carcar.com');
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

    it('calculates nested alternation size', () => {
      const ast = parse('{smart{car,bike},fast{boat,plane}}.com');
      expect(expansionSize(ast)).toBe(4);
    });

    it('calculates charclass range size', () => {
      const ast = parse('[a-z]{2,3}.ai');
      expect(expansionSize(ast)).toBe(26 ** 2 + 26 ** 3);
    });

    it('calculates optional size', () => {
      const ast = parse('car(s)?.com');
      // car + (s or empty) = 2 options
      expect(expansionSize(ast)).toBe(2);
    });

    it('calculates complex expression size', () => {
      const ast = parse('{api,dev}(-v[0-9]{1})?.{ai,io}');
      // 2 * (1 + 10) * 2 = 44
      expect(expansionSize(ast)).toBe(44);
    });
  });

  describe('expansion limits (Section 9.3)', () => {
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
      const ast = parse('[a-z]{2}.[a-z]{2}.[a-z]{2}.com');
      expect(() => preview(ast, 10)).not.toThrow();
      const result = preview(ast, 10);
      expect(result.domains).toHaveLength(10);
      expect(result.total).toBe(26 ** 6);
      expect(result.truncated).toBe(true);
    });
  });

  describe('determinism (Section 9.1)', () => {
    it('same expression always produces same set', () => {
      const a = ddsl('{fast,smart}{car,bike}.com');
      const b = ddsl('{fast,smart}{car,bike}.com');
      expect(a).toEqual(b);
    });

    it('v0.2 expressions are deterministic', () => {
      const a = ddsl('car(s)?.com');
      const b = ddsl('car(s)?.com');
      expect(a).toEqual(b);
    });
  });
});
