# 불 씬 GLB Three.js 통합 가이드

> `scene_fire_animated.glb`를 Three.js에서 로드하고  
> **불 애니메이션을 무한반복**시키는 방법

---

## 📦 GLB 파일 정보

| 항목 | 값 |
|---|---|
| 파일 | `scene_fire_animated.glb` |
| 크기 | **0.76 MB** |
| 애니메이션 메시 | `OBJ_Fire_Flames` (셰이프 키 30개) |
| 애니메이션 길이 | 180 프레임 = 7.5초 (24fps) |
| 압축 | Draco level 10 + WebP 텍스처 + 모프 노멀 제거 |

---

## 🎯 핵심: 왜 이전 GLB는 "애니메이션 없어 보였나?"

GLB 자체에 애니메이션 클립은 정상적으로 들어 있었지만,  
Three.js에서 **이 두 줄이 빠지면 재생이 안 됩니다**:

```javascript
mixer = new THREE.AnimationMixer(gltf.scene);
gltf.animations.forEach(clip => {
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
});
// ...그리고 매 프레임:
mixer.update(delta);
```

GLB 안의 액션은 **180프레임에서 1프레임으로 매끄럽게 크로스페이드**되도록  
플립북 + 루프 패턴으로 베이크되어 있어서, `LoopRepeat + Infinity`만 설정하면 끊김 없이 영원히 타오릅니다.

---

## 🏗 통합 — 완전한 무한루프 패턴

### 핵심 함수 3개

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ─── stage 진입 시 호출 ───
function setupFire(scene) {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
    
    const fireState = {
        mixer: null,
        gltfRoot: null,
        running: true,
    };
    
    loader.load('/scene_fire_animated.glb', (gltf) => {
        scene.add(gltf.scene);
        fireState.gltfRoot = gltf.scene;
        
        // ⭐ 셰이프 키 애니메이션 무한반복
        if (gltf.animations.length > 0) {
            fireState.mixer = new THREE.AnimationMixer(gltf.scene);
            gltf.animations.forEach(clip => {
                const action = fireState.mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.play();
            });
            console.log(`✅ Fire 애니메이션 ${gltf.animations.length}개 로드`);
        } else {
            console.warn("⚠️ GLB에 애니메이션 클립이 없음");
        }
        
        // 불꽃은 알파/투명 처리 필요할 수 있음
        gltf.scene.traverse((obj) => {
            if (!obj.isMesh) return;
            if (obj.name.includes('Fire_Flames') || obj.name.includes('Flames')) {
                obj.material.transparent = true;
                obj.material.depthWrite = false;
                obj.material.alphaTest = 0.01;
            }
        });
    });
    
    return fireState;
}

// ─── 매 프레임 호출 ───
function updateFire(state, delta) {
    if (!state.running) return;
    if (state.mixer) state.mixer.update(delta);   // ⭐ 이 줄이 핵심
}

// ─── stage 종료/언마운트 시 정리 ───
function disposeFire(state, scene) {
    state.running = false;
    
    if (state.mixer) {
        state.mixer.stopAllAction();
        state.mixer.uncacheRoot(state.gltfRoot);
    }
    
    if (state.gltfRoot) {
        scene.remove(state.gltfRoot);
        state.gltfRoot.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
    }
    
    state.gltfRoot = null;
    state.mixer = null;
}
```

### React/SPA 컴포넌트 예시

```jsx
function FireStage() {
    const mountRef = useRef(null);
    
    useEffect(() => {
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current.appendChild(renderer.domElement);
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x222244);
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 500);
        camera.position.set(8, 5, 8);
        camera.lookAt(0, 0, 0);
        
        scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 10, 5);
        scene.add(dir);
        // 불 옆에 따뜻한 점광원 추가하면 더 자연스러움
        const firelight = new THREE.PointLight(0xff7733, 1.5, 8);
        firelight.position.set(0, 1, 0);
        scene.add(firelight);
        
        // ⭐ 불 애니메이션 무한루프 셋업
        const fireState = setupFire(scene);
        const clock = new THREE.Clock();
        let rafId;
        
        const animate = () => {
            rafId = requestAnimationFrame(animate);
            const delta = clock.getDelta();
            updateFire(fireState, delta);
            
            // (선택) 불 광원 깜빡임 추가
            firelight.intensity = 1.3 + Math.random() * 0.5;
            
            renderer.render(scene, camera);
        };
        animate();
        
        return () => {
            cancelAnimationFrame(rafId);
            disposeFire(fireState, scene);
            renderer.dispose();
            mountRef.current?.removeChild(renderer.domElement);
        };
    }, []);
    
    return <div ref={mountRef} />;
}
```

---

## 🐛 트러블슈팅 — "애니메이션이 안 보여요"

### 1. `gltf.animations`가 비어있는지 확인

```javascript
loader.load('/scene_fire_animated.glb', (gltf) => {
    console.log('애니메이션 클립 수:', gltf.animations.length);
    console.log('클립 이름:', gltf.animations.map(c => c.name));
});
```

비어 있으면 GLB export 시 누락된 것 → Blender에서 다시 export.

### 2. `mixer.update(delta)` 매 프레임 호출 확인

가장 흔한 실수. `requestAnimationFrame` 안에서 반드시 호출해야 합니다.

```javascript
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();   // ⭐ 매 프레임 새 delta
    if (mixer) mixer.update(delta);   // ⭐ 빠지면 정지
    renderer.render(scene, camera);
}
```

### 3. `setLoop(LoopRepeat, Infinity)` 빠지면 한 번만 재생됨

기본값은 `LoopRepeat`이지만 `Infinity`를 명시하지 않으면 1번 후 멈출 수 있어요. 명시적으로:

```javascript
action.setLoop(THREE.LoopRepeat, Infinity);
action.clampWhenFinished = false;
action.play();
```

### 4. 불꽃이 검은 박스로 보임 (알파 처리 누락)

```javascript
gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.name.includes('Flames')) {
        obj.material.transparent = true;
        obj.material.depthWrite = false;
        obj.material.alphaTest = 0.01;
    }
});
```

### 5. 메모리 누수 (stage 들락날락 시)

`disposeFire()` 호출 누락. cleanup function에서 반드시.

---

## 🎛 추가 효과 (선택)

### 광원 깜빡임으로 더 생동감 있게

```javascript
const firelight = new THREE.PointLight(0xff7733, 1.5, 8);
firelight.position.set(0, 1, 0);
scene.add(firelight);

// animate 안에서:
firelight.intensity = 1.3 + Math.random() * 0.5;
```

### 재생 속도 조정

```javascript
mixer.timeScale = 1.5;   // 1.5배속으로 더 격렬하게
// 또는
action.timeScale = 0.7;  // 천천히 타오르게
```

---

## ✅ 체크리스트

- [ ] `scene_fire_animated.glb` 로드 (`gltf.animations.length > 0` 확인)
- [ ] `THREE.LoopRepeat` + `Infinity` 으로 무한반복
- [ ] `requestAnimationFrame` 안에서 `mixer.update(delta)` 매 프레임 호출
- [ ] 불꽃 메시에 `transparent=true` + `depthWrite=false`
- [ ] stage 언마운트 시 `disposeFire()` 호출
- [ ] [gltf-viewer](https://gltf-viewer.donmccurdy.com/)에서 시각 확인 (자동 재생됨)

---

## 📎 분수 GLB와 다른 점

| 항목 | 분수 (`v6.glb`) | 불 (`fire_animated.glb`) |
|---|---|---|
| 메시 수 | 4 (Pool, MidPool, Cascade, TopSpray) | 1 (Fire_Flames) |
| UV 스크롤 필요? | ✅ 베일 흐름용 | ❌ 셰이프 키만으로 충분 |
| 셰이프 키 수 | 메시당 15개 | 30개 (더 부드러운 흔들림) |
| 파일 크기 | 25 MB | 0.76 MB |

코드 패턴은 거의 동일 — **`mixer.update(delta)` + `setLoop(LoopRepeat, Infinity)`** 가 무한루프의 핵심.

---

## 📌 한 줄 요약

```javascript
mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat, Infinity).play();
// + animate() 안에서 mixer.update(clock.getDelta()) 매 프레임
```

이 패턴만 있으면 불은 stage가 떠 있는 동안 영원히 타오릅니다.
