# airport4.glb — Three.js 루프 애니메이션 가이드

## TL;DR — 최소 코드

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

let mixer;
const clock = new THREE.Clock();

loader.load('/airport4.glb', (gltf) => {
  scene.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);

  gltf.animations.forEach(clip => {
    mixer.clipAction(clip).play();   // 기본이 LoopRepeat, Infinity
  });
});

function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  renderer.render(scene, camera);
}
animate();
```

이게 다예요. **`AnimationAction.play()`만 부르면 기본으로 무한 루프**입니다 (`THREE.LoopRepeat`, repetitions=`Infinity`). 에스컬레이터 포함 11개 클립 모두 끝없이 재생됩니다.

---

## GLB에 들어있는 11개 애니메이션 클립

| # | 이름 | 채널 | 타겟 | 비고 |
|---|---|---|---|---|
| 0 | `Plane_Throw_Prop` | 6 | 2 | 종이비행기 prop (원본 + Counter 캐릭터 둘 다) |
| 1 | `Plane_Throw_Rig` | 114 | 20 | 비행기 캐릭터 본 애니메이션 (원본 + Counter) |
| 2 | `Shutter_EyeDefL` | 3 | 1 | 카메라 캐릭터 왼쪽 눈 깜빡임 |
| 3 | `Shutter_EyeZZL` | 3 | 1 | 카메라 캐릭터 zz 눈 |
| 4 | `Shutter_PropCam` | 3 | 1 | 카메라 prop |
| 5 | `Shutter_Flash` | 3 | 1 | 플래시 효과 |
| 6 | `Heart_Offer_Prop` | 3 | 1 | 하트 prop |
| 7 | `Heart_Offer_Rig` | 57 | 19 | 하트 캐릭터 본 |
| 8 | `Lollipop_ArmShake_Rig` | 57 | 19 | 막대사탕 캐릭터 본 |
| 9 | `Lollipop_Shake` | 3 | 1 | 막대사탕 prop |
| 10 | **`Escalator_Steps`** | **192** | **64** | **에스컬레이터 64개 step 위치 (path1 32 + path2 32)** |

전부 100 프레임 길이 (24fps 기준 약 4.17초)이고 frame 1과 frame 100이 동일한 상태라 seamless loop.

---

## 에스컬레이터 (`Escalator_Steps`) 동작 원리

64개 step mesh가 각자 자기 위치 location 키프레임을 갖고 있어요. 각 step은 100 프레임 동안 곡선 경로(`INT_Escalator_path1`/`path2`)를 **정확히 한 바퀴** 도는데, motion = `total_arc / 99` per frame으로 베이크돼서 frame 100이 frame 1과 정확히 같은 위치(0.00mm 오차)예요.

- 곡선 1개 길이: 12.638m
- step 1개 속도: 약 3.06 m/s (실제 에스컬레이터보단 빠른 moving walkway 정도)
- 사이클: 약 4.17초

루프 경계에서 mesh 위치가 동일하니 three.js가 시간 wrap할 때 점프 없음.

> **루프가 buggy하게 보이면 확인할 것**:
> 1. `mixer.update(clock.getDelta())`가 매 프레임 호출되는지
> 2. `clock.getDelta()` 대신 `performance.now()` 직접 쓰지 않았는지 (단위 안 맞음)
> 3. clip에 `setLoop(THREE.LoopOnce)`를 실수로 설정 안 했는지

---

## 모든 클립 무한 루프 (권장 기본)

```javascript
gltf.animations.forEach(clip => {
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);   // 명시적 (기본값이라 생략 가능)
  action.clampWhenFinished = false;
  action.play();
});
```

---

## 특정 클립만 무한, 나머지는 1회만

예를 들어 에스컬레이터·캐릭터 idle 모션은 계속 돌리고, 일회성 액션(셔터·하트 던지기)은 한 번만 보여주고 싶으면:

```javascript
const INFINITE = new Set([
  'Escalator_Steps',
  'Plane_Throw_Rig',
  'Plane_Throw_Prop',
  'Lollipop_ArmShake_Rig',
  'Lollipop_Shake',
]);

gltf.animations.forEach(clip => {
  const action = mixer.clipAction(clip);
  if (INFINITE.has(clip.name)) {
    action.setLoop(THREE.LoopRepeat, Infinity);
  } else {
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;     // 마지막 프레임에서 고정 (튕겨 돌아가지 않음)
  }
  action.play();
});
```

---

## 트리거 방식 (클릭 시 1회 재생)

특정 클립을 평소엔 멈춰뒀다가 이벤트 발생 시 1회 재생:

```javascript
const actions = {};
gltf.animations.forEach(clip => {
  const action = mixer.clipAction(clip);
  actions[clip.name] = action;

  if (clip.name === 'Heart_Offer_Rig' || clip.name === 'Heart_Offer_Prop') {
    // 평소엔 정지
    action.setLoop(THREE.LoopOnce);
    action.clampWhenFinished = true;
    // play() 호출 안 함
  } else {
    action.play();
  }
});

// 트리거: 하트 캐릭터 클릭했을 때
function triggerHeartOffer() {
  ['Heart_Offer_Rig', 'Heart_Offer_Prop'].forEach(name => {
    const a = actions[name];
    a.reset();        // 처음으로 되감기
    a.play();
  });
}
```

---

## 속도 조절

전체 속도 변경:

```javascript
mixer.timeScale = 0.5;    // 절반 속도
mixer.timeScale = 2.0;    // 2배 속도
```

특정 클립만 속도 변경:

```javascript
actions['Escalator_Steps'].timeScale = 0.3;   // 에스컬레이터만 느리게 (시각 속도 ↓)
```

> 에스컬레이터 기본 속도(3 m/s)가 부담스러우면 `timeScale = 0.16` 정도로 줄이면 원본 Blender GN 속도(0.19 m/s)에 근사해집니다. 단 0.16 같은 분수 timeScale 쓰면 loop 경계의 매끄러움은 약간 흐려질 수 있어요 (보간이 비선형이 됨). 0.5나 0.25 같은 정수 분수 추천.

---

## Counter 캐릭터 동기화 주의

비행기 캐릭터 애니메이션(`Plane_Throw_Rig`, `Plane_Throw_Prop`)은 **원본 캐릭터와 Counter 캐릭터를 동시에 타겟**해요 — 단일 클립이 두 개 본/prop 그룹을 함께 움직입니다. 둘을 따로 제어할 수 없는 구조니, 분리 재생이 필요하면 Blender에서 별도 NLA 트랙으로 다시 export해야 합니다.

---

## 카메라 셋업 (참고)

GLB에 카메라 객체는 없어요. three.js에서 직접:

```javascript
const camera = new THREE.PerspectiveCamera(
  26.633,                                   // vertical FOV
  window.innerWidth / window.innerHeight,
  0.01, 1000
);
camera.position.set(0.5092, 3.1688, 4.4875);
camera.up.set(-0.0589, 0.9871, -0.1487);    // ← lookAt보다 먼저
camera.lookAt(-3.8719, 1.2413, -6.578);
```

`resize` 핸들러에선 `aspect`만 갱신하고 `lookAt` 재호출 금지.

---

## 디버깅 체크리스트

| 증상 | 원인 / 해결 |
|---|---|
| 모델은 보이는데 애니메이션 안 움직임 | `mixer.update()` 호출 누락 / `clock.getDelta()` 안 씀 |
| 일부 mesh가 검정으로 렌더링 | Draco decoder 경로 404 — `setDecoderPath` URL 확인 |
| 모델이 안 뜸 | DRACOLoader가 GLTFLoader에 연결 안 됨 (`loader.setDRACOLoader(dracoLoader)`) |
| 에스컬레이터 step이 점프하며 사라짐 | 옛 GLB 캐시 — 브라우저 hard refresh 또는 파일명/쿼리스트링 변경 |
| 캐릭터가 빠르게 깜빡이듯 떨림 | `mixer.update`를 `setInterval` 같은 비동기 콜백에서 호출 — `requestAnimationFrame` 안에서 호출해야 함 |
| 클립이 두 번 동시에 재생되는 듯 | 같은 GLB를 두 번 로드 또는 동일 모델에 mixer 두 개 |
| 루프 경계에서 캐릭터가 살짝 튐 | clip 자체가 seamless 아님 — Blender에서 frame 1 = frame 100 키프레임 일치 확인 |

---

## Tone.js / 사운드 동기화 (옵션)

에스컬레이터 사이클 길이(약 4.17초) 에 맞춰 사운드 루프를 동기화하려면:

```javascript
const escDuration = actions['Escalator_Steps'].getClip().duration;   // 약 4.125s
// Tone.js / Howler 등의 루프 길이를 escDuration으로 맞춰서 재생
```

---

## 파일

- **`/airport4.glb`** — 7.25 MB, Draco 압축 (position q=14, level 6)
- 11개 NLA 트랙 → 11개 AnimationClip
- 150개 Object, frame range 1–100, 24 fps