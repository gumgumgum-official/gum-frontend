# Pull Request: [#29] 게임기 인터랙션 및 미니게임 구현

## 개요

Stage3 게임기 오브젝트 클릭 시 카메라 클로즈업 애니메이션과 함께 잡초 뽑기 미니게임을 실행합니다. 미니게임은 15초 동안 잡초를 클릭해 점수를 올리는 방식이며, 기록은 localStorage에 저장되고 명예의 전당에서 확인할 수 있습니다.

---

## 변경 사항 요약

### 1. 게임기 클릭 인터랙션

- **카메라 클로즈업**: 게임기 클릭 시 GSAP으로 카메라가 게임기 앞으로 부드럽게 이동
- **CustomEvent 연동**: `minigame:open` / `minigame:close` 이벤트로 Three.js(Stage3)와 React(MinigameOverlay) 간 통신
- **OrbitControls 제어**: 미니게임 열림 시 비활성화, 닫힘 시 원위치 복귀

### 2. 미니게임 "껌딱지 월드 환경 미화단"

| 기능 | 설명 |
|------|------|
| 게임 플로우 | 시작 → 15초 플레이 → 결과 → 점수 등록 / 재도전 |
| 잡초 스폰 | 랜덤 간격(300~700ms), 최대 7개 동시 |
| 잡초 디스폰 | 랜덤 시간(3~8초) 후 클릭 없으면 사라짐 |
| 점수 | 일반 잡초 +1점, 황금 잡초 +3점 |
| 명예의 전당 | localStorage 저장, 최대 10개, 스크롤 가능 |
| 등록 | 닉네임 입력 후 등록 시 결과 모달 닫기 |

### 3. UI/UX 개선

- **X 버튼**: 게시판 모달과 동일한 스타일(32×32, 투명 배경), 나무 톤 색상 적용
- **스크롤바**: 명예의 전당 목록용 커스텀 스타일(6px, 나무색 썸)
- **모달 레이아웃**: 세로 380px 고정, 코너 radius `rounded-2xl`로 통일

### 4. 기술 스택 / 의존성

- **Framer Motion**: 애니메이션, AnimatePresence
- **Tailwind CSS**: 스타일링
- **Lucide React**: 아이콘 (Sprout, Trophy, Medal 등)
- **GSAP**: 카메라 애니메이션

---

## 파일 구조

```
src/
├── components/
│   └── MinigameOverlay.jsx      # 미니게임 오버레이 컨테이너
├── minigame/
│   ├── WeedGameUI.jsx           # 메인 게임 UI
│   ├── index.js
│   ├── minigame.css             # 테마, 스크롤바 등
│   └── lib/
│       ├── TimerComponent.js    # 15초 카운트다운
│       ├── ScoreState.js        # localStorage 점수 관리
│       └── WeedSpawner.js       # 잡초 스폰/디스폰 로직
└── utils/stages/stage3/
    └── minigameLauncher.js      # 카메라 클로즈업, CustomEvent
```

---

## 수정된 주요 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/stages/Stage3.js` | 게임기 클릭 핸들러, raycaster, minigameLauncher 연동 |
| `src/App.jsx` | MinigameOverlay 마운트 |
| `eslint.config.js` | `localStorage`, `CustomEvent` globals 추가 |
| `package.json` | framer-motion, lucide-react, gsap, tailwind 등 추가 |

---

## 테스트 방법

1. `npm install && npm run dev`
2. `/kiosk` 또는 `/dev` 접속 후 Stage 3 진입
3. 게임기 오브젝트 클릭 → 미니게임 모달 표시 확인
4. "시작하기" 클릭 → 15초 동안 잡초 클릭
5. 결과 모달에서 닉네임 입력 후 [등록] 또는 [재도전] 동작 확인

---

## 특이사항

- 미니게임은 `EVENT_OPEN` / `EVENT_CLOSE`로 React와 Three.js가 분리되어 동작
- 기록은 `localStorage` 키 `ggeomddjagi_records`에 저장 (최대 10개)
- 타이머/스폰 useEffect 의존성으로 인한 버그 수정: cleanup을 unmount 시에만 실행

---

## 관련 이슈

Closes #29
