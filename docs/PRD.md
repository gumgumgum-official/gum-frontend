# [PRD] 껌딱지 월드

## 1. 프로젝트 개요 (Project Overview)

- **제품명**: 껌딱지 나라로의 여행 (A Journey to Ggumddi Nation)
- **목표**: 사용자의 고민을 3D 텍스트로 시각화하고, 이를 파괴하는 인터랙션과 캐릭터와의 교감을 통해 심리적 해방감을 제공하는 인터랙티브 웹 전시.
- **핵심 키워드**: 고민 해소, 인터랙션, 3D 힐링, 캐릭터 경험.

## 2. 기술 스택 (Technical Stack)

| 구분         | 기술 스택                              | 비고                           |
| :----------- | :------------------------------------- | :----------------------------- |
| **Core**     | Three.js, Cannon-es                    | 3D 렌더링 및 물리 엔진 연산    |
| **Frontend** | React, React Router, Vite              | 라우팅 및 빌드 관리            |
| **Quality**  | ESLint, Prettier, JSDoc (jsconfig)     | 코드 컨벤션 및 타입 검사       |
| **Workflow** | Husky, lint-staged                     | Git 커밋 전 코드 검증          |
| **Hardware** | Beam Projector, Computer(Kiosk), Enter | Phase 2(빔), Phase 3~6(컴퓨터) |

## 3. 사용자 여정 및 상세 요구사항 (User Journey & Requirements)

### 3.1. [Phase 1] 여행의 시작: 입국 신고서

> **본 프로젝트(gum-frontend) 범위 아님** — 별도 프로젝트에서 구현됨.

- **UI/UX**: 기내 창가 뷰 배경의 아이패드 입력 화면.
- **기능**: 애플펜슬을 이용한 '걱정거리' 텍스트 입력 및 데이터 전송.
- **요구사항**:
  - 입국 신고서 양식의 폼(Form) 구현.
  - 입력 완료 시 비행기 착륙 애니메이션과 함께 다음 단계 데이터 바인딩.

### 3.2. [Phase 2] 무슨 일이야?: 고민 시각화 (Beam Projector)

- **UI/UX**: 쿼터뷰(CCTV 뷰) 기반의 둥근 섬 형태 배경.
- **기능**: 입력받은 고민을 3D 텍스트 객체로 변환하여 실시간 투하.
- **요구사항**:
  - `Three.js PerspectiveCamera`를 활용한 둥근 섬 배경 뷰 구현.
  - GLB 모델 기반 배경/오브제 로드, config(`stage2.js`)로 카메라·fog·배경 설정.
  - 껌딱지 캐릭터들의 자율 AI 모션(걷기, 상호작용) 배치.
  - 누적된 고민 텍스트들이 섬 위에 쌓이는 물리 로직 구현.

### 3.3. [Phase 3] 부셔버리자: 스트레스 해소 (Interaction)

- **UI/UX**: 밝은 초원 배경의 유저 체험 존.
- **기능**: 아케이드 버튼(엔터키) 클릭 시 고민 텍스트 파괴.
- **요구사항**:
  - `Cannon-es`를 이용한 텍스트 파편화 효과(Fracture Effect).
  - 파괴된 자리에 꽃이 피어나는 시각적 보상 연출.
  - 버튼 입력 시마다 껌딱지 캐릭터의 응원 애니메이션 트리거.

### 3.4. [Phase 4] 털어버리자: 축제 (Celebration)

- **UI/UX**: 콘서트장/파티장 분위기의 연출.
- **기능**: 마우스 인터랙션을 통한 파티 분위기 고조.
- **요구사항**:
  - 마우스 속도 기반 색종이(Confetti) 파티클 시스템.
  - 껌딱지 캐릭터들의 댄스 애니메이션(브레이킹 댄스 등).

### 3.5. [Phase 5] 난 너의 편: 교감 및 기록

- **UI/UX**: 따뜻한 햇살이 드는 광장 배경.
- **기능**: 캐릭터 클릭 시 포옹 인터랙션 및 결과물 저장.
- **요구사항**:
  - 캐릭터 클릭 시 레이캐스팅(Raycasting)을 이용한 개별 포옹 모션.
  - 최종 인터랙션 완료 후 폴라로이드 사진 형태의 이미지 렌더링(Canvas Export).

### 3.6. [Phase 6] 헤어짐: 퇴장

- **UI/UX**: 공항 배경의 하이앵글 뷰.
- **기능**: 커튼콜 형태의 배웅 인사.
- **요구사항**:
  - 껌딱지들이 일렬로 서서 작별 인사하는 애니메이션.
  - 관람객의 마우스 호버에 반응하는 작별 멘트 말풍선.

## 4. 비기능적 요구사항 (Non-Functional)

- **Performance**: 다수의 물리 객체 존재 시 60fps 유지 (Instanced Mesh 활용).
- **Extensibility**: Stage 단위 관리, stage별 config 분리(`config/stages/stageN.js`), JSDoc 타입 정의(`types.js`).
- **Real-time**: 태블릿 입력 데이터가 빔 프로젝트 서버로 지연 없이 전달될 것.

## 5. 프로젝트 범위 (Scope)

- **본 프로젝트(gum-frontend)**: Phase 2, 3, 6 (Stage 2, 3, 6) — Phase 4, 5 미구현
- **라우트**: `/beam`(Stage 2), `/kiosk`(Stage 3→6 포탈), `/dev`(Stage 2/3/6 키보드 전환, 개발용)
- **별도 프로젝트**: Phase 1 (입국 신고서 태블릿 UI) — `POST /api/worry` 등으로 연동

---

**작성일**: 2026. 01. 31
**작성자**: Senior Fullstack Engineer / PM
