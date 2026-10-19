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
| `pnpm test` / `pnpm test:e2e` | 단위 / E2E 테스트 |
| `pnpm lint` / `pnpm typecheck` | 린트 / 타입 검사 |
| `pnpm docs:check` | PRD·설계 문서 교차 검증 |
| `pnpm collector:test` | Python 수집기 테스트 |

## 문서
- 제품 요구사항: [docs/PRD.md](docs/PRD.md)
- 설계: [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATA_MODEL](docs/DATA_MODEL.md) · [API](docs/API.md)
- 리서치: [docs/research](docs/research/)
- 브랜드: [docs/05_브랜드_가이드.md](docs/05_브랜드_가이드.md)
