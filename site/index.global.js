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
    clearVariables: () => clearVariables,
    ddsl: () => ddsl,
    ddslDocument: () => ddslDocument,
    documentExpansionSize: () => documentExpansionSize,
    expand: () => expand,
    expandDocument: () => expandDocument,
    expansionSize: () => expansionSize,
    parse: () => parse,
    parseDocument: () => parseDocument,
    prepare: () => prepare,
    prepareDocument: () => prepareDocument,
    preview: () => preview,
    previewDocument: () => previewDocument,
    setVariables: () => setVariables
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
  var VOWELS = ["a", "e", "i", "o", "u"];
  var CONSONANTS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t", "v", "w", "x", "y", "z"];
  var UNIVERSE = [..."abcdefghijklmnopqrstuvwxyz0123456789"];
  function isLetter(ch) {
    return LETTER.test(ch);
  }
  function isDigit(ch) {
    return DIGIT.test(ch);
  }
  function isLiteralChar(ch) {
    return isLetter(ch) || isDigit(ch) || ch === "-";
  }
  function isVarNameChar(ch) {
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
  function prepareDocument(input) {
    return input.split("\n").map((line) => {
      const commentIdx = line.indexOf("#");
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx);
      }
      return line.trim().toLowerCase();
    }).filter((line) => line.length > 0);
  }
  function canProduceEmpty(elements) {
    return elements.every((el) => {
      if (el.optional) return true;
      const p = el.primary;
      if (p.type === "charclass" && p.repetitionMin === 0) return true;
      if (p.type === "group") {
        if (p.repetitionMin === 0) return true;
        return canProduceEmpty(p.elements);
      }
      if (p.type === "alternation") {
        return p.options.some((opt) => canProduceEmpty(opt));
      }
      return false;
    });
  }
  function substituteVariables(line, varStrings) {
    let result = "";
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch !== "@") {
        result += ch;
        i++;
        continue;
      }
      i++;
      let name = "";
      while (i < line.length && isVarNameChar(line[i])) {
        name += line[i];
        i++;
      }
      if (name.length === 0) {
        throw new ParseError("Empty variable name", i);
      }
      const value = varStrings.get(name);
      if (value === void 0) {
        throw new ParseError(`Undefined variable @${name}`, i);
      }
      result += value;
    }
    return result;
  }
  function parseDocument(lines) {
    const variables = [];
    const expressions = [];
    const varStrings = /* @__PURE__ */ new Map();
    for (const line of lines) {
      if (line.startsWith("@")) {
        const eqIdx = line.indexOf("=");
        if (eqIdx === -1) {
          const substituted = substituteVariables(line, varStrings);
          const domain = parseExpression(substituted, /* @__PURE__ */ new Map());
          expressions.push(domain);
        } else {
          const name = line.slice(1, eqIdx).trim().toLowerCase();
          const value = line.slice(eqIdx + 1).trim();
          if (name.length === 0) {
            throw new ParseError("Empty variable name", 0);
          }
          if (varStrings.has(name)) {
            throw new ParseError(`Variable @${name} is already defined`, 0);
          }
          const substituted = substituteVariables(value, varStrings);
          if (substituted.length === 0) {
            throw new ParseError("Empty variable definition", 0);
          }
          const elements = parseSequenceString(substituted, /* @__PURE__ */ new Map());
          varStrings.set(name, substituted);
          variables.push({ type: "vardef", name, elements });
        }
      } else {
        const substituted = substituteVariables(line, varStrings);
        const domain = parseExpression(substituted, /* @__PURE__ */ new Map());
        expressions.push(domain);
      }
    }
    return { type: "document", variables, expressions };
  }
  function parseSequenceString(input, varMap) {
    const src = input.toLowerCase();
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
    function isRepetitionAhead() {
      if (src[pos] !== "{") return false;
      let i = pos + 1;
      if (i >= src.length || !isDigit(src[i])) return false;
      while (i < src.length && isDigit(src[i])) i++;
      if (i >= src.length) return false;
      if (src[i] === "}") return true;
      if (src[i] !== ",") return false;
      i++;
      if (i >= src.length || !isDigit(src[i])) return false;
      while (i < src.length && isDigit(src[i])) i++;
      return i < src.length && src[i] === "}";
    }
    const elements = parseSequenceInner();
    if (pos < src.length) {
      throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
    }
    return elements;
    function parseSequenceInner() {
      const elements2 = [];
      while (pos < src.length) {
        const ch = peek();
        if (ch === "." || ch === "," || ch === ")" || ch === "}") {
          break;
        }
        elements2.push(parseElement());
      }
      return elements2;
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
        if (pos + 1 < src.length && src[pos + 1] === ":") {
          return parseStandaloneNamedClass();
        }
        return parseCharClass();
      }
      if (ch === "{") {
        return parseAlternation();
      }
      if (ch === "(") {
        return parseGroup();
      }
      if (ch === "@") {
        return parseVarRef();
      }
      if (ch !== void 0 && isLiteralChar(ch)) {
        return parseLiteral();
      }
      throw new ParseError(`Unexpected character '${ch}'`, pos);
    }
    function parseLiteral() {
      let value = "";
      while (pos < src.length) {
        const ch = peek();
        if (isLiteralChar(ch)) {
          value += advance();
        } else {
          break;
        }
      }
      return { type: "literal", value };
    }
    function parseVarRef() {
      advance();
      let name = "";
      while (pos < src.length && isVarNameChar(peek())) {
        name += advance();
      }
      if (name.length === 0) {
        throw new ParseError("Empty variable name", pos);
      }
      if (!varMap.has(name)) {
        throw new ParseError(`Undefined variable @${name}`, pos);
      }
      return { type: "varref", name };
    }
    function parseStandaloneNamedClass() {
      const start = pos;
      advance();
      advance();
      let className = "";
      while (pos < src.length && peek() !== ":") {
        className += advance();
      }
      if (peek() !== ":" || src[pos + 1] !== "]") {
        throw new ParseError("Invalid named class syntax", pos);
      }
      advance();
      advance();
      let chars;
      if (className === "v") {
        chars = [...VOWELS];
      } else if (className === "c") {
        chars = [...CONSONANTS];
      } else {
        throw new ParseError(`Unknown named class [:${className}:]`, start);
      }
      chars.sort();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "charclass", chars, negated: false, repetitionMin, repetitionMax };
    }
    function parseGroup() {
      const start = pos;
      advance();
      const elements2 = parseSequenceInner();
      if (elements2.length === 0) {
        throw new ParseError("Empty group", start);
      }
      if (peek() !== ")") {
        throw new ParseError(`Expected ')' but found ${peek() ?? "end of input"}`, pos);
      }
      advance();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "group", elements: elements2, repetitionMin, repetitionMax };
    }
    function parseAlternation() {
      const start = pos;
      advance();
      const options = [];
      const firstSeq = parseSequenceInner();
      if (firstSeq.length === 0) {
        throw new ParseError("Empty alternation item", pos);
      }
      options.push(firstSeq);
      while (peek() === ",") {
        advance();
        const seq = parseSequenceInner();
        if (seq.length === 0) {
          throw new ParseError("Empty alternation item", pos);
        }
        options.push(seq);
      }
      if (peek() !== "}") {
        throw new ParseError(`Expected '}' but found ${peek() ?? "end of input"}`, pos);
      }
      advance();
      if (options.length < 2) {
        throw new ParseError("Alternation must have at least two options", start);
      }
      return { type: "alternation", options };
    }
    function parseCharClass() {
      const start = pos;
      advance();
      let negated = false;
      if (peek() === "^") {
        negated = true;
        advance();
      }
      const charSet = /* @__PURE__ */ new Set();
      if (peek() === "]") {
        throw new ParseError("Empty character class", pos);
      }
      while (pos < src.length && peek() !== "]") {
        if (peek() === "[" && pos + 1 < src.length && src[pos + 1] === ":") {
          advance();
          advance();
          let className = "";
          while (pos < src.length && peek() !== ":") {
            className += advance();
          }
          if (peek() !== ":" || src[pos + 1] !== "]") {
            throw new ParseError("Invalid named class syntax", pos);
          }
          advance();
          advance();
          if (className === "v") {
            VOWELS.forEach((c) => charSet.add(c));
          } else if (className === "c") {
            CONSONANTS.forEach((c) => charSet.add(c));
          } else {
            throw new ParseError(`Unknown named class [:${className}:]`, start);
          }
          continue;
        }
        const ch = advance();
        if (!isLetter(ch) && !isDigit(ch)) {
          throw new ParseError(`Invalid character in character class: '${ch}'`, pos - 1);
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
            throw new ParseError(`Invalid range: '${ch}-${end}'`, start);
          }
        } else {
          charSet.add(ch);
        }
      }
      if (peek() !== "]") {
        throw new ParseError("Unterminated character class", start);
      }
      advance();
      let chars;
      if (negated) {
        chars = UNIVERSE.filter((c) => !charSet.has(c));
      } else {
        chars = Array.from(charSet);
      }
      chars.sort();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "charclass", chars, negated, repetitionMin, repetitionMax };
    }
    function parseRepetition() {
      const start = pos;
      advance();
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
      let min = parseInt(numStr, 10);
      let max = min;
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
          throw new ParseError("Empty repetition max", pos);
        }
        max = parseInt(maxStr, 10);
      }
      if (peek() !== "}") {
        throw new ParseError("Unterminated repetition", start);
      }
      advance();
      if (min > max) {
        throw new ParseError(`Invalid repetition range: min (${min}) > max (${max})`, start);
      }
      return { min, max };
    }
  }
  function parseExpression(input, varMap) {
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
    function isRepetitionAhead() {
      if (src[pos] !== "{") return false;
      let i = pos + 1;
      if (i >= src.length || !isDigit(src[i])) return false;
      while (i < src.length && isDigit(src[i])) i++;
      if (i >= src.length) return false;
      if (src[i] === "}") return true;
      if (src[i] !== ",") return false;
      i++;
      if (i >= src.length || !isDigit(src[i])) return false;
      while (i < src.length && isDigit(src[i])) i++;
      return i < src.length && src[i] === "}";
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
        if (pos + 1 < src.length && src[pos + 1] === ":") {
          return parseStandaloneNamedClass();
        }
        return parseCharClass();
      }
      if (ch === "{") {
        return parseAlternation();
      }
      if (ch === "(") {
        return parseGroup();
      }
      if (ch === "@") {
        return parseVarRef();
      }
      if (ch !== void 0 && isLiteralChar(ch)) {
        return parseLiteral();
      }
      throw new ParseError(`Unexpected character '${ch}'`, pos);
    }
    function parseLiteral() {
      let value = "";
      while (pos < src.length) {
        const ch = peek();
        if (isLiteralChar(ch)) {
          value += advance();
        } else {
          break;
        }
      }
      return { type: "literal", value };
    }
    function parseVarRef() {
      advance();
      let name = "";
      while (pos < src.length && isVarNameChar(peek())) {
        name += advance();
      }
      if (name.length === 0) {
        throw new ParseError("Empty variable name", pos);
      }
      if (!varMap.has(name)) {
        throw new ParseError(`Undefined variable @${name}`, pos);
      }
      return { type: "varref", name };
    }
    function parseStandaloneNamedClass() {
      const start = pos;
      advance();
      advance();
      let className = "";
      while (pos < src.length && peek() !== ":") {
        className += advance();
      }
      if (peek() !== ":" || src[pos + 1] !== "]") {
        throw new ParseError("Invalid named class syntax", pos);
      }
      advance();
      advance();
      let chars;
      if (className === "v") {
        chars = [...VOWELS];
      } else if (className === "c") {
        chars = [...CONSONANTS];
      } else {
        throw new ParseError(`Unknown named class [:${className}:]`, start);
      }
      chars.sort();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "charclass", chars, negated: false, repetitionMin, repetitionMax };
    }
    function parseGroup() {
      const start = pos;
      advance();
      const elements = parseSequence();
      if (elements.length === 0) {
        throw new ParseError("Empty group", start);
      }
      if (peek() !== ")") {
        throw new ParseError(`Expected ')' but found ${peek() ?? "end of input"}`, pos);
      }
      advance();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "group", elements, repetitionMin, repetitionMax };
    }
    function parseAlternation() {
      const start = pos;
      advance();
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
      if (peek() !== "}") {
        throw new ParseError(`Expected '}' but found ${peek() ?? "end of input"}`, pos);
      }
      advance();
      if (options.length < 2) {
        throw new ParseError("Alternation must have at least two options", start);
      }
      return { type: "alternation", options };
    }
    function parseCharClass() {
      const start = pos;
      advance();
      let negated = false;
      if (peek() === "^") {
        negated = true;
        advance();
      }
      const charSet = /* @__PURE__ */ new Set();
      if (peek() === "]") {
        throw new ParseError("Empty character class", pos);
      }
      while (pos < src.length && peek() !== "]") {
        if (peek() === "[" && pos + 1 < src.length && src[pos + 1] === ":") {
          advance();
          advance();
          let className = "";
          while (pos < src.length && peek() !== ":") {
            className += advance();
          }
          if (peek() !== ":" || src[pos + 1] !== "]") {
            throw new ParseError("Invalid named class syntax", pos);
          }
          advance();
          advance();
          if (className === "v") {
            VOWELS.forEach((c) => charSet.add(c));
          } else if (className === "c") {
            CONSONANTS.forEach((c) => charSet.add(c));
          } else {
            throw new ParseError(`Unknown named class [:${className}:]`, start);
          }
          continue;
        }
        const ch = advance();
        if (!isLetter(ch) && !isDigit(ch)) {
          throw new ParseError(`Invalid character in character class: '${ch}'`, pos - 1);
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
            throw new ParseError(`Invalid range: '${ch}-${end}'`, start);
          }
        } else {
          charSet.add(ch);
        }
      }
      if (peek() !== "]") {
        throw new ParseError("Unterminated character class", start);
      }
      advance();
      let chars;
      if (negated) {
        chars = UNIVERSE.filter((c) => !charSet.has(c));
      } else {
        chars = Array.from(charSet);
      }
      chars.sort();
      let repetitionMin = 1;
      let repetitionMax = 1;
      if (isRepetitionAhead()) {
        const rep = parseRepetition();
        repetitionMin = rep.min;
        repetitionMax = rep.max;
      }
      return { type: "charclass", chars, negated, repetitionMin, repetitionMax };
    }
    function parseRepetition() {
      const start = pos;
      advance();
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
      let min = parseInt(numStr, 10);
      let max = min;
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
          throw new ParseError("Empty repetition max", pos);
        }
        max = parseInt(maxStr, 10);
      }
      if (peek() !== "}") {
        throw new ParseError("Unterminated repetition", start);
      }
      advance();
      if (min > max) {
        throw new ParseError(`Invalid repetition range: min (${min}) > max (${max})`, start);
      }
      return { min, max };
    }
    const ast = parseDomain();
    if (pos < src.length) {
      throw new ParseError(`Unexpected character '${src[pos]}'`, pos);
    }
    return ast;
  }
  function parse(input) {
    return parseExpression(input, /* @__PURE__ */ new Map());
  }

  // src/expander.ts
  var ExpansionError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "ExpansionError";
    }
  };
  var DEFAULT_MAX_EXPANSION = 1e6;
  var variableMap = /* @__PURE__ */ new Map();
  function setVariables(variables) {
    variableMap = /* @__PURE__ */ new Map();
    for (const v of variables) {
      variableMap.set(v.name, v.elements);
    }
  }
  function clearVariables() {
    variableMap = /* @__PURE__ */ new Map();
  }
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
  function documentExpansionSize(doc) {
    setVariables(doc.variables);
    try {
      return calcDocumentSize(doc);
    } finally {
      clearVariables();
    }
  }
  function calcDocumentSize(doc) {
    let total = 0;
    for (const expr of doc.expressions) {
      const size = expansionSize(expr);
      total += size;
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
      case "group": {
        const innerSize = sequenceExpansionSize(primary.elements);
        let total = 0;
        for (let r = primary.repetitionMin; r <= primary.repetitionMax; r++) {
          total += Math.pow(innerSize, r);
          if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
            return Infinity;
          }
        }
        return total;
      }
      case "varref": {
        const varElements = variableMap.get(primary.name);
        if (!varElements) {
          return 0;
        }
        return sequenceExpansionSize(varElements);
      }
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
  function expandDocument(doc, options) {
    const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
    setVariables(doc.variables);
    try {
      if (maxExpansion > 0 && maxExpansion !== Infinity) {
        const size = calcDocumentSize(doc);
        if (size > maxExpansion) {
          throw new ExpansionError(
            `Document would expand to ${size.toLocaleString()} domains, which exceeds the limit of ${maxExpansion.toLocaleString()}`
          );
        }
      }
      const allDomains = /* @__PURE__ */ new Set();
      for (const expr of doc.expressions) {
        const domains = expand(expr, { maxExpansion: Infinity });
        for (const d of domains) {
          allDomains.add(d);
        }
      }
      return [...allDomains];
    } finally {
      clearVariables();
    }
  }
  function preview(ast, limit, options) {
    const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
    const total = expansionSize(ast);
    if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
      throw new ExpansionError(
        `Expression would expand to ${total.toLocaleString()} domains, which exceeds the limit of ${maxExpansion.toLocaleString()}`
      );
    }
    const truncated = total > limit;
    const labelSets = ast.labels.map(expandLabel);
    const domains = [...new Set(cartesianProductCapped(labelSets, limit).map((parts) => parts.join(".")))];
    return { domains, total, truncated };
  }
  function previewDocument(doc, limit, options) {
    const maxExpansion = options?.maxExpansion ?? DEFAULT_MAX_EXPANSION;
    setVariables(doc.variables);
    try {
      const total = calcDocumentSize(doc);
      if (maxExpansion > 0 && maxExpansion !== Infinity && total > maxExpansion) {
        throw new ExpansionError(
          `Document would expand to ${total.toLocaleString()} domains, which exceeds the limit of ${maxExpansion.toLocaleString()}`
        );
      }
      const truncated = total > limit;
      const allDomains = [];
      let remaining = limit;
      for (const expr of doc.expressions) {
        if (remaining <= 0) break;
        const result = preview(expr, remaining, { maxExpansion: Infinity });
        for (const s of result.domains) {
          allDomains.push(s);
        }
        remaining -= result.domains.length;
      }
      return {
        domains: [...new Set(allDomains)].slice(0, limit),
        total,
        truncated
      };
    } finally {
      clearVariables();
    }
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
        return expandGroup(primary.elements, primary.repetitionMin, primary.repetitionMax);
      case "varref": {
        const varElements = variableMap.get(primary.name);
        if (!varElements) {
          return [];
        }
        return expandSequence(varElements);
      }
    }
  }
  function expandCharClass(chars, min, max) {
    let results = [];
    for (let rep = min; rep <= max; rep++) {
      if (rep === 0) {
        results.push("");
      } else {
        results = results.concat(expandCharClassFixed(chars, rep));
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
  function expandGroup(elements, min, max) {
    const innerStrings = expandSequence(elements);
    const results = [];
    for (let rep = min; rep <= max; rep++) {
      if (rep === 0) {
        results.push("");
      } else {
        const expanded = expandGroupFixed(innerStrings, rep);
        for (const s of expanded) {
          results.push(s);
        }
      }
    }
    return results;
  }
  function expandGroupFixed(strings, repetition) {
    if (repetition === 0) return [""];
    if (repetition === 1) return strings;
    let results = [...strings];
    for (let i = 1; i < repetition; i++) {
      const next = [];
      for (const existing of results) {
        for (const s of strings) {
          next.push(existing + s);
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
  function ddslDocument(input, options) {
    const lines = prepareDocument(input);
    const doc = parseDocument(lines);
    return expandDocument(doc, options);
  }
  return __toCommonJS(index_exports);
})();
