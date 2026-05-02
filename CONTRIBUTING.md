# Contributing to @us-all/mcp-toolkit

Thank you for your interest in contributing! This is a small, focused library. Please read [STANDARD.md](./STANDARD.md) first — it explains *why* the patterns here exist, which is the prerequisite for proposing new ones.

## Development setup

### Prerequisites

- Node.js 18+
- pnpm 10.30+

### Getting started

```bash
git clone https://github.com/us-all/mcp-toolkit.git
cd mcp-toolkit
pnpm install
pnpm run build
pnpm run test
```

## Scope rules

The toolkit accepts:

- **Pure functions / classes** with no domain coupling. `applyExtractFields`, `ToolRegistry`, `createWrapToolHandler` all qualify.
- **Patterns proven across multiple consumers**. If only one server needs it, keep it local — generalize only when at least two consumers would copy it.
- **Type-safe APIs.** Generics over `any`. `unknown` over loose `Record`.

The toolkit rejects:

- SDK / auth / protocol-specific code. That belongs in the consumer.
- Patterns that haven't shipped to production in any consumer yet — let them prove out locally first.
- Helpers that bring in additional runtime dependencies. Peer-deps only (`@modelcontextprotocol/sdk`, `zod`).

## Adding new functionality

### 1. Implement in `src/<feature>.ts`

Keep one feature per file. Export the public API; mark internal helpers `function` (not `export`).

### 2. Re-export from `src/index.ts` AND add a subpath export to `package.json`

```jsonc
// package.json "exports"
"./<feature>": {
  "import": "./dist/<feature>.js",
  "types": "./dist/<feature>.d.ts"
}
```

This lets consumers import either from the top level (`@us-all/mcp-toolkit`) or the subpath (`@us-all/mcp-toolkit/<feature>`).

### 3. Add tests in `tests/<feature>.test.ts`

Cover the happy path AND each documented option. Tests are the spec — if a test would change, the API contract has changed.

### 4. Update `STANDARD.md`

If the feature implements a pattern listed in STANDARD.md, update the example to use it. If it's a new pattern, add a section explaining the *why*.

## API stability

We're in the `0.x` line. Patch bumps may include refactors as long as exported behavior is preserved; minor bumps may add new exports; behavior changes in existing exports require a clear note in the commit message.

After 1.0.0, the public API (top-level + subpath exports) follows strict semver:
- New export → minor
- Behavior change in existing export → major
- Pure refactor → patch

## Pull request process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/<short-name>`)
3. Make your changes; ensure `pnpm build` and `pnpm test` succeed
4. Submit a pull request describing *why* the change is in scope

### PR guidelines

- Keep changes focused — one feature or fix per PR
- Add a CLAUDE.md "최근 변경사항" entry describing the change
- Don't bump `version` in your PR — releases are cut by maintainers tagging `vX.Y.Z`
- If the change affects consumer migration, list which consumers will need updates

## Reporting issues

- Use the [GitHub issue tracker](https://github.com/us-all/mcp-toolkit/issues)
- Include the toolkit version, Node version, and which consumer (if any) is affected
- For security issues, see [SECURITY.md](./SECURITY.md) — do not open public issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
