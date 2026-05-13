# DDSL v0.4.0

A declarative language for describing sets of domain names using structural patterns.

DDSL is a Domain-Specific Language about domains — a compact, human-readable way to express domain name spaces that expands into finite, deterministic sets.

## Quick Example

```ts
import { ddsl, ddslDocument } from 'ddsl';

ddsl('{car,bike}.com');
// ['car.com', 'bike.com']

ddsl('car(s)?.com');
// ['car.com', 'cars.com']

ddsl('[^aeiou]{3}.com');
// All 3-letter domains using consonants and digits (29,791)

ddsl('[:c:][:v:][:c:].ai');
// All CVC .ai domains (2,205)

// Multi-line documents with variables
ddslDocument(`
  @tlds = {com,net}
  @env = {dev,staging,prod}
  api.@env.example.@tlds
`);
// ['api.dev.example.com', 'api.dev.example.net', ...]
```

## Install

```bash
npm install ddsl
```

## API

### `ddsl(expression, options?)`

Parse and expand a DDSL expression in one step.

```ts
import { ddsl } from 'ddsl';

const domains = ddsl('{car,bike}.com');
```

### `ddslDocument(input, options?)`

Parse and expand a multi-line DDSL document with variables.

```ts
import { ddslDocument } from 'ddsl';

const domains = ddslDocument(`
  @tlds = {com,net,org}
  # API endpoints
  api.example.@tlds
  cdn.example.@tlds
`);
```

### `parse(expression)`

Parse a DDSL expression into an AST.

```ts
import { parse } from 'ddsl';

const ast = parse('car(s)?.com');
```

### `parseDocument(lines, lineNumbers?)`

Parse prepared document lines into a document AST. The optional `lineNumbers` array (parallel to `lines`) maps each line to its original source line number. When provided, `ParseError.line` reflects the actual source line rather than the preprocessed index — useful for highlighting errors in an editor.

```ts
import { parseDocument, prepareDocument } from 'ddsl';

// Without line tracking (backward compatible)
const { lines } = prepareDocument(input);
const doc = parseDocument(lines);

// With accurate line numbers in errors
const { lines, lineNumbers } = prepareDocument(input);
const doc = parseDocument(lines, lineNumbers);
```

### `expand(ast, options?)`

Expand a parsed AST into the full set of domain names. Throws `ExpansionError` if the expansion exceeds `maxExpansion`.

```ts
import { parse, expand } from 'ddsl';

const ast = parse('[a-z]{4}.ai');
const domains = expand(ast);
```

### `expandDocument(doc, options?)`

Expand a parsed document into the full set of domain names. Throws `ExpansionError` if the expansion exceeds `maxExpansion`.

```ts
import { parseDocument, prepareDocument, expandDocument } from 'ddsl';

const lines = prepareDocument(input);
const doc = parseDocument(lines);
const domains = expandDocument(doc);
```

### `preview(ast, limit, options?)`

Preview an expansion with a capped result set. Returns a `PreviewResult` with `domains`, `total`, `truncated`, and optionally `seed`. Throws `ExpansionError` if the total expansion size exceeds `maxExpansion`.

Without `seed`, returns the first `limit` domains in expansion order (prefix slice, backwards-compatible). With `seed`, samples `limit` domains deterministically from across the full space using index-based selection — no full expansion needed.

```ts
import { parse, preview } from 'ddsl';

const ast = parse('[a-z]{3}.ai'); // 17,576 domains

// Existing behaviour — prefix slice
preview(ast, 10);
// { domains: ['aaa.ai', 'aab.ai', ...], total: 17576, truncated: true }

// Deterministic sampling
preview(ast, 10, { seed: 42 });
// { domains: ['bax.ai', 'tog.ai', ...], total: 17576, truncated: true, seed: 42 }
```

### `previewDocument(doc, limit, options?)`

Preview a document expansion with a capped result set. Supports the same `seed` option as `preview`. With `seed`, samples proportionally across all expressions by their expansion size.

Throws `ExpansionError` if the total expansion size exceeds `maxExpansion`.

```ts
import { parseDocument, prepareDocument, previewDocument } from 'ddsl';

const { lines } = prepareDocument(input);
const doc = parseDocument(lines);

// Prefix slice
const result = previewDocument(doc, 100);
// { domains: [...], total: number, truncated: boolean }

// Deterministic sampling across all expressions
const sampled = previewDocument(doc, 100, { seed: 42 });
// { domains: [...], total: number, truncated: true, seed: 42 }
```

### `expansionSize(ast)`

Calculate the expansion size without expanding.

```ts
import { parse, expansionSize } from 'ddsl';

const ast = parse('[a-z]{10}.com');
expansionSize(ast); // 141,167,095,653,376
```

### `documentExpansionSize(doc)`

Calculate the total expansion size of a document without expanding.

```ts
import { parseDocument, prepareDocument, documentExpansionSize } from 'ddsl';

const lines = prepareDocument(input);
const doc = parseDocument(lines);
documentExpansionSize(doc); // 18
```

### `prepare(input)`

Strip whitespace from user input before parsing.

```ts
import { parse, prepare } from 'ddsl';

const ast = parse(prepare('  { car, bike }.com  '));
```

### `prepareDocument(input)`

Prepare a multi-line document: strips comments, trims lines, removes empty lines, normalises case. Returns `{ lines, lineNumbers }` where `lineNumbers[i]` is the 1-based original source line for `lines[i]`.

```ts
import { prepareDocument, parseDocument } from 'ddsl';

const { lines, lineNumbers } = prepareDocument(`
  @tlds = {com,net}  # TLDs
  example.@tlds
`);
// lines:       ['@tlds = {com,net}', 'example.@tlds']
// lineNumbers: [2, 3]

try {
  const doc = parseDocument(lines, lineNumbers);
} catch (e) {
  if (e instanceof ParseError) {
    console.log(e.line);       // original source line (1-based), or undefined
    console.log(e.position);   // character position within that line
    console.log(e.rawMessage); // message text without the 'Parse error at...' prefix
  }
}
```

### Options

```ts
ddsl('[a-z]{4}.ai', { maxExpansion: 500_000 });
preview(ast, 50, { seed: 42 });
preview(ast, 50, { offset: 50 });           // page 2
preview(ast, 50, { seed: 42, offset: 50 }); // page 2 of a seeded sample
```

| Option | Type | Default | Description |
|---|---|---|---|
| `maxExpansion` | `number` | `1,000,000` | Maximum domains to produce. Throws `ExpansionError` if exceeded. Set to `Infinity` to disable. |
| `seed` | `number` | — | Seed for deterministic sampling in `preview`/`previewDocument`. When set, results are sampled from across the expansion space rather than taken from the prefix. The same seed always produces the same sample. |
| `offset` | `number` | `0` | Number of results to skip. Use with a fixed `limit` to paginate: page N starts at `offset = N * limit`. Works with or without `seed`. Returned in `PreviewResult.offset`. |

## DDSL v0.4.0 Syntax

| Element | Example | Description |
|---|---|---|
| Literal | `car` | Fixed text (letters, digits, hyphens) |
| Alternation | `{car,bike}` | Choice between options |
| Character class | `[a-z]` | Single character (defaults to {1}) |
| Repetition | `[a-z]{3}` | Fixed repetition |
| Range | `[a-z]{2,4}` | Variable-length sequences |
| Negation | `[^aeiou]` | Exclude characters |
| Named class (standalone) | `[:v:]` | Vowels — one character, like `[a-z]{1}` |
| Named class (standalone) | `[:c:]` | Consonants — one character |
| Named class (in bracket) | `[[:v:]]` | Vowels inside a bracket class |
| Named class (in bracket) | `[[:c:]0-9]` | Consonants and digits combined |
| Grouping | `(abc)` | Group elements together |
| Group repetition | `(ab){2,3}` | Repeat a group |
| Optional | `(s)?` | Make a group optional |
| Variable | `@name` | Reference a defined variable |
| Comment | `# text` | Ignored (document mode) |

### Examples

```
example.com                         → example.com
{car,bike}.com                      → car.com, bike.com
car(s)?.com                         → car.com, cars.com
[a-z].io                            → 26 one-letter domains
[^aeiou]{3}.com                     → 29,791 domains (consonants + digits)
[:c:][:v:][:c:].ai                  → 2,205 CVC domains
(ab){2,3}.com                       → abab.com, ababab.com
{smart{car,bike},fast{boat,plane}}.com → 4 domains
```

### Document Mode

```
@tlds = {com,net,org}
@env = {dev,staging,prod}

# API endpoints
api.@env.example.@tlds

# CDN endpoints
cdn.@env.example.@tlds
```

## Stability / Versioning

Spec-first: behavior follows spec.md, DDSL v0.4.0 may change; breaking changes will be noted in CHANGELOG.md

## Specification

Full specification, [DDSL v0.4.0 spec](https://github.com/mrpling/ddsl/blob/main/spec.md) 

The reference implementation is available at [ddsl.app](https://ddsl.app).

## License

MIT
