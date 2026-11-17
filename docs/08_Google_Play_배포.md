# 08. Google Play 배포 (Android 앱)

햄찌법원 Android 앱은 배포 사이트 `https://hamzzi-courthouse.vercel.app`을 그대로 띄우는 **TWA(Trusted Web Activity)** 앱이다. 앱 안에 웹 코드를 넣지 않으므로, 웹을 배포하면 앱 내용도 바로 바뀐다. 앱을 다시 올려야 하는 때는 이름·아이콘·색·패키지 설정을 바꿀 때뿐이다.

> 정책 내용은 2026-11-17에 Google 도움말에서 확인했다. Play 정책은 자주 바뀌므로 제출 직전에 각 절의 출처 링크를 다시 확인한다.

## 1. 방식과 이유

| 방식 | 판단 |
|---|---|
| **TWA (Bubblewrap)** — 채택 | 서버 기능(SSE 분석 스트림, Supabase, 쿠키 `hz_anon`, 관리자 모드)이 웹과 똑같이 동작한다. 화면은 기기의 Chrome이 그리므로 웹과 차이가 없다. Google이 공식으로 권하는 PWA → Play 방식 |
| Capacitor 로컬 번들 / 정적 내보내기 | 쓰지 않는다. 라우트 핸들러·서버 컴포넌트·`cacheComponents`가 서버를 필요로 해서 정적 내보내기가 안 된다 |
| WebView 래퍼 | 쓰지 않는다. 쿠키·스트리밍 처리를 직접 맞춰야 하고, 웹 저장소가 브라우저와 따로 놀아 동작이 달라질 수 있다 |

참고: TWA 앱은 기기의 Chrome과 **쿠키를 공유**한다. 같은 기기에서 Chrome으로 햄찌법원을 쓰던 사람은 앱에서도 같은 `hz_anon` 세션이 이어지고, 비로그인 질문 횟수(**하루 3회, 매일 초기화** — 서버 규칙을 그대로 따름)도 함께 센다.

## 2. 저장소 구성

| 파일 | 역할 |
|---|---|
| `app/manifest.ts` | 웹 앱 매니페스트(`/manifest.webmanifest`). 이름 "햄찌법원", 아이콘, theme `#FAF9F6`(--bg), 시작 화면 바탕 `#F4EEE1`(--cream) |
| `app/layout.tsx` | `viewport.themeColor`(상태 표시줄 색) |
| `public/icons/` | 앱 아이콘 192·512, 마스커블 192·512. `scripts/make_app_icons.py`로 다시 만든다 |
| `public/.well-known/assetlinks.json` | 앱 ↔ 사이트 연결(Digital Asset Links). **지문은 자리표시** — 5절에서 채운다 |
| `twa/twa-manifest.json` | Bubblewrap 설정. 패키지 `app.vercel.hamzzi_courthouse.twa`, 버전, 색, 아이콘 URL, 서명 키 위치 |
| `twa/` 나머지 | Bubblewrap 1.27.0이 만든 Android(Gradle) 프로젝트. `minSdkVersion 24`(androidbrowserhelper 2.7.4 요구), `targetSdkVersion 36` |
| `twa/store/` | 스토어 등록용 아이콘(512×512)과 그래픽 이미지 초안(1024×500) |
| `twa/release.mjs` · `twa/CHANGELOG.md` | 버전 올리기·검사·빌드 도구(`pnpm android:version`·`android:bump`·`android:build`)와 앱 버전 기록 (3.3절) |

서비스 워커는 넣지 않았다. 지금 Chrome·Bubblewrap은 설치·TWA에 서비스 워커를 요구하지 않고, 오프라인에서 법률 정보를 보여 줄 수도 없어서다. 인터넷이 끊기면 Chrome 기본 오류 화면이 나온다.

`twa/.gitignore`가 빌드 결과(`*.apk`·`*.aab`)와 **서명 키(`*.jks`·`*.keystore`)를 커밋에서 막는다.** 키와 비밀번호는 저장소·채팅·이슈 어디에도 올리지 않는다.

## 3. 로컬 빌드

필요한 것: JDK 17 이상(이 컴퓨터는 Temurin 21), Android SDK(build-tools·platform 36, Android Studio가 깐 `%LOCALAPPDATA%\Android\Sdk`). Gradle 8.11.1과 라이브러리는 처음 빌드할 때 자동으로 내려받는다.

```bash
pnpm android:build
```

(`twa/release.mjs build`: 버전 일치 검사 → `twa/`에서 `gradlew assembleDebug bundleRelease` → `twa/dist/`에 버전 이름 붙여 복사. `ANDROID_HOME`이 없으면 Windows 기본 SDK 위치를 쓴다.)

| 결과물 | 경로 | 쓰임 |
|---|---|---|
| 디버그 APK | `twa/app/build/outputs/apk/debug/app-debug.apk` | 내 폰에 직접 설치해 보기(`adb install`). 디버그 키로 서명돼 있어 assetlinks와 지문이 달라, 화면 위에 주소 표시줄이 보이는 것이 정상 |
| 릴리스 AAB(서명 전) | `twa/app/build/outputs/bundle/release/app-release.aab` | 아래 업로드 키로 서명한 뒤 Play Console에 올린다 |

### 3.1 업로드 키 만들기 (사용자가 직접, 한 번)

```bash
keytool -genkeypair -v -keystore twa/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- 비밀번호는 keytool이 물어볼 때 직접 입력한다. `twa/upload-keystore.jks`는 `.gitignore`에 걸려 커밋되지 않는다.
- 키 파일과 비밀번호를 **저장소 밖 두 곳 이상에 백업**한다(비밀번호 관리자 등). 잃어버리면 Play Console에서 업로드 키 재설정을 요청해야 한다.
- 업로드 키 지문(SHA-256) 보기: `keytool -list -v -keystore twa/upload-keystore.jks -alias upload`

### 3.2 업로드용 AAB 서명

```bash
jarsigner -keystore twa/upload-keystore.jks twa/app/build/outputs/bundle/release/app-release.aab upload
```

Bubblewrap CLI로 해도 된다(`npx @bubblewrap/cli@1.27.0 build`, `twa/`에서). 단 Bubblewrap CLI는 **JDK 17만** 받아들이므로(처음 실행할 때 JDK 17 설치를 제안한다), 지금 컴퓨터(JDK 21)에서는 위 Gradle + jarsigner 방법이 간단하다.

### 3.3 업데이트와 버전 관리

**먼저 판단: 앱을 다시 올려야 하나?**

| 바뀐 것 | 할 일 | 앱 버전 |
|---|---|---|
| 웹 기능·화면·문구·API·DB (대부분의 업데이트) | main 푸시 → Vercel 배포. 앱은 그대로 두면 다음 실행부터 새 웹이 뜬다 | 그대로 |
| 앱 이름·아이콘·색·시작 화면, 패키지 설정, minSdk/targetSdk, Play 정책 대응(예: 매년 targetSdk 상향) | 아래 순서로 새 AAB를 만들어 올린다 | 올림 |

**버전 규칙** — 기준은 `twa/twa-manifest.json` 한 곳이다.
- `appVersionCode`(정수, Play가 보는 번호): 올릴 때마다 **1씩 증가**. Play에 한 번 올린 번호는 (테스트 트랙에서 지웠어도) 다시 쓸 수 없다.
- `appVersion`(보이는 이름, `x.y.z`): `patch` = 아이콘·색·문구 같은 작은 껍데기 수정, `minor` = 기능 설정 추가(바로가기·알림 등), `major` = 패키지 구조나 최소 Android 버전처럼 큰 변경.
- `app/build.gradle`의 `versionCode`·`versionName`은 스크립트가 맞춰 준다. 손으로 따로 고치지 않는다.

**순서**

```bash
pnpm android:version
```
1. 현재 버전과 두 파일 일치 여부를 본다.
```bash
pnpm android:bump patch "아이콘 교체"
```
2. 버전을 올린다. `twa-manifest.json`·`app/build.gradle`이 같이 바뀌고 `twa/CHANGELOG.md` 맨 위에 기록이 생긴다.
3. 설정(색·아이콘 등)까지 바꿨다면 `twa-manifest.json`을 고친 뒤 `twa/`에서 `npx @bubblewrap/cli@1.27.0 update --skipVersionUpgrade`로 Android 프로젝트를 다시 만든다(버전은 2에서 이미 올렸으므로 Bubblewrap이 또 올리지 않게 한다. 아이콘은 배포 사이트 `iconUrl`에서 받으므로 웹을 먼저 배포한다). 버전만 올리는 경우는 건너뛴다.
```bash
pnpm android:build
```
4. 빌드한다. 두 파일 버전이 다르면 멈춘다. 결과는 `twa/dist/hamzzi-court-<버전>-vc<번호>-unsigned.aab`·`-debug.apk`로 복사돼 어느 버전인지 헷갈리지 않는다(`dist/`는 커밋 안 됨).
5. 3.2대로 AAB에 서명하고 Play Console(내부 테스트 → 위 트랙)에 올린다. **출시 노트**에 CHANGELOG 내용을 적는다.
6. 올린 뒤 커밋하고 태그를 단다: `git tag android-v1.0.1` (태그 = Play에 올라간 버전 기록).

아이콘 그림을 바꾸려면 `python -X utf8 scripts/make_app_icons.py`를 실행한다(마스코트 원본 `public/mascot/hamzzi-judge.webp`에서 얼굴을 잘라 크림 바탕에 올림). 웹 아이콘은 배포만으로 바뀌지만, **앱 런처 아이콘은 앱에 들어가 있어서 새 버전을 올려야** 바뀐다.

## 4. Play Console 개발자 계정 (사용자가 직접)

- 등록비 **미화 25달러, 한 번만** 낸다. 개인 계정은 **법적 이름과 같은 정부 발급 신분증·신용카드**로 본인 확인을 할 수 있고, 게시 전에 **Play Console 모바일 앱으로 Android 기기 접근을 확인**해야 한다. ([Play Console 가입 도움말](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en))
- 개인 계정 이름·주소 일부가 스토어에 개발자 정보로 공개될 수 있다. 공개하고 싶지 않으면 조직 계정(사업자 정보 필요)을 검토한다.

## 5. 앱 만들기 · 앱 서명 · 사이트 연결

1. Play Console → **앱 만들기**: 기본 언어 한국어, 앱 이름 "햄찌법원", 앱(게임 아님), 무료.
2. **Play App Signing**을 쓴다(새 앱은 기본). Google이 실제 배포용 **앱 서명 키**를 보관하고, 우리는 3.1의 **업로드 키**로 서명한 AAB만 올린다.
3. 첫 AAB를 내부 테스트 트랙에 올린 뒤, **테스트 및 출시 → 설정 → 앱 무결성 → 앱 서명**에서 **앱 서명 키 인증서의 SHA-256 지문**을 복사한다.
4. `public/.well-known/assetlinks.json`의 `REPLACE_WITH_PLAY_APP_SIGNING_KEY_SHA256`를 그 지문(`AA:BB:…` 형식)으로 바꾼다. 내가 직접 서명한 AAB/APK도 전체 화면으로 보고 싶으면 업로드 키 지문을 배열에 하나 더 넣는다. 지문은 비밀이 아니라 공개해도 되는 값이다.
5. 웹을 배포(main 푸시 → Vercel)하고 연결을 확인한다:
   - `https://hamzzi-courthouse.vercel.app/.well-known/assetlinks.json`이 JSON으로 열리는지
   - [Google Digital Asset Links 확인 API](https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://hamzzi-courthouse.vercel.app&relation=delegate_permission/common.handle_all_urls)에 패키지 이름이 보이는지
6. Play에서 받은 앱을 열었을 때 **주소 표시줄이 없으면** 연결 성공이다. 주소 표시줄이 보이면 지문·패키지 이름이 틀린 것이다.

## 6. 스토어 등록 정보

| 항목 | 내용 (초안) |
|---|---|
| 앱 이름 (30자) | 햄찌법원 |
| 간단한 설명 (80자) | 내 법률 문제를 법령·판례 근거로 정리해 주는 AI 법률 정보 서비스 (법률 자문 아님) |
| 앱 아이콘 | `twa/store/play-icon-512.png` (512×512 PNG) |
| 그래픽 이미지 | `twa/store/feature-graphic-1024x500.png` (초안, 바꿔도 됨) |
| 휴대전화 스크린샷 | 2~8장 — **사용자가 실제 기기·에뮬레이터에서 캡처**(홈, 결과 화면, 판례 검색, 절차 타임라인 등). 개인정보가 보이지 않는 예시 질문 화면으로 찍는다 |
| 카테고리 | 도서/참고자료 또는 교육 (선택) |
| 연락처 이메일 | 사용자가 정한다(공개됨) |
| 개인정보처리방침 URL | `https://hamzzi-courthouse.vercel.app/privacy` |

자세한 설명 초안 (단정 표현·승률 표현 없이):

```
햄찌법원은 일상에서 겪는 법률 문제를 문장으로 적으면, 관련 법령과 판례를 찾아 쟁점과 절차를 정리해 보여 주는 AI 법률 정보 서비스예요.

· 근거 중심: 답변에 쓰인 조문·판례는 법제처 국가법령정보센터에서 그때그때 찾아온 자료이고, 원문과 대조한 근거만 보여 드려요.
· 절차 안내: 단계별로 "혼자 가능 / 전문가 권장"을 표시해요.
· 개인정보 보호: 이름·전화번호 같은 정보는 가린 문장만 저장하고 30일 뒤 지워요.
· 로그인 없이 하루 3번 질문할 수 있어요(매일 초기화).

꼭 알아 두세요
· AI가 만든 정보이며 법률 자문이 아니에요. 구체적인 판단은 변호사 등 전문가와 상담하세요.
· 햄찌법원은 정부·법원·법제처와 관련이 없는 개인 서비스예요.
· 법령·판례 출처: 법제처 국가법령정보센터 (https://www.law.go.kr), 국가법령정보 공동활용 Open API (https://open.law.go.kr)
```

## 7. 앱 콘텐츠 (정책 신고)

### 7.1 개인정보처리방침
- URL은 `/privacy`. Play는 방침에 **개발자 정보와 개인정보 문의처**가 있기를 요구한다. 지금 방침 5절은 "정식 출시 전에 적을 예정"이므로 **제출 전에 책임자·연락처를 채운다**(법무 검토 항목).

### 7.2 데이터 보안 섹션 (제안 — 제출 전 법무 확인)
근거: `app/privacy/page.tsx`, `docs/DATA_MODEL.md`.

| Play 항목 | 신고 제안 | 근거 |
|---|---|---|
| 앱 활동 → 기타 사용자 제작 콘텐츠 | 수집함 · 앱 기능 · 선택 아님(질문하려면 필요) | 질문은 **마스킹본만** 저장, 원문 저장 안 함, 30일 보관 후 자동 삭제. 의견도 가린 문장만 |
| 기기 또는 기타 ID | 수집함 · 앱 기능·사기 방지(남용 방지) | 쿠키 `hz_anon`(무작위 세션 번호)로 질문 횟수를 셈. IP는 **원본을 저장하지 않고** 비밀값을 섞은 해시만 저장 |
| 위치·연락처·사진·금융·건강 항목 | 수집하지 않음 | 별도 수집 기능 없음. 단, 사용자가 질문에 건강·범죄경력 등을 적으면 동의 후 가린 문장으로 처리됨 — 이 점을 신고에 반영할지 법무 확인 |
| 데이터 공유 | 법무 확인 | 가린 문장에서 만든 검색 문장을 법제처 Open API로 보냄(제3자 공유로 볼지 확인). 유료 모드일 때 AI 제공자(Anthropic)로 가린 문장 전송 — 처리 위탁(서비스 제공자)으로 보면 '공유' 아님 |
| 전송 중 암호화 | 예 (HTTPS) | |
| 삭제 요청 | 가능 — `/privacy`의 "내 데이터 지우기" | 계정이 없어 계정 삭제 URL 항목은 해당 없음 |

### 7.3 그 밖의 신고
- **광고**: 없음.
- **앱 액세스**: 로그인 없이 모든 기능 사용 가능. (관리자 모드는 운영자 전용이라 심사용 계정 안내 불필요)
- **타겟층**: 만 18세 이상만 선택한다(어린이 대상이 아님 → 가족 정책 대상 아님).
- **콘텐츠 등급**: IARC 설문 작성. 카테고리는 참고·뉴스·교육. 사용자끼리 소통·콘텐츠 공유 없음, 폭력·성적 내용 없음으로 답한다. 결과 등급은 설문 결과를 따른다.
- **정부 정보 앱 요건**: 정부와 관련 없는 앱이 정부 정보를 전하면 **설명·스토어 페이지에 정보 출처를 보이게 적고, 정부를 대표하지 않음을 분명히** 해야 한다. 6절 설명 초안에 둘 다 넣었다. ([정부 정보 앱 요건](https://support.google.com/googleplay/android-developer/answer/9514050?hl=en))
- **생성형 AI 콘텐츠 정책**: AI가 불쾌하거나 부정직한 행동을 돕는 내용을 만들지 않게 할 책임이 개발자에게 있다. 햄찌법원은 검증 근거 밖 인용 차단(F-005), 단정 표현 금지(N1), 문서 작성 게이트(DEC-022)로 대응한다. ([AI 생성 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en))

## 8. 법률 정보 앱 주의점

- 모든 AI 결과에 `AI_NOTICE`("AI 생성 · 법률 자문 아님", `lib/api/respond.ts`)가 붙는다. 앱은 같은 웹을 띄우므로 따로 할 일은 없고, **스토어 설명·스크린샷 문구에도 같은 원칙**을 지킨다.
- 스토어 문구·스크린샷에 "반드시", "무조건", "100%", 승소·처벌 가능성, 승률 같은 표현을 쓰지 않는다(CLAUDE.md 절대 규칙 2).
- 변호사 연결·과금·법률문서 생성은 F-013 승인 전 꺼져 있다. 스토어 설명에 이 기능들을 쓰지 않는다.
- 아이콘·그래픽에 법원·정부 상징(태극 문양, 법원 로고 등)을 넣지 않는다(정부 사칭 오해 방지).

## 9. 신규 개인 계정의 비공개 테스트 요건

**2023-11-13 이후 만든 개인 개발자 계정**은 프로덕션 출시 신청 전에 **테스터 12명 이상이 14일 이상 연속으로 참여(옵트인)한 비공개 테스트**를 거쳐야 한다. 조직 계정과 그 전에 만든 개인 계정은 해당하지 않는다. ([앱 테스트 요건 도움말](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en))

- 중간에 옵트아웃했다가 다시 들어온 테스터는 다시 14일을 채워야 한다.
- 테스터는 Google 계정 이메일 목록이나 Google 그룹으로 초대하고, 초대 링크로 옵트인한 뒤 Play에서 앱을 설치한다.
- 14일 동안 테스터가 실제로 앱을 써 보고 의견을 남기게 한다. 프로덕션 신청 때 테스트 내용을 묻는 질문에 답해야 한다.

## 10. 출시 순서

1. **내부 테스트** — 3.2에서 서명한 AAB를 올리고 나(와 소수)만 설치. 5절 assetlinks 지문을 채워 배포한 뒤, 주소 표시줄 없이 열리는지·예시 질문·판례 검색·개인정보처리방침이 잘 보이는지 확인한다(예시 질문은 저장된 답변 재생이라 비용 0. 그 밖의 실제 질문은 CLAUDE.md 절대 규칙 8대로 사용자 판단).
2. **비공개 테스트** — 테스터 12명 이상, 14일 이상 연속(9절). 이 기간에 7절 신고·6절 등록 정보를 모두 채운다.
3. **프로덕션 액세스 신청** — Play Console 대시보드에서 신청하고 질문지에 답한다. 심사를 기다린다.
4. **프로덕션 출시** — 단계적 출시(예: 일부 비율부터)로 시작할 수 있다.

## 11. 사용자가 직접 할 일 체크리스트

- [ ] Play Console 개발자 계정 등록(25달러, 신분증·카드 본인 확인, Android 기기 확인)
- [ ] 업로드 키 만들기(3.1) + 저장소 밖 백업
- [ ] AAB 빌드·서명(3장) 후 내부 테스트에 업로드
- [ ] 앱 서명 키 SHA-256을 `public/.well-known/assetlinks.json`에 넣고 웹 배포(5절)
- [ ] 개인정보처리방침에 책임자·연락처 추가(7.1)
- [ ] 데이터 보안·콘텐츠 등급·타겟층·광고 신고(7절) — 데이터 공유 항목은 법무 확인
- [ ] 스크린샷 2~8장 캡처, 연락처 이메일, 카테고리, 설명 확정(6절)
- [ ] 테스터 12명 모집 → 14일 연속 비공개 테스트(9절) → 프로덕션 신청
