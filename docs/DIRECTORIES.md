# Directory submission tracker

Public visibility targets. Submit each repo to all 9 directories.

## Submission matrix

| Directory | URL | Method | Notes |
|---|---|---|---|
| modelcontextprotocol/servers (official registry) | https://github.com/modelcontextprotocol/servers | PR adding row to README "Community Servers" table | Highest signal. Required: server name, repo URL, brief description |
| punkpeye/awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | PR | Sort into right category folder. Largest by traffic |
| TensorBlock/awesome-mcp-servers | https://github.com/TensorBlock/awesome-mcp-servers | PR | Domain-foldered. observability for datadog, data for openmetadata, etc. |
| PulseMCP | https://www.pulsemcp.com/submit | Web form | Auto-pulls from GitHub if you point to a tagged release |
| mcp.so | https://mcp.so/submit | Web form | Largest aggregator by raw count |
| mcpservers.org | https://mcpservers.org/submit | GitHub PR or form | Curated; have to write a description |
| Smithery | https://smithery.ai | YAML manifest in repo (`smithery.yaml`) + register | Requires a deploy/runtime config; works best with Streamable HTTP — defer until Phase 5 of mcp-graph-lab? |
| Glama | https://glama.ai/mcp/servers/add | Web form | Auto-indexes from GitHub; needs reachable repo |
| LobeHub MCP Marketplace | https://lobehub.com/mcp | PR to their registry repo | Check current submission process |

## Submission checklist (per repo, per directory)

Before submitting, the repo README must:
- [ ] Lead with use-case (not tool list) per `README-TEMPLATE.md`
- [ ] Have asciinema demo recording at `docs/demo.cast`
- [ ] Show comparison table vs at least 2 competitors
- [ ] List 5 example prompts
- [ ] Have working `pnpm dlx @us-all/<DOMAIN>-mcp@latest` install snippet
- [ ] Reference `@us-all/mcp-toolkit` clearly

## Per-repo submission state

| Repo | official | punkpeye | TensorBlock | PulseMCP | mcp.so | mcpservers.org | Smithery | Glama | LobeHub |
|---|---|---|---|---|---|---|---|---|---|
| datadog-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| openmetadata-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| mlflow-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| google-drive-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| unifi-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| android-mcp | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (defer) | ⬜ | ⬜ |
| mcp-toolkit | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | (n/a — library) | ⬜ | ⬜ |

`✅ submitted-merged · ⏳ submitted-pending · ⬜ todo · — n/a`

## Suggested order of operations

1. **Apply README-TEMPLATE.md to one pilot repo first** (suggest `datadog-mcp` — strongest hand: 159 tools, SLO CRUD, DD official server visible reference point). Iterate template based on what works.
2. **Record one asciinema demo** for datadog-mcp. Validate the format/length is right.
3. **Submit datadog-mcp to 3 directories** (start with TensorBlock + PulseMCP + mcp.so — fastest turnaround). Measure download lift.
4. **Roll the validated template + demo recipe to the other 5 repos**, one per day.
5. **Mass-submit** the remaining 5 repos to all 9 directories.

Total estimated effort: 1 day for pilot, 5 days for rollout, ~2 hours per repo for submissions = **~1 week part-time**.

## Out-of-directory channels (parallel)

These don't fit the directory-list pattern but are equal-leverage:

- **MLflow GitHub issues**: comment on `mlflow/mlflow#23034`, `#22625`, `#23049` showing how `@us-all/mlflow-mcp` already does what's being requested.
- **OpenMetadata Slack** `#community-resources`: link to repo + `lineage-impact-analysis` prompt.
- **Ubiquiti community** "UniFi MCP" threads: cite our Site Manager analytics tools as differentiation vs sirkirby/enuno.
- **Datadog winor30 channel reach** (Composio/Quickchat blog comments): present 159 tools + SLO CRUD as upgrade path from winor30's 25.
- **Reddit**: r/mcp Show & Tell post (one-shot for the suite, not per-repo).
- **dev.to**: "Building a 7-server MCP suite with @us-all/mcp-toolkit" — drives both library and consumers.
