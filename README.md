# Gum World

Three.js 기반의 3D 웹 애플리케이션

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
│   ├── appConfig.js  # 앱 전체 설정 (조명, 렌더러 등)
│   └── stageConfig.js # 스테이지별 설정
├── stages/           # 스테이지별 장면
│   ├── Stage1.js
│   ├── Stage2.js
│   └── ...
├── utils/            # 유틸리티
│   └── StageManager.js # 스테이지 전환 관리
├── main.js           # 메인 엔트리 포인트
└── style.css         # 스타일
```

## 키보드 단축키

- `1-6`: 스테이지 전환

## 기술 스택

- **Three.js** - 3D 그래픽
- **Cannon-es** - 물리 엔진
- **Vite** - 빌드 도구
- **ESLint** - 코드 품질
- **Prettier** - 코드 포맷팅

## 개발 가이드

### 새 스테이지 추가하기

1. `src/stages/StageX.js` 파일 생성
2. `src/config/stageConfig.js`에 설정 추가
3. `src/main.js`에서 스테이지 등록

```javascript
// StageX.js 예시
import * as THREE from "three";
import { STAGE_CONFIG } from "../config/stageConfig.js";

export function StageX() {
  let objects = [];
  const config = STAGE_CONFIG.stageX;

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

### 설정 값 수정하기

모든 하드코딩된 값은 `src/config/` 폴더의 설정 파일에 있습니다.
- 스테이지별 설정: `stageConfig.js`
- 공통 설정: `appConfig.js`

## 라이선스

Private
