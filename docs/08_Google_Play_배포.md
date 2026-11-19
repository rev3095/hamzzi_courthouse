# 08. Google Play 배포 (Android 앱)

햄찌법원 Android 앱은 **Capacitor 앱**이다(DEC-048, 2026-11-20). 앱 화면(`mobile/`)과 규칙 판독기(`lib/reader`)·검증된 예시 답변 45건을 앱 안에 넣어, **인터넷이 없어도** 질문을 읽고 절차·확인할 것을 정리한다. AI 답변(법령·판례 근거)은 웹에서 받는다 — 앱 안의 온라인 AI 판독은 자리만 두고 꺼 두었다(`lib/reader/source.ts`).

처음에는 배포 사이트를 그대로 띄우는 TWA(`twa/`)로 만들었다(2026-11-17, PR #1). TWA 프로젝트는 지우지 않고 남겨 두지만 스토어에는 Capacitor 앱을 올린다. 둘은 같은 패키지 이름을 쓰므로 **둘 중 하나만** 올린다.

> 정책 내용은 2026-11-17에 Google 도움말에서 확인했다. Play 정책은 자주 바뀌므로 제출 직전에 각 절의 출처 링크를 다시 확인한다.
> iOS(App Store)·두 스토어 공통 준비물·진행 번호(P14~P30)는 `docs/reports/2026-11-19_앱_제작_스토어_등록_보고서.md`.

## 1. 방식과 이유

| 방식 | 판단 |
|---|---|
| **Capacitor (앱 화면을 앱 안에 넣음)** — 채택 (DEC-048) | 인터넷 없이 열리고, 규칙 판독기·예시 답변이 기기 안에서 돈다(비용 0). 사용자가 다른 프로젝트(Minimal PT)에서 쓰는 방식이고, 같은 코드로 iOS 앱도 만든다. 웹(Next.js) 전체를 내보내는 것이 아니라, 서버가 필요 없는 앱 전용 화면(`mobile/`)을 따로 만들어 저장소의 순수 규칙(`lib/reader`·`lib/procedure`·`lib/pii`)을 그대로 쓴다 |
| TWA (Bubblewrap, `twa/`) | 처음 방식. 웹을 그대로 띄우므로 웹 배포가 곧 앱 업데이트지만 인터넷이 없으면 열리지 않고, Apple은 웹을 감싼 앱을 받지 않는다(4.2). 남겨 두되 올리지 않는다 |
| 웹 전체를 WebView로 띄우기 | 쓰지 않는다. 쿠키·스트리밍을 따로 맞춰야 하고 오프라인에서 쓸 수 없다 |

**웹과 앱이 다른 점**: 웹 기능(분석 API, 로그인, 커뮤니티, 판례 검색)은 앱에 없다. 앱은 오프라인 판독 + 예시 답변 + 공식 기관 링크 + "웹에서 근거 보기" 링크(바깥 브라우저로 첫 화면만 연다. 질문을 웹으로 보내지 않는다)다. 그래서 **웹 배포만으로는 앱이 바뀌지 않는다** — 판독 규칙·절차 문안·예시가 바뀌면 앱을 다시 빌드해 올린다(3.3).

## 2. 저장소 구성

| 파일 | 역할 |
|---|---|
| `lib/reader/` | 오프라인 판독기 (README에 순서·정확도·하지 않는 것) |
| `mobile/src/` | 앱 화면 (React + Vite). 질문 정리 · 예시 답변 · 앱 정보 |
| `mobile/vite.config.ts` | 앱 화면 빌드 → `mobile/dist/` (`@/` = 저장소 루트) |
| `mobile/capacitor.config.ts` | 앱 이름 "햄찌법원", 패키지 `app.vercel.hamzzi_courthouse.twa`(사용자 확정), `webDir: dist` |
| `mobile/android/` · `mobile/ios/` | Capacitor 8이 만든 네이티브 프로젝트 (minSdk 24, targetSdk 36 / iOS 번들 ID `app.vercel.hamzzi-courthouse`) |
| `mobile/app-version.json` | **앱 버전의 한 곳** (3.3절) |
| `mobile/release.mjs` · `mobile/CHANGELOG.md` | 버전 검사·올리기·빌드 도구(`pnpm app:version`·`app:bump`·`app:sync`·`app:apk`)와 앱 버전 기록 |
| `scripts/make_mobile_assets.py` | 앱 아이콘·시작 화면(햄찌 얼굴, 크림 바탕)을 Android·iOS에 만든다 |
| `twa/store/` | 스토어 등록용 아이콘(512×512)과 그래픽 이미지 초안(1024×500) — Capacitor 앱에도 그대로 쓴다 |
| `twa/` 나머지 · `public/.well-known/assetlinks.json` | 처음 방식(TWA). Capacitor 앱은 assetlinks가 필요 없다 |

`mobile/.gitignore`가 빌드 결과(`dist/`·`out/`)와 **서명 키(`*.jks`·`*.keystore`·`keystore.properties`)를 커밋에서 막는다.** 키와 비밀번호는 저장소·채팅·이슈 어디에도 올리지 않는다.

## 3. 로컬 빌드

필요한 것: Node·pnpm(저장소와 같음), JDK 17 이상(이 컴퓨터는 Temurin 21), Android SDK(`%LOCALAPPDATA%\Android\Sdk`, platform 36). Gradle과 라이브러리는 처음 빌드할 때 자동으로 내려받는다. iOS는 macOS + Xcode가 있어야 빌드된다(보고서 P25).

```bash
pnpm app:apk
```

(`mobile/release.mjs apk`: 앱 화면 빌드(vite) → `cap sync`(Android·iOS에 복사) → 버전 다시 반영·검사 → `mobile/android`에서 `gradlew assembleDebug bundleRelease` → `mobile/out/`에 버전 이름 붙여 복사.)

| 결과물 | 경로 | 쓰임 |
|---|---|---|
| 디버그 APK | `mobile/out/hamzzi-court-app-<버전>-vc<번호>-debug.apk` | 내 폰·에뮬레이터에 직접 설치해 보기(`adb install -r <파일>`). 디버그 키로 서명돼 있어 Play에는 못 올린다 |
| 릴리스 AAB(서명 전) | `mobile/out/hamzzi-court-app-<버전>-vc<번호>-unsigned.aab` | 아래 업로드 키로 서명한 뒤 Play Console에 올린다 |

화면만 빠르게 보려면 `pnpm app:dev`(http://localhost:5190, 브라우저)로 연다.

### 3.1 업로드 키 만들기 (사용자가 직접, 한 번)

```bash
keytool -genkeypair -v -keystore mobile/upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

- 비밀번호는 keytool이 물어볼 때 직접 입력한다. `mobile/upload-keystore.jks`는 `mobile/.gitignore`에 걸려 커밋되지 않는다. (TWA 때 이미 `twa/upload-keystore.jks`를 만들었다면 그 파일을 그대로 써도 된다 — 업로드 키는 앱마다 하나면 된다.)
- 키 파일과 비밀번호를 **저장소 밖 두 곳 이상에 백업**한다(비밀번호 관리자 등). 잃어버리면 Play Console에서 업로드 키 재설정을 요청해야 한다.
- 업로드 키 지문(SHA-256) 보기: `keytool -list -v -keystore mobile/upload-keystore.jks -alias upload`

### 3.2 업로드용 AAB 서명

```bash
jarsigner -keystore mobile/upload-keystore.jks mobile/out/hamzzi-court-app-1.1.0-vc2-unsigned.aab upload
```

서명한 파일 이름에서 `-unsigned`를 지워 두면 헷갈리지 않는다.

### 3.3 업데이트와 버전 관리

**먼저 판단: 앱을 다시 올려야 하나?**

| 바뀐 것 | 할 일 | 앱 버전 |
|---|---|---|
| 웹에만 있는 기능(분석 API·로그인·커뮤니티·판례 검색·DB) | main 푸시 → Vercel 배포. 앱은 그대로 | 그대로 |
| 앱 화면(`mobile/src`), 판독 규칙(`lib/reader`), 절차 문안(`lib/procedure`), 예시 답변(`lib/demo/examples.json`), 개인정보 가리기(`lib/pii`) | 아래 순서로 새 AAB를 만들어 올린다 — 앱 안에 들어 있는 코드다 | 올림 |
| 앱 이름·아이콘·시작 화면, minSdk/targetSdk, Play 정책 대응(예: 매년 targetSdk 상향) | 아래 순서 | 올림 |

**버전 규칙** — 기준은 `mobile/app-version.json` 한 곳이다.
- `versionCode`(정수, Play·App Store가 보는 번호): 올릴 때마다 **1씩 증가**. 한 번 올린 번호는 (테스트 트랙에서 지웠어도) 다시 쓸 수 없다. TWA 첫 빌드가 1을 썼으므로 Capacitor 앱은 2부터다.
- `versionName`(보이는 이름, `x.y.z`): `patch` = 문구·낱말·아이콘 같은 작은 수정, `minor` = 화면·기능 추가, `major` = 구조 변경.
- `android/app/build.gradle`(versionCode·versionName), `ios/App/App.xcodeproj/project.pbxproj`(CURRENT_PROJECT_VERSION·MARKETING_VERSION·번들 ID), `mobile/package.json`은 스크립트가 맞춰 준다. 손으로 따로 고치지 않는다.

**순서**

```bash
pnpm app:version
```
1. 현재 버전과 Android·iOS 프로젝트가 같은지 본다.
```bash
pnpm app:bump patch "판독 낱말 보강"
```
2. 버전을 올린다. 세 곳이 같이 바뀌고 `mobile/CHANGELOG.md` 맨 위에 기록이 생긴다.
```bash
pnpm app:apk
```
3. 빌드한다. 버전이 어긋나면 멈춘다. 결과는 `mobile/out/`에 버전 이름이 붙어 복사된다(`out/`은 커밋 안 됨).
4. 디버그 APK를 기기에 설치해 **비행기 모드에서도** 열리고 판독되는지 본다.
5. 3.2대로 AAB에 서명하고 Play Console(내부 테스트 → 위 트랙)에 올린다. **출시 노트**에 CHANGELOG 내용을 적는다.
6. 올린 뒤 커밋하고 태그를 단다: `git tag app-v1.1.1` (태그 = 스토어에 올라간 버전 기록).

판독 규칙을 고쳤다면 3번 전에 `pnpm reader:score`(무료 로컬 채점)로 정확도가 떨어지지 않았는지 본다(`lib/reader/README.md`).

아이콘 그림을 바꾸려면 `python -X utf8 scripts/make_app_icons.py`(웹·스토어 아이콘) 뒤 `python -X utf8 scripts/make_mobile_assets.py`(앱 아이콘·시작 화면)를 실행한다. `npx cap add`로 네이티브 프로젝트를 새로 만든 뒤에도 다시 실행한다.

## 4. Play Console 개발자 계정 (사용자가 직접)

- 등록비 **미화 25달러, 한 번만** 낸다. 개인 계정은 **법적 이름과 같은 정부 발급 신분증·신용카드**로 본인 확인을 할 수 있고, 게시 전에 **Play Console 모바일 앱으로 Android 기기 접근을 확인**해야 한다. ([Play Console 가입 도움말](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en))
- 개인 계정 이름·주소 일부가 스토어에 개발자 정보로 공개될 수 있다. 공개하고 싶지 않으면 조직 계정(사업자 정보 필요)을 검토한다.

## 5. 앱 만들기 · 앱 서명

1. Play Console → **앱 만들기**: 기본 언어 한국어, 앱 이름 "햄찌법원", 앱(게임 아님), 무료.
2. **Play App Signing**을 쓴다(새 앱은 기본). Google이 실제 배포용 **앱 서명 키**를 보관하고, 우리는 3.1의 **업로드 키**로 서명한 AAB만 올린다.
3. 첫 AAB를 내부 테스트 트랙에 올린다.

Capacitor 앱은 웹 사이트를 띄우지 않으므로 **사이트 연결(Digital Asset Links)이 필요 없다.** `public/.well-known/assetlinks.json`의 지문을 채울 일(이전 P16)은 없어졌다. 파일은 그대로 두어도 해가 없다.

## 6. 스토어 등록 정보

| 항목 | 내용 (초안) |
|---|---|
| 앱 이름 (30자) | 햄찌법원 (이름의 '법원' 때문에 정부 앱으로 오해받을 수 있어 "햄찌법원 - 법률 절차 정보"도 검토. 앱은 AI를 부르지 않으므로 이름에 'AI'를 넣지 않는다) |
| 간단한 설명 (80자) | 인터넷 없이도 내 법률 문제의 절차와 준비할 것을 정리해 주는 법률 정보 앱 · 법률 자문 아님 |
| 앱 아이콘 | `twa/store/play-icon-512.png` (512×512 PNG) |
| 그래픽 이미지 | `twa/store/feature-graphic-1024x500.png` (초안, 바꿔도 됨) |
| 휴대전화 스크린샷 | 2~8장 — **사용자가 실제 기기·에뮬레이터에서 캡처**(질문 정리 홈, 판독 결과, 절차 순서, 예시 답변, 앱 정보). 개인정보가 보이지 않는 질문으로 찍는다 |
| 카테고리 | 도서/참고자료 또는 교육 (선택) |
| 연락처 이메일 | 사용자가 정한다(공개됨) |
| 개인정보처리방침 URL | `https://hamzzi-courthouse.vercel.app/privacy` |

자세한 설명 초안 (단정 표현·승률 표현 없이):

```
햄찌법원은 일상에서 겪는 법률 문제를 문장으로 적으면, 어떤 절차에 해당하는지와 무엇을 준비하면 좋은지 정리해 주는 법률 정보 앱이에요.

· 인터넷 없이도: 질문을 기기 안에서 정해 둔 규칙으로 읽어요. 질문은 저장하거나 밖으로 보내지 않아요.
· 절차 순서: 단계마다 "혼자 가능 / 상황에 따라 / 전문가 권장"과 준비할 것·주의할 점을 보여 드려요.
· 확인할 것: 적어 주신 날짜·금액·자료를 정리하고, 더 확인해 두면 좋은 것을 알려 드려요.
· 예시 답변: 법령·판례를 미리 확인해 만든 예시 답변을 인터넷 없이 볼 수 있어요.
· 법령·판례 근거가 담긴 AI 답변은 햄찌법원 웹(https://hamzzi-courthouse.vercel.app)에서 받을 수 있어요.

꼭 알아 두세요
· 법률 자문이 아니에요. 결과를 예측하거나 누가 옳은지 판단하지 않아요. 구체적인 판단은 변호사 등 전문가와 상담하세요.
· 예시 답변은 AI가 만든 정보예요.
· 햄찌법원은 정부·법원·법제처와 관련이 없는 개인 서비스예요.
· 법령·판례 출처: 법제처 국가법령정보센터 (https://www.law.go.kr), 국가법령정보 공동활용 Open API (https://open.law.go.kr)
```

## 7. 앱 콘텐츠 (정책 신고)

### 7.1 개인정보처리방침
- URL은 `/privacy`. Play는 방침에 **개발자 정보와 개인정보 문의처**가 있기를 요구한다. 지금 방침 5절은 "정식 출시 전에 적을 예정"이므로 **제출 전에 책임자·연락처를 채운다**(법무 검토 항목).

### 7.2 데이터 보안 섹션 (제안 — 제출 전 법무 확인)
근거: `mobile/src/App.tsx`, `lib/reader/source.ts`.

| Play 항목 | 신고 제안 | 근거 |
|---|---|---|
| 데이터 수집 | **수집하지 않음** | 질문은 기기 안에서만 읽고 저장하지 않는다(화면을 닫으면 사라짐). 앱에 서버·분석 도구·광고 SDK가 없고 네트워크 호출 코드가 없다(온라인 판독은 꺼져 있음) |
| 데이터 공유 | **공유하지 않음** | 위와 같음. "웹에서 근거 보기"·공식 기관 링크는 바깥 브라우저로 주소만 연다 — 질문을 주소에 넣지 않는다 |
| 전송 중 암호화 | 해당 없음(보내는 데이터 없음) | 링크는 모두 HTTPS |
| 삭제 요청 | 해당 없음 | 저장하는 데이터·계정이 없다 |

Play 정의상 기기 밖으로 보내지 않는 데이터는 '수집'이 아니다 ([데이터 보안 섹션 도움말](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)). **온라인 AI 판독을 켜면**(질문을 서버로 보냄) 이 표를 다시 쓴다 — 웹의 신고 내용(가린 질문 저장·30일 보관·처리 위탁)과 Google 로그인을 쓰면 계정 삭제 요건([계정 삭제 요건](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en))을 따르게 된다.

### 7.3 그 밖의 신고
- **광고**: 없음.
- **앱 액세스**: 로그인 없이 모든 기능 사용 가능, 횟수 제한 없음(기기 안 규칙 판독이라 비용이 없다). 심사 안내 칸에 "인터넷 없이 동작하는 규칙 기반 정리 앱이며 AI를 호출하지 않음. 예시 답변은 미리 만든 AI 답변을 앱에 넣은 것"이라고 적는다.
- **타겟층**: 만 18세 이상만 선택한다(어린이 대상이 아님 → 가족 정책 대상 아님).
- **콘텐츠 등급**: IARC 설문 작성. 카테고리는 참고·뉴스·교육. 앱 안에 사용자끼리 소통·콘텐츠 공유 없음(커뮤니티는 웹에만 있음), 폭력·성적 내용 없음으로 답한다. 절차 안내에 범죄 피해(성범죄·가정폭력 등) 신고 절차가 글로 나오므로 설문에서 묻는다면 그대로 답한다. 결과 등급은 설문 결과를 따른다.
- **정부 정보 앱 요건**: 정부와 관련 없는 앱이 정부 정보를 전하면 **설명·스토어 페이지에 정보 출처를 보이게 적고, 정부를 대표하지 않음을 분명히** 해야 한다. 6절 설명 초안에 둘 다 넣었다. ([정부 정보 앱 요건](https://support.google.com/googleplay/android-developer/answer/9514050?hl=en))
- **생성형 AI 콘텐츠 정책**: 앱은 AI를 호출하지 않는다. 앱에 넣은 예시 답변 45건만 AI가 만든 것이고, 근거 대조를 통과한 문단만 넣었으며(F-005) `AI_NOTICE`를 붙인다. 온라인 AI 판독을 켜면 이 정책을 다시 본다. ([AI 생성 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/14094294?hl=en))

## 8. 법률 정보 앱 주의점

- 판독 결과에는 `READER_NOTICE`("규칙으로 정리한 안내 · AI 생성 아님 · 법률 자문 아님"), 예시 답변에는 `AI_NOTICE`("AI 생성 · 법률 자문 아님")가 붙는다. **스토어 설명·스크린샷 문구에도 같은 원칙**을 지킨다.
- 스토어 문구·스크린샷에 "반드시", "무조건", "100%", 승소·처벌 가능성, 승률 같은 표현을 쓰지 않는다(CLAUDE.md 절대 규칙 2).
- 변호사 연결·과금·법률문서 생성은 F-013 승인 전 꺼져 있다. 스토어 설명에 이 기능들을 쓰지 않는다.
- 아이콘·그래픽에 법원·정부 상징(태극 문양, 법원 로고 등)을 넣지 않는다(정부 사칭 오해 방지).

## 9. 신규 개인 계정의 비공개 테스트 요건

**2023-11-13 이후 만든 개인 개발자 계정**은 프로덕션 출시 신청 전에 **테스터 12명 이상이 14일 이상 연속으로 참여(옵트인)한 비공개 테스트**를 거쳐야 한다. 조직 계정과 그 전에 만든 개인 계정은 해당하지 않는다. ([앱 테스트 요건 도움말](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en))

- 중간에 옵트아웃했다가 다시 들어온 테스터는 다시 14일을 채워야 한다.
- 테스터는 Google 계정 이메일 목록이나 Google 그룹으로 초대하고, 초대 링크로 옵트인한 뒤 Play에서 앱을 설치한다.
- 14일 동안 테스터가 실제로 앱을 써 보고 의견을 남기게 한다. 프로덕션 신청 때 테스트 내용을 묻는 질문에 답해야 한다.

## 10. 출시 순서

1. **내부 테스트** — 3.2에서 서명한 AAB를 올리고 나(와 소수)만 설치. **비행기 모드**에서 질문 정리·절차 순서·예시 답변이 되는지, 인터넷을 켰을 때 공식 기관 링크·웹 링크·개인정보처리방침이 바깥 브라우저로 열리는지 확인한다(앱은 AI를 부르지 않아 비용 0).
2. **비공개 테스트** — 테스터 12명 이상, 14일 이상 연속(9절). 이 기간에 7절 신고·6절 등록 정보를 모두 채운다. 테스터가 "분야를 잘못 읽었다"고 한 질문은 직접 다시 쓴 문장으로 `lib/reader/dev-cases.ts`에 더해 고친다(원문은 저장소에 올리지 않는다).
3. **프로덕션 액세스 신청** — Play Console 대시보드에서 신청하고 질문지에 답한다. 심사를 기다린다.
4. **프로덕션 출시** — 단계적 출시(예: 일부 비율부터)로 시작할 수 있다.

## 11. 사용자가 직접 할 일 체크리스트

- [ ] Play Console 개발자 계정 등록(25달러, 신분증·카드 본인 확인, Android 기기 확인)
- [ ] 업로드 키 만들기(3.1) + 저장소 밖 백업
- [ ] 디버그 APK를 내 폰에 설치해 보기(3장, 비행기 모드 포함)
- [ ] AAB 빌드·서명(3장) 후 내부 테스트에 업로드
- [ ] 개인정보처리방침에 책임자·연락처 추가(7.1)
- [ ] 데이터 보안(수집·공유 없음)·콘텐츠 등급·타겟층·광고 신고(7절) — 법무 확인
- [ ] 스크린샷 2~8장 캡처, 연락처 이메일, 카테고리, 설명 확정(6절)
- [ ] 테스터 12명 모집 → 14일 연속 비공개 테스트(9절) → 프로덕션 신청
