# Lab Area 오브제 분석 (Reference)

> 레퍼런스 소스코드 `reference/sources/Game/World/Areas/LabArea.js` 기반 분석  
> Lab 영역은 `areas-compressed.glb` 내부의 `lab` 자식 모델로 로드됨

---

## 개요

Lab 영역은 3D 포트폴리오 월드 내 "실험실/작업실" 형태의 인터랙티브 공간이다.
`labData`(lab.js)의 프로젝트 이미지들을 스크롤/선택하여 볼 수 있는 갤러리형 UI를 제공한다.

### 데이터 소스
- **모델**: `static/areas/areas-compressed.glb` → `areasModel.scene.children` 중 `name.startsWith('lab')`인 자식
- **데이터**: `sources/data/lab.js` (프로젝트 목록: title, url, image, imageMini)

---

## 오브제 목록 및 역할

| Reference Name | 역할 | 상세 |
|----------------|------|------|
| **interactivePoint** | 상호작용 포인트 | Lab 진입 시 클릭하면 Lab 열림. `InteractivePoints.create()`로 등록 |
| **mecanism** | 메커니즘 오브제 | 스크롤 시 나무 수레 소리(`05947 light wooden cart...`) 재생 위치 |
| **images** | 메인 이미지 메시 | 현재 선택된 프로젝트의 대형 이미지 표시. KTX 텍스처 로드 |
| **arrowPrevious** | 이전 화살표 | 이전 프로젝트로 이동 버튼. 호버 시 `hover.activeMaterial` 적용 |
| **arrowNext** | 다음 화살표 | 다음 프로젝트로 이동 버튼 |
| **intersectPrevious** | 이전 클릭 영역 | `rayCursor.addIntersect()`로 클릭 감지 구체 |
| **intersectNext** | 다음 클릭 영역 | 마찬가지 클릭 감지 |
| **title** | 타이틀 그룹 | 현재 프로젝트 제목 텍스트. `TextCanvas`로 텍스처 생성 후 적용 |
| **url** | URL 그룹 | 링크 텍스트 + 패널. `intersectUrl`로 클릭 시 새 탭 열기 |
| **intersectUrl** | URL 클릭 영역 | `url.open()` 트리거 |
| **chainLeft** | 왼쪽 체인 | 스크롤 휠 기반 수직 스크롤 애니메이션 |
| **chainRight** | 오른쪽 체인 | |
| **chainPulley** | 풀리 체인 | 휠 스크롤에 따라 회전 |
| **gearA, gearB, gearC** | 기어 | 체인과 연동된 회전 애니메이션 |
| **mini** | 미니 카드 템플릿 | 스크롤 목록의 각 프로젝트 카드. 클론하여 여러 개 생성 |
| **balls** | 진자 공 2개 | GSAP으로 진자 swing 애니메이션 |
| **blackBoard** | 블랙보드 | 조작법 안내. 점프 애니메이션 + 입력 모드별 라벨 |
| **blackboardLabelsGamepadPlaystation** | 패드 라벨 | PlayStation 스타일 조작 설명 |
| **blackboardLabelsGamepadXbox** | 패드 라벨 | Xbox 스타일 조작 설명 |
| **blackboardLabelsMouseKeyboard** | 키보드/마우스 라벨 | PC 조작 설명 |
| **candleFlame** | 촛불 불꽃 | 야간에만 표시. `emissiveOrangeRadialGradient` + 파동 애니메이션 |
| **heat** | 가마솥 열기 | `MeshBasicNodeMaterial`로 빨간/주황 이펙트 |
| **wood** | 장작 | 불타는 장작 느낌의 emissive 재질 |
| **liquid** | 액체 표면 | 가마솥 내 액체. 보라→파랑 그라데이션 |

---

## Reference 네이밍 규칙

`References.js`의 `parse()`가 `ref(erence)이름숫자` 패턴으로 파싱한다.

- 예: `refInteractivePoint1` → `interactivePoint` (소문자로 시작)
- 여러 개일 경우 배열로 저장: `items.get('arrowPrevious')[0]`

---

## 주요 기능별 오브제 그룹

### 1. 스크롤/네비게이션
- `chainLeft`, `chainRight`, `chainPulley`, `gearA/B/C`
- `arrowPrevious/Next`, `intersectPrevious/Next`
- `mini` (목록 카드)

### 2. 콘텐츠 표시
- `images` (메인 이미지)
- `title` (제목)
- `url` (링크)

### 3. 분위기/장식
- `balls` (진자)
- `blackBoard` (안내판)
- `candleFlame` (촛불)
- `heat`, `wood`, `liquid` (가마솥)

### 4. 인터랙션
- `interactivePoint` (Lab 열기)
- `intersectUrl` (URL 열기)
- 각 `mini`의 `intersect` (프로젝트 선택)
