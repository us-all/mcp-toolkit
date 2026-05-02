# Security Policy

`@us-all/mcp-toolkit` is a shared library used by 6 production MCP servers. Security work here propagates to all of them — please err on the side of caution.

## Defensive surfaces

The toolkit ships two security-relevant utilities. Changes that weaken either are treated as breaking and require a major-version bump (or, in the 0.x line, a clear changelog warning).

### Error redaction (`createWrapToolHandler`)

`DEFAULT_REDACTION_PATTERNS` covers the common credential leak vectors observed across consumers: `api_key`, `app_key`, `authorization`, `bearer`, `password`, `secret`, `token`. Consumer servers extend this with domain-specific env-var names (`DD_API_KEY`, `OPENMETADATA_TOKEN`, `X-API-KEY`, etc.) via the `redactionPatterns` option. Both lists are applied to error message strings and string fields in structured error payloads before returning to the LLM client.

If you add or change a default pattern, document the rationale in the commit message — consumers rely on these defaults rather than re-listing them locally.

### `passthrough` vs `structured` error shapes

`{ kind: "passthrough", text }` returns raw text without sanitization. This is intentional for cases like `WriteBlockedError` where the message is fully controlled by us. **Do not use `passthrough` for errors whose message can include data from upstream APIs** — those must use `structured` (which sanitizes by default).

## Reporting a vulnerability

If you discover a security issue, please email the maintainers directly rather than opening a public issue. We will respond within 72 hours.

When reporting, include:
- A minimal reproduction
- Whether the issue affects the toolkit alone or also one of the consumer servers (datadog, openmetadata, google-drive, mlflow, unifi, android)
- Suggested patch if you have one

## Coordinated disclosure

Because the toolkit is a dependency of 6 published servers, security fixes are released first as a toolkit patch, then the consumer servers bump their pin in sequence. Embargo until all 7 packages are published.
