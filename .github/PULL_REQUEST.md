# Pull Request: refactor/5-update-file-structure → dev

## 개요

Vanilla JS 기반 프로젝트를 React + React Router로 마이그레이션하고, Stage별 config 분리, Phase 1(입국 신고서) 제거, GLB 로더 통합을 수행했습니다.

---

## 변경 사항 요약

### 1. React + React Router 마이그레이션

- **React 셸 도입**: 기존 Three.js 로직을 `initThreeApp`으로 추출하여 React 컴포넌트(`ThreeCanvas`)로 래핑
- **라우트 기반 페이지 분리**:
  - `/dev` — 개발용 (Stage 2~6, 키보드 2~6 전환)
  - `/beam` — 빔 프로젝터 (Stage 2)
  - `/kiosk` — 체험 존 (Stage 3~6)
- **의존성 추가**: `react`, `react-dom`, `react-router-dom`, `@vitejs/plugin-react`

### 2. Stage별 config 분리

- **통합 `stageConfig.js` 제거** → `config/stages/stageN.js` (N=2~6)로 분리
- **상수 네이밍**: `STAGE_N_CONFIG` (UPPER_SNAKE_CASE)
- **Stage 1 config 삭제**: Phase 1은 별도 프로젝트에서 구현

### 3. Phase 1 (입국 신고서) 제거

- **본 프로젝트 범위**: Stage 2 ~ Stage 6
- **삭제된 파일**: `Stage1.js`, `stage1.js`, `TabletPage.jsx`, `EntryForm.jsx`, `stageConfig.js`
- **문서 반영**: PRD.md, FLOW.md에 "별도 프로젝트" 명시

### 4. Stage2 GLB 로더 전환 (dev 머지 반영)

- **FBX → GLB**: `background_2.fbx` → `background1.glb`
- **assetLoaders.js**: GLB/GLTF 로더 (DRACO 지원)
- **stageDebugControls.js**: Orbit, Transform, Drag 컨트롤, C/G/S 키 config 출력
- **props 지원**: `config.props` 배열로 오브제(GLBs) 로드 (예: `collision.glb`)
- **StageManager**: `setup(scene, renderer)` 시그니처로 변경

### 5. 문서 및 설정 업데이트

- **README**: 사용 방법, 라우트, 페이지별 상세, 프로젝트 구조 갱신
- **PRD.md**: Phase 1 별도 프로젝트 범위 명시
- **FLOW.md**: Phase ↔ Stage 매핑에 프로젝트 구분 추가
- **ESLint**: React, React Hooks 플러그인 및 globals 추가

---

## 파일 구조 변경

```
src/
├── config/stages/       # stage2.js ~ stage6.js (Stage 1 제거)
├── components/          # ThreeCanvas.jsx
├── pages/               # BeamPage, KioskPage, DevPage (TabletPage 제거)
├── three/               # initThreeApp.js (Three.js 로직)
├── utils/               # assetLoaders.js, stageDebugControls.js 추가
├── App.jsx, main.jsx
└── ...
```

---

## 테스트 방법

1. `npm install && npm run dev`
2. `http://localhost:5173` 접속
3. **라우트 확인**:
   - `/dev` — 키보드 2~6으로 Stage 전환
   - `/beam` — Stage 2 (GLB 배경, 오브제)
   - `/kiosk` — Stage 3~6

---

## 특이사항

- Phase 1 (입국 신고서)은 별도 프로젝트에서 구현되며, `POST /api/worry` 등으로 연동 예정
- Stage2는 GLB + DRACO 사용 — `public/draco/` 폴더 및 `background1.glb`, `collision.glb` 등 모델 필요
- 키보드 전환은 `/dev`에서만 활성화 (2~6번 키)

---

## 관련 이슈

Closes #5
