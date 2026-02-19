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

  describe('repetition vs alternation disambiguation', () => {
    it('charclass followed by alternation', () => {
      // [ab]{cd,ef} → charclass {1} + alternation
      expect(ddsl('[ab]{cd,ef}.com')).toEqual([
        'acd.com', 'aef.com', 'bcd.com', 'bef.com',
      ].sort());
    });

    it('group followed by alternation', () => {
      // (ab){cd,ef} → group + alternation
      expect(ddsl('(ab){cd,ef}.com')).toEqual(['abcd.com', 'abef.com']);
    });

    it('charclass with repetition then alternation', () => {
      // [ab]{2}{cd,ef} → charclass rep 2 + alternation
      const result = ddsl('[ab]{2}{cd,ef}.com');
      expect(result).toHaveLength(8); // 4 pairs * 2 alternates
      expect(result).toContain('aacd.com');
      expect(result).toContain('abef.com');
      expect(result).toContain('bbcd.com');
    });

    it('group with repetition then alternation', () => {
      // (ab){2}{cd,ef} → group rep 2 + alternation
      expect(ddsl('(ab){2}{cd,ef}.com')).toEqual(['ababcd.com', 'ababef.com']);
    });

    it('direct expression matches variable-substituted equivalent', () => {
      // Direct: [ab]{cd,ef}.com
      const direct = ddsl('[ab]{cd,ef}.com');

      // Via variables: @a@b.com where @a=[ab], @b={cd,ef}
      const viaVars = ddslDoc(`
        @a = [ab]
        @b = {cd,ef}
        @a@b.com
      `);

      expect(direct).toEqual(viaVars);
    });

    it('variable order produces correct different results', () => {
      // @a@b → [ab]{cd,ef} → charclass + alternation
      const ab = ddslDoc(`
        @a = [ab]
        @b = {cd,ef}
        @a@b.com
      `);

      // @b@a → {cd,ef}[ab] → alternation + charclass
      const ba = ddslDoc(`
        @a = [ab]
        @b = {cd,ef}
        @b@a.com
      `);

      // Both valid but different results
      expect(ab).toContain('acd.com');  // [ab] then {cd,ef}
      expect(ba).toContain('cda.com');  // {cd,ef} then [ab]
      expect(ab).not.toEqual(ba);
    });

    it('CVC prefix followed by keyword alternation (original bug)', () => {
      const result = ddslDoc(`
        @prefix = [[:c:]][[:v:]][[:c:]]
        @keywords = {agent,lab}
        @prefix@keywords.com
      `);
      // 21*5*21 CVC combos * 2 keywords = 4410
      expect(result).toHaveLength(21 * 5 * 21 * 2);
      expect(result).toContain('bavagent.com');
      expect(result).toContain('bavlab.com');
    });
  });

  describe('standalone named classes', () => {
    it('[:v:] expands to 5 single-vowel domains', () => {
      const result = ddsl('[:v:].ai');
      expect(result).toHaveLength(5);
      expect(result).toContain('a.ai');
      expect(result).toContain('e.ai');
      expect(result).toContain('u.ai');
    });

    it('[:c:] expands to 21 single-consonant domains', () => {
      const result = ddsl('[:c:].ai');
      expect(result).toHaveLength(21);
      expect(result).toContain('b.ai');
      expect(result).toContain('z.ai');
      expect(result).not.toContain('a.ai');
      expect(result).not.toContain('e.ai');
    });

    it('spec example 11.8 standalone: [:c:][:v:][:c:].ai produces 2205 domains', () => {
      const result = ddsl('[:c:][:v:][:c:].ai');
      expect(result).toHaveLength(21 * 5 * 21);
      expect(result).toContain('bab.ai');
      expect(result).toContain('zuz.ai');
    });

    it('[:v:]{2}.io expands to 25 domains', () => {
      const result = ddsl('[:v:]{2}.io');
      expect(result).toHaveLength(5 ** 2);
      expect(result).toContain('aa.io');
      expect(result).toContain('uu.io');
    });

    it('[:c:]{2,3}.com expands to 21² + 21³ domains', () => {
      const result = ddsl('[:c:]{2,3}.com');
      expect(result).toHaveLength(21 ** 2 + 21 ** 3);
    });

    it('pre[:v:]?.com expands to 6 domains', () => {
      expect(ddsl('pre[:v:]?.com')).toEqual(
        ['pre.com', 'prea.com', 'pree.com', 'prei.com', 'preo.com', 'preu.com'].sort(),
      );
    });

    it('[:c:] and [[:c:]] produce identical expansions', () => {
      expect(ddsl('[:c:].io')).toEqual(ddsl('[[:c:]].io'));
    });

    it('[:v:] and [[:v:]] produce identical expansions', () => {
      expect(ddsl('[:v:].io')).toEqual(ddsl('[[:v:]].io'));
    });

    it('mixes with a following literal', () => {
      const result = ddsl('[:c:]3.com');
      expect(result).toHaveLength(21);
      expect(result).toContain('b3.com');
      expect(result).toContain('z3.com');
      expect(result).not.toContain('a3.com');
    });

    it('mixes with a bracket char class', () => {
      const result = ddsl('[:c:][0-9].com');
      expect(result).toHaveLength(21 * 10);
      expect(result).toContain('b0.com');
      expect(result).toContain('z9.com');
    });

    it('works inside a variable definition', () => {
      const result = ddslDoc(`
        @cvc = [:c:][:v:][:c:]
        @cvc.io
      `);
      expect(result).toHaveLength(21 * 5 * 21);
    });

    it('calculates expansionSize correctly', () => {
      expect(expansionSize(parse('[:v:].io'))).toBe(5);
      expect(expansionSize(parse('[:c:]{2}.io'))).toBe(21 ** 2);
      expect(expansionSize(parse('[:c:][:v:][:c:].ai'))).toBe(21 * 5 * 21);
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
