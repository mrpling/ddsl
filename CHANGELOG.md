# Changelog
All notable changes to this project will be documented in this file.

## - 2026-02-19 - v0.3.1
- Named classes `[:v:]` and `[:c:]` are now valid as standalone elements in an expression, behaving
  like a character class with an implied `{1}` repetition. Explicit repetition (e.g. `[:c:]{3,5}`)
  and the `?` optional operator are also supported in standalone form.
- Named classes inside bracket expressions (`[[:v:]]`, `[[:c:]]`, `[^[:c:]]`) continue to work
  unchanged. This is a fully backwards-compatible change.

## - 2026-02-17
- Initial release, v0.3.