# 햄찌법원 Android 앱 버전 기록

앱 껍데기(TWA)의 버전만 적는다. 웹 기능 업데이트는 Vercel 배포만으로 앱에 바로 반영되므로 여기 적지 않는다.
새 항목은 `pnpm android:bump <patch|minor|major> "변경 내용"`이 맨 위에 추가한다. Play에 올린 versionCode는 다시 쓸 수 없다.

## 1.0.0 (versionCode 1) — 2026-11-17
- 첫 버전: https://hamzzi-courthouse.vercel.app TWA, 패키지 app.vercel.hamzzi_courthouse.twa, minSdk 24 · targetSdk 36
