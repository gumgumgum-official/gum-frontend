# Gum World

껌딱지 나라로의 여행 - React + Three.js 기반 인터랙티브 3D 웹 전시

> **본 프로젝트(gum-frontend) 범위**: Stage 2 ~ Stage 6 (Phase 2 ~ Phase 6)  
> Phase 1 (입국 신고서 태블릿 UI)는 별도 프로젝트에서 구현됨. `docs/PRD.md` 참고.

## 사용 방법 (Usage)

### 개발 서버 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 후 아래 경로로 이동하세요.

### 페이지별 접속 URL

| 용도 | URL | 설명 |
|------|-----|------|
| **개발용** | `http://localhost:5173/dev` | Stage 2~6 테스트, 키보드 2~6으로 전환 |
| **빔 프로젝터** | `http://localhost:5173/beam` | 고민 시각화 (Stage 2) |
| **키오스크** | `http://localhost:5173/kiosk` | 체험 존 (Stage 3~6) |

기본 경로(`/`)는 `/dev`로 자동 리다이렉트됩니다.

### 전시 환경별 배포

실제 전시에서는 각 기기가 아래 URL로 접속합니다.

- **태블릿(iPad)**: 별도 프로젝트 — 입국 신고서 입력 후 `POST /api/worry` 전송
- **빔 프로젝터**: `/beam` — Socket.io로 고민 데이터 수신 후 3D 텍스트 표시
- **체험 존 PC**: `/kiosk` — 아케이드 버튼으로 Stage 3→4→5→6 순차 진행

---

## 페이지 및 라우트

### 라우트 목록

| 경로 | 페이지 | Stage | 키보드 전환 | 비고 |
|------|--------|-------|:----------:|------|
| `/` | - | - | - | `/dev`로 리다이렉트 |
| `/dev` | DevPage | 2, 3, 4, 5, 6 | ✅ | 개발용, Stage 2~6 테스트 |
| `/beam` | BeamPage | 2 | ❌ | 빔 프로젝터 전용 |
| `/kiosk` | KioskPage | 3, 4, 5, 6 | ❌ | 체험 존, 순차 진행 |
| `*` | - | - | - | 404 시 `/dev`로 리다이렉트 |

### 페이지별 상세

#### DevPage (`/dev`)

- **용도**: 개발·디버깅
- **Stage**: 2~6
- **기능**: 키보드 `2`~`6`으로 즉시 Stage 전환
- **초기 Stage**: 2

#### BeamPage (`/beam`)

- **용도**: 빔 프로젝터 출력 (Phase 2)
- **Stage**: 2 (둥근 섬, 고민 시각화)
- **기능**: Socket.io로 고민 데이터 수신 → 3D 텍스트 투하 (구현 예정)

#### KioskPage (`/kiosk`)

- **용도**: 체험 존 PC (Phase 3~6)
- **Stage**: 3 → 4 → 5 → 6 순차
- **기능**: 아케이드 버튼/엔터로 Stage 전환 (구현 예정)
- **초기 Stage**: 3

### 키보드 단축키 (개발용 `/dev`만)

| 키 | 동작 |
|----|------|
| `2` | Stage 2 (고민 시각화) |
| `3` | Stage 3 (부셔버리자) |
| `4` | Stage 4 (털어버리자) |
| `5` | Stage 5 (난 너의 편) |
| `6` | Stage 6 (헤어짐) |

---

## 개발 환경 설정

### 필수 요구사항
- Node.js 16 이상
- npm 또는 yarn

### 설치

```bash
npm install
```

### VS Code 확장 프로그램 (권장)
이 프로젝트를 열면 VS Code가 자동으로 추천 확장 프로그램을 제안합니다:
- Prettier - Code formatter
- ESLint

## 사용 가능한 명령어

### 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:5173` 열기  
페이지 경로: `/dev`(개발용), `/beam`, `/kiosk` — 위 **사용 방법** 참고

### 프로덕션 빌드
```bash
npm run build
```

### 빌드 미리보기
```bash
npm run preview
```

### 코드 품질 도구

#### 자동 검사 (Git Hooks)
코드를 커밋할 때 **자동으로** 다음 작업이 실행됩니다:
- 변경된 파일에 대해 ESLint 검사 및 자동 수정
- Prettier로 자동 포맷팅

**수동으로 실행하고 싶을 때:**

#### ESLint (코드 검사)
```bash
# 코드 검사
npm run lint

# 자동 수정
npm run lint:fix
```

#### Prettier (코드 포맷팅)
```bash
# 포맷 확인
npm run format:check

# 자동 포맷팅
npm run format
```

## 프로젝트 구조

```
src/
├── config/           # 설정 파일
│   ├── appConfig.js  # 앱 전체 설정
│   └── stages/       # 스테이지별 설정 (stage2.js ~ stage6.js)
├── components/       # React 컴포넌트
│   └── ThreeCanvas.jsx  # Three.js 캔버스 래퍼
├── pages/            # 라우트별 페이지
│   ├── BeamPage.jsx     # /beam (Stage 2)
│   ├── KioskPage.jsx    # /kiosk (Stage 3~6)
│   └── DevPage.jsx      # /dev (개발용, 키보드 전환)
├── three/            # Three.js 초기화
│   └── initThreeApp.js  # Stage 2~6 로직
├── stages/           # 스테이지별 장면 (Stage2.js ~ Stage6.js)
├── utils/            # 유틸리티
├── App.jsx           # React Router 설정
├── main.jsx          # React 진입점
└── style.css         # 스타일
```

Phase–Stage 매핑은 `docs/FLOW.md`의 "Phase ↔ Stage 매핑" 섹션을 참고하세요.

---

## 기술 스택

- **React** - UI 및 라우팅
- **React Router** - URL 기반 페이지 분리
- **Three.js** - 3D 그래픽
- **Cannon-es** - 물리 엔진
- **Vite** - 빌드 도구
- **ESLint** - 코드 품질
- **Prettier** - 코드 포맷팅

## 개발 가이드

### 새 스테이지 추가하기

1. `src/config/stages/stageX.js`에 설정 추가
2. `src/stages/StageX.js` 파일 생성
3. `src/three/initThreeApp.js`에 Stage 팩토리 등록 (STAGE_FACTORIES)

```javascript
// stageX.js 예시
export const STAGE_X_CONFIG = { camera: {...}, background: {...} };

// StageX.js 예시
import * as THREE from "three";
import { STAGE_X_CONFIG } from "../config/stages/stageX.js";

export function StageX() {
  const objects = [];
  const config = STAGE_X_CONFIG;

  return {
    camera: null,

    setup(scene) {
      // 카메라, 오브젝트 설정
    },

    update(delta) {
      // 애니메이션 업데이트
    },

    cleanup(scene) {
      // 메모리 정리
      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      objects = [];
    },
  };
}
```

### JSDoc 타입 (jsconfig.json)

- `jsconfig.json`에 `checkJs: true` 설정 — JSDoc 기반 타입 검사
- `src/types.js`에 Stage, config, initThreeApp 등 공통 타입 정의
- VS Code 등 IDE에서 자동완성 및 타입 체크 지원

### 설정 값 수정하기

모든 하드코딩된 값은 `src/config/` 폴더의 설정 파일에 있습니다.
- 스테이지별 설정: `config/stages/stageN.js`
- 공통 설정: `appConfig.js`

### 참고 문서

- **`docs/PRD.md`** — 제품 요구사항 정의 (Phase 1~6 상세, 본 프로젝트 범위: Phase 2~6)
- **`docs/FLOW.md`** — 시스템 아키텍처, Phase–Stage 매핑, 데이터 흐름

## 라이선스

Private
