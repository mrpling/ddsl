# DDSL

A declarative language for describing sets of domain names using structural patterns.

DDSL is a Domain-Specific Language about domains — a compact, human-readable way to express domain name spaces that expands into finite, deterministic sets.

## Quick Example

```ts
import { ddsl } from 'ddsl';

ddsl('{car,bike}.com');
// ['car.com', 'bike.com']

ddsl('{fast,smart}{car,bike}.com');
// ['fastcar.com', 'fastbike.com', 'smartcar.com', 'smartbike.com']

ddsl('[a-z]{3}.ai');
// all 17,576 three-letter .ai domains

ddsl('{api,dev}.{tools,cloud}');
// ['api.tools', 'api.cloud', 'dev.tools', 'dev.cloud']
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

const ast = parse('{car,bike}.com');
```

### `expand(ast, options?)`

Expand a parsed AST into the full set of domain names.

```ts
import { parse, expand } from 'ddsl';

const ast = parse('[a-z]{4}.ai');
const domains = expand(ast);
```

### `expansionSize(ast)`

Calculate the expansion size without expanding. Useful for checking before committing to large expansions.

```ts
import { parse, expansionSize } from 'ddsl';

const ast = parse('[a-z]{10}.com');
expansionSize(ast); // 141,167,095,653,376
```

### Options

```ts
ddsl('[a-z]{4}.ai', { maxExpansion: 500_000 });
```

| Option | Type | Default | Description |
|---|---|---|---|
| `maxExpansion` | `number` | `1,000,000` | Maximum domains to produce. Throws `ExpansionError` if exceeded. Set to `Infinity` to disable. |

## DDSL v0.1 Syntax

| Element | Example | Description |
|---|---|---|
| Literal | `car` | Fixed text |
| Alternation | `{car,bike}` | Choice between literals |
| Character class | `[a-z]{3}` | Fixed-length character sequences |

Elements combine within labels. Labels are separated by dots.

## Specification

The full DDSL v0.1 specification is available at [ddsl.app](https://ddsl.app).

## License

MIT
