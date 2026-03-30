# Stage3: island2 단일 GLB 리팩터링

Stage3 씬 지오메트리를 **`public/models/stage3/island2.glb` 하나**로 통합하고, 나머지 Stage3 전용 GLB/FBX 병렬 로드를 제거한 작업을 정리한 문서입니다.

---

## 1. 배경과 목표

### 문제

- Stage3에서 배경·나무·게임기·거울·아이스크림 카트 등 **여러 개의 GLB/FBX**를 각각 로드·배치하고 있었습니다.
- 에셋이 늘수록 로드 순서·중복·경로 관리 비용이 커집니다.

### 목표

1. **씬 지오메트리**는 **`island2.glb`만** 로드한다.
2. **상호작용(클릭)** 은 GLB **내부 오브젝트 이름 규칙**으로 식별한다 (`INT_*` 접두사).
3. **포탈(스테이지 전환)** 은 메시가 아니라 **설정상의 논리 평면**으로 유지한다.
4. **캐릭터·껌딱지** 등 `/models/common/` 경로는 기존대로 두어, “섬 에셋”과 “공용 캐릭터 에셋”을 구분한다.

---

## 2. 리팩토링 계획 (당초 설계)

| 단계 | 내용 |
|------|------|
| A | `stage3ObjectsConfig`에서 island 외 **모든 `path`(GLB/FBX)** 제거 |
| B | `loadIceCreamSpawnModels` 등 **추가 GLB 로드 함수** 제거 |
| C | `Stage3.js`의 **병렬 loadTasks**(카트·스폰 템플릿·props·FBX 거울) 제거 |
| D | 배경 로더에서 **레이캐스트**: 장식 메시는 막고, **`INT_` 트리만** 히트 가능하게 |
| E | 배경 로드 후 **`registerIslandInteractions`**: `INT_*` 노드 순회 → 레이 메시 수집, `gameMachine` / `icecream` 루트 ref |
| F | (후속) 아이스크림 **스폰 템플릿**은 island 내부 또는 별도 설계로 연결 — 당장은 템플릿 없으면 클릭해도 스폰 없음 |
| G | (후속) Cannon 장애물 / `OBJ_`·`DECO_` 네이밍 등은 별도 이슈 |

---

## 3. 구현 요약 (실제 반영 내용)

### 3.1 설정: `src/config/stages/stage3/stage3ObjectsConfig.js`

- **`model`**: `path: "/models/stage3/island2.glb"` 및 기존 위치·섀도우 옵션 유지.
- **`icecreamCart`**: `spawnScale`, `maxSpawns`, `physicsSubsteps`만 유지. `path` / `spawnPaths` 제거.
- **`notice`**: 모달용 `paperSoundPaths`만 유지.
- **`portal_bright`**: `position`, `normal`, `halfWidth`, `targetStage`만 유지 (논리 포탈).
- **삭제**: `tree1`, `notice` GLB, `statue`, `well`, `clock`, `water`, `gameMachine`, `bench`, `signs`, `mirror`(FBX) 등 **별도 에셋 블록 전부**.

### 3.2 설정 진입점: `src/config/stages/stage3.js`

- `STAGE3_CONFIG` 조합만 유지.
- **`loadIceCreamSpawnModels` 삭제**, `getGLBLoader` import 제거.

### 3.3 배경 로더: `src/utils/stages/stage3/backgroundLoader.js`

- **Island 바운딩**: `model.children` 한 단계·정확 일치 `"island"`만 보던 방식을 **`traverse` + 이름 trim + 소문자 `"island"`** 비교로 변경 (깊은 계층·`Island` 등 대응).
- **Raycast**: 모든 메시에 `raycast` noop을 걸지 않고, **조상 중 `name`이 `INT_`로 시작하는 메시만** 기본 raycast 유지. 나머지는 `(() => {})`로 클릭 통과·성능·의도적 “배경만” 처리.

### 3.4 스테이지 본체: `src/stages/Stage3.js`

- **제거**: `FBXLoader`, `fbxLoader`, `loadIceCreamSpawnModels` import 및 **병렬 props/카트/스폰/거울 로드 블록** 전체.
- **추가**: `INT_PREFIX`, `INT_SUFFIX_TO_TARGET`, `intRaycastMeshes[]`.
- **`registerIslandInteractions(model)`**  
  - 이름이 `INT_`로 시작하는 **루트 오브젝트**마다 하위 `Mesh`를 집합에 넣어 `intRaycastMeshes`에 반영.  
  - `INT_gameMachine` → `gameMachineRef`, `INT_icecream` → `iceCreamCartRef`.  
  - `gameMachineRef`가 있을 때만 `onMinigameClose`로 `closeMinigame` 연동.
- **`getPointerHitTarget`**: `intersectObjects(intRaycastMeshes, false)` 후, 히트 메시에서 부모를 올라가며 `INT_*` 접미사를 **`notice` / `gameMachine` / `mirror` / `icecream` / `portal`** 로 매핑.

### 3.5 타입: `src/types.js`

- `Stage3PropConfig`, `Stage3PortalConfig`, `Stage3IcecreamCartConfig`의 **`path` 등을 optional**로 조정해 현재 config와 일치.

### 3.6 디버그 컨트롤 (부수 수정): `src/utils/common/stageDebugControls.js`

- Three.js **r170+**에서 `TransformControls`는 **`Object3D`가 아님** → `scene.add(transformControls)`는 런타임 오류.
- **`scene.add(transformControls.getHelper())`** 로 변경하고, dispose 시 **`scene.remove`도 helper에 대해 수행**.

---

## 4. `island2.glb`에 실제로 있는 노드 이름 (gltf.nodes 파싱)

에셋을 바꾸지 않은 기준, **이름이 있는 노드**는 아래와 같습니다.  
(이름 없는 중간 노드·메시는 목록에 안 나옵니다.)

| glTF node index | 이름 | 비고 |
|-----------------|------|------|
| 0 | `INT_notice` | 코드에 매핑 있음 → 게시판 모달 |
| 1 | `INT_well` | **아직 코드 매핑 없음** |
| 2 | `INT_water` | **아직 코드 매핑 없음** |
| 3 | `INT_statue` | **아직 코드 매핑 없음** |
| 4 | `INT_clock` | **아직 코드 매핑 없음** |
| 5 | `island` | 바운딩/이동 제한용 (클릭 타깃 아님) |
| 6 | `SandBase` | 장식 |
| 7 | `Sea` | 장식 |
| 8 | `Background` | 장식 |
| 9 | `INT_fence` | **아직 코드 매핑 없음** |
| 10 | `INT_portal` | 코드 매핑 있음 → 클릭 시 Stage 전환 |
| 11 | `INT_LightHouse` | **아직 코드 매핑 없음** |

현재 `Stage3.js`의 클릭 매핑은 **`INT_notice`**, **`INT_gameMachine`**, **`INT_mirror`**, **`INT_icecream`**, **`INT_portal`** 입니다.  
이 GLB에는 현재 **게임기·거울·아이스크림 루트 이름이 없으므로**, 해당 기능은 동작하지 않습니다. (`INT_portal`은 동작)  
원하는 동작에 맞게 **Blender에서 위 이름을 표준 이름으로 바꾸거나**, 코드의 `INT_SUFFIX_TO_TARGET` / `handlePointerDown`에 **새 접미사**를 추가하면 됩니다.

로컬에서 노드 목록을 다시 뽑을 때는 저장소 루트에서:

```bash
node -e "const fs=require('fs');const b=fs.readFileSync('public/models/stage3/island2.glb');const L=b.readUInt32LE(12);const g=JSON.parse(b.slice(20,20+L).toString('utf8'));(g.nodes||[]).forEach((n,i)=>{if(n.name)console.log(i,n.name);});"
```

---

## 5. DCC(GLB) 네이밍 규칙 (코드 기준)

클릭이 동작하려면 `island2.glb` 안에 다음 **루트(또는 해당 서브트리의 조상)** 이름을 맞춥니다.

| 오브젝트 이름 | 동작 |
|---------------|------|
| `INT_notice` | 게시판 모달 (`notice.paperSoundPaths`) |
| `INT_gameMachine` | 미니게임 카메라 클로즈업 |
| `INT_mirror` | 거울 모달 |
| `INT_icecream` | 아이스크림 스폰(스폰용 GLB 템플릿이 없으면 클릭만 되고 스폰은 안 됨) |
| `INT_portal` | 클릭 시 `config.portal_bright.targetStage`로 전환 (기본 6) |

접두사는 코드 상 **`INT_`**, 접미사는 위 표와 **정확히** 일치해야 합니다 (`gameMachine` 카멜케이스).

### 유지보수 규칙 (앞으로 추가될 때)

1. `island2.glb`에 오브젝트 이름을 추가/수정했다면, 이 문서의 **4번 노드 목록 표**를 함께 갱신합니다.
2. 새 `INT_*` 인터랙션을 추가했다면, 이 문서의 **5번 네이밍 규칙 표**와 `Stage3.js`의 `INT_SUFFIX_TO_TARGET`을 같이 갱신합니다.
3. Blender에서 `INT_gameMachine`으로 이름 변경 후, Stage3 재진입해서 콘솔의 `island INT_ 노드` 로그에 노출되는지 확인합니다.

---

## 6. 포탈(스테이지 전환)

- `portal_bright`는 **별도 GLB 없음**.
- `config.portal_bright`의 **월드 XZ 평면**(`position`, `normal`, `halfWidth`)과 `targetStage`로 `checkPortalPlaneCrossing`이 동작합니다.
- `INT_portal` 클릭 시에도 동일한 `targetStage`로 전환 이벤트를 보냅니다.

---

## 7. 디스크 상의 기타 파일

- `public/models/stage3/` 안의 **다른 glb/fbx**는 코드에서 **로드하지 않음**.
- 저장소 용량 정리를 원하면 백업 후 해당 파일 삭제 가능 (앱 동작에는 필수 아님).

---

## 8. 후속 작업 아이디어

1. **아이스크림**: `iceCreamTemplates`를 island 내부 숨김 템플릿·또는 소수 공용 GLB로 다시 채우기.
2. **물리**: Cannon으로 `INT_` / `OBJ_` 메시에 바디 부여, 캐릭터 충돌.
3. **레이캐스트**: `DECO_` 제외 등 네이밍 규칙 확장.

---

## 9. 관련 파일 목록

| 파일 | 역할 |
|------|------|
| `src/config/stages/stage3/stage3ObjectsConfig.js` | island + 데이터만 |
| `src/config/stages/stage3.js` | `STAGE3_CONFIG` |
| `src/utils/stages/stage3/backgroundLoader.js` | island2 로드, island 바운딩, raycast 정책 |
| `src/stages/Stage3.js` | `INT_` 등록, 포인터·포탈·기존 게임플레이 |
| `src/utils/common/stageDebugControls.js` | Three r182 호환 TransformControls |
| `src/types.js` | JSDoc 정합성 |

---

*작성 기준: island2 단일화 + INT_ 상호작용 + TransformControls 수정 반영 이후 코드베이스.*
