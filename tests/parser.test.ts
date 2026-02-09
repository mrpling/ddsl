import { describe, it, expect } from 'vitest';
import { parse, ParseError } from '../src/parser';

describe('parser', () => {
  describe('valid expressions (Section 9.1)', () => {
    it('parses a literal domain', () => {
      const ast = parse('example.com');
      expect(ast.type).toBe('domain');
      expect(ast.labels).toHaveLength(2);
      expect(ast.labels[0].elements).toEqual([
        { type: 'literal', value: 'example' },
      ]);
      expect(ast.labels[1].elements).toEqual([
        { type: 'literal', value: 'com' },
      ]);
    });

    it('parses a single-label domain', () => {
      const ast = parse('example');
      expect(ast.labels).toHaveLength(1);
    });

    it('parses a three-label domain', () => {
      const ast = parse('api.dev.tools');
      expect(ast.labels).toHaveLength(3);
    });

    it('parses alternation', () => {
      const ast = parse('{car,bike}.com');
      expect(ast.labels[0].elements).toEqual([
        { type: 'alternation', options: ['car', 'bike'] },
      ]);
    });

    it('parses three-way alternation', () => {
      const ast = parse('{car,bike,train}.com');
      expect(ast.labels[0].elements[0]).toEqual({
        type: 'alternation',
        options: ['car', 'bike', 'train'],
      });
    });

    it('parses character class with repetition', () => {
      const ast = parse('[a-z]{4}.ai');
      const el = ast.labels[0].elements[0];
      expect(el.type).toBe('charclass');
      if (el.type === 'charclass') {
        expect(el.chars).toHaveLength(26);
        expect(el.repetition).toBe(4);
      }
    });

    it('parses combined elements in a single label', () => {
      const ast = parse('{fast,smart}{car,bike}.com');
      expect(ast.labels[0].elements).toHaveLength(2);
      expect(ast.labels[0].elements[0].type).toBe('alternation');
      expect(ast.labels[0].elements[1].type).toBe('alternation');
    });

    it('parses multi-label alternation', () => {
      const ast = parse('{api,dev}.{tools,cloud}');
      expect(ast.labels).toHaveLength(2);
      expect(ast.labels[0].elements[0].type).toBe('alternation');
      expect(ast.labels[1].elements[0].type).toBe('alternation');
    });

    it('parses numeric-prefix domains', () => {
      const ast = parse('123.com');
      expect(ast.labels[0].elements[0]).toEqual({
        type: 'literal',
        value: '123',
      });
    });

    it('parses hex-style domains', () => {
      const ast = parse('0x.ai');
      expect(ast.labels[0].elements[0]).toEqual({
        type: 'literal',
        value: '0x',
      });
    });

    it('parses digit character classes', () => {
      const ast = parse('[0-9]{3}.com');
      const el = ast.labels[0].elements[0];
      expect(el.type).toBe('charclass');
      if (el.type === 'charclass') {
        expect(el.chars).toHaveLength(10);
        expect(el.repetition).toBe(3);
      }
    });

    it('parses mixed character classes', () => {
      const ast = parse('[a-z0-9]{2}.com');
      const el = ast.labels[0].elements[0];
      if (el.type === 'charclass') {
        expect(el.chars).toHaveLength(36);
      }
    });

    it('parses literal + charclass in one label', () => {
      const ast = parse('x[a-z]{2}.com');
      expect(ast.labels[0].elements).toHaveLength(2);
      expect(ast.labels[0].elements[0].type).toBe('literal');
      expect(ast.labels[0].elements[1].type).toBe('charclass');
    });
  });

  describe('case sensitivity (Section 4.3)', () => {
    it('normalises input to lowercase', () => {
      const ast = parse('EXAMPLE.COM');
      expect(ast.labels[0].elements[0]).toEqual({
        type: 'literal',
        value: 'example',
      });
    });

    it('normalises alternation to lowercase', () => {
      const ast = parse('{Car,BIKE}.com');
      expect(ast.labels[0].elements[0]).toEqual({
        type: 'alternation',
        options: ['car', 'bike'],
      });
    });
  });

  describe('invalid expressions (Section 9.2)', () => {
    it('rejects empty expression', () => {
      expect(() => parse('')).toThrow(ParseError);
    });

    it('rejects empty label (leading dot)', () => {
      expect(() => parse('.com')).toThrow(ParseError);
    });

    it('rejects empty label (double dot)', () => {
      expect(() => parse('..com')).toThrow(ParseError);
    });

    it('rejects empty label (trailing dot)', () => {
      expect(() => parse('example.')).toThrow(ParseError);
    });

    it('rejects optional syntax', () => {
      expect(() => parse('car?.com')).toThrow(ParseError);
    });

    it('rejects single-option alternation', () => {
      expect(() => parse('{car}.com')).toThrow(ParseError);
    });

    it('rejects empty alternation item', () => {
      expect(() => parse('{,bike}.com')).toThrow(ParseError);
    });

    it('rejects empty character class', () => {
      expect(() => parse('[]{3}.com')).toThrow(ParseError);
    });

    it('rejects character class without repetition', () => {
      expect(() => parse('[a-z].com')).toThrow(ParseError);
    });

    it('rejects zero repetition', () => {
      expect(() => parse('[a-z]{0}.com')).toThrow(ParseError);
    });

    it('rejects invalid characters', () => {
      expect(() => parse('hello@world.com')).toThrow(ParseError);
    });

    it('rejects spaces', () => {
      expect(() => parse('hello world.com')).toThrow(ParseError);
    });
  });
});
