/**
 * DDSL v0.1 — Test Runner (standalone, no dependencies)
 *
 * Verifies the parser and expander against all spec examples.
 * Run with: npx tsx tests/run.ts
 */

import { parse, ParseError } from '../src/parser';
import { expand, expansionSize, ExpansionError } from '../src/expander';
import { ddsl } from '../src/index';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertThrows(fn: () => void, errorType: any, message: string): void {
  try {
    fn();
    failed++;
    console.log(`  ✗ ${message} (no error thrown)`);
  } catch (e) {
    if (e instanceof errorType) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.log(`  ✗ ${message} (wrong error type: ${(e as Error).message})`);
    }
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function assertExpands(expr: string, expected: string[], message: string): void {
  try {
    const result = ddsl(expr);
    if (arraysEqual(result, expected)) {
      passed++;
      console.log(`  ✓ ${message}`);
    } else {
      failed++;
      console.log(`  ✗ ${message}`);
      console.log(`    expected: [${expected.join(', ')}]`);
      console.log(`    got:      [${result.join(', ')}]`);
    }
  } catch (e) {
    failed++;
    console.log(`  ✗ ${message} (threw: ${(e as Error).message})`);
  }
}

// ─── Section 6: Spec Examples ───────────────────────────────────

console.log('\nSection 6: Spec Examples');

assertExpands('example.com', ['example.com'],
  '6.1 literal domain');

assertExpands('{car,bike,train}.com', ['car.com', 'bike.com', 'train.com'],
  '6.2 alternation');

// 6.3: just check count and sample values
{
  const result = ddsl('[a-z]{3}.ai');
  assert(result.length === 17576, `6.3 character class count (got ${result.length})`);
  assert(result.includes('aaa.ai'), '6.3 contains aaa.ai');
  assert(result.includes('zzz.ai'), '6.3 contains zzz.ai');
  assert(result.includes('cat.ai'), '6.3 contains cat.ai');
}

assertExpands('{fast,smart}{car,bike}.com',
  ['fastcar.com', 'fastbike.com', 'smartcar.com', 'smartbike.com'],
  '6.4 combined structure');

assertExpands('{api,dev}.{tools,cloud}',
  ['api.tools', 'api.cloud', 'dev.tools', 'dev.cloud'],
  '6.5 multi-label domain');

// ─── Section 9.1: Additional Valid Expressions ──────────────────

console.log('\nSection 9.1: Additional Valid Expressions');

assertExpands('123.com', ['123.com'], 'numeric domain');
assertExpands('0x.ai', ['0x.ai'], 'hex-style domain');

{
  const result = ddsl('[a-z]{4}.ai');
  assert(result.length === 456976, `[a-z]{4}.ai count (got ${result.length})`);
}

// ─── Section 4.3: Case Sensitivity ──────────────────────────────

console.log('\nSection 4.3: Case Sensitivity');

assertExpands('EXAMPLE.COM', ['example.com'], 'uppercase normalised');
assertExpands('{Car,BIKE}.com', ['car.com', 'bike.com'], 'mixed case alternation');

// ─── Section 8.4: Output Normalisation ──────────────────────────

console.log('\nSection 8.4: Output Normalisation');

{
  const result = ddsl('{api,dev}.{tools,cloud}');
  assert(result.every(d => d === d.toLowerCase()), 'all output lowercase');
  assert(result.every(d => !d.endsWith('.')), 'no trailing dots');
  assert(result.every(d => d.includes('.')), 'dot separator present');
}

// ─── Expansion Size ─────────────────────────────────────────────

console.log('\nExpansion Size');

assert(expansionSize(parse('example.com')) === 1, 'literal size = 1');
assert(expansionSize(parse('{car,bike,train}.com')) === 3, 'alternation size = 3');
assert(expansionSize(parse('{fast,smart}{car,bike}.com')) === 4, 'combined size = 4');
assert(expansionSize(parse('[a-z]{3}.ai')) === 17576, 'charclass size = 17576');
assert(expansionSize(parse('[a-z]{10}.com')) === 26 ** 10, 'large charclass size');

// ─── Expansion Limits ───────────────────────────────────────────

console.log('\nExpansion Limits (Section 8.3)');

assertThrows(
  () => expand(parse('[a-z]{10}.com'), { maxExpansion: 1_000_000 }),
  ExpansionError,
  'throws when exceeding limit',
);

assertThrows(
  () => expand(parse('[a-z]{3}.ai'), { maxExpansion: 100 }),
  ExpansionError,
  'respects custom limit',
);

{
  try {
    expand(parse('{car,bike}.com'), { maxExpansion: 10 });
    passed++;
    console.log('  ✓ allows expansion within limit');
  } catch {
    failed++;
    console.log('  ✗ allows expansion within limit');
  }
}

// ─── Section 9.2: Invalid Expressions ───────────────────────────

console.log('\nSection 9.2: Invalid Expressions');

assertThrows(() => parse(''), ParseError, 'empty expression');
assertThrows(() => parse('.com'), ParseError, 'empty label (leading dot)');
assertThrows(() => parse('..com'), ParseError, 'empty label (double dot)');
assertThrows(() => parse('example.'), ParseError, 'empty label (trailing dot)');
assertThrows(() => parse('car?.com'), ParseError, 'optional syntax');
assertThrows(() => parse('{car}.com'), ParseError, 'single-option alternation');
assertThrows(() => parse('{,bike}.com'), ParseError, 'empty alternation item');
assertThrows(() => parse('[]{3}.com'), ParseError, 'empty character class');
assertThrows(() => parse('[a-z].com'), ParseError, 'charclass without repetition');
assertThrows(() => parse('[a-z]{0}.com'), ParseError, 'zero repetition');
assertThrows(() => parse('hello@world.com'), ParseError, 'invalid character @');
assertThrows(() => parse('hello world.com'), ParseError, 'space in expression');

// ─── Parser Structure Tests ─────────────────────────────────────

console.log('\nParser Structure');

{
  const ast = parse('example.com');
  assert(ast.type === 'domain', 'root node is domain');
  assert(ast.labels.length === 2, 'two labels');
  assert(ast.labels[0].elements[0].type === 'literal', 'first element is literal');
}

{
  const ast = parse('{fast,smart}{car,bike}.com');
  assert(ast.labels[0].elements.length === 2, 'two elements in first label');
  assert(ast.labels[0].elements[0].type === 'alternation', 'first element is alternation');
  assert(ast.labels[0].elements[1].type === 'alternation', 'second element is alternation');
}

{
  const ast = parse('[a-z0-9]{2}.com');
  const el = ast.labels[0].elements[0];
  assert(el.type === 'charclass', 'charclass parsed');
  if (el.type === 'charclass') {
    assert(el.chars.length === 36, 'mixed class has 36 chars');
    assert(el.repetition === 2, 'repetition is 2');
  }
}

// ─── Determinism ────────────────────────────────────────────────

console.log('\nDeterminism (Section 8.1)');

{
  const a = ddsl('{fast,smart}{car,bike}.com').sort();
  const b = ddsl('{fast,smart}{car,bike}.com').sort();
  assert(arraysEqual(a, b), 'same expression → same set');
}

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
