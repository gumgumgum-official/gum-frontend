# 분수대 GLB Three.js 통합 가이드 (v6)

> `scene_with_fountain_v6.glb`을 Three.js stg3에서 로드하고
> **물 흐름 효과를 무한반복**시키는 방법

---

## 📦 GLB 파일 정보

| 항목            | 값                                             |
| --------------- | ---------------------------------------------- |
| 파일            | `scene_with_fountain_v6.glb`                   |
| 크기            | **25.37 MB** (이전 v5는 96 MB → 74% 감소)      |
| 셰이프 키       | 메시당 15개 (24fps에서 0.5초 간격으로 보간)    |
| 텍스처          | WebP (Q75)                                     |
| 메시 압축       | Draco level 10 (position 10-bit, normal 7-bit) |
| 모프 노멀       | 없음 → Three.js가 런타임에서 자동 재계산       |
| 애니메이션 길이 | 180 프레임 = 7.5초 (24fps 기준)                |

---

## 🎯 핵심 요구사항: stg3 무한반복

분수대 물 효과는 **두 가지 애니메이션의 합**이며, 둘 다 끊김 없이 계속 반복되어야 합니다:

1. **셰이프 키 애니메이션** (vertex 변위 — 잔물결, 흔들림, 펄싱)
   - `THREE.LoopRepeat` + `Infinity` 으로 자동 무한반복
2. **UV 스크롤** (텍스처 흐름 — 베일이 떨어지는 시각 효과)
   - `tex.offset.y % 1` modulo 연산으로 자동 무한 wrap

stg3가 **마운트되어 있는 동안** 두 효과가 계속 돌고, **언마운트 시 정리**되도록 구현합니다.

---

## 📚 의존성

```bash
npm install three
```

Three.js r150+ 권장. Draco 디코더는 CDN.

---

## 🗂 메시 구조

| 메시 이름               | 역할                                    | 셰이프 키 | 머티리얼        | UV 스크롤        |
| ----------------------- | --------------------------------------- | --------- | --------------- | ---------------- |
| `OBJ_Fountain_Pool`     | 바닥 풀 수면 (잔물결)                   | 15        | `Water_Pool`    | ❌               |
| `OBJ_Fountain_MidPool`  | 가운데 받침 물 수면 (잔물결)            | 15        | `Water_Pool`    | ❌               |
| `OBJ_Fountain_Cascade`  | 림 → 바닥으로 떨어지는 큰 종            | 15        | `Water_Curtain` | ✅ flowSpeed=1.2 |
| `OBJ_Fountain_TopSpray` | 꼭대기 dome + 받침까지 떨어지는 작은 종 | 15        | `Water_Curtain` | ✅ flowSpeed=0.4 |

분수대의 물은 위에서 아래로 4단계로 흐릅니다:

```
[꼭대기 dome]
   ↓ TopSpray (느리게 흐름)
[가운데 받침에 물 고임]  ← MidPool 잔물결
   ↓ Cascade (빠르게 흐름)
[바닥 풀에 물 고임]      ← Pool 잔물결
```

---

## 🏗 stg3 통합 — 완전한 무한반복 패턴

### 핵심 패턴

```javascript
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// ─── stg3 진입 시 호출 ───
function setupFountain(scene) {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);

  // 무한반복용 핸들 (cleanup 시 사용)
  const fountainState = {
    mixer: null,
    flowingTextures: [],
    gltfRoot: null,
    running: true,
  };

  loader.load("/scene_with_fountain_v6.glb", (gltf) => {
    scene.add(gltf.scene);
    fountainState.gltfRoot = gltf.scene;

    // ① 셰이프 키 애니메이션 — 무한반복 설정
    if (gltf.animations.length > 0) {
      fountainState.mixer = new THREE.AnimationMixer(gltf.scene);
      gltf.animations.forEach((clip) => {
        const action = fountainState.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity); // ⭐ 무한반복
        action.play();
      });
    }

    // ② UV 스크롤 — 베일 흐름
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const isCascade = obj.name.includes("Cascade");
      const isTopSpray = obj.name.includes("TopSpray");
      if (!isCascade && !isTopSpray) return;

      // 알파 깜빡임 방지
      obj.material.transparent = true;
      obj.material.depthWrite = false;

      const tex = obj.material.map;
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        fountainState.flowingTextures.push({
          tex,
          flowSpeed: isCascade ? 1.2 : 0.4,
        });
      }
    });
  });

  return fountainState;
}

// ─── 매 프레임 호출 (stg3 렌더 루프) ───
function updateFountain(state, delta) {
  if (!state.running) return;

  // 셰이프 키 애니메이션 진행
  if (state.mixer) state.mixer.update(delta);

  // ⭐ UV V좌표 음수 방향으로 이동 + modulo로 무한 wrap
  state.flowingTextures.forEach(({ tex, flowSpeed }) => {
    tex.offset.y = (tex.offset.y - flowSpeed * delta) % 1;
  });
}

// ─── stg3 종료/언마운트 시 정리 ───
function disposeFountain(state, scene) {
  state.running = false;

  if (state.mixer) {
    state.mixer.stopAllAction();
    state.mixer.uncacheRoot(state.gltfRoot);
  }

  if (state.gltfRoot) {
    scene.remove(state.gltfRoot);
    // 메모리 정리
    state.gltfRoot.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  state.flowingTextures.length = 0;
  state.gltfRoot = null;
  state.mixer = null;
}
```

### React/SPA stg3 컴포넌트 예시

```jsx
function Stg3() {
  const mountRef = useRef(null);

  useEffect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
    camera.position.set(20, 20, 30);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(10, 20, 10);
    scene.add(dir);

    // 분수 무한반복 효과 셋업
    const fountainState = setupFountain(scene);
    const clock = new THREE.Clock();
    let rafId;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      updateFountain(fountainState, delta); // ⭐ 매 프레임 무한반복
      renderer.render(scene, camera);
    };
    animate();

    // ⭐ stg3 언마운트 시 정리
    return () => {
      cancelAnimationFrame(rafId);
      disposeFountain(fountainState, scene);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} />;
}
```

### 무한반복이 보장되는 이유

| 메커니즘                  | 어떻게 무한반복?                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **셰이프 키 애니메이션**  | `THREE.LoopRepeat` + `Infinity` → 7.5초 사이클이 끝나면 자동으로 처음부터 재생. GLB 자체에 매끄러운 루프 크로스페이드(180프레임)가 베이크됨 → 끊김 없음                     |
| **UV 스크롤**             | `tex.offset.y -= flowSpeed * delta` 만 하면 값이 무한히 작아지는데, `% 1` 으로 항상 [0,1) 범위로 wrap. `wrapT=RepeatWrapping` 덕분에 텍스처가 시각적으로도 끊김 없이 이어짐 |
| **stg3 마운트 동안 지속** | `requestAnimationFrame` 루프가 계속 도는 동안 두 효과 모두 동시에 진행                                                                                                      |
| **언마운트 시 정리**      | `cancelAnimationFrame` + `mixer.stopAllAction` + 메모리 dispose로 누수 방지                                                                                                 |

---

## 🎛 튜닝 파라미터

| 파라미터             | 권장              | 효과                                    |
| -------------------- | ----------------- | --------------------------------------- |
| Cascade `flowSpeed`  | **1.2** (0.8~2.0) | 림 베일 흐름 속도                       |
| TopSpray `flowSpeed` | **0.4** (0.3~0.8) | dome 분출 흐름 속도 (느려야 자연스러움) |
| Pool/MidPool         | UV 스크롤 안 함   | 잔물결만 (셰이프 키)                    |

---

## 🐛 트러블슈팅

### "물이 안 흘러요"

```javascript
// material.map이 null인지 확인
gltf.scene.traverse((obj) => {
  if (obj.name.includes("Cascade") || obj.name.includes("TopSpray")) {
    console.log(obj.name, "map:", obj.material.map);
  }
});
```

map이 null이면 `obj.material.alphaMap`을 대신 쓰세요 (WebP의 경우 알파가 별도일 수 있음).

### "stg3에서 빠져나갔다 돌아오면 메모리가 쌓여요"

`disposeFountain` 호출 누락. cleanup function에서 반드시 호출.

### "프레임이 떨어져요"

96MB 모델이 25MB가 됐어도 **셰이프 키 자체는 GPU 메모리 사용량이 큼** (메시당 15키 × vertex 데이터). 모바일에서 프레임 떨어지면:

- 카메라 frustum culling 활용
- LOD 도입 (분수 멀리서 보면 셰이프 키 끄기)
- `mixer.timeScale = 0.5` 로 감속

### "알파가 깜빡거려요"

```javascript
obj.material.transparent = true;
obj.material.depthWrite = false; // ⭐ 핵심
obj.material.alphaTest = 0.01; // 보조
```

### "텍스처 wrap 안 됨 → 한 번만 흐르고 멈춤"

```javascript
tex.wrapS = THREE.RepeatWrapping;
tex.wrapT = THREE.RepeatWrapping;
tex.needsUpdate = true; // ⭐ 깜빡 잊기 쉬움
```

---

## 🔍 메시 이름 검색 가이드

`name.includes()` 사용 시 주의:

| 검색         | 매치                                                             |
| ------------ | ---------------------------------------------------------------- |
| `'Cascade'`  | `OBJ_Fountain_Cascade` ✅                                        |
| `'TopSpray'` | `OBJ_Fountain_TopSpray` ✅                                       |
| `'MidPool'`  | `OBJ_Fountain_MidPool` ✅                                        |
| `'Pool'`     | `OBJ_Fountain_Pool` **+** `OBJ_Fountain_MidPool` ⚠️ (둘 다 매치) |
| `'Fountain'` | 위 4개 + 분수대 본체 `OBJ_Fountain` ⚠️                           |

`Pool`만 정확히 매치하려면 `obj.name === 'OBJ_Fountain_Pool'` 사용.

---

## ✅ 체크리스트

stg3 완성 전 확인:

- [ ] `scene_with_fountain_v6.glb` 로드 확인
- [ ] `THREE.LoopRepeat` + `Infinity` 으로 셰이프 키 애니메이션 무한반복
- [ ] Cascade, TopSpray의 `tex.wrapS/wrapT = RepeatWrapping`
- [ ] `updateFountain()` 매 프레임 호출 (delta 전달)
- [ ] `tex.offset.y` modulo 1 wrap 확인
- [ ] stg3 언마운트 시 `disposeFountain()` 호출
- [ ] `transparent=true` + `depthWrite=false` 적용
- [ ] [gltf-viewer](https://gltf-viewer.donmccurdy.com/)에서 시각 확인 후 통합

---

## 📎 요약

**stg3에서 분수대 물 흐름이 무한반복되려면 두 줄이 핵심**:

```javascript
action.setLoop(THREE.LoopRepeat, Infinity); // 셰이프 키 무한반복
tex.offset.y = (tex.offset.y - flowSpeed * delta) % 1; // UV 무한 스크롤
```

위 패턴을 `requestAnimationFrame` 루프 안에서 매 프레임 실행 + 언마운트 시 정리하면 stg3가 떠 있는 동안 분수가 끊김 없이 흐릅니다.
