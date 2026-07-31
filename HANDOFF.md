# 런코치(Running Coach) — 다른 컴퓨터에서 이어서 작업하기

마라톤 훈련용 러닝 코치 PWA. 단일 HTML/CSS/JS로 만든 웹앱이며, IndexedDB에 데이터를 저장하고
GitHub Pages로 배포합니다. (빌드 도구·Node 불필요)

---

## 1. 프로젝트 개요

- **형태**: PWA (Progressive Web App) — 아이폰 홈화면에 추가해 앱처럼 사용
- **핵심 파일**
  - `index.html` — UI 레이아웃/스타일/화면 골격
  - `app.js` — 모든 로직(IndexedDB, OCR 파싱, 플랜 생성, 실시간 러닝, 음성 안내, 이미지 매칭 등)
  - `manifest.json` — PWA 메타/아이콘
  - `sw.js` — 서비스워커(오프라인 캐시). 배포마다 `CACHE` 버전을 올려 갱신 강제
  - `icon-192.png`, `icon-512.png` — 앱 아이콘
  - `.nojekyll` — GitHub Pages에서 Jekyll 처리 비활성화
  - `netlify.toml` — (구) Netlify 설정. 현재는 GitHub Pages 사용
  - `generate-icons.ps1` — 아이콘 생성용 PowerShell 스크립트(로컬 전용)
  - `NSM 러닝 훈련법.txt`, `NSM 러닝 훈련법2.txt` — NSM 훈련법 원문(학습 근거 자료)
- **배포**: GitHub `main`에 push → GitHub Pages 자동 배포
  - 저장소: https://github.com/Hoon118/running-coach.git
  - 라이브: https://hoon-run-coach.netlify.app/ (또는 GitHub Pages 주소)
- **현재 버전**: v22 (`app.js`의 `APP_VERSION`과 `sw.js`의 `CACHE`가 항상 일치해야 함)

---

## 2. 다른 컴퓨터에서 환경 구축 (권장: git clone)

가장 깔끔한 방법은 GitHub에서 그대로 받는 것입니다.

```bash
git clone https://github.com/Hoon118/running-coach.git
cd running-coach
```

> 주의: `NSM *.txt`, `generate-icons.ps1`, `deploy/` 는 `.gitignore`로 제외되어 GitHub에는 없습니다.
> 이 파일들은 함께 드리는 압축본(`running-coach-full.zip`)에 포함되어 있으니, clone 후 압축본에서 복사해 넣으세요.

압축본으로만 옮길 경우: `running-coach-full.zip`을 풀면 `.git` 히스토리까지 그대로 있어 바로 이어서 작업 가능합니다.

### 필요한 도구
- **Git** (필수) — 버전관리/배포
- **에디터** — Cursor 또는 VS Code
- **Node.js** — *불필요*(빌드 없음). 단, `node --check app.js`로 문법검사 원하면 설치하면 됨
- 로컬 미리보기(택1):
  ```bash
  # Python이 있으면
  python -m http.server 8000
  # 또는 Node가 있으면
  npx serve .
  ```
  브라우저에서 `http://localhost:8000` 접속.
  ※ GPS/동작센서/음성은 **HTTPS에서만** 완전히 동작하므로 실제 확인은 배포본(아이폰)에서 하세요.

---

## 3. 개발 → 배포 흐름

1. `index.html` / `app.js` 등 수정
2. **버전 올리기** (캐시 갱신 필수): `app.js`의 `const APP_VERSION = 'vNN'` 과
   `sw.js`의 `const CACHE = 'runcoach-vNN'` 을 **같은 번호로** 올린다
3. 커밋 & 푸시
   ```bash
   git add -A
   git commit -m "설명"
   git push
   ```
4. GitHub Pages가 자동 배포 → 아이폰에서 홈화면 앱 재실행(또는 새로고침)으로 최신 반영

> Windows PowerShell에서는 `&&` 와 heredoc(`<<EOF`)이 안 됩니다.
> 명령은 `;` 로 잇거나 한 줄씩 실행하고, 여러 줄 커밋 메시지는 파일로 저장 후 `git commit -F 메시지파일` 을 쓰세요.

---

## 4. 주요 기능 & 코드 위치 (app.js)

- **데이터 저장**: `DB` (IndexedDB 래퍼) — stores: `records`, `shoes`, `plans`, `files`
- **이미지 OCR/매칭**: `handleFiles`, `buildImageItem`, `sameRun`, `matchCost`,
  `findMergeTarget`, `attachImageToRecord`, `mergeImageGroup`, `splitsTotals`
  - v21에서 매칭 오차범위 축소(거리 0.2km·시간 25초) + 독립신호 2개↑ 일치 조건
- **훈련 플랜**: `generatePlan` → `generateNsmPlan` / `generateMixedPlan`,
  `buildIntervalWorkout`/`buildTempoWorkout`/`buildNsmWorkout`
- **실시간 러닝**: `startRun`, `tick`, `updateWorkoutProgress`, `renderWorkoutStep`
  (GPS: `navigator.geolocation.watchPosition`, 케이던스: `devicemotion`)
- **지도·날씨**: `initRunMap`/`ensureLeaflet`(OSM), `fetchWeather`(Open-Meteo),
  `updateRunPolyline` — 러닝 탭에 현재 위치·기상·실시간 경로
- **음성 안내(TTS)**: `speakWith`, `speak`, `koVoices`, `voiceSamples`
  - Microsoft 음성 제외, 샘플 클릭 즉시 전환(`speechSynthesis.cancel`)
- **분석 리포트**: `openRecordReport`, `renderAthleteProfile`, `classifyRun`
- **NSM 훈련법**: `NSM` 객체(페이스표/처방), `openNsmGuide`

---

## 5. 알려진 한계 (검토 완료)

- **애플 건강(HealthKit) 연동**: 웹앱/PWA에서 불가. 네이티브 iOS 앱 필요
- **애플워치 실행**: 웹앱 설치 불가. watchOS 네이티브 앱 필요
- → 현재 방침: 웹앱 유지, 워치 기록은 스크린샷 업로드(OCR)로 흡수
- **음성**: 기기에 설치된 음성만 사용 가능. 아이폰 설정 → 손쉬운 사용 → 콘텐츠 말하기 →
  음성 → 한국어에서 '유나(고급)' 등을 받으면 더 자연스러워짐

---

## 6. 다음에 할 만한 작업(메모)

- 사용자가 음성 샘플 10종 중 마음에 드는 번호를 고르면 기본값으로 고정
- 이미지 매칭 정확도 실사용 피드백 반영
- 훈련 플랜/분석 리포트 고도화
