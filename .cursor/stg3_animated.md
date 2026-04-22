# Island10 Well Scene × three.js 구현 사양서

> 이 문서는 `island10_well_animated.glb`를 three.js 씬에 로드하고, 유저 캐릭터가 돌아다니며 **(1) 캐릭터에 근접** 또는 **(2) 캐릭터/인터랙션 오브젝트 클릭** 시 애니메이션이 재생되는 기능을 구현하기 위한 사양서다. 이 문서는 AI(코드 생성기)에게 그대로 전달해서 작업을 지시하기 위한 목적으로 작성되었다. 반드시 **§11 주의사항** 섹션까지 전부 읽고 반영해야 한다.

---

## 0. 개요

- **입력**: `island10_well_animated.glb` (Draco 압축, 약 96 MB)
- **씬 구성**: 섬 배경(지면 + 초목 + 시설물) + 캐릭터 1마리(우물 위) + 애니메이션 7개
- **기능 요구사항**:
  1. GLB 로드 후 씬에 배치
  2. 유저(= 1인칭 카메라) WASD 이동 + 마우스 시점 회전
  3. 유저가 캐릭터에 **일정 거리 이내로 근접**하면 7개 애니메이션을 **동시에** 재생 (진입 시 1회, 쿨다운 후 재트리거)
  4. 유저가 **캐릭터 또는 INT\_ 오브젝트를 클릭/탭**하면 해당 반응 실행 (캐릭터 = 7개 동시 재생, 비캐릭터 = 후크)
  5. 바닥(`Ground1~4`)에 걷기 가능, `DECO_*`은 통과 가능, `OBJ_*`/`INT_*`는 향후 콜리전 대상

---

## 1. GLB 파일 구조 (불변 — 수정하지 말 것)

### 1.1 씬 구조 상위 레벨

GLB의 기본 씬에는 루트 노드가 하나 있다: `group` (노드 784). 다른 모든 것이 이 그룹의 자식이다.

```
Scene
└── group
    ├── ANIM_Gumtoongji   (캐릭터 1마리)
    ├── DECO_*             (551개: 꽃, 풀, 돌, 벽돌 등)
    ├── OBJ_*              (166개: 덤불, 통나무, 배, 캠프파이어 등)
    ├── INT_*              (24개: Bench, Well, Clock, GameMachine, IceCart,
    │                           Notice, Portal, Poster1~7, StreetLight2~4, Tent 등)
    └── Ground             (부모) → Ground1, Ground2, Ground3, Ground4 (바닥 4조각)
```

> **중요**: 이전 glb에 있던 기본 Blender `Cube` 노드는 이미 제거되었다. 다시 생기지 않도록 주의.

### 1.2 노드 네이밍 규칙

| Prefix    | 의미                                                      | 레이캐스팅/콜리전 용도        |
| --------- | --------------------------------------------------------- | ----------------------------- |
| `ANIM_*`  | 캐릭터 (애니메이션 붙음) — 본 씬엔 `ANIM_Gumtoongji` 하나 | 클릭/근접 트리거 대상         |
| `INT_*`   | 시설물 (현재 애니메이션 없음, 추후 인터랙션 예정)         | 클릭 트리거 후크 + 충돌       |
| `OBJ_*`   | 일반 오브젝트 (애니메이션 없음)                           | 충돌체 (통과 금지)            |
| `DECO_*`  | 데코레이션 (꽃, 풀, 돌 등 밟아도 되는 것)                 | **충돌 제외** (그냥 통과)     |
| `Ground*` | 바닥. `Ground` 는 부모, `Ground1~4` 가 실제 메쉬          | 바닥 Y-스냅용 레이캐스트 대상 |

### 1.3 캐릭터 정보

**`ANIM_Gumtoongji`** (단일 캐릭터, 우물 위에 배치됨)

| 속성                  | 값                                  |
| --------------------- | ----------------------------------- |
| Translation           | `(-36.942, 19.687, -10.602)`        |
| Rotation (quaternion) | `(0.0197, 0.5213, -0.0018, 0.8531)` |
| Scale                 | `(1.876, 1.876, 1.876)`             |

**캐릭터 서브트리 구성**:

```
ANIM_Gumtoongji
├── Eye_default_L          (왼쪽 눈)
├── Eye_default_R          (오른쪽 눈)
├── model                  (몸체 메쉬, skin=0)
├── Mouth_smile            (입)
├── Paw_L                  (왼쪽 앞발)
├── Paw_R                  (오른쪽 앞발)
└── Root → Hips → Spine → Chest → Neck → Head
                          ├── L_UpperArm → L_LowerArm → L_Hand
                          └── R_UpperArm → R_LowerArm → R_Hand
                 ├── L_UpperLeg → L_LowerLeg → L_Foot
                 └── R_UpperLeg → R_LowerLeg → R_Foot
```

### 1.4 애니메이션 목록 (총 7개)

**모두 동일 캐릭터의 서로 다른 부위를 타겟팅**. 자연스러운 idle 연출을 위해 **반드시 7개를 동시에** `play()`해야 한다.

| 클립 이름               | 타겟                 | 역할          |
| ----------------------- | -------------------- | ------------- |
| `ANIM_GumtoongjiAction` | 본(rig) 전체, 57채널 | 몸 애니메이션 |
| `Eye_default_LAction`   | `Eye_default_L`      | 왼쪽 눈       |
| `Eye_default_RAction`   | `Eye_default_R`      | 오른쪽 눈     |
| `modelAction`           | `model`              | 몸체 메쉬     |
| `Mouth_smileAction`     | `Mouth_smile`        | 입            |
| `Paw_LAction.001`       | `Paw_L`              | 왼쪽 앞발     |
| `Paw_RAction.001`       | `Paw_R`              | 오른쪽 앞발   |

> **주의**: 클립 이름이 오타처럼 보여도 그대로 사용. `.001` 접미사와 `Action` 접미사는 Blender 익스포트 시 자동 부여된 이름으로, 변경 시 매칭 실패.

### 1.5 씬 스케일 (매우 중요)

- **캐릭터 위치가 (-36, 19, -10) 부근, 스케일 1.88**. 즉 씬 전체가 수십 단위 규모 (airport 씬이 ~5단위 규모였던 것과 다름).
- 유저 이동 속도, 근접 반경, 카메라 `far plane` 등을 이 스케일에 맞춰야 함.
- 권장 값: `MOVE_SPEED ≈ 4.0 m/s`, `PROXIMITY_RADIUS ≈ 3.0`, `camera.far ≈ 500`.

---

## 2. 기술 스택 및 의존성

### 2.1 필수 패키지

```bash
npm install three
```

three.js **r150 이상** 권장 (r160+ 에서 SkinnedMesh 레이캐스팅 및 Draco 관련 개선사항 반영됨).

### 2.2 Draco 디코더 (필수 — 이거 없으면 로드 실패)

GLB가 `KHR_draco_mesh_compression`으로 압축되어 있으므로, **반드시** `DRACOLoader`를 설정해야 한다.

- **옵션 A (간단, CDN)**: 구글 CDN
- **옵션 B (프로덕션 권장)**: `node_modules/three/examples/jsm/libs/draco/` 를 `public/draco/` 로 복사 후 로컬 경로 사용

---

## 3. GLB 로딩 코드

```js
// src/loadScene.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export async function loadIslandScene(url) {
  const dracoLoader = new DRACOLoader();
  // 옵션 A (CDN)
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
  );
  // 옵션 B (로컬, 권장):
  // dracoLoader.setDecoderPath('/draco/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // 파일이 약 96 MB로 크다 — 로딩 진행률 UI 필수
  const gltf = await gltfLoader.loadAsync(url, (evt) => {
    if (evt.lengthComputable) {
      const pct = ((evt.loaded / evt.total) * 100).toFixed(1);
      console.log(`[load] ${pct}%`);
      // TODO: UI에 progress bar 반영
    }
  });

  // SkinnedMesh 프러스텀 컬링 해제 (없으면 카메라 가장자리에서 사라짐 — §11.2)
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });

  return gltf;
}
```

---

## 4. 씬 파싱

`group` 노드 아래의 최상위 자식들만 분류 대상이다. DECO/OBJ 중 부모 노드 아래 자식들이 있는 경우가 있으니, **`traverse` 기반으로 이름 prefix 매칭**을 해야 누락이 없다.

```js
// src/parseScene.js
export const CHAR_ROOT_NAME = "ANIM_Gumtoongji";

export function parseScene(root) {
  let character = null;
  const intFixtures = [];
  const objs = [];
  const decos = [];
  const groundPieces = [];

  root.traverse((o) => {
    const name = o.name || "";
    if (name === CHAR_ROOT_NAME) {
      character = o;
      return; // 자식으로 내려가지 않도록 traverse는 그대로 두지만 분류는 하지 않음
    }
    // 캐릭터 내부 노드 (Head, L_Hand 등) 은 캐릭터 하위이므로 어떤 prefix에도 매칭시키지 않음
    // → 조상 중에 CHAR_ROOT_NAME이 있으면 skip
    let p = o.parent;
    while (p) {
      if (p.name === CHAR_ROOT_NAME) return;
      p = p.parent;
    }
    if (name.startsWith("INT_")) intFixtures.push(o);
    else if (name.startsWith("OBJ_")) objs.push(o);
    else if (name.startsWith("DECO_")) decos.push(o);
    else if (/^Ground\d+$/.test(name)) groundPieces.push(o);
  });

  if (!character)
    console.warn("[parseScene] character ANIM_Gumtoongji not found");
  if (groundPieces.length === 0)
    console.warn("[parseScene] Ground* not found — 바닥 레이캐스트 불가");

  return { character, intFixtures, objs, decos, groundPieces };
}
```

---

## 5. 애니메이션 시스템

### 5.1 Mixer 및 Action 생성

7개 클립을 배열로 잡아두고, 트리거 시 전부 동시에 `reset().play()`.

```js
// src/animation.js
import * as THREE from "three";

export const ALL_CLIP_NAMES = [
  "ANIM_GumtoongjiAction",
  "Eye_default_LAction",
  "Eye_default_RAction",
  "modelAction",
  "Mouth_smileAction",
  "Paw_LAction.001",
  "Paw_RAction.001",
];

export function createAnimationController(gltf) {
  const mixer = new THREE.AnimationMixer(gltf.scene);

  const actions = ALL_CLIP_NAMES.map((name) => {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (!clip) {
      console.warn(`[anim] clip not found: ${name}`);
      return null;
    }
    const action = mixer.clipAction(clip);

    // 기본: 1회 재생 후 마지막 프레임 유지.
    // 계속 반복되는 idle을 원하면 아래 두 줄을 주석 처리하고 LoopRepeat로.
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;

    // idle 루프를 원할 경우:
    // action.setLoop(THREE.LoopRepeat, Infinity);

    return action;
  }).filter(Boolean);

  /** 모든 7개 클립을 동시에 처음부터 재생. 이미 재생 중이어도 안전하게 재시작. */
  function playCharacter() {
    for (const a of actions) a.reset().play();
  }

  /** 어느 하나라도 재생 중인지 */
  function isPlaying() {
    return actions.some((a) => a.isRunning());
  }

  /** 전부 부드럽게 페이드아웃 */
  function stopCharacter(fadeSec = 0.3) {
    for (const a of actions) a.fadeOut(fadeSec);
  }

  return { mixer, playCharacter, isPlaying, stopCharacter, actions };
}
```

### 5.2 매 프레임 업데이트

렌더 루프에서 `mixer.update(delta)`를 호출해야 한다 (§9 참조).

---

## 6. 유저 캐릭터 및 이동

### 6.1 1인칭 (PointerLockControls) — 본 씬의 권장 방식

씬 스케일이 크기 때문에(캐릭터 위치 ~-36, 19, -10) 카메라 `far`, 이동 속도, 근접 반경을 모두 조정한다.

```js
// src/userController.js
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export function createUserController(camera, domElement, groundPieces) {
  const controls = new PointerLockControls(camera, domElement);

  // 초기 위치는 캐릭터 근처 (하지만 바로 트리거되지 않게 약간 떨어뜨림)
  camera.position.set(-30, 22, -10);
  camera.lookAt(-36.9, 20.5, -10.6);

  domElement.addEventListener("click", () => {
    if (!controls.isLocked) controls.lock();
  });

  const keys = { w: false, a: false, s: false, d: false, shift: false };
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyW") keys.w = true;
    if (e.code === "KeyA") keys.a = true;
    if (e.code === "KeyS") keys.s = true;
    if (e.code === "KeyD") keys.d = true;
    if (e.code === "ShiftLeft") keys.shift = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW") keys.w = false;
    if (e.code === "KeyA") keys.a = false;
    if (e.code === "KeyS") keys.s = false;
    if (e.code === "KeyD") keys.d = false;
    if (e.code === "ShiftLeft") keys.shift = false;
  });

  // 씬 스케일에 맞춘 이동 파라미터
  const MOVE_SPEED = 4.0; // m/s (Shift 시 2배)
  const EYE_HEIGHT = 1.6; // 바닥 위 눈높이
  const RUN_MULT = 2.0;

  // 바닥 레이캐스트 (재사용 객체)
  const floorRay = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);

  function update(delta) {
    if (controls.isLocked) {
      const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      const rgt = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const speed = MOVE_SPEED * (keys.shift ? RUN_MULT : 1);
      if (fwd) controls.moveForward(fwd * speed * delta);
      if (rgt) controls.moveRight(rgt * speed * delta);
    }

    // Y를 바닥에 스냅 (Ground1~4 전체 대상)
    if (groundPieces.length > 0) {
      rayOrigin.copy(camera.position);
      rayOrigin.y += 50; // 씬 스케일상 위에서 충분히 내려쏘기
      floorRay.set(rayOrigin, DOWN);
      const hits = floorRay.intersectObjects(groundPieces, false);
      if (hits.length > 0) camera.position.y = hits[0].point.y + EYE_HEIGHT;
    }
  }

  // 근접 계산 시 사용할 '발' 위치
  const _userPos = new THREE.Vector3();
  function getUserPosition() {
    _userPos.copy(camera.position);
    _userPos.y -= EYE_HEIGHT;
    return _userPos;
  }

  return { controls, update, getUserPosition };
}
```

---

## 7. 근접 감지 (Proximity Trigger)

캐릭터가 1마리뿐이라 로직이 단순하다. 진입 시 1회 트리거 + 쿨다운.

```js
// src/proximity.js
import * as THREE from "three";

export function createProximityWatcher({
  character,
  playCharacter,
  isPlaying,
  radius = 3.0,
  cooldownMs = 5000,
}) {
  let inside = false;
  let cooldownUntil = 0;

  const _charWorld = new THREE.Vector3();

  function update(userPos, nowMs) {
    if (!character) return;
    character.getWorldPosition(_charWorld);
    const d = userPos.distanceTo(_charWorld);
    const isIn = d < radius;

    if (!inside && isIn) {
      if (nowMs >= cooldownUntil && !isPlaying()) {
        playCharacter();
        cooldownUntil = nowMs + cooldownMs;
      }
    }
    inside = isIn;
  }

  return { update };
}
```

### 7.1 튜닝 값

- `radius = 3.0` (씬 스케일 고려). 캐릭터 스케일 1.88이므로 3~4 단위가 자연스러움.
- `cooldownMs = 5000`. 애니메이션 길이보다 충분히 길게.

---

## 8. 클릭/탭 감지 (Raycasting)

```js
// src/clickHandler.js
import * as THREE from "three";
import { CHAR_ROOT_NAME } from "./parseScene.js";

export function createClickHandler({
  renderer,
  camera,
  gltfScene,
  playCharacter,
  onFixtureClick,
  onObjClick,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const locked = !!document.pointerLockElement;

    if (locked) {
      pointer.set(0, 0); // PointerLock 시 화면 중앙으로 레이
    } else {
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(gltfScene, true);
    if (intersects.length === 0) return;

    // 부모 체인 타고 올라가며 prefix 매칭
    let o = intersects[0].object;
    while (o) {
      const name = o.name || "";
      if (name === CHAR_ROOT_NAME) {
        playCharacter();
        return;
      }
      if (name.startsWith("INT_")) {
        onFixtureClick?.(name, o);
        return;
      }
      if (name.startsWith("OBJ_")) {
        onObjClick?.(name, o);
        return;
      }
      // DECO_ / Ground는 클릭 무시
      o = o.parent;
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  return {
    dispose: () =>
      renderer.domElement.removeEventListener("pointerdown", onPointerDown),
  };
}
```

### 8.1 INT\_ 클릭 후크 활용 예

현재 `INT_Bench`, `INT_Well`, `INT_GameMachine` 등은 애니메이션이 없다. 클릭 시 할 수 있는 것들:

1. 콘솔 로그 (개발 초기)
2. 살짝 스케일 펄스 (GSAP 등)
3. 사운드 재생
4. UI 말풍선 / 안내 텍스트

각자 프로젝트에서 확장. 본 문서에서는 훅만 마련.

---

## 9. 렌더 루프 (전체 통합 예시)

```js
// src/main.js
import * as THREE from "three";
import { loadIslandScene } from "./loadScene.js";
import { parseScene } from "./parseScene.js";
import { createAnimationController } from "./animation.js";
import { createUserController } from "./userController.js";
import { createProximityWatcher } from "./proximity.js";
import { createClickHandler } from "./clickHandler.js";

async function main() {
  // ---- three.js 기본 세팅 ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3ff);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500, // 씬 스케일 큼 — far 충분히 크게
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // 조명 (glb에 조명이 없으면 필수)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7b4b, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(30, 50, 20);
  scene.add(dir);

  // ---- GLB 로드 (96 MB — 진행률 UI 필요) ----
  const gltf = await loadIslandScene("/island10_well_animated.glb");
  scene.add(gltf.scene);

  const parsed = parseScene(gltf.scene);
  const anim = createAnimationController(gltf);

  const user = createUserController(
    camera,
    renderer.domElement,
    parsed.groundPieces,
  );
  const proximity = createProximityWatcher({
    character: parsed.character,
    playCharacter: anim.playCharacter,
    isPlaying: anim.isPlaying,
    radius: 3.0,
    cooldownMs: 5000,
  });
  const click = createClickHandler({
    renderer,
    camera,
    gltfScene: gltf.scene,
    playCharacter: anim.playCharacter,
    onFixtureClick: (name, obj) => console.log("[INT] click:", name),
    onObjClick: (name, obj) => console.log("[OBJ] click:", name),
  });

  // ---- 렌더 루프 ----
  const clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    const delta = clock.getDelta();
    const nowMs = performance.now();

    user.update(delta);
    anim.mixer.update(delta);
    proximity.update(user.getUserPosition(), nowMs);

    renderer.render(scene, camera);
  }
  tick();

  // ---- 리사이즈 ----
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main().catch(console.error);
```

---

## 10. 충돌 처리 (선택)

`OBJ_*` / `INT_*` 통과 금지를 원하면 이동 전 짧은 레이캐스트로 체크. `DECO_*`과 `Ground*`은 충돌 제외.

```js
const solids = [...parsed.intFixtures, ...parsed.objs]; // DECO_, Ground 제외
// 이동 방향으로 레이 → hit 이 생기면 그 프레임 이동 취소
```

자세한 구현은 프로젝트 요구에 따름. 성능 위해 `three-mesh-bvh` 도입 검토.

---

## 11. ⚠️ 주의사항 (Gotchas)

### 11.1 파일 크기 96 MB — 로딩 UX 설계 필수

Draco 압축되어 있지만 메쉬 수가 739개라 최종 크기가 크다. 모바일/3G에서는 30초~2분 걸릴 수 있음. 반드시 로딩 진행률 UI 표시. 가능하면:

- DECO\_\* 일부는 별도 파일로 분리 후 LOD 적용
- KTX2 + Basis 텍스처 압축 추가 (현재는 미적용)

### 11.2 Draco 디코더 경로

`DRACOLoader.setDecoderPath()` 가 잘못되면 **조용히 실패**한다 (씬 검게 뜨고 콘솔 404). 프로덕션은 반드시 로컬 경로. CDN 경로는 끝이 `/` 여야 함.

### 11.3 SkinnedMesh 프러스텀 컬링

캐릭터의 `model` 은 `SkinnedMesh`다. 본 변환 후 바운딩이 부정확해 **카메라 가장자리에서 갑자기 사라지는** 현상 발생. 로드 직후 반드시:

```js
gltf.scene.traverse((o) => {
  if (o.isSkinnedMesh) o.frustumCulled = false;
});
```

### 11.4 7개 클립은 반드시 동시 재생

눈·입·몸·발이 서로 다른 클립으로 분리되어 있어 **하나라도 빠지면 프랑켄슈타인** 같은 연출이 된다. `playCharacter()`에서 전부 `reset().play()` 호출 필수. 코드상 `ALL_CLIP_NAMES` 상수에 7개 전부 들어있는지 배포 전 확인.

### 11.5 애니메이션 중복 재생

`action.isRunning() === true` 일 때 `reset().play()` 호출 시 처음부터 재시작. 원하지 않으면 `proximity.js`처럼 `isPlaying` 가드 추가. 클릭은 의도적 재시작으로 허용 가능.

### 11.6 `ANIM_Gumtoongji.position` 덮어쓰기 금지

GLB의 캐릭터는 월드 위치 `(-36.94, 19.69, -10.60)` + 회전 + 스케일 1.88 이 적용된 상태로 바인딩되어 있다. `character.position.set(...)` 으로 옮기면 애니메이션 오프셋이 깨질 수 있음. 위치 조정 필요 시 캐릭터를 감싸는 `Group`을 만들어 그 그룹을 이동.

### 11.7 씬 스케일이 큼 (airport와 다름)

- 유저 이동 속도: ~4 m/s (airport 씬은 1.2 였음)
- 근접 반경: ~3.0 (airport 씬은 1.0)
- 카메라 `far`: ~500 (airport 씬은 100)
- 눈높이: ~1.6 (airport 씬은 0.35)

이 값들 튜닝 없이 airport 스펙을 그대로 복붙하면 **씬을 한 발짝만 걸어도 벽을 뚫고 나가는** 현상이 생긴다.

### 11.8 DECO* 충돌 제외 vs OBJ* 충돌 대상

`DECO_*`(꽃, 풀, 벽돌 조각 등 551개)는 캐릭터가 밟고 지나가야 한다. 충돌 감지 대상에 포함하지 말 것. `OBJ_*`(덤불, 통나무, 배 등 166개)는 통과 금지 — 단, 현재 스펙은 충돌 미구현이므로 추후 작업 시 이 구분만 지키면 됨.

### 11.9 바닥은 `Ground1~4`, 부모 `Ground`는 빈 노드

바닥 Y-스냅 레이캐스트 대상은 `Ground1`, `Ground2`, `Ground3`, `Ground4` 이다. 부모 `Ground`(노드 546)는 메쉬가 없으므로 단독으로 레이캐스트하면 실패한다. 본 스펙의 `parseScene`은 `Ground1~4`를 배열로 수집해 `groundPieces`로 제공.

### 11.10 매 프레임 `new THREE.Vector3()` 금지

모든 `update()` 루프 내에서는 모듈 스코프 재사용 벡터로 `copy()`/`set()`만 사용. 매 프레임 new 하면 GC 스파이크.

### 11.11 PointerLock + 클릭 좌표

PointerLockControls 활성 시 `clientX/Y`는 의미 없음. 레이는 화면 중앙(0, 0)으로 쏜다. 본 문서 `clickHandler`는 이미 반영.

### 11.12 모바일

- `PointerLockControls`는 모바일에서 동작하지 않음 → 가상 조이스틱 + 스와이프 회전 대안 필요.
- 96 MB 파일은 모바일 4G에선 한참 걸리므로 Wi-Fi 권장 안내 UI.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` 로 성능 방어.

### 11.13 레이캐스팅 성능 — 씬이 큼

`raycaster.intersectObject(gltf.scene, true)` 는 매 클릭마다 전체 씬(785 노드, 739 메쉬)을 훑는다. 클릭 빈도 낮으면 OK. **바닥 스냅은 매 프레임**이므로 `groundPieces`(4개)만 대상으로 할 것 — 씬 전체를 대상으로 하면 프레임 드랍 확실.

### 11.14 애니메이션 이름 오타 주의

`THREE.AnimationClip.findByName()`은 못 찾으면 null을 반환. `Paw_LAction.001`의 `.001`은 실제 클립 이름의 일부. 임의로 제거하면 매칭 실패.

### 11.15 GLB 재내보내기 시 `Cube` 노드 재생성 주의

Blender에서 다시 export할 때 씬의 기본 큐브를 지우지 않으면 루트에 `Cube`가 다시 생긴다. Export 전 Blender 씬에서 확인 필수.

### 11.16 Orphan 노드 주의

현재 `island10_well_animated.glb`에는 **참조되지 않는 Cube 노드가 orphan으로 남아있다** (씬에는 포함 안 되지만 `nodes[]` 배열에는 있음). 렌더링엔 영향 없지만, 완전히 정리하려면 glTF Transform 같은 툴로 prune 필요.

---

## 12. 확장/추가 과제 (후속 작업용)

1. 벤치 쪽에 두 번째 캐릭터 추가 (현재 1마리 — 추가 후 스펙의 `CHAR_ROOT_NAME`을 배열로 확장해야 함)
2. `INT_*` 시설물에 개별 인터랙션 부여 (GameMachine 클릭 시 미니게임 진입 등)
3. 애니메이션 LoopRepeat로 변경하여 상시 idle 연출 (§5.1 주석 참조)
4. 충돌 처리 (three-mesh-bvh 권장)
5. 파일 크기 최적화 — KTX2 텍스처 압축, DECO\_ 분리 로딩
6. 사운드 (Howler.js 등)
7. 모바일 가상 조이스틱 (nipple.js 등)
8. 포스트프로세싱 아웃라인으로 "상호작용 가능" 표시
9. 애니메이션 종료 이벤트 (`mixer.addEventListener('finished', ...)`) 활용한 상태 머신

---

## 13. 체크리스트 (구현 완료 검증)

- [ ] GLB 로드 시 콘솔 에러 없음 (Draco decoder 경로 OK)
- [ ] 로딩 진행률 UI 표시됨 (96 MB는 오래 걸림)
- [ ] 섬 씬(지면 4조각, 초목, 시설물, 우물, 벤치 등) 정상 렌더
- [ ] 우물 위의 캐릭터 1마리가 보임 (스케일 1.88)
- [ ] 루트에 `Cube` 잔재 안 보임
- [ ] WASD로 이동, 마우스로 시점 회전 (Shift 시 뜀)
- [ ] `Ground1~4` 위로 Y가 부드럽게 스냅
- [ ] 캐릭터에 반경 3 이내로 접근 시 7개 클립이 **동시에** 재생되며 자연스러운 idle 연출
- [ ] 범위를 벗어났다 재진입 시 쿨다운(5초) 후 다시 트리거
- [ ] 캐릭터 클릭 시 즉시 애니메이션 재생 (중복 허용)
- [ ] `INT_Bench` / `INT_Well` / `INT_Clock` 등 클릭 시 콘솔에 `[INT] click: 이름` 출력
- [ ] `OBJ_Bush*` / `OBJ_Boat` 등 클릭 시 `[OBJ] click: 이름` 출력
- [ ] `DECO_*` 클릭 시 반응 없음 (의도적)
- [ ] 카메라 가장자리에서 캐릭터가 사라지지 않음 (SkinnedMesh frustumCulled 확인)
- [ ] 리사이즈 시 화면 비율 유지

---

_끝. 추가 캐릭터 배치나 씬 확장 시 이 문서의 §1.1, §1.3, §1.4 섹션을 함께 업데이트할 것._
