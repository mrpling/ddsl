# DDSL v0.1 Specification

## 1. Introduction

DDSL (Domain Domain-Specific Language) is a declarative language for describing sets of domain names using structural patterns. A DSL about domains.

DDSL allows compact, human-readable expressions that expand into finite sets of domain names. It is intended to be:

- deterministic
- enumerable
- implementation-agnostic
- easy to parse and re-implement

DDSL describes possible domain names, not their availability, value, or DNS behaviour.

---

## 2. Design Goals

DDSL v0.1 is designed to be:

**Declarative**  
Expressions describe what domains exist in the set, not how to generate them.

**Deterministic**  
The same expression always produces the same set.

**Enumerable**  
All results must form a finite set.

**Human-readable**  
Expressions should be understandable without tooling.

**Simple to implement**  
A conforming parser and expander should be implementable in a small, standalone program.

---

## 2.1 Terminology

**Expression**  
A string written in DDSL syntax.

**Expansion**  
The finite set of domain names produced by evaluating a DDSL expression.

**Label**  
A sequence of characters between dots in a domain name.

**Domain name**  
A string consisting of one or more labels separated by dots.

---

## 3. Non-Goals

DDSL does not:

- check domain availability
- perform WHOIS or RDAP lookups
- assign value or quality to domains
- encode DNS records or behaviour
- enforce registry policies
- include AI prompts or semantic intent
- define execution strategies or ordering

These concerns are outside the scope of the language and belong to tools built on top of it.

---

## 4. Core Concepts

### 4.1 Domains and Labels

A domain consists of one or more labels separated by dots.

Examples:

```
example
example.com
api.dev.tools
```

The dot (`.`) is a structural delimiter and is not part of any label.

### 4.2 Sets

Every valid DDSL expression represents a finite set of domain names.

A single literal domain is a valid DDSL expression and represents a set of one.

Because the result is a set, duplicate values are removed. If an expression produces the same domain name more than once (for example, through duplicate alternation options), the result contains that domain name only once. Implementations MUST deduplicate expansion output.

### 4.3 Case Sensitivity

DDSL is case-insensitive. Implementations MUST normalise all input to lowercase before parsing. The grammar defines only lowercase letters; uppercase input is accepted but treated identically to its lowercase equivalent.

### 4.4 Whitespace

DDSL expressions MUST NOT contain whitespace. Spaces, tabs, newlines, and other whitespace characters are not part of the grammar and MUST be rejected by a conforming parser.

Applications that accept user input SHOULD strip whitespace before passing the input to the parser. This preprocessing step is outside the scope of the language itself. The reference implementation provides a `prepare()` function for this purpose.

---

## 5. Syntax Overview

DDSL v0.1 supports the following element types:

| Element | Example | Description |
|---|---|---|
| Literal | `car` | Fixed text |
| Alternation | `{car,bike}` | Choice between literals |
| Character class + repetition | `[a-z]{3}` | Fixed-length character sequences |

Domains are formed by combining these elements into labels separated by dots.

### 5.1 Dot as a Reserved Delimiter

The dot (`.`):

- separates labels
- is reserved for structural use
- MUST NOT appear inside:
  - literals
  - alternation items
  - character classes

This ensures that DDSL expressions always describe valid domain structures rather than arbitrary dotted strings.

---

## 6. Examples

### 6.1 Literal domain

```
example.com
```

Expands to:

```
example.com
```

### 6.2 Alternation

```
{car,bike,train}.com
```

Expands to:

```
car.com
bike.com
train.com
```

### 6.3 Character class with repetition

```
[a-z]{3}.ai
```

Expands to all three-letter `.ai` domains.

### 6.4 Combined structure

```
{fast,smart}{car,bike}.com
```

Expands to:

```
fastcar.com
fastbike.com
smartcar.com
smartbike.com
```

### 6.5 Multi-label domain example

```
{api,dev}.{tools,cloud}
```

Expands to:

```
api.tools
api.cloud
dev.tools
dev.cloud
```

This example demonstrates that DDSL expressions may contain multiple labels.  
Multi-label support is part of the core grammar and not a separate feature.

---

## 7. Formal Grammar (EBNF)

The following grammar defines valid DDSL v0.1 expressions.

```ebnf
domain      = label, { ".", label } ;

label       = element, { element } ;

element     = literal
            | char_class, repetition
            | alternation ;

literal     = literal_char, { literal_char } ;
literal_char = letter | digit | "-" ;

alternation = "{", alt_item, { ",", alt_item }, "}" ;
alt_item    = literal ;

char_class  = "[", class_item, { class_item }, "]" ;

class_item  = letter
            | digit
            | letter, "-", letter
            | digit, "-", digit ;

repetition  = "{", number, "}" ;

number      = digit, { digit } ;

letter      = "a"-"z" ;
digit       = "0"-"9" ;
```

### 7.1 Grammar Notes

**Labels must be non-empty.** A label consists of one or more elements. Expressions that would produce empty labels (e.g. `..com` or `.com`) are invalid.

**Literals may begin with a letter, digit, or hyphen.** DNS label validity rules (such as prohibiting leading or trailing hyphens) are outside the scope of the core grammar and belong to the validation layer (see Section 11).

**Alternation items are literals only.** Nested alternations (e.g. `{{a,b}c,d}`) and character classes inside alternations (e.g. `{[a-z]{2},foo}`) are not supported in v0.1.

**Whitespace is not permitted.** The grammar does not include whitespace at any position. See Section 4.4.

---

## 8. Expansion Semantics

A conforming implementation must:

1. Parse the expression into its structural components.
2. Compute the Cartesian product of all alternations and character classes.
3. Deduplicate the results (see Section 4.2).
4. Produce the complete set of resulting domain names.

### 8.1 Determinism

The same input must always produce the same set.

Order of results is not defined by the specification.

### 8.2 Finiteness

If an expression would produce an infinite set, it is invalid.  
All DDSL v0.1 expressions must expand to a finite number of domains.

### 8.3 Combinatorial Expansion

Some valid expressions expand to very large sets. For example, `[a-z]{10}.com` produces 26^10 (approximately 141 trillion) domain names. The specification does not impose a maximum expansion size. Implementations SHOULD document any limits they impose and SHOULD reject or warn on expressions that exceed those limits rather than silently truncating results. Implementations MAY impose limits on alternation size or repetition counts.

### 8.4 Output Normalisation

All output domain names:

- MUST be lowercase
- MUST NOT contain a trailing dot
- MUST use `.` as the label separator

---

## 9. Valid and Invalid Examples

### 9.1 Valid

```
example.com
{car,bike}.com
[a-z]{4}.ai
{fast,smart}{car,bike}.com
{api,dev}.{tools,cloud}
123.com
0x.ai
{car,car}.com            → expands to: car.com (duplicates removed)
```

### 9.2 Invalid (v0.1)

```
[a-z]{3,5}.com     ← repetition ranges not supported
car?.com           ← optional syntax not supported
car{1-10}.com      ← numeric ranges not supported
.com               ← empty label
..com              ← empty label
{[a-z]{2},foo}.com ← character classes inside alternation not supported
{{a,b}c,d}.com     ← nested alternation not supported
(empty string)     ← empty expressions are not allowed
{ car, bike }.com  ← whitespace not permitted
```

---

## 10. Conformance

An implementation conforms to DDSL v0.1 if it:

1. Accepts all valid expressions defined by this specification.
2. Rejects invalid expressions (including those containing whitespace).
3. Expands valid expressions into the correct finite set of domains.
4. Deduplicates expansion output.

---

## 11. Validation (Non-normative)

Implementations may optionally provide validation checks that are outside the core language.

Examples include:

- maximum number of labels
- label length limits (DNS imposes a 63-octet limit per label)
- prohibition of leading or trailing hyphens in labels
- known TLD lists
- root zone validation
- registry policy checks

These checks:

- do not affect language conformance
- must not change the meaning of a valid DDSL expression
- are implementation-specific

Implementations are encouraged to provide validation as a separate pass from parsing and expansion, so that the core language semantics remain clean and predictable.

---

## 12. Input Preprocessing (Non-normative)

Applications that accept DDSL expressions from users (such as web interfaces, command-line tools, or APIs) will often need to preprocess the input before passing it to a conforming parser.

Common preprocessing steps include:

- stripping whitespace (spaces, tabs, newlines)
- trimming leading and trailing whitespace
- splitting multi-line input into separate expressions

These steps are outside the scope of the DDSL language. The parser itself MUST reject whitespace (see Section 4.4). Preprocessing is the responsibility of the application layer.

The reference implementation provides a `prepare()` function that strips all whitespace from a string, suitable for use before calling `parse()`.

---

## 13. Versioning

Future versions of DDSL may introduce:

- nested alternations
- optional segments
- length ranges
- variables and macros
- structural constraints
- objective metrics
- extension profiles

These features are intentionally excluded from v0.1 to preserve simplicity and stability.

---

## 14. Reference Implementation

A reference implementation will be provided at:

https://ddsl.app

The reference implementation demonstrates correct parsing and expansion but does not define the language.