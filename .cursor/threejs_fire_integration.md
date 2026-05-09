# beam_gum_tent_scene.glb — Three.js 사용 가이드

블렌더에서 export한 `beam_gum_tent_scene.glb`를 Three.js로 띄우고 애니메이션을 무한 재생하기 위한 가이드.

---

## 1. GLB 파일 구성

| 항목 | 내용                                                                                        |
| ---- | ------------------------------------------------------------------------------------------- |
| 크기 | 약 7.7 MB                                                                                   |
| 압축 | Draco mesh compression (level 6)                                                            |
| 포함 | 메시, 머티리얼/텍스처, 라이트(촛불 spot + fill 4개), 카메라, 스킨/본, 모프 타깃, 애니메이션 |
| Y-up | glTF 표준 (블렌더 Z-up → glTF Y-up 자동 변환)                                               |

---

## 2. 애니메이션 클립 (3개)

GLB에 3개의 `AnimationClip`이 들어있고, 모두 **무한 반복**으로 동시 재생되어야 한다.

| 클립 이름               | 대상                       | 길이 (frame@24fps) | 설명                            |
| ----------------------- | -------------------------- | ------------------ | ------------------------------- |
| `Lollipop_ArmShake_Rig` | 캐릭터 armature            | 31 frame           | 양팔 동시 wave (X축 ±20°)       |
| `SwingPivotAction`      | SwingPivot empty           | 60 frame           | 그네 좌석+줄 앞뒤 흔들기 (±15°) |
| `메쉬.013Action.002`    | OBJ_Fire_Flames shape keys | 180 frame          | 불꽃 셰이프키 시퀀스            |

> 클립 이름은 export 후 변형될 수 있으니, 로드 직후 `gltf.animations.map(a => a.name)`을 콘솔에 찍어 실제 이름을 확인하는 게 안전.

이름이 한글(`메쉬.013Action.002`)이라 문자 인코딩 문제가 나면 `gltf.animations[index]`로 인덱스 접근하거나, 로드 후 즉시 영문으로 rename하는 방식 권장.

---

## 3. 의존성 설치

```bash
npm install three
```

Draco 압축을 풀려면 별도 디코더가 필요하다. 두 가지 방법:

- **CDN 사용 (가장 간단)**: `https://www.gstatic.com/draco/versioned/decoders/1.5.6/`
- **로컬 호스팅**: `node_modules/three/examples/jsm/libs/draco/`의 `draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js`를 정적 폴더에 복사 후 그 경로 지정

---

## 4. 최소 구현 코드

```javascript
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

// --- 1. 기본 셋업 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; // 색감 정확하게
renderer.toneMapping = THREE.ACESFilmicToneMapping; // GLB 라이트가 자연스럽게 보이도록
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; // 그림자 원하면
document.body.appendChild(renderer.domElement);

// --- 2. Draco 디코더 ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);

// --- 3. GLB 로드 ---
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

let mixer = null;
const clock = new THREE.Clock();

loader.load("/path/to/beam_gum_tent_scene.glb", (gltf) => {
  scene.add(gltf.scene);

  // 실제 애니메이션 이름 확인 (디버깅)
  console.log(
    "Animations:",
    gltf.animations.map((a) => a.name),
  );

  // --- 4. 애니메이션 무한 재생 ---
  mixer = new THREE.AnimationMixer(gltf.scene);
  gltf.animations.forEach((clip) => {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  });

  // --- 5. (선택) 카메라를 GLB 안에 든 카메라로 교체 ---
  // const gltfCamera = gltf.cameras[0];
  // if (gltfCamera) camera = gltfCamera;
});

// --- 6. 렌더 루프 ---
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  renderer.render(scene, camera);
}
animate();

// --- 7. 리사이즈 대응 ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

---

## 5. 주의사항

### 5.1 Draco 디코더 경로

`setDecoderPath()` 끝에 **슬래시 `/`** 가 빠지면 디코더를 못 찾는다. CDN을 쓰는 게 가장 안전.

### 5.2 애니메이션 무한 루프

블렌더에서 Cycles modifier로 무한 루프를 설정했지만 glTF 표준에는 "infinite loop" 개념이 없어, **export 시 일정 frame까지만 baking**됨. 따라서 무한 반복은 Three.js 측에서 처리해야 한다:

```javascript
action.setLoop(THREE.LoopRepeat, Infinity); // 필수
```

### 5.3 라이트

GLB 안에 촛불 분위기 라이트 5개(spot 1 + point 4)가 들어있다. Three.js는 `KHR_lights_punctual` extension을 자동 인식하므로 별도 처리 없이 라이트가 살아난다. 만약 너무 어둡거나 밝으면:

```javascript
gltf.scene.traverse((o) => {
  if (o.isLight) o.intensity *= 0.5; // 또는 *2.0
});
```

`renderer.toneMappingExposure` 조정으로도 전체 밝기 변경 가능.

### 5.4 그림자

GLB의 라이트는 기본적으로 그림자가 꺼져있다. 켜려면:

```javascript
gltf.scene.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  if (o.isLight) o.castShadow = true;
});
```

성능에 부담이 크니 spot light에만 켜는 게 일반적.

### 5.5 머티리얼이 어두워 보이면

- `renderer.outputColorSpace = THREE.SRGBColorSpace` 누락 시 색이 어두워짐 (필수)
- ACES 톤매핑 누락 시 라이트가 너무 강하게 클립되거나 색이 빠짐
- 환경광이 너무 약하면 `scene.environment`에 HDRI 추가 가능 (블렌더의 World 배경은 GLB로 export되지 않음)

### 5.6 한글 클립 이름 처리

`메쉬.013Action.002`처럼 한글이 섞이면 일부 환경(특정 빌드 도구, IDE 자동 완성)에서 깨질 수 있다. 안전하게:

```javascript
const fireClip =
  gltf.animations.find((a) => a.name.includes("메쉬")) || gltf.animations[2]; // 인덱스 fallback
```

또는 로드 후 rename:

```javascript
gltf.animations.forEach((a, i) => {
  if (i === 0) a.name = "arm_shake";
  if (i === 1) a.name = "swing";
  if (i === 2) a.name = "fire";
});
```

### 5.7 좌표계와 스케일

블렌더 씬 단위가 그대로 들어간다 (씬에서 그네 위치가 X≈8m, Y≈48m 영역). 카메라 거리를 충분히 두지 않으면 잘 안 보일 수 있다. 위 코드의 `camera.position.set(0, 2, 8)`은 단순 예시 — `gltf.cameras[0]`가 있으면 그걸 쓰는 게 정확.

### 5.8 캐릭터·사탕·모자가 떨어져 나간 것처럼 보이면

- `export_skins=True`, `export_apply=True`가 모두 켜진 상태에서 export됐는지 확인 (이번 export는 OK)
- Three.js에서 `gltf.scene.traverse`로 본 매핑 확인 가능
- 사탕은 `Hand.L` 본의 자식, 모자(`Object_2`)는 `Head` 본의 자식 — 본 애니메이션이 재생되면 자동으로 따라감

### 5.9 셰이프키 (불꽃) 안 움직이면

```javascript
gltf.scene.traverse((o) => {
  if (o.isMesh && o.morphTargetInfluences) {
    console.log(o.name, o.morphTargetInfluences.length);
  }
});
```

`OBJ_Fire_Flames`가 30개 이상의 morph target을 가져야 정상.

### 5.10 클립 길이가 다른데 같이 재생됨

세 클립의 길이가 다르므로(31 / 60 / 180 frame), 각자의 cycle로 무한 반복되어 자연스러운 비주기 모션이 된다. Three.js의 `LoopRepeat`은 클립 길이만큼 반복하므로 별도 동기화 불필요.

---

## 6. 추가 팁

### 6.1 OrbitControls (마우스로 둘러보기)

```javascript
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0); // 캐릭터 부근
controls.update();
```

### 6.2 정지·일시정지

```javascript
action.paused = true; // 정지
action.paused = false; // 재개
action.timeScale = 0.5; // 속도 조절 (0.5 = 절반)
```

### 6.3 빌드 시 Draco WASM 누락 주의

Vite, webpack 등의 번들러로 빌드할 때 Draco 디코더 파일이 정적 자산으로 복사되도록 설정해야 한다. CDN 방식이면 신경 안 써도 됨.

### 6.4 모바일 성능

`renderer.shadowMap.enabled = false`, 그림자 OFF, `pixelRatio` 제한 (`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`).

---

## 7. 검증 체크리스트

- [ ] 콘솔에 `Animations: [...]` 가 3개 출력됨
- [ ] 캐릭터 양팔이 wave 함
- [ ] 그네 좌석+줄이 앞뒤로 흔들리고, 캐릭터가 함께 흔들림
- [ ] 사탕이 캐릭터 손에 붙어있고 같이 움직임
- [ ] 모자가 캐릭터 머리에 고정
- [ ] 모닥불 불꽃이 끊임없이 변형됨
- [ ] 텐트 안 촛불 톤(주황) 라이트가 살아있음
- [ ] 세 애니메이션이 각자 다른 주기로 끝없이 반복
