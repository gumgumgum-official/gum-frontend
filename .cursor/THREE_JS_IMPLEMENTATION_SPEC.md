# Airport GLB × three.js 구현 사양서

> 이 문서는 `airport3_with_characters.glb`를 three.js 씬에 로드하고, 유저 캐릭터가 돌아다니며 **(1) 각 캐릭터에 근접** 또는 **(2) 캐릭터/오브젝트 클릭** 시 애니메이션이 재생되는 기능을 구현하기 위한 사양서다. 이 문서는 AI(코드 생성기)에게 그대로 전달해서 작업을 지시하기 위한 목적으로 작성되었다. 반드시 **§11 주의사항** 섹션까지 전부 읽고 반영해야 한다.

---

## 0. 개요

- **입력**: `airport3_with_characters.glb` (Draco 압축, KHR 확장 사용)
- **씬 구성**: 공항 배경 + 캐릭터 5마리(애니메이션 10개 포함)
- **기능 요구사항**:
  1. GLB 로드 후 씬에 배치
  2. 유저 캐릭터(= 카메라 또는 별도 모델)가 WASD 또는 조이스틱으로 이동
  3. 유저가 캐릭터 5마리 중 하나에 **일정 거리 이내로 근접**하면 해당 캐릭터의 애니메이션 재생 (진입 시 1회, 쿨다운 후 재트리거 가능)
  4. 유저가 **캐릭터 또는 오브젝트를 클릭/탭**하면 해당 캐릭터의 애니메이션 재생. 오브젝트의 경우 후크(hook)만 마련
  5. 바닥 충돌(걷기 가능), 기둥·벤치 등 통과 금지(선택)

---

## 1. GLB 파일 구조 (불변 — 수정하지 말 것)

### 1.1 노드 네이밍 규칙

| Prefix       | 의미                          | 예시                                              | 레이캐스팅/콜리전 용도 |
|--------------|-------------------------------|---------------------------------------------------|---------------------|
| `INT_Gum_*`  | 캐릭터 (애니메이션 붙음)         | `INT_Gum_Cry`, `INT_Gum_Heart`, `INT_Gum_Camera`, `INT_Gum_Airplane`, `INT_Gum_Lollipop` | 클릭/근접 트리거 대상 |
| `INT_*`      | 내부 시설물 (현재 애니메이션 없음, 추후 인터랙션 예정) | `INT_Bench1~4`, `INT_Escalator1~2`, `INT_Photobooth`, `INT_Board_pic`, `INT_Poster` | 클릭 트리거 후크 + 충돌 |
| `OBJ_*`      | 일반 오브젝트 (애니메이션 없음, 충돌체) | `OBJ_ATM`, `OBJ_Cart1~3`, `OBJ_Bag1~2`, `OBJ_FlowerPot1~2`, `OBJ_Tel`, `OBJ_Display`, `OBJ_Arrow`, `OBJ_Top`, `OBJ_Airplane` | 충돌만 |
| `BG_*`       | 환경 (바닥/기둥/트랙/외곽)       | `BG_Floor`, `BG_Column1~4`, `BG_Outside`, `BG_Track` | `BG_Floor`는 바닥 레이캐스트용, 나머지는 배경 |

### 1.2 캐릭터 위치 (glb translation — 참고용, 변경하지 말 것)

| 캐릭터              | Translation (x, y, z)             |
|--------------------|-----------------------------------|
| `INT_Gum_Cry`      | `(-0.900, 0.291, -0.700)`         |
| `INT_Gum_Heart`    | `(-0.400, 0.291, -0.700)`         |
| `INT_Gum_Camera`   | `(-3.120, 0.291, -0.700)`         |
| `INT_Gum_Airplane` | `(-2.620, 0.291, -0.700)`         |
| `INT_Gum_Lollipop` | `(-3.100, 0.291, -3.010)`         |

**씬 스케일이 작다** (전체 가로 약 3~5 단위). `MOVE_SPEED`, `PROXIMITY_RADIUS` 등 값 설정 시 이 스케일을 고려할 것. 바닥 Y ≈ 0, 캐릭터 발 Y ≈ 0.291.

### 1.3 애니메이션 목록 (AnimationClip 이름)

총 10개 클립이 있고, 캐릭터별 매핑은 다음과 같다. **같은 캐릭터의 복수 클립은 반드시 동시에 재생**해야 자연스럽다 (rig + prop 페어).

```js
const ANIM_MAP = {
  INT_Gum_Cry:      [],                                                                  // 애니메이션 없음
  INT_Gum_Heart:    ['Heart_Offer_Rig', 'Heart_Offer_Prop'],                             // 하트 건네주기 (몸 + 하트)
  INT_Gum_Camera:   ['Shutter_EyeDefL', 'Shutter_EyeZZL', 'Shutter_PropCam', 'Shutter_Flash'], // 사진 찍기 (눈 2종 + 카메라 + 플래시)
  INT_Gum_Airplane: ['Plane_Throw_Rig', 'Plane_Throw_Prop'],                             // 종이비행기 던지기 (몸 + 비행기)
  INT_Gum_Lollipop: ['Lollipop_ArmShake_Rig', 'Lollipop_Shake'],                         // 막대사탕 흔들기 (팔 + 사탕)
};
```

> **주의**: `INT_Gum_Cry`는 애니메이션이 없다. 재생 요청 시 크래시/에러 없이 조용히 무시되어야 한다. 대체 인터랙션(예: 살짝 스케일 튕기기, 사운드)을 원하면 후크를 마련한다.

---

## 2. 기술 스택 및 의존성

### 2.1 필수 패키지

```bash
npm install three
```

three.js **r150 이상** 권장 (r160+ 에서 SkinnedMesh 레이캐스팅 및 Draco 관련 개선사항 반영됨).

### 2.2 Draco 디코더 (필수 — 이거 없으면 로드 실패)

GLB가 `KHR_draco_mesh_compression` 으로 압축되어 있으므로, **반드시** `DRACOLoader`를 설정해야 한다.

- **옵션 A (간단, CDN)**: 디코더를 구글 CDN에서 로드
- **옵션 B (프로덕션 권장)**: `node_modules/three/examples/jsm/libs/draco/` 를 `public/draco/` 등으로 복사 후 로컬 경로 사용

---

## 3. GLB 로딩 코드

```js
// src/loadScene.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export async function loadAirportScene(url) {
  const dracoLoader = new DRACOLoader();
  // 옵션 A (CDN)
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  // 옵션 B (로컬, 권장):
  // dracoLoader.setDecoderPath('/draco/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const gltf = await gltfLoader.loadAsync(url);

  // SkinnedMesh 프러스텀 컬링 해제 (없으면 카메라 가장자리에서 사라질 수 있음 — §11.2 참고)
  gltf.scene.traverse(o => {
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });

  return gltf; // { scene, animations, ... }
}
```

---

## 4. 씬 파싱 (로드 직후 1회 실행)

씬의 최상위(top-level) 노드는 prefix로 분류되므로 `traverse` 없이 `gltf.scene.children`만 훑어도 충분하다.

```js
// src/parseScene.js
export const CHAR_ROOT_NAMES = [
  'INT_Gum_Cry',
  'INT_Gum_Heart',
  'INT_Gum_Camera',
  'INT_Gum_Airplane',
  'INT_Gum_Lollipop',
];

export function parseScene(root) {
  const chars = {};           // { [charName]: Object3D }
  const intFixtures = [];     // INT_* (non-character)
  const objs = [];            // OBJ_*
  const bgs = [];             // BG_* (excluding floor)
  let floor = null;           // BG_Floor

  for (const o of root.children) {
    const name = o.name || '';
    if (CHAR_ROOT_NAMES.includes(name))      chars[name] = o;
    else if (name.startsWith('INT_'))        intFixtures.push(o);
    else if (name.startsWith('OBJ_'))        objs.push(o);
    else if (name === 'BG_Floor')            floor = o;
    else if (name.startsWith('BG_'))         bgs.push(o);
  }

  // Sanity check
  const missing = CHAR_ROOT_NAMES.filter(n => !chars[n]);
  if (missing.length) console.warn('[parseScene] missing characters:', missing);
  if (!floor) console.warn('[parseScene] BG_Floor not found — 바닥 레이캐스트 불가');

  return { chars, intFixtures, objs, bgs, floor };
}
```

---

## 5. 애니메이션 시스템

### 5.1 Mixer 및 Action 캐싱

`AnimationMixer`는 **`gltf.scene`** 전체에 하나만 생성한다. 캐릭터별로 따로 만들지 말 것 (glTF의 애니메이션 채널은 씬 기준 노드 참조이므로, 하나의 믹서가 알아서 올바른 노드를 찾아간다).

```js
// src/animation.js
import * as THREE from 'three';

export const ANIM_MAP = {
  INT_Gum_Cry:      [],
  INT_Gum_Heart:    ['Heart_Offer_Rig', 'Heart_Offer_Prop'],
  INT_Gum_Camera:   ['Shutter_EyeDefL', 'Shutter_EyeZZL', 'Shutter_PropCam', 'Shutter_Flash'],
  INT_Gum_Airplane: ['Plane_Throw_Rig', 'Plane_Throw_Prop'],
  INT_Gum_Lollipop: ['Lollipop_ArmShake_Rig', 'Lollipop_Shake'],
};

export function createAnimationController(gltf) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actionsByChar = {};

  for (const [charName, clipNames] of Object.entries(ANIM_MAP)) {
    actionsByChar[charName] = clipNames
      .map(name => {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (!clip) {
          console.warn(`[anim] clip not found: ${name}`);
          return null;
        }
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true; // 마지막 프레임 유지 (원위치 안 돌아감)
        return action;
      })
      .filter(Boolean);
  }

  /**
   * 캐릭터의 모든 페어 애니메이션을 동시에 처음부터 재생.
   * 이미 재생 중이어도 안전하게 재시작됨.
   */
  function playCharacter(charName) {
    const actions = actionsByChar[charName];
    if (!actions || actions.length === 0) {
      // INT_Gum_Cry 등 애니메이션 없는 경우: 대체 이펙트 후크
      onCharacterWithoutAnim?.(charName);
      return;
    }
    for (const action of actions) {
      action.reset().play();
    }
  }

  /** 해당 캐릭터가 현재 재생 중인지 여부 */
  function isPlaying(charName) {
    const actions = actionsByChar[charName] || [];
    return actions.some(a => a.isRunning());
  }

  let onCharacterWithoutAnim = null;
  function setOnCharacterWithoutAnim(fn) { onCharacterWithoutAnim = fn; }

  return { mixer, playCharacter, isPlaying, setOnCharacterWithoutAnim };
}
```

### 5.2 매 프레임 업데이트

렌더 루프에서 `mixer.update(delta)`를 호출해야 한다 (§9 참조).

---

## 6. 유저 캐릭터 및 이동

### 6.1 권장 방식: 1인칭 (PointerLockControls)

가장 단순하고 확실하다. 카메라 위치 = 유저 위치로 취급한다.

```js
// src/userController.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export function createUserController(camera, domElement, floor) {
  const controls = new PointerLockControls(camera, domElement);

  // 초기 위치 (씬 스케일이 작으므로 작게)
  camera.position.set(0, 0.6, 1.5);

  // 클릭으로 포인터 락 시작
  domElement.addEventListener('click', () => {
    if (!controls.isLocked) controls.lock();
  });

  const keys = { w: false, a: false, s: false, d: false };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') keys.w = true;
    if (e.code === 'KeyA') keys.a = true;
    if (e.code === 'KeyS') keys.s = true;
    if (e.code === 'KeyD') keys.d = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') keys.w = false;
    if (e.code === 'KeyA') keys.a = false;
    if (e.code === 'KeyS') keys.s = false;
    if (e.code === 'KeyD') keys.d = false;
  });

  // 씬 스케일이 작음(약 3~5 단위) — 속도도 작게
  const MOVE_SPEED = 1.2; // m/s
  const EYE_HEIGHT = 0.35; // 바닥 위 눈높이 (스케일에 맞춰 튜닝)

  // 바닥 레이캐스트용 (재사용 객체로 GC 피함)
  const floorRay = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);

  function update(delta) {
    if (controls.isLocked) {
      const fwd = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      const rgt = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      if (fwd) controls.moveForward(fwd * MOVE_SPEED * delta);
      if (rgt) controls.moveRight(rgt * MOVE_SPEED * delta);
    }

    // Y를 바닥에 스냅
    if (floor) {
      rayOrigin.copy(camera.position);
      rayOrigin.y += 10;
      floorRay.set(rayOrigin, DOWN);
      const hits = floorRay.intersectObject(floor, true);
      if (hits.length > 0) camera.position.y = hits[0].point.y + EYE_HEIGHT;
    }
  }

  /** 유저의 월드 위치 (캐릭터 근접 계산용). 카메라 발 위치로 보정. */
  const _userPos = new THREE.Vector3();
  function getUserPosition() {
    _userPos.copy(camera.position);
    _userPos.y -= EYE_HEIGHT; // 발 기준으로
    return _userPos;
  }

  return { controls, update, getUserPosition };
}
```

### 6.2 대안: 3인칭 + 별도 캐릭터 모델

- OrbitControls 또는 자체 3인칭 카메라 구현
- 유저 캐릭터 모델(GLTF 별도 로드) — `userChar.position`이 유저 위치
- 바닥 스냅 동일, 이동만 캐릭터 오브젝트의 position으로

선택은 프로젝트 방향성에 따름. 이 문서는 1인칭 기준으로 설명한다.

---

## 7. 근접 감지 (Proximity Trigger)

### 7.1 설계 원칙

- **Edge 기반 트리거**: "범위에 들어오는 순간" 한 번만 실행. 머무는 동안 계속 실행 금지.
- **Exit 시 플래그 리셋**: 범위를 벗어났다 다시 들어오면 다시 트리거 가능.
- **쿨다운**: 짧은 시간 내 반복 진입 방지 (애니메이션 중간에 재시작되는 것도 방지).

```js
// src/proximity.js
import * as THREE from 'three';

export function createProximityWatcher({ chars, playCharacter, isPlaying, radius = 1.0, cooldownMs = 4000 }) {
  const inside = new Map(); // charName -> bool
  const cooldownUntil = new Map(); // charName -> timestamp
  for (const name of Object.keys(chars)) {
    inside.set(name, false);
    cooldownUntil.set(name, 0);
  }

  // 재사용 벡터 (매 프레임 new 피함)
  const _charWorld = new THREE.Vector3();

  function update(userPos, nowMs) {
    for (const [name, obj] of Object.entries(chars)) {
      obj.getWorldPosition(_charWorld);
      const d = userPos.distanceTo(_charWorld);
      const isIn = d < radius;
      const wasIn = inside.get(name);

      if (!wasIn && isIn) {
        // 진입 순간 (edge)
        if (nowMs >= cooldownUntil.get(name) && !isPlaying(name)) {
          playCharacter(name);
          cooldownUntil.set(name, nowMs + cooldownMs);
        }
      }
      inside.set(name, isIn);
    }
  }

  return { update };
}
```

### 7.2 튜닝 값

- `radius`: **씬 스케일이 작으므로 1.0 정도가 적당** (캐릭터 간 간격이 0.5 단위). 캐릭터끼리 너무 가까워 동시에 트리거될 수 있으면 0.5~0.8로 줄일 것.
- `cooldownMs`: 애니메이션 길이보다 크게 (4~5초 권장).

---

## 8. 클릭/탭 감지 (Raycasting)

### 8.1 구현

`pointerdown`은 마우스와 터치를 모두 커버한다. PointerLockControls와 함께 쓸 때는 잠금 상태에서도 이벤트가 오는지 확인 필요 (r160+ 기준 오긴 옴).

```js
// src/clickHandler.js
import * as THREE from 'three';
import { CHAR_ROOT_NAMES } from './parseScene.js';

export function createClickHandler({ renderer, camera, gltfScene, playCharacter, onFixtureClick, onObjClick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onPointerDown(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    // PointerLock 상태에서는 중앙(0,0)으로 레이 쏘는 게 UX 상 자연스러움.
    // 프리 마우스 상태에서는 실제 포인터 좌표 사용.
    const locked = !!document.pointerLockElement;
    if (locked) {
      pointer.set(0, 0);
    } else {
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(gltfScene, true);
    if (intersects.length === 0) return;

    // 부모 체인을 타고 올라가면서 prefix 매칭되는 조상을 찾는다
    let o = intersects[0].object;
    while (o) {
      const name = o.name || '';
      if (CHAR_ROOT_NAMES.includes(name)) {
        playCharacter(name);
        return;
      }
      if (name.startsWith('INT_')) {
        onFixtureClick?.(name, o);
        return;
      }
      if (name.startsWith('OBJ_')) {
        onObjClick?.(name, o);
        return;
      }
      o = o.parent;
    }
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  return { dispose: () => renderer.domElement.removeEventListener('pointerdown', onPointerDown) };
}
```

### 8.2 오브젝트/시설물 클릭 후크

현재 `INT_` 시설물(벤치 등)과 `OBJ_*` 는 애니메이션이 없다. 클릭 시 할 수 있는 것들:

1. 콘솔 로그 (개발 초기 단계)
2. 살짝 스케일 펄스(`gsap.to(obj.scale, { x:1.05, y:1.05, z:1.05, yoyo:true, repeat:1 })`)
3. 사운드 재생
4. UI 토스트/말풍선

이건 각자 프로젝트에서 확장. 이 문서에서는 훅만 마련.

---

## 9. 렌더 루프

```js
// src/main.js 일부
import * as THREE from 'three';
import { loadAirportScene } from './loadScene.js';
import { parseScene } from './parseScene.js';
import { createAnimationController } from './animation.js';
import { createUserController } from './userController.js';
import { createProximityWatcher } from './proximity.js';
import { createClickHandler } from './clickHandler.js';

async function main() {
  // ---- three.js 기본 세팅 ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe8f0);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // 조명 (glb에 조명이 없으면 필수)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 5, 2);
  scene.add(dir);

  // ---- GLB 로드 ----
  const gltf = await loadAirportScene('/airport3_with_characters.glb');
  scene.add(gltf.scene);

  const parsed = parseScene(gltf.scene);
  const anim = createAnimationController(gltf);
  anim.setOnCharacterWithoutAnim((name) => {
    console.log(`[hook] ${name} 은 애니메이션 없음 — 대체 이펙트 위치`);
  });

  const user = createUserController(camera, renderer.domElement, parsed.floor);
  const proximity = createProximityWatcher({
    chars: parsed.chars,
    playCharacter: anim.playCharacter,
    isPlaying: anim.isPlaying,
    radius: 1.0,
    cooldownMs: 4000,
  });
  const click = createClickHandler({
    renderer,
    camera,
    gltfScene: gltf.scene,
    playCharacter: anim.playCharacter,
    onFixtureClick: (name, obj) => console.log('fixture click:', name),
    onObjClick:     (name, obj) => console.log('obj click:', name),
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
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main().catch(console.error);
```

---

## 10. 충돌 처리 (선택 사항)

캐릭터가 벤치/기둥 등을 통과하지 못하게 하려면 매 프레임 레이캐스트 또는 간단한 원형 충돌을 추가한다. 씬 스케일이 작아 `Three-Mesh-BVH` 같은 가속 구조 없이도 돌아가지만, 성능을 위해 권장된다.

간이 구현(이동 전/후 레이캐스트로 막기):

```js
// 이동 방향으로 짧은 레이를 쏴서 solid 목록과 충돌하면 그 프레임 이동 취소
const solids = [...Object.values(parsed.chars), ...parsed.intFixtures, ...parsed.objs, ...parsed.bgs];
```

자세한 구현은 프로젝트 요구에 따라. 이 문서 범위 밖.

---

## 11. ⚠️ 주의사항 (Gotchas)

### 11.1 Draco 디코더 경로

`DRACOLoader.setDecoderPath()` 가 잘못되면 **조용히 실패**한다 (씬은 검게 뜨고 콘솔에 404만 찍힘). 프로덕션은 반드시 로컬 경로 사용. CDN 사용 시에도 슬래시(`/`)로 끝나야 한다.

### 11.2 SkinnedMesh 프러스텀 컬링

캐릭터의 스키닝 메쉬는 본(bone) 변환 후 바운딩 박스가 정확하지 않아 카메라 가장자리에서 **갑자기 사라지는** 현상이 생긴다. 로드 직후 반드시:

```js
gltf.scene.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
```

### 11.3 `INT_Gum_Cry`는 애니메이션 없음

`ANIM_MAP.INT_Gum_Cry === []` 이다. 재생 호출 시 에러 없이 무시되어야 하며, 필요하면 `setOnCharacterWithoutAnim()`에 대체 로직을 등록한다.

### 11.4 페어 애니메이션 동시 재생

Heart / Airplane / Lollipop은 Rig(몸)과 Prop(소품)이 쌍으로 존재한다. **반드시 두 클립을 동시에 `reset().play()`** 해야 몸동작과 소품 움직임이 동기화된다. Camera는 Shutter_* 4개가 하나의 "사진 찍기" 시퀀스이므로 전부 동시 재생.

### 11.5 애니메이션 중복 재생

`action.isRunning() === true` 일 때 `.reset().play()` 호출 시 처음부터 다시 재생된다. 이게 원하지 않으면 `proximity.js`처럼 `isPlaying` 체크로 가드한다. 클릭은 의도적 재시작으로 허용해도 OK.

### 11.6 캐릭터의 `translation`을 덮어쓰지 말 것

glb의 캐릭터 루트는 이미 올바른 월드 위치를 가지고 있다. `chars['INT_Gum_Heart'].position.set(...)` 같은 걸로 옮기면 애니메이션의 오프셋이 깨질 수 있다. 위치 조정이 필요하면 캐릭터를 감싸는 `Group`을 만들어 그 그룹을 이동시킬 것.

### 11.7 씬 스케일

씬 크기가 작다 (전체 ~5m 규모). `MOVE_SPEED`, `EYE_HEIGHT`, `PROXIMITY_RADIUS`, 카메라 `near` (0.01 권장) 전부 작은 값으로. 큰 값 쓰면 즉시 벽 통과/뛰어오름 현상.

### 11.8 매 프레임 `new THREE.Vector3()` 금지

`update()` 안에서 벡터를 매 프레임 `new`로 만들면 GC 스파이크 발생. 본 문서 코드처럼 **모듈 스코프에 재사용 벡터**를 두고 `copy()`/`set()`으로 덮어쓸 것.

### 11.9 PointerLock + 클릭

PointerLockControls 활성 상태에서는 `clientX/clientY`가 의미 없다 — 레이는 화면 중앙(0,0)으로 쏘는 게 정석. 본 문서 `clickHandler`는 이미 반영됨.

### 11.10 모바일

- `pointerdown`은 터치도 커버하지만, `PointerLockControls`는 모바일에서 동작하지 않음. 모바일은 가상 조이스틱 + 스와이프 회전(orbit) 대안 필요.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` 로 성능 방어.
- 터치 디바이스에서 첫 상호작용(오디오/포인터락) 전까지 브라우저가 일부 기능을 막는 것 참고.

### 11.11 레이캐스팅 성능

`raycaster.intersectObject(gltf.scene, true)` 는 매 클릭마다 전체 씬을 훑는다. 클릭은 빈번하지 않으므로 OK. 근접 감지는 `distanceTo`만 쓰므로 레이캐스팅 부담 없음. **바닥 스냅은 매 프레임** 일어나므로 `floor` 한 객체만 대상으로 삼을 것 (씬 전체를 대상으로 하면 프레임 드랍).

### 11.12 애니메이션 이름 오타

`THREE.AnimationClip.findByName()` 은 못 찾으면 `null`을 반환한다 — `console.warn` 남기도록 방어 코딩되어 있다. 새 glb로 교체했는데 애니메이션이 안 재생되면 **콘솔에 `clip not found` 경고**부터 확인.

### 11.13 CORS / 에셋 경로

- `/airport3_with_characters.glb` 는 정적 자산 경로. Vite/Next.js는 `public/` 폴더에 두면 됨.
- 외부 도메인 호스팅 시 CORS 헤더 필요.

### 11.14 glb 변경 시 영향

캐릭터 `INT_Gum_*` 이름이 바뀌면 `ANIM_MAP`과 `CHAR_ROOT_NAMES`를 함께 수정해야 한다. 애니메이션 클립 이름이 바뀌면 `ANIM_MAP`의 배열 수정. 새 캐릭터 추가 시 세 곳 모두.

---

## 12. 확장/추가 과제 (후속 작업용)

이 사양 구현 후 고려할 것들:

1. `INT_` 시설물(Escalator 등) 애니메이션 추가 시, `ANIM_MAP`을 캐릭터 외 객체까지 확장
2. 캐릭터 근접 시 UI 말풍선/프롬프트 표시
3. 클릭 시 사운드 재생 (Howler.js 등)
4. 모바일 가상 조이스틱 (nipple.js 등)
5. 포스트프로세싱(아웃라인)으로 "상호작용 가능" 표시
6. 애니메이션 종료 시 이벤트 (`mixer.addEventListener('finished', ...)`) 활용해 상태 전환
7. 조명/그림자 (`renderer.shadowMap.enabled = true`, 디렉셔널 라이트 `castShadow`)
8. 씬 스케일을 실제 공항 사이즈로 재조정하려면 glb 로드 후 `gltf.scene.scale.setScalar(N)` + 이동 속도/반경 연동 상수 일괄 스케일

---

## 13. 체크리스트 (구현 완료 검증)

- [ ] GLB가 로드되고 콘솔 에러 없음
- [ ] Draco 디코더 경로에서 404 뜨지 않음
- [ ] 캐릭터 5마리가 각자 위치에 보임
- [ ] 공항 배경(바닥/기둥/에스컬레이터 등)이 보임
- [ ] WASD로 이동, 마우스로 시점 회전
- [ ] 걸으면서 Y가 바닥에 딱 붙음
- [ ] `INT_Gum_Heart` 근처로 가면 하트 건네주기 애니메이션 재생
- [ ] `INT_Gum_Camera` 근처로 가면 눈+카메라+플래시 동시에 움직임
- [ ] `INT_Gum_Airplane` 근처로 가면 몸 움직이며 비행기가 날아감
- [ ] `INT_Gum_Lollipop` 근처로 가면 팔 흔들며 사탕도 흔들림
- [ ] `INT_Gum_Cry` 근접 시 에러 없이 조용히 무시 (콘솔 로그 OK)
- [ ] 범위를 벗어났다 재진입 시, 쿨다운 후 다시 재생됨
- [ ] 캐릭터를 클릭하면 해당 애니메이션 재생
- [ ] `OBJ_*` / 비캐릭터 `INT_*` 클릭 시 훅 콜백이 이름과 함께 호출됨
- [ ] 카메라 가장자리에서 캐릭터가 사라지지 않음 (SkinnedMesh frustumCulled 확인)
- [ ] 리사이즈 시 화면 비율 유지

---

*끝. 추가 질문이나 애매한 부분 있으면 구현 전 확인 요망.*
