"use strict";
var DDSL = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    ExpansionError: () => ExpansionError,
    ParseError: () => ParseError,
    ddsl: () => ddsl,
    expand: () => expand,
    expansionSize: () => expansionSize,
    parse: () => parse
  });

  // src/parser.ts
  var ParseError = class extends Error {
    constructor(message, position) {
      super(`Parse error at position ${position}: ${message}`);
      this.position = position;
      this.name = "ParseError";
    }
  };
  var LETTER = /^[a-z]$/;
  var DIGIT = /^[0-9]$/;
  function isLetter(ch) {
    return LETTER.test(ch);
  }
  function isDigit(ch) {
    return DIGIT.test(ch);
  }
  function isLiteralChar(ch) {
    return isLetter(ch) || isDigit(ch) || ch === "-";
  }
  function expandRange(start, end) {
    const s = start.charCodeAt(0);
    const e = end.charCodeAt(0);
    if (s > e) {
      throw new Error(`Invalid range: ${start}-${end}`);
    }
    const result = [];
    for (let i = s; i <= e; i++) {
      result.push(String.fromCharCode(i));
    }
    return result;
  }
  function parse(input) {
    const src = input.replace(/\s+/g, "").toLowerCase();
    if (src.length === 0) {
      throw new ParseError("Empty expression", 0);
    }
    let pos = 0;
    function peek() {
      return src[pos];
    }
    function advance() {
      return src[pos++];
    }
    function expect(ch) {
      if (pos >= src.length || src[pos] !== ch) {
        throw new ParseError(
          `Expected '${ch}' but found ${pos >= src.length ? "end of input" : `'${src[pos]}'`}`,
          pos
        );
      }
      pos++;
    }
    function parseDomain() {
      const labels = [];
      labels.push(parseLabel());
      while (pos < src.length && peek() === ".") {
        advance();
        labels.push(parseLabel());
      }
      return { type: "domain", labels };
    }
    function parseLabel() {
      const elements = [];
      if (pos >= src.length || peek() === ".") {
        throw new ParseError("Empty label", pos);
      }
      while (pos < src.length && peek() !== ".") {
        elements.push(parseElement());
      }
      if (elements.length === 0) {
        throw new ParseError("Empty label", pos);
      }
      return { type: "label", elements };
    }
    function parseElement() {
      const ch = peek();
      if (ch === "[") {
        return parseCharClass();
      }
      if (ch === "{") {
        return parseAlternation();
      }
      if (ch !== void 0 && isLiteralChar(ch)) {
        return parseLiteral();
      }
      throw new ParseError(
        `Unexpected character '${ch}'`,
        pos
      );
    }
    function parseLiteral() {
      const start = pos;
      let value = "";
      while (pos < src.length) {
        const ch = peek();
        if (isLiteralChar(ch)) {
          value += advance();
        } else {
          break;
        }
      }
      if (value.length === 0) {
        throw new ParseError("Expected literal", start);
      }
      return { type: "literal", value };
    }
    function parseAlternation() {
      const start = pos;
      expect("{");
      const options = [];
      options.push(parseAltItem());
      while (peek() === ",") {
        advance();
        options.push(parseAltItem());
      }
      expect("}");
      if (options.length < 2) {
        throw new ParseError(
          "Alternation must have at least two options",
          start
        );
      }
      return { type: "alternation", options };
    }
    function parseAltItem() {
      let value = "";
      while (pos < src.length) {
        const ch = peek();
        if (isLiteralChar(ch)) {
          value += advance();
        } else {
          break;
        }
      }
      if (value.length === 0) {
        throw new ParseError("Empty alternation item", pos);
      }
      return value;
    }
    function parseCharClass() {
      const start = pos;
      expect("[");
      const charSet = /* @__PURE__ */ new Set();
      if (peek() === "]") {
        throw new ParseError("Empty character class", pos);
      }
      while (pos < src.length && peek() !== "]") {
        const ch = advance();
        if (!isLetter(ch) && !isDigit(ch)) {
          throw new ParseError(
            `Invalid character in character class: '${ch}'`,
            pos - 1
          );
        }
        if (peek() === "-" && pos + 1 < src.length && src[pos + 1] !== "]") {
          advance();
          const end = advance();
          if (isLetter(ch) && isLetter(end)) {
            for (const c of expandRange(ch, end)) {
              charSet.add(c);
            }
          } else if (isDigit(ch) && isDigit(end)) {
            for (const c of expandRange(ch, end)) {
              charSet.add(c);
            }
          } else {
            throw new ParseError(
              `Invalid range: '${ch}-${end}' (must be letter-letter or digit-digit)`,
              start
            );
          }
        } else {
          charSet.add(ch);
        }
      }
      expect("]");
      if (peek() !== "{") {
        throw new ParseError(
          "Character class must be followed by a repetition like {3}",
          pos
        );
      }
      expect("{");
      let numStr = "";
      while (pos < src.length && peek() !== "}") {
        const ch = advance();
        if (!isDigit(ch)) {
          throw new ParseError(`Expected digit in repetition, got '${ch}'`, pos - 1);
        }
        numStr += ch;
      }
      expect("}");
      if (numStr.length === 0) {
        throw new ParseError("Empty repetition count", pos);
      }
      const repetition = parseInt(numStr, 10);
      if (repetition === 0) {
        throw new ParseError("Repetition count must be at least 1", pos);
      }
      return {
        type: "charclass",
        chars: Array.from(charSet).sort(),
        repetition
      };
    }
    const ast = parseDomain();
    if (pos < src.length) {
      throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
    }
    return ast;
  }

  // src/expander.ts
  var ExpansionError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ExpansionError";
    }
  };
  var DEFAULT_MAX_EXPANSION = 1e5;
  function expansionSize(ast) {
    let total = 1;
    for (const label of ast.labels) {
      const labelSize = labelExpansionSize(label);
      total *= labelSize;
      if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
        return Infinity;
      }
    }
    return total;
  }
  function uniqueStrings(values) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
    return result;
  }
  function labelExpansionSize(label) {
    let size = 1;
    for (const element of label.elements) {
      size *= elementExpansionSize(element);
      if (!Number.isFinite(size) || size > Number.MAX_SAFE_INTEGER) {
        return Infinity;
      }
    }
    return size;
  }
  function elementExpansionSize(element) {
    switch (element.type) {
      case "literal":
        return 1;
      case "alternation":
        return uniqueStrings(element.options).length;
      case "charclass":
        return Math.pow(element.chars.length, element.repetition);
    }
  }
  function expand(ast, options) {
    const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
    const limit = maxExpansion > 0 && maxExpansion !== Infinity ? maxExpansion : Infinity;
    const labelSets = ast.labels.map(expandLabel);
    return cartesianProductCapped(labelSets, limit).map((parts) => parts.join("."));
  }
  function expandLabel(label) {
    const elementSets = label.elements.map(expandElement);
    return cartesianProduct(elementSets).map((parts) => parts.join(""));
  }
  function expandElement(element) {
    switch (element.type) {
      case "literal":
        return [element.value];
      case "alternation":
        return uniqueStrings(element.options);
      case "charclass":
        return expandCharClass(element.chars, element.repetition);
    }
  }
  function expandCharClass(chars, repetition) {
    if (repetition === 0) return [""];
    let results = chars.map((c) => c);
    for (let i = 1; i < repetition; i++) {
      const next = [];
      for (const existing of results) {
        for (const ch of chars) {
          next.push(existing + ch);
        }
      }
      results = next;
    }
    return results;
  }
  function cartesianProduct(sets) {
    if (sets.length === 0) return [[]];
    let result = [[]];
    for (const set of sets) {
      const next = [];
      for (const existing of result) {
        for (const item of set) {
          next.push([...existing, item]);
        }
      }
      result = next;
    }
    return result;
  }
  function cartesianProductCapped(sets, limit) {
    if (sets.length === 0) return [[]];
    let result = [[]];
    for (const set of sets) {
      const next = [];
      outer: for (const existing of result) {
        for (const item of set) {
          next.push([...existing, item]);
          if (next.length >= limit) break outer;
        }
      }
      result = next;
    }
    return result;
  }

  // src/index.ts
  function ddsl(expression, options) {
    return expand(parse(expression), options);
  }
  return __toCommonJS(index_exports);
})();
