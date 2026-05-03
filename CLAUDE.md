# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 컨텍스트입니다.

## 프로젝트 개요

`@us-all/mcp-toolkit` — `@us-all/*` MCP 서버용 공통 빌딩 블록. 6개 production MCP에서 검증된 토큰 효율 패턴을 단일 npm 패키지로 추출.

- **타겟**: Node 18+, ESM, TypeScript strict
- **Peer deps**: `@modelcontextprotocol/sdk` ^1.27 || ^1.28 || ^1.29, `zod` ^4
- **목적**: 6 production MCP의 코드 중복 제거 + 패턴 진화 시 단일 진실 소스
- **표준 문서**: [STANDARD.md](./STANDARD.md) — 패턴의 *why*, 이 패키지는 *how*

## 디렉토리

```
src/
├── extract-fields.ts       # applyExtractFields(data, expr?) — 응답 필드 프로젝션
├── registry.ts             # ToolRegistry<TCategory> + createSearchToolsMetaTool + parseEnvList
├── wrap-tool-handler.ts    # createWrapToolHandler — 에러 sanitize + structured 응답 + extractFields auto-apply
├── aggregate.ts            # aggregate(fetchers, caveats) — Promise.allSettled + 라벨링된 caveats 보일러플레이트 통합
└── index.ts                # re-export 통합 진입점
tests/
├── extract-fields.test.ts      # 9 cases — wildcards, backtick keys, projection 엣지
├── registry.test.ts            # 11 cases — search 매칭, 카테고리 토글, allowlist/denylist
├── wrap-tool-handler.test.ts   # 16 cases — 성공/에러 경로, 커스텀 redaction, errorExtractors
└── aggregate.test.ts           # 11 cases — 성공/거부 mix, 커스텀 formatReason, 동시성 검증
STANDARD.md             # us-all MCP 작성 표준 (패턴 가이드)
```

## Build & Run

```bash
pnpm install
pnpm build          # tsc → dist/
pnpm test           # 36 unit tests
```

## 설계 원칙

- **Pure functions / pure classes**: 외부 의존성 없는 도메인-독립 코드만 추출. SDK/auth 등 도메인 특수 로직은 각 repo에 유지.
- **Generic categories**: `ToolRegistry<TCategory>` — 각 repo가 자체 `CATEGORIES` 상수를 typed로 정의해서 사용.
- **Always-enabled meta**: `meta` 카테고리는 기본적으로 항상 활성. `alwaysEnabled` 옵션으로 커스터마이즈 가능.
- **Schema opt-in**: `extractFields`는 각 도구 schema가 명시적으로 선언해야 동작 (MCP SDK가 미선언 필드를 validation에서 drop). STANDARD.md에 caveat 명시.

## 의존 관계 (consumer)

| repo | 의존 |
|------|------|
| openmetadata-mcp v1.7.0+ | ✓ |
| google-drive-mcp v1.8.0+ | ✓ |
| datadog-mcp v1.12.0+ | ✓ |
| mlflow-mcp v1.6.0+ | ✓ |
| unifi-mcp v1.5.0+ | ✓ |
| android-mcp v1.7.0+ | ✓ |

## 최근 변경사항

- **v1.1.0** (2026-05-03): `aggregate(fetchers, caveats, formatReason?)` helper 추가 (`./aggregate` sub-export). 6 consumer의 어그리게이션 도구가 반복하던 `Promise.allSettled` + 라벨링된 `caveats.push(...)` 보일러플레이트(블록당 10-15 lines)를 1줄 호출로 단축. 타입은 입력 fetcher object 모양에서 추론, rejected slot은 `null`. `defaultFormatReason` 헬퍼도 별도 노출. 11 신규 테스트 (총 47/47).
- **v1.0.0** (2026-05-03): API freeze. v0.2.0 이후 6 consumer 모두 `^0.2.0` 핀에 안정 안착, 후속 변경 0건, 36/36 테스트 통과 → semver 1.x 보장 시작. Public surface 12 symbol (4 entry points) 그대로. Breaking change 없음, 단순 안정화 마일스톤.
- **v0.2.0** (2026-05-02): `createWrapToolHandler` factory 추가 — 6 consumer repo의 `tools/utils.ts` 패턴 통합. 옵션: `redactionPatterns` (기본 7종 + caller 패턴 머지), `errorExtractors` (커스텀 에러 클래스 매칭, `passthrough`/`structured` 분기), `extractFieldsParam`. 기본 export `wrapToolHandler`는 zero-config. 16 신규 테스트.
- **v0.1.0** (2026-05-01): 초기 릴리즈. `applyExtractFields`, `ToolRegistry<TCategory>`, `createSearchToolsMetaTool`, `parseEnvList`, `extractFieldsDescription` 노출.
- 6 production repo가 동일 세션에서 즉시 마이그레이션 (~990 lines 코드 중복 제거).
- npm trusted publishing (GitHub Actions OIDC) 설정 완료.
- STANDARD.md 이 repo로 이전 (이전엔 datadog-mcp-server에 위치).

## 알려진 이슈

- **`@modelcontextprotocol/sdk` 2.0-alpha 호환성 미검증**: alpha 단계라 stable 대기 중. 1.x 라인은 ^1.27 || ^1.28 || ^1.29 명시.
- **테스트는 toolkit 자체만**: 6 consumer repo의 통합 테스트는 각 repo가 책임. toolkit 변경 시 consumer breakage 가능 → semver minor에서 깨지지 않도록 주의.

## 개선 로드맵

- [x] 초기 릴리즈 (extract-fields + registry + search-tools meta)
- [x] 6 production repo 마이그레이션
- [x] `wrapToolHandler` factory — 6 repo가 각자 만드는 sanitization 로직 통합 (v0.2.0)
- [x] 6 consumer repo 마이그레이션 (각 repo의 `tools/utils.ts` 제거 + toolkit factory 호출로 교체) — v0.2.0 wave에서 완료
- [x] 1.0.0 안정화 (semver guarantee) — v1.0.0
- [x] `aggregate(fetchers, caveats)` helper — aggregation 도구의 error reporting 패턴화 (v1.1.0)
- [ ] `resourceHelper` — `asJson(uri, data)` 같은 반복 헬퍼 노출 (1.x post-release)
- [ ] `wrapImageToolHandler` 추출 — android-mcp 로컬 패턴이 toolkit으로 올라갈지 평가 (잠재 BC, 2.0 후보)

## Cascade 자동화

`.github/workflows/cascade-bump.yml` — toolkit publish 성공 시 6 consumer repo에 PR 자동 생성:
- `@us-all/mcp-toolkit` dep 핀을 새 버전으로 갱신
- consumer PATCH version bump
- `pnpm install` + build + test 실행 (성공해야 PR 생성됨)
- CLAUDE.md "최근 변경사항" 섹션에 entry 자동 삽입
- PR은 **자동 머지 안 함** — 리뷰 후 머지하면 consumer publish workflow가 점화

**일회성 셋업 필요**: org/repo settings에 `CASCADE_PAT` secret 등록.
- fine-grained PAT, repository scope = 6 consumer repo, permissions = Contents:write + Pull requests:write + Workflows:write
- 또는 GitHub App (us-all/* org 전체 설치, 같은 권한)

수동 트리거: `gh workflow run cascade-bump.yml -f version=1.x.y` (us-all/mcp-toolkit repo).

## 단일 진실 소스 (Single Source of Truth)

신규 패턴 진화 시 toolkit 한 곳만 업데이트 → 6 repo 자동 혜택.

새 MCP 작성 시:
1. `pnpm add @us-all/mcp-toolkit @modelcontextprotocol/sdk zod`
2. STANDARD.md의 가이드대로 `tool()` 헬퍼 + `currentCategory` 패턴 사용
3. README에 `[![@us-all standard](https://img.shields.io/badge/built%20to-%40us--all%20MCP%20standard-blue)](https://github.com/us-all/mcp-toolkit/blob/main/STANDARD.md)` 배지
