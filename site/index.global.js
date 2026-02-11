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
    parse: () => parse,
    prepare: () => prepare,
    preview: () => preview
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
  function prepare(input) {
    return input.replace(/\s+/g, "");
  }
  function canProduceEmpty(elements) {
    return elements.every((el) => {
      if (el.optional) return true;
      const p = el.primary;
      if (p.type === "charclass" && p.repetitionMin === 0) return true;
      if (p.type === "group") return canProduceEmpty(p.elements);
      if (p.type === "alternation") {
        return p.options.every((opt) => canProduceEmpty(opt));
      }
      return false;
    });
  }
  function parse(input) {
    const src = input.toLowerCase();
    if (src.length === 0) {
      throw new ParseError("Empty expression", 0);
    }
    if (/\s/.test(src)) {
      const pos2 = src.search(/\s/);
      throw new ParseError("Whitespace is not permitted", pos2);
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
      const startPos = pos;
      if (pos >= src.length || peek() === ".") {
        throw new ParseError("Empty label", pos);
      }
      const elements = parseSequence();
      if (elements.length === 0) {
        throw new ParseError("Empty label", startPos);
      }
      if (canProduceEmpty(elements)) {
        throw new ParseError(
          "Label must produce at least one character in every expansion branch",
          startPos
        );
      }
      return { type: "label", elements };
    }
    function parseSequence() {
      const elements = [];
      while (pos < src.length) {
        const ch = peek();
        if (ch === "." || ch === "," || ch === ")" || ch === "}") {
          break;
        }
        elements.push(parseElement());
      }
      return elements;
    }
    function parseElement() {
      const primary = parsePrimary();
      let optional = false;
      if (peek() === "?") {
        advance();
        optional = true;
      }
      return { primary, optional };
    }
    function parsePrimary() {
      const ch = peek();
      if (ch === "[") {
        return parseCharClass();
      }
      if (ch === "{") {
        return parseAlternation();
      }
      if (ch === "(") {
        return parseGroup();
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
    function parseGroup() {
      const start = pos;
      expect("(");
      const elements = parseSequence();
      if (elements.length === 0) {
        throw new ParseError("Empty group", start);
      }
      expect(")");
      return { type: "group", elements };
    }
    function parseAlternation() {
      const start = pos;
      expect("{");
      const options = [];
      const firstSeq = parseSequence();
      if (firstSeq.length === 0) {
        throw new ParseError("Empty alternation item", pos);
      }
      options.push(firstSeq);
      while (peek() === ",") {
        advance();
        const seq = parseSequence();
        if (seq.length === 0) {
          throw new ParseError("Empty alternation item", pos);
        }
        options.push(seq);
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
          "Character class must be followed by a repetition like {3} or {2,5}",
          pos
        );
      }
      expect("{");
      let numStr = "";
      while (pos < src.length && peek() !== "}" && peek() !== ",") {
        const ch = advance();
        if (!isDigit(ch)) {
          throw new ParseError(`Expected digit in repetition, got '${ch}'`, pos - 1);
        }
        numStr += ch;
      }
      if (numStr.length === 0) {
        throw new ParseError("Empty repetition count", pos);
      }
      let repetitionMin = parseInt(numStr, 10);
      let repetitionMax = repetitionMin;
      if (peek() === ",") {
        advance();
        let maxStr = "";
        while (pos < src.length && peek() !== "}") {
          const ch = advance();
          if (!isDigit(ch)) {
            throw new ParseError(`Expected digit in repetition max, got '${ch}'`, pos - 1);
          }
          maxStr += ch;
        }
        if (maxStr.length === 0) {
          throw new ParseError("Empty repetition max (open-ended ranges not supported)", pos);
        }
        repetitionMax = parseInt(maxStr, 10);
      }
      expect("}");
      if (repetitionMin > repetitionMax) {
        throw new ParseError(
          `Invalid repetition range: min (${repetitionMin}) > max (${repetitionMax})`,
          start
        );
      }
      return {
        type: "charclass",
        chars: Array.from(charSet).sort(),
        repetitionMin,
        repetitionMax
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
  var DEFAULT_MAX_EXPANSION = 1e6;
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
  function labelExpansionSize(label) {
    return sequenceExpansionSize(label.elements);
  }
  function sequenceExpansionSize(elements) {
    let size = 1;
    for (const element of elements) {
      size *= elementExpansionSize(element);
      if (!Number.isFinite(size) || size > Number.MAX_SAFE_INTEGER) {
        return Infinity;
      }
    }
    return size;
  }
  function elementExpansionSize(element) {
    const primarySize = primaryExpansionSize(element.primary);
    if (element.optional) {
      return primarySize + 1;
    }
    return primarySize;
  }
  function primaryExpansionSize(primary) {
    switch (primary.type) {
      case "literal":
        return 1;
      case "alternation": {
        let total = 0;
        for (const option of primary.options) {
          total += sequenceExpansionSize(option);
          if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
            return Infinity;
          }
        }
        return total;
      }
      case "charclass": {
        let total = 0;
        for (let r = primary.repetitionMin; r <= primary.repetitionMax; r++) {
          total += Math.pow(primary.chars.length, r);
          if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
            return Infinity;
          }
        }
        return total;
      }
      case "group":
        return sequenceExpansionSize(primary.elements);
    }
  }
  function expand(ast, options) {
    const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
    if (maxExpansion > 0 && maxExpansion !== Infinity) {
      const size = expansionSize(ast);
      if (size > maxExpansion) {
        throw new ExpansionError(
          `Expression would expand to ${size.toLocaleString()} domains, which exceeds the limit of ${maxExpansion.toLocaleString()}`
        );
      }
    }
    const labelSets = ast.labels.map(expandLabel);
    return [...new Set(cartesianProduct(labelSets).map((parts) => parts.join(".")))];
  }
  function preview(ast, limit) {
    const total = expansionSize(ast);
    const truncated = total > limit;
    const labelSets = ast.labels.map(expandLabel);
    const domains = [...new Set(cartesianProductCapped(labelSets, limit).map((parts) => parts.join(".")))];
    return { domains, total, truncated };
  }
  function expandLabel(label) {
    return expandSequence(label.elements);
  }
  function expandSequence(elements) {
    const elementSets = elements.map(expandElement);
    return cartesianProduct(elementSets).map((parts) => parts.join(""));
  }
  function expandElement(element) {
    const primaryStrings = expandPrimary(element.primary);
    if (element.optional) {
      const result = ["", ...primaryStrings];
      return [...new Set(result)];
    }
    return primaryStrings;
  }
  function expandPrimary(primary) {
    switch (primary.type) {
      case "literal":
        return [primary.value];
      case "alternation": {
        const results = [];
        for (const option of primary.options) {
          results.push(...expandSequence(option));
        }
        return [...new Set(results)];
      }
      case "charclass":
        return expandCharClass(primary.chars, primary.repetitionMin, primary.repetitionMax);
      case "group":
        return expandSequence(primary.elements);
    }
  }
  function expandCharClass(chars, min, max) {
    const results = [];
    for (let rep = min; rep <= max; rep++) {
      if (rep === 0) {
        results.push("");
      } else {
        results.push(...expandCharClassFixed(chars, rep));
      }
    }
    return results;
  }
  function expandCharClassFixed(chars, repetition) {
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
