# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # 개발 서버 (http://localhost:5173)
npm run dev:mock     # MSW 목 활성화 개발 서버
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 검사
npm run lint:fix     # ESLint 자동 수정
npm run format       # Prettier 포맷
```

테스트 없음. 시각 확인은 브라우저에서 직접.

### 개발 URL

| URL | 용도 |
|-----|------|
| `/dev` | Stage 2/3/6 — 키보드 `2`/`3`/`6`으로 전환 |
| `/beam` | Stage 2 단독 (빔 프로젝터) |
| `/kiosk` | Stage 3→6 순차 진행 |
| `/memory-test` | 메모리 누수 확인 |

## 아키텍처

### React ↔ Three.js 분리 구조

React는 렌더링 컨테이너 역할만 하고, 실제 씬 로직은 Three.js 세계에서 동작한다.

```
ThreeCanvas.jsx (React)
  └─ initThreeApp (src/three/initThreeApp.js)
       └─ StageManager (src/utils/common/StageManager.js)
            ├─ Stage2 (src/stages/Stage2.js)
            ├─ Stage3 (src/stages/Stage3.js)
            └─ Stage6 (src/stages/Stage6.js)
```

### StageInstance 인터페이스

모든 Stage는 `src/types.js`에 정의된 인터페이스를 따른다:

```js
{
  camera,             // THREE.PerspectiveCamera
  setup(scene, renderer),
  update(delta),      // 매 프레임
  cleanup(scene),     // 언마운트 시 리소스 해제
}
```

Stage 간 전환은 `StageManager.switchToStage(n)`이 담당하며, 이전 Stage의 `cleanup()`을 호출한 뒤 새 Stage의 `setup()`을 실행한다.

### React ↔ Three.js 통신: window CustomEvent

Three.js 코드에서 React UI를 열거나 닫을 때 `window.dispatchEvent(new CustomEvent(...))` 를 사용한다. 이벤트 이름은 반드시 `src/events/` 아래 상수로 정의하고 임포트해서 사용한다 (오타 방지).

- `src/events/stage6Events.js` — Stage6 / 공항 관련 이벤트
- 기타 이벤트: `gum:showNoticeModal`, `gum:showGameMachineModal` 등은 `App.jsx`에서 구독

### 설정 분리 패턴

씬에서 직접 수치를 쓰지 않고 `src/config/stages/` 아래 config 객체로 분리한다.

- `src/config/stages/stage2.js` → `STAGE2_CONFIG`
- `src/config/stages/stage3/stage3.js` → `STAGE3_CONFIG`
- `src/config/stages/stage6.js` → `STAGE6_CONFIG`
- `src/config/appConfig.js` → `APP_CONFIG` (렌더러 설정, 조명 등)

### GLB 오브젝트 명명 규칙

GLB 내 메시 이름 접두사가 동작을 결정한다:

- `INT_` — 클릭 인터랙션 가능 오브젝트 (게시판, 우물, 포탈 등)
- `OBJ_` — 물리 충돌 대상에 포함되는 배경 오브젝트

### 유틸 구조

```
src/utils/
  common/           # 스테이지 공통 (StageManager, assetLoaders, stageDebugControls 등)
  stages/
    stage2/         # Stage2 전용 유틸
    stage3/         # Stage3 전용 유틸 (characterController, fountainEffect 등)
    stage6/         # Stage6 전용 유틸
  handwriting/      # SVG 손글씨 → Three.js 평면 메시
```

### 백엔드 연동

- **Supabase**: 손글씨 SVG 저장 (`handwriting` 버킷) + Realtime 구독 → Stage2에서 수신
- **gum_server REST**: 모니터 할당 흐름 (`src/lib/monitorCurrentApi.js`)
  - `POST .../start` → `GET .../current` 폴링(1500ms) → `POST .../complete`
  - 환경변수: `VITE_GUM_SERVER_URL` (없으면 `localhost:3000`으로 proxy)
- **MSW 목**: `npm run dev:mock` 또는 `VITE_ENABLE_MSW=true` → `src/mocks/`

### 성능 주의사항

- SVG 텍스처는 GPU 부하가 크므로 해상도를 최소화한다
- Three.js 청크는 minify 후 ~650KB 허용 (`chunkSizeWarningLimit: 700`)
- 렌더러 pixelRatio는 최대 2로 제한, Electron-like 환경에서는 1.25로 낮춤
- Stage 언마운트 시 `cleanup()`에서 텍스처·지오메트리·머티리얼을 반드시 dispose
- 캐릭터 클론은 `SkeletonUtils.clone()`으로 복제 (스켈레톤 참조 꼬임 방지)

## Claude Code 운영 지침

### 컨텍스트·토큰 관리

- Stage 파일(Stage2/3/6.js)은 2000~4000줄 규모다. 한 번에 전체를 읽지 말고 필요한 섹션만 오프셋으로 읽는다.
- 탐색이 3회 이상 필요한 작업은 `Explore` 서브에이전트에 위임해 메인 컨텍스트를 보호한다.
- GLB/이미지 등 바이너리 에셋은 읽지 않는다.
- 작업 전 advisor를 호출해 접근법을 검증하고, 완료 후에도 한 번 더 호출한다.

### 주기적으로 해야 할 일

- **Stage 파일 크기 확인**: `wc -l src/stages/*.js` — 한 파일이 2500줄 넘으면 분리 후보 제안
- **미사용 이벤트 확인**: `src/events/` 상수가 실제 코드에서 사용되는지 grep
- **dispose 누락 확인**: `cleanup()` 없는 Stage 유틸이 있으면 메모리 누수 위험 플래그
- **브랜치 작업 전**: `git diff --stat dev...HEAD`로 변경 범위 확인 후 머지 충돌 위험 파일 파악
