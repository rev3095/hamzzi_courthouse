# 햄찌법원 (Hamzzi Court)

자연어로 설명한 법률 문제를 구조화하고, 실제 법령·판례를 근거로 보여주는 AI 법률 정보 탐색 서비스입니다.

> 햄찌법원은 법률 정보를 제공하며 법률 자문을 하지 않습니다. 햄찌 판사는 AI 캐릭터입니다.

## 시작하기

필요: Node 24+, pnpm 10+, Python 3.12 + uv, (로컬 DB를 쓸 때) Docker

```bash
pnpm install
pnpm dev
```

| 명령 | 설명 |
|---|---|
| `pnpm build` | 프로덕션 빌드 |
| `pnpm test` / `pnpm test:e2e` | 단위 / E2E 테스트 |
| `pnpm test:live` | 법제처 실호출 스모크 테스트 (키·등록 IP 필요, 기본 테스트에서 제외) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | 린트 / 타입 검사 / 포맷 |
| `pnpm docs:check` | PRD·설계 문서 교차 검증 |
| `pnpm collector:test` | Python 수집기 테스트 |

## 법령·판례 조회: korean-law-mcp

[korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)(MIT, 4.15.6 고정)를 두 가지로 쓴다 (PRD DEC-009).

1. **서비스(데모)**: 판례 검색·본문, 법령 조문, 인용 재조회를 서버 코드에서 라이브러리로 직접 호출한다. 호출은 [lib/search](lib/search/)의 어댑터 한 곳을 거친다. 실시간 조회한 판례 본문은 저장하지 않는다 (DEC-007).
2. **개발 보조**: Claude Code에서 로컬 stdio MCP 서버로 쓴다. 설정: [.mcp.json](.mcp.json) → [scripts/korean-law-mcp.mjs](scripts/korean-law-mcp.mjs).

- 법제처 OC 키: 서비스 코드는 `OPEN_LAW_API_KEY`를 읽는다. 개발용 MCP는 `.env.local`의 `LAW_OC`를 쓰고, 없으면 `OPEN_LAW_API_KEY`를 쓴다.
- 법제처 API는 신청 때 등록한 IP에서 호출해야 한다. 배포 서버(예: Vercel)에서도 호출이 되는지는 배포 전에 확인한다 (OQ-ARC-05).

## 문서
- 제품 요구사항: [docs/PRD.md](docs/PRD.md)
- 설계: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA_MODEL](docs/DATA_MODEL.md) · [API](docs/API.md)
- 리서치: [docs/research](docs/research/)
- 브랜드: [docs/05_브랜드_가이드.md](docs/05_브랜드_가이드.md)
