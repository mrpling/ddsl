# DDSL v0.2 Specification

## 1. Introduction

DDSL (Domain Domain-Specific Language) is a declarative language for describing finite sets of domain names using structural patterns.

A valid DDSL expression expands into a finite set of domain names.

DDSL is:

- deterministic
- enumerable
- implementation-agnostic
- easy to parse and re-implement

DDSL describes possible domain names, not their availability, value, or DNS behavior.

---

## 2. Design Goals

DDSL v0.2 is designed to be:

Declarative
Expressions describe what domains exist in the set, not how to generate them.

Deterministic
The same expression always produces the same set.

Enumerable
All results form a finite set.

Human-readable
Expressions should be understandable without tooling.

Structurally composable
Expressions may nest and group without introducing procedural logic.

Simple to implement
A conforming parser and expander should be implementable in a small standalone program.

---

## 3. Non-Goals

DDSL does not:

- check domain availability
- perform WHOIS or RDAP lookups
- assign value or quality to domains
- encode DNS records or behavior
- enforce registry policies
- include AI prompts or semantic intent
- define execution strategies or ordering
- define ranking, scoring, or filtering logic

These concerns are outside the scope of the language and belong to tools built on top of it.

---

## 4. Terminology

Expression
A string written in DDSL syntax.

Expansion
The finite set of domain names produced by evaluating a DDSL expression.

Label
A sequence of characters between dots in a domain name.

Domain name
A string consisting of one or more labels separated by dots.

Element
A syntactic unit within a label (literal, alternation, character class with repetition, or group).

---

## 5. Core Concepts

### 5.1 Domains and Labels

A domain consists of one or more labels separated by dots.

Examples:

example
example.com
api.dev.tools

The dot (.)

- separates labels
- is a structural delimiter
- is not part of any label

Labels MUST be non-empty.

---

### 5.2 Sets and Deduplication

Every valid DDSL expression represents a finite set of domain names.

Duplicate values MUST be removed from the final expansion.

---

### 5.3 Case Sensitivity

DDSL is case-insensitive.

Implementations MUST normalize all input to lowercase before parsing.

Output domain names MUST be lowercase.

---

### 5.4 Whitespace

DDSL expressions MUST NOT contain whitespace.

Spaces, tabs, and newlines MUST cause the parser to reject the expression.

Whitespace handling, if any, is outside the core language (see Section 12).

---

## 6. Syntax Overview

DDSL v0.2 supports:

- Literal text
- Alternation {...}
- Character classes [...]
- Repetition {n} and {min,max}
- Grouping (...)
- Optional operator ?

Domains are formed by combining elements into labels separated by dots.

---

## 7. Formal Grammar (EBNF)

domain      = label, { ".", label } ;

label       = sequence ;

sequence    = element, { element } ;

element     = primary, [ "?" ] ;

primary     = literal
            | char_class, repetition
            | alternation
            | group ;

group       = "(", sequence, ")" ;

literal     = literal_char, { literal_char } ;
literal_char = letter | digit | "-" ;

alternation = "{", sequence, { ",", sequence }, "}" ;

char_class  = "[", class_item, { class_item }, "]" ;

class_item  = letter
            | digit
            | letter, "-", letter
            | digit, "-", digit ;

repetition  = "{", number, "}"
            | "{", number, ",", number, "}" ;

number      = digit, { digit } ;

letter      = "a"-"z" ;
digit       = "0"-"9" ;

---

## 8. Label Validity Rules

A label MUST be statically guaranteed to produce at least one character in every expansion branch.

The following are invalid:

- A label consisting only of optional elements.
- A label consisting only of a repetition with minimum 0.
- A label in which every element may produce an empty string.

Optional omission MUST NOT create empty labels.

If any expansion branch would result in an empty label, the expression MUST be rejected.

Repetition ranges MUST satisfy 0 <= min <= max.

---

## 9. Expansion Semantics

A conforming implementation MUST:

1. Parse the expression.
2. Expand alternations, repetition ranges, and optional branches.
3. Compute the Cartesian product of all structural branches.
4. Deduplicate results.
5. Output lowercase domain names without trailing dots.

### 9.1 Determinism

The same input MUST always produce the same set.

Order of results is not defined.

### 9.2 Finiteness

All expressions MUST expand to a finite set.

### 9.3 Large Expansions

Implementations MAY impose size limits and SHOULD document such limits. They SHOULD reject or warn rather than silently truncate results.

### 9.4 Output Normalization

All output domain names:

- MUST be lowercase
- MUST NOT contain trailing dots
- MUST use "." as the label separator

---

## 10. Detailed Expansion Examples

### 10.1 Literal

example.com

expands to:

example.com

A literal expression produces a single domain name.

---

### 10.2 Alternation

{car,bike}.com

expands to:

car.com
bike.com

Alternation selects one of the comma-separated branches.

---

### 10.3 Character Class with Range

[a-z]{3,4}.ai

expands to all 3-letter and 4-letter .ai domains.

Repetition ranges expand to every length between the specified minimum and maximum inclusive.

---

### 10.4 Grouping and Optional

car(s)?.com

expands to:

car.com
cars.com

The group (s) allows the optional operator ? to apply to the grouped sequence rather than to a single element.

---

### 10.5 Nested Alternation (Structured Composition)

{smart{car,bike},fast{boat,plane}}.com

expands to:

smartcar.com
smartbike.com
fastboat.com
fastplane.com

Nested alternation allows structured naming families to be expressed without flattening all combinations manually.

Without nesting, the same expansion would require explicitly listing:

{smartcar,smartbike,fastboat,fastplane}.com

Nesting preserves structural relationships between components.

---

### 10.6 Prefix Families with Shared Base Terms

{{pro,ultra}{car,bike},eco{car,bike}}.com

expands to:

procar.com
probike.com
ultracar.com
ultrabike.com
ecocar.com
ecobike.com

This demonstrates:

- Alternation of full sequences
- Shared suffix structures
- Reuse of structured components without duplication

---

### 10.7 Mixing Structured Words and Pattern Classes

{[a-z]{3},smart{car,bike}}.com

expands to:

All three-letter .com domains
smartcar.com
smartbike.com

Alternation branches may combine:

- Character class patterns
- Nested structured sequences
- Literal elements

This allows mixing generic pattern generation with explicit brand families in a single expression.

---

### 10.8 Combined Real-World Pattern

{api,dev}(-v[0-9]{1})?.{ai,io}

expands to:

api.ai
api.io
api-v0.ai
api-v1.ai
...
api-v9.io
dev.ai
dev.io
dev-v0.ai
...
dev-v9.io

This example demonstrates:

- Alternation across labels
- Optional grouped suffixes
- Character class repetition
- Structured multi-label domains

---

## 11. Conformance

An implementation conforms to DDSL v0.2 if it:

- Accepts all valid expressions
- Rejects invalid expressions
- Expands to the correct finite set
- Deduplicates results
- Normalizes output as specified

---

## 12. Input Preprocessing (Non-Normative)

Implementations MAY provide preprocessing prior to parsing.

Example:

prepare(input):
    return input.strip().lower()

Preprocessing MUST NOT alter the structural meaning of the expression.

Whitespace removal is not part of the core language.

---

## 13. Non-Normative Validation

Optional validation may include:

- Label length limits (for example, DNS 63-octet limit)
- Label count limits
- Known TLD lists
- Registry policy checks

These checks do not affect language conformance.

---

## 14. Versioning

Future versions may introduce:

- Variables or macros
- Named character classes
- Structural constraints
- Objective metrics
- Extension profiles

---

## 15. Reference Implementation

https://ddsl.app
