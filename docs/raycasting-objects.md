# 레이캐스팅 오브젝트 분석

> 각 스테이지에서 `THREE.Raycaster`가 검사하는 오브젝트 목록과 히트 시 동작 정리

---

## 요약 테이블

| 스테이지 | 파일                              | 레이캐스터           | 검사 대상 배열                                | 용도                       | 히트 시 동작              |
| -------- | --------------------------------- | -------------------- | --------------------------------------------- | -------------------------- | ------------------------- |
| 2        | `Stage2.js`                       | `rc`                 | `spawnZoneMeshes`                             | 스폰 존 유효성 검사        | boolean 반환              |
| 2        | `Stage2.js`                       | `rcDown`             | `groundMeshes`                                | 유효 스폰 그리드 사전 계산 | 유효 좌표 수집            |
| 3        | `stage3IslandWalkable.js`         | `_walkableRaycaster` | walkable 메시 배열                            | 캐릭터 Y 좌표 샘플링       | Y 좌표 반환               |
| 3        | `gumFollowerController.js`        | `_groundRaycaster`   | `walkableGroundMeshes`                        | 껌 팔로워 Y 위치 결정      | Y 좌표 반환               |
| 3        | `stage3InteractionsController.js` | `_raycaster`         | `intRaycastMeshes`, `gumtoongjiRaycastMeshes` | 클릭 인터랙션 감지         | 인터랙션 핸들러 실행      |
| 6        | `Stage6.js`                       | `raycaster`          | `intRaycastMeshes`                            | INT\_ 오브젝트 클릭 감지   | ATM/전화/포토부스 등 실행 |
| 6        | `speechBubbleHover.js`            | `raycaster`          | `characterModels`                             | 캐릭터 호버 감지           | 말풍선 표시 + 사운드      |
| Debug    | `stageDebugControls.js`           | `raycaster`          | `roots` (props)                               | 프롭 선택 (편집용)         | TransformControls 연결    |

---

## Stage 2

### `rc` — 스폰 존 유효성 검사

**파일**: `src/stages/Stage2.js`
**함수**: `buildSpawnZoneValidator()`

**검사 오브젝트**: `spawnZoneMeshes`

- 섬 모델 내 스폰 가능 구역 메시
- 함수 파라미터로 전달됨

**동작**: 위에서 아래로 레이를 쏴 해당 (x,z)가 스폰 존 위인지 boolean 반환

```js
origin.set(x, groundY + 100, z);
rc.set(origin, down); // down = (0,-1,0)
for (const m of spawnZoneMeshes) meshRaycast.call(m, rc, ints);
return ints.length > 0;
```

---

### `rcDown` — 유효 스폰 그리드 사전 계산

**파일**: `src/stages/Stage2.js`
**함수**: `buildValidSpawnGrid()`

**검사 오브젝트**: `groundMeshes`

- 섬의 바닥/지면 메시

**동작**: 그리드 전체를 순회하며 레이 히트 여부로 유효 스폰 좌표 `{ x, z }` 배열 생성. Y_FLOOR 임계값 이상인 히트만 유효로 처리.

---

## Stage 3

### `_walkableRaycaster` — 워크어블 지면 Y 샘플링

**파일**: `src/utils/stages/stage3/island/stage3IslandWalkable.js`
**함수**: `sampleStage3WalkableGroundY()`

**검사 오브젝트**: `meshes` 파라미터 (워크어블 지면 메시)

- `collectStage3WalkableFromModel()`이 모델을 순회하며 수집
- 이름 패턴 `WALKABLE` 포함 메시 또는 특정 머티리얼 패턴으로 필터링
- 수집 시 `mesh.raycast = THREE.Mesh.prototype.raycast` 명시 설정

**동작**: 캐릭터 스폰 높이, 이동 유효성, 허용 범위 계산에 사용. Y 좌표 반환.

```js
raycaster.intersectObjects(meshes, false, _walkableRayHits);
```

---

### `_groundRaycaster` — 껌 팔로워 지면 Y

**파일**: `src/utils/stages/stage3/gumFollowerController.js`
**함수**: `sampleGroundY()`

**검사 오브젝트**: `walkableGroundMeshes` (모듈 레벨 상태)

- `collectStage3WalkableFromModel()`으로 수집한 동일 워크어블 메시

**동작**: 프레임마다 팔로워의 수직 위치를 지면에 붙이기 위해 Y 좌표 샘플링

```js
_groundRaycaster.intersectObjects(walkableGroundMeshes, false, _groundHits);
return _groundHits.length > 0 ? _groundHits[0].point.y : null;
```

---

### `_raycaster` — 클릭 인터랙션 감지

**파일**: `src/utils/stages/stage3/interactions/stage3InteractionsController.js`
**함수**: `getPointerHitTarget()`

#### 검사 오브젝트 1: `gumtoongjiRaycastMeshes`

- `ANIM_Gumtoongji` 오브젝트 하위의 모든 메시
- 먼저 검사 (캐릭터 클릭 우선순위)

#### 검사 오브젝트 2: `intRaycastMeshes`

- `STAGE3_INT_PREFIX`로 시작하는 모든 오브젝트의 하위 메시
- `registerIslandInteractions()`에서 수집

**인터랙티브 오브젝트 목록 (INT\_ 접두사)**:

| 오브젝트명    | 히트 시 동작                                  |
| ------------- | --------------------------------------------- |
| `gumtoongji`  | 애니메이션 재생, 스탬프 시퀀스 진행           |
| `portal`      | 스테이지 전환 시도                            |
| `icecream`    | 아이스크림 스폰, 스탬프 진행, 이스터에그 발동 |
| `notice`      | 공지 모달 표시, 스탬프 큐                     |
| `gameMachine` | 사운드 재생, 게임 머신 모달 표시, 스탬프 큐   |
| `tent`        | 껌 카드 모달 열기, 스탬프 큐                  |
| `well`        | 우물 클릭 사운드, 커스텀 이벤트 디스패치      |
| `clock`       | 스탬프 시퀀스 진행                            |

```js
// gumtoongji 먼저 검사
_raycaster.intersectObjects(gumtoongjiRaycastMeshes, false);
// 나머지 인터랙티브 오브젝트
_raycaster.intersectObjects(intRaycastMeshes, false);
```

히트 시 오브젝트 계층을 위로 탐색해 `INT_` 접두사 부모를 찾아 인터랙션 타입 결정.

---

## Stage 6

### `raycaster` — INT\_ 오브젝트 클릭 감지

**파일**: `src/stages/Stage6.js`
**함수**: `getPointerHitTarget()`, `registerIntInteractions()`

**검사 오브젝트**: `intRaycastMeshes`

- `INT_` 접두사 오브젝트 하위 메시 전부
- `EXTRA_CLICKABLE_OBJECT_NAMES` 목록에 있는 명시적 오브젝트도 포함

**인터랙티브 오브젝트 목록**:

| 오브젝트명            | 히트 시 동작 (onClick)                                      | 호버 시 동작 (onPointerMove)                   |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `atm`                 | ATM 모달 표시 (활성화 시) 또는 "준비중" 메시지, 사운드 재생 | 커서 변경                                      |
| `tel` (전화기)        | 현재 전화 통화 재생 (활성화 시)                             | 커서 변경                                      |
| `photobooth`          | 커튼 사운드, 포토부스 모달 표시                             | 커서 변경                                      |
| `boardpic` / `poster` | 포스터 모달 표시                                            | 커서 변경                                      |
| 캐릭터 오브젝트       | 캐릭터 애니메이션/사운드 재생                               | 애니메이션 + `STAGE6_INT_CLICK_EVENT` 디스패치 |

```js
raycaster.setFromCamera(pointer, cameraRef);
raycaster.intersectObjects(intRaycastMeshes, false);
```

---

### `raycaster` — 지면 Y 샘플링

**파일**: `src/stages/Stage6.js`
**함수**: `raycastFloorY()`

**검사 오브젝트**: `meshes` 파라미터

- `BG_Floor` 노드 하위 메시 우선, 없으면 전체 모델 메시
- 캐릭터 스폰 높이 결정에 사용

---

### `raycaster` — 캐릭터 말풍선 호버

**파일**: `src/utils/stages/stage6/speechBubbleHover.js`
**함수**: `createSpeechBubbleHover()`

**검사 오브젝트**: `characterModels` (파라미터)

- 캐릭터 모델 배열

**동작**: 마우스 호버 시 캐릭터 위 말풍선 표시, 캐릭터 바운딩박스 기반 위치 계산, 환호 사운드 재생

```js
raycaster.intersectObjects(targets, true); // recursive: true
```

---

## Debug

### `raycaster` — 프롭 선택

**파일**: `src/utils/common/stageDebugControls.js`

**검사 오브젝트**: `getPropRoots()` 반환값

- 편집 가능한 씬 오브젝트(프롭) 루트 목록

**동작**:

- `onPointerDown`: 히트된 오브젝트에 `TransformControls` 연결 (이동/회전/스케일 편집)
- `onPointerMove`: 호버 시 커서를 `pointer`로 변경

```js
raycaster.intersectObjects(roots, true); // recursive: true
```

---

## 오브젝트 수집 패턴 요약

| 수집 방식                          | 사용처                                       |
| ---------------------------------- | -------------------------------------------- |
| 이름 접두사 `INT_` 필터            | Stage3 인터랙션, Stage6 인터랙션             |
| 이름 패턴 `WALKABLE` 필터          | Stage3 워크어블 지면                         |
| 명시적 이름 `ANIM_Gumtoongji`      | Stage3 gumtoongji 캐릭터                     |
| `EXTRA_CLICKABLE_OBJECT_NAMES` Set | Stage6 추가 클릭 오브젝트                    |
| 함수 파라미터로 직접 전달          | Stage2 스폰 검증, Stage6 지면, Stage6 말풍선 |
| `BG_Floor` 노드 메시               | Stage6 바닥 Y 샘플링                         |
