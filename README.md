# DDSL

A declarative language for describing sets of domain names using structural patterns.

DDSL is a Domain-Specific Language about domains — a compact, human-readable way to express domain name spaces that expands into finite, deterministic sets.

## Quick Example

```ts
import { ddsl } from 'ddsl';

ddsl('{car,bike}.com');
// ['car.com', 'bike.com']

ddsl('car(s)?.com');
// ['car.com', 'cars.com']

ddsl('[a-z]{2,3}.ai');
// all 2 and 3 letter .ai domains (18,252 total)

ddsl('{smart{car,bike},fast{boat,plane}}.com');
// ['smartcar.com', 'smartbike.com', 'fastboat.com', 'fastplane.com']

ddsl('{api,dev}(-v[0-9]{1})?.{ai,io}');
// 44 domains: api.ai, api-v0.ai, ..., dev-v9.io
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

### `parse(expression)`

Parse a DDSL expression into an AST.

```ts
import { parse } from 'ddsl';

const ast = parse('car(s)?.com');
```

### `expand(ast, options?)`

Expand a parsed AST into the full set of domain names. Throws `ExpansionError` if the expansion exceeds `maxExpansion`.

```ts
import { parse, expand } from 'ddsl';

const ast = parse('[a-z]{4}.ai');
const domains = expand(ast);
```

### `preview(ast, limit)`

Preview an expansion with a capped result set. Unlike `expand()`, this never throws on large expressions.

```ts
import { parse, preview } from 'ddsl';

const ast = parse('[a-z]{10}.com');
const result = preview(ast, 100);
// { domains: [...100 items], total: 141167095653376, truncated: true }
```

### `expansionSize(ast)`

Calculate the expansion size without expanding. Useful for checking before committing to large expansions.

```ts
import { parse, expansionSize } from 'ddsl';

const ast = parse('[a-z]{10}.com');
expansionSize(ast); // 141,167,095,653,376
```

### `prepare(input)`

Strip whitespace from user input before parsing. The parser rejects whitespace, so use this for user-provided input.

```ts
import { parse, prepare } from 'ddsl';

const ast = parse(prepare('  { car, bike }.com  '));
```

### Options

```ts
ddsl('[a-z]{4}.ai', { maxExpansion: 500_000 });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `maxExpansion` | `number` | `1,000,000` | Maximum domains to produce. Throws `ExpansionError` if exceeded. Set to `Infinity` to disable. |

## DDSL v0.2 Syntax

| Element | Example | Description |
|---|---|---|
| Literal | `car` | Fixed text (letters, digits, hyphens) |
| Alternation | `{car,bike}` | Choice between options |
| Character class | `[a-z]{3}` | Character sequences with repetition |
| Repetition range | `[a-z]{2,4}` | Variable-length sequences |
| Grouping | `(abc)` | Group elements together |
| Optional | `(s)?` | Make a group optional |
| Nesting | `{smart{car,bike},fast}` | Nested alternations and sequences |

Elements combine within labels. Labels are separated by dots.

### Examples

```
example.com                         → example.com
{car,bike}.com                      → car.com, bike.com
car(s)?.com                         → car.com, cars.com
[a-z]{2,3}.ai                       → all 2-3 letter .ai domains
{smart{car,bike},fast{boat,plane}}.com → smartcar.com, smartbike.com, ...
{api,dev}(-v[0-9]{1})?.{ai,io}      → api.ai, api-v0.ai, ..., dev-v9.io
```

## Specification

The full DDSL v0.2 specification is available at [ddsl.app](https://ddsl.app).

## License

MIT
