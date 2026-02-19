# DDSL v0.3.1 Specification

## 1. Introduction

DDSL (Domain Domain-Specific Language) is a declarative language for describing finite sets of domain names using structural patterns.

A valid DDSL expression expands into a finite set of domain names.

DDSL is:

- deterministic
- enumerable
- implementation-agnostic
- easy to parse and re-implement

DDSL describes possible domain names, not their availability, value, or DNS behaviour.

---

## 2. Design Goals

DDSL v0.3.1 is designed to be:

**Declarative**
Expressions describe what domains exist in the set, not how to generate them.

**Deterministic**
The same expression always produces the same set.

**Enumerable**
All results form a finite set.

**Human-readable**
Expressions should be understandable without tooling.

**Structurally composable**
Expressions may nest and group without introducing procedural logic.

**Simple to implement**
A conforming parser and expander should be implementable in a small standalone program.

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
- define ranking, scoring, or filtering logic

These concerns are outside the scope of the language and belong to tools built on top of it.

---

## 4. Terminology

**Expression**
A string written in DDSL syntax that describes a set of domain names.

**Expansion**
The finite set of domain names produced by evaluating a DDSL expression.

**Label**
A sequence of characters between dots in a domain name.

**Domain name**
A string consisting of one or more labels separated by dots.

**Element**
A syntactic unit within a label (literal, alternation, character class, group, or variable reference).

**Group**
A parenthesised sequence of elements that acts as a single unit, primarily for scoping the optional operator or repetition.

**Document**
A multi-line DDSL input consisting of variable definitions, expressions, and comments.

**Statement**
A single non-empty, non-comment line in a DDSL document. A statement is either a variable definition or an expression.

**Variable**
A named macro defined with `@name = ...` that expands to a DDSL sequence by textual substitution.

---

## 5. Core Concepts

### 5.1 Domains and Labels

A domain consists of one or more labels separated by dots.

Examples:

```
example
example.com
api.dev.tools
```

The dot (`.`):

- separates labels
- is a structural delimiter
- is not part of any label
- MUST NOT appear inside literals, alternation items, character classes, or groups

Labels MUST be non-empty.

### 5.2 Sets and Deduplication

Every valid DDSL expression represents a finite set of domain names.

Duplicate values MUST be removed from the final expansion.

### 5.3 Case Sensitivity

DDSL is case-insensitive.

Implementations MUST normalise all input to lowercase before parsing.

Output domain names MUST be lowercase.

### 5.4 Whitespace

Within expressions, whitespace is not permitted. Spaces and tabs inside an expression MUST cause the parser to reject it.

In document mode, newlines separate statements. See Section 7 for the document-level grammar and Section 13 for preprocessing.

### 5.5 Character Class Universe

The character class universe is the set of all characters that may appear in character classes:

    a-z and 0-9 (36 characters total)

All character class operations -- ranges, named classes, and negation -- operate within this universe.

Negation produces the universe minus the specified characters. For example, `[^aeiou]` produces all 31 characters in the universe that are not vowels (21 consonants plus 10 digits).

The hyphen (`-`) is a valid literal character in domain labels but is not part of the character class universe. Hyphens must be introduced through literal elements or alternation, not through character classes.

---

## 6. Syntax Overview

DDSL v0.3.1 supports:

- Literal text
- Alternation `{...}`
- Character classes `[...]` including negation `[^...]`
- Named character classes `[:v:]` and `[:c:]` (can also be placed inside `[...]`)
- Repetition `{n}` and `{min,max}` on character classes and groups
- Grouping `(...)`
- Optional operator `?`
- Variable references `@name`
- Multi-line documents with variable definitions and comments

Domains are formed by combining elements into labels separated by dots.

### 6.1 Grouping

A group is a parenthesised sequence of elements. It produces the same expansion as its contents but serves as a single unit for the optional operator and for repetition.

`(fast){car,bike}.com` is equivalent to `fast{car,bike}.com`.

Without `?` or repetition, a group has no effect on expansion.

### 6.2 Optional Operator

The `?` operator may follow any primary element (literal, alternation, character class, group, or variable reference). It means the element is either present or absent.

`car(s)?.com` expands to `car.com` and `cars.com`.

### 6.3 Empty Labels Are Invalid

A label MUST be guaranteed to produce at least one character in every expansion branch.

If any expansion branch would result in an empty label, the expression MUST be rejected.

This includes (but is not limited to) the following cases:

- A label where every element is optional (every element has a trailing '?').
- A label where the only element can expand to empty via repetition with minimum 0.
- A label containing an alternation where any branch can expand to an empty label (for example via an optional group inside that branch).

This rule is a semantic validity requirement. Implementations MAY detect it during parsing or during a validation pass, but MUST reject expressions that violate it.


### 6.4 Repetition

Repetition may follow a character class or a group.

Fixed repetition: `[a-z]{3}` or `(ab){2}`

Range repetition: `[a-z]{2,4}` or `(ab){1,3}`

Range repetition expands to the union of all lengths from min to max inclusive.

If a character class has no repetition, it defaults to `{1}`. That is, `[a-z]` is equivalent to `[a-z]{1}`.

Repetition MUST satisfy 0 <= min <= max.

### 6.5 Character Classes

A character class matches a single character from a defined set and is expanded across the repetition count.

**Basic:** `[a-z]`, `[0-9]`, `[a-z0-9]`, `[abc]`

**Negated:** `[^aeiou]` -- matches all characters in the universe (see Section 5.5) except those listed.

**Named classes:**

- `[:v:]` -- vowels: a, e, i, o, u
- `[:c:]` -- consonants: b, c, d, f, g, h, j, k, l, m, n, p, q, r, s, t, v, w, x, y, z

Named classes may be used in two places:

- As standalone elements in an expression. In this form, [:v:] and [:c:] behave like character classes with an implied repetition of {1}.

- As atoms inside bracket character classes [...]. In this form, they contribute their character sets to the enclosing class, and may be negated via ^ in the enclosing class.

- `[:v:]` -- vowels only
- `[:c:]` -- consonants only
- `[[:c:]0-9]` -- consonants and digits
- `[[:v:][:c:]]` -- vowels and consonants (equivalent to `[a-z]`)

**Negated named classes:**

- `[^[:c:]]` -- everything in the universe except consonants (vowels and digits)
- `[^[:v:]0-9]` -- everything in the universe except vowels and digits (consonants only)

The negation operator `^` applies to the entire class contents. It MUST appear immediately after the opening `[` if present. When a bracket class contains named classes, implementations MUST expand named classes to their underlying character sets before applying ^ negation.

### 6.6 Variables

Variables are named macros defined in document mode. They allow reuse of common patterns.

Definition syntax: `@name = sequence`

Reference syntax: `@name` (inline within an expression)

Variable names consist of letters, digits, and hyphens. They are case-insensitive.

See Section 8 for variable semantics and scoping rules.

### 6.7 Comments

In document mode, `#` begins a comment. Everything from `#` to the end of the line is ignored.

Comments may appear on their own line or after a statement:

```
# This is a full-line comment
@tlds = {com,net}       # This is an inline comment
example.@tlds
```

Comments are stripped during preprocessing (see Section 13) before parsing.

### 6.8 Multi-line Documents

A DDSL document consists of one or more lines. Each non-empty, non-comment line is a statement.

A statement is either:

- a variable definition (`@name = sequence`)
- an expression (anything else)

The final expansion of a document is the union of the expansions of all expression statements. Variable definitions do not produce output.

---

## 7. Formal Grammar (EBNF)

### 7.1 Document-Level Grammar

```ebnf
document    = { line, newline }, [ line ] ;

line        = comment
            | var_def
            | domain
            | empty ;

comment     = "#", { any_char } ;

var_def     = "@", var_name, "=", sequence ;

var_name    = var_char, { var_char } ;
var_char    = letter | digit | "-" ;

empty       = "" ;

newline     = "\n" ;
```

Note: in document mode, comments and leading/trailing whitespace on each line are stripped during preprocessing before the expression parser sees the input. The `=` in variable definitions MAY be surrounded by spaces during preprocessing; implementations SHOULD tolerate this.

### 7.2 Expression-Level Grammar

```ebnf
domain      = label, { ".", label } ;

label       = sequence ;

sequence    = element, { element } ;

element     = primary, [ "?" ] ;

primary     = literal
            | char_class, [ repetition ]
            | named_class, [ repetition ]
            | alternation
            | group, [ repetition ]
            | var_ref ;

group       = "(", sequence, ")" ;

var_ref     = "@", var_name ;

literal     = literal_char, { literal_char } ;
literal_char = letter | digit | "-" ;

alternation = "{", sequence, { ",", sequence }, "}" ;

char_class  = "[", [ "^" ], class_body, "]" ;

class_body  = class_item, { class_item } ;

class_item  = letter
            | digit
            | letter, "-", letter
            | digit, "-", digit
            | named_class ;

named_class = "[:", class_name, ":]" ;

class_name  = "v" | "c" ;

repetition  = "{", number, "}"
            | "{", number, ",", number, "}" ;

number      = digit, { digit } ;

letter      = "a"-"z" ;
digit       = "0"-"9" ;
```

---

## 8. Variable Semantics

### 8.1 Definition and Substitution

Variables are defined with `@name = sequence` and referenced with `@name`.

Variable expansion is textual substitution: the reference `@name` is replaced with the sequence from the definition before the expression is parsed.

### 8.2 Ordering

Variables MUST be defined before they are referenced. Forward references are invalid.

### 8.3 No Redefinition

A variable name MUST NOT be defined more than once in a document. Redefinition is invalid.

### 8.4 Variable References Inside Variables

A variable definition MAY reference previously-defined variables.

Rules:

- Variables MUST be defined before they are referenced (no forward references).
- Cycles are invalid and MUST be rejected (direct or indirect), for example:
  @a=@a
  @a=@b and @b=@a
- Implementations MUST set a reasonable recursion or expansion-depth limit and MUST reject definitions that exceed it.

Variable substitution is textual. After substitution, the resulting expression MUST still conform to the DDSL grammar (including whitespace rules and empty-label rules).

### 8.5 Scope

Variables are scoped to the document in which they are defined. They have no persistence or global state across documents.

### 8.6 Variable Name Restrictions

Variable names:

- consist of letters, digits, and hyphens
- MUST NOT be empty
- are case-insensitive (`@TLDs` and `@tlds` are the same variable)

---

## 9. Grammar Rules

- Labels MUST be non-empty.
- Groups MUST be non-empty.
- Alternation items MUST be non-empty.
- A label in which every element is optional is invalid (see Section 6.3).
- Repetition ranges MUST satisfy 0 <= min <= max.
- A repetition minimum of 0 on the sole element of a label is invalid (same empty-label rule).
- Character class bodies MUST be non-empty.
- Negation (`^`) applies to the entire character class, not individual items.
- Variable references MUST resolve to a previously defined variable.
- Variable names MUST NOT be redefined.
- Variable definitions MAY reference previously-defined variables.

---

## 10. Expansion Semantics

A conforming implementation MUST:

1. Preprocess the document into statements (see Section 13).
2. Process statements in order: register variable definitions, collect expressions.
3. For each expression, substitute variable references with their defined values.
4. Parse the resulting expression.
5. Expand alternations, repetition ranges, optional branches, and character classes (including named and negated classes).
6. Compute the Cartesian product of all structural branches.
7. Deduplicate results within each expression.
8. Compute the union of all expression results.
9. Deduplicate the final combined result.
10. Output lowercase domain names without trailing dots.

### 10.1 Determinism

The same input MUST always produce the same set.

Order of results is not defined.

### 10.2 Finiteness

All expressions MUST expand to a finite set.

### 10.3 Large Expansions

Implementations MAY impose size limits and SHOULD document such limits. They SHOULD reject or warn rather than silently truncate results.

### 10.4 Output Normalisation

All output domain names:

- MUST be lowercase
- MUST NOT contain trailing dots
- MUST use `.` as the label separator

---

## 11. Detailed Expansion Examples

### 11.1 Literal

```
example.com
```

Expands to: example.com

### 11.2 Alternation

```
{car,bike}.com
```

Expands to: car.com, bike.com

### 11.3 Character Class with Default Repetition

```
[a-z].ai
```

Equivalent to `[a-z]{1}.ai`. Expands to all 26 one-letter .ai domains.

### 11.4 Character Class with Range Repetition

```
[a-z]{3,4}.ai
```

Expands to all 3- and 4-letter .ai domains.

### 11.5 Negated Character Class

```
[^aeiou]{3}.com
```

Expands to all 3-character .com labels using characters from the universe (a-z, 0-9) excluding a, e, i, o, u. That is 31 characters, producing 31^3 = 29,791 domains.

### 11.6 Grouping and Optional

```
car(s)?.com
```

Expands to: car.com, cars.com

### 11.7 Group Repetition

```
(ab){2,3}.com
```

Expands to: abab.com, ababab.com

### 11.8 Named Character Classes

```
[:c:][:v:][:c:].ai
```

Expands to all CVC .ai labels where:

- [:c:] = b,c,d,f,g,h,j,k,l,m,n,p,q,r,s,t,v,w,x,y,z (21 consonants)
- [:v:] = a,e,i,o,u (5 vowels)

Producing 21 * 5 * 21 = 2,205 domains.

### 11.9 Mixed Named and Range Classes

```
[[:c:]0-9]{2}.io
```

Expands to all 2-character .io labels using consonants and digits (31 characters). Producing 31^2 = 961 domains.

### 11.10 Negated Named Character Class

```
[^[:c:]]{2}.io
```

Expands to all 2-character .io labels using characters from the universe excluding consonants. That leaves vowels and digits (15 characters). Producing 15^2 = 225 domains.

### 11.11 Nested Alternation (Structured Composition)

{smart{car,bike},fast{boat,plane}}.com

expands to:

smartcar.com
smartbike.com
fastboat.com
fastplane.com

### 11.12 Variables and Multi-line Document

```
@tlds = {com,net,org}
@env = {dev,staging,prod}

# API endpoints
api.@env.example.@tlds

# CDN endpoints
cdn.@env.example.@tlds
```

Expands to the union of both expressions:

```
api.dev.example.com
api.staging.example.com
api.prod.example.com
api.dev.example.net
...
cdn.prod.example.org
```

### 11.13 Structured Composition with Variables

```
@tlds = {com,net}
{smart{car,bike},fast{boat,plane}}.@tlds
```

Expands to:

```
smartcar.com
smartbike.com
fastboat.com
fastplane.com
smartcar.net
smartbike.net
fastboat.net
fastplane.net
```

### 11.14 Combined Features

```
@tlds = {ai,io}
{api,dev}(-v[0-9]{1})?.@tlds
```

Expands to:

```
api.ai
api.io
dev.ai
dev.io
api-v0.ai
api-v0.io
api-v1.ai
...
dev-v9.io
```

---

## 12. Conformance

An implementation conforms to DDSL v0.3.1 if it:

- Accepts all valid expressions and documents
- Rejects invalid expressions (including those containing whitespace)
- Resolves variables correctly per Section 8
- Expands to the correct finite set
- Deduplicates results
- Normalises output as specified

Single-expression mode (without document features) is a valid subset. An implementation that only supports single expressions (no variables, no multi-line, no comments) conforms to DDSL v0.3.1 expression-level conformance but not document-level conformance.

---

## 13. Input Preprocessing (Non-Normative)

Implementations that support document mode SHOULD preprocess input as follows:

1. Split input into lines.
2. For each line, strip everything from `#` to end of line (comments).
3. Trim leading and trailing whitespace from each line.
4. Remove empty lines.
5. Normalise to lowercase.
6. For variable definitions, strip spaces around `=`.
7. Pass each remaining line to the parser as a statement.

Within expressions (after preprocessing), whitespace is still invalid and MUST cause rejection.

Case normalisation is part of the core parser (Section 5.3). Preprocessing MAY also normalise case as a convenience, but the parser MUST NOT rely on preprocessing having done so.

The reference implementation provides a `prepare()` function for single-expression whitespace stripping and a `prepareDocument()` function for full document preprocessing.

---

## 14. Non-Normative Validation

Optional validation may include:

- Label length limits (e.g., DNS 63-octet limit)
- Label count limits
- Prohibition of leading or trailing hyphens in labels
- Known TLD lists
- Root zone validation
- Registry policy checks

These checks do not affect language conformance.

---

## 15. Versioning

Future versions may introduce:

- Additional named character classes
- Set difference / exclusion operators
- External includes
- Structural constraints
- Objective metrics
- Extension profiles

These features are intentionally excluded from v0.3.1 to preserve simplicity and stability.

---

## 16. Reference Implementation

A reference implementation will be provided at:

https://ddsl.app

The reference implementation demonstrates correct parsing and expansion but does not define the language.
