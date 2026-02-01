# Benches & PoleLights 렌더링 레퍼런스 분석

> 레퍼런스 소스코드 (`folio-2025`) 기반으로 bench, poleLights의 경로, 로딩, 활용, 렌더링 흐름을 정리한 문서

---

## 1. 원본 경로 및 리소스

### 1.1 파일 경로 (Reference 기준)

| 모델 | 원본 경로 | 로더 타입 | 비고 |
|------|-----------|-----------|------|
| **benches** | `benches/benches-compressed.glb` | `gltf` | DRACO 압축 |
| **poleLights** | `poleLights/poleLights-compressed.glb` | `gltf` | DRACO 압축 |

- **베이스 경로**: Vite `publicDir: '../static/'` → `reference/static/`  
- **실제 파일**:
  - `reference/static/benches/benches-compressed.glb` (또는 `benches.glb`)
  - `reference/static/poleLights/poleLights-compressed.glb` (또는 `poleLights.glb`)

### 1.2 Game.js 리소스 로딩

```javascript
// reference/sources/Game/Game.js (124~167행 근처)
this.resourcesLoader.load([
  // ...
  [ 'benchesModel', 'benches/benches-compressed.glb', 'gltf' ],
  [ 'poleLightsModel', 'poleLights/poleLights-compressed.glb', 'gltf' ],
  // ...
])
```

- `ResourcesLoader.load()`: `_file[2]`가 `'gltf'`이면 `GLTFLoader` 사용
- `GLTFLoader`는 DRACOLoader, KTX2Loader 연동
- 로드 결과: `this.game.resources.benchesModel`, `this.game.resources.poleLightsModel` (GLTF 객체)

---

## 2. Benches 렌더링

### 2.1 초기화 (World.js)

```javascript
// reference/sources/Game/World/World.js (step 1)
this.benches = new Benches()
```

### 2.2 Benches.js 처리 흐름

#### Step 1: InstancedGroup 준비

```javascript
// Benches.js
const [ base, references ] = InstancedGroup.getBaseAndReferencesFromInstances(
  this.game.resources.benchesModel.scene.children
)
```

- `getBaseAndReferencesFromInstances(children)`:
  - **base**: `children[0].clone()` → 원점(0,0,0), identity 회전
  - **references**: 각 child의 position, rotation, scale을 담은 `Object3D` 배열

- GLB 구조 가정: `scene.children`에 `bench1`, `bench2`, ... 같은 인스턴스들이 각각의 위치/회전으로 배치됨

#### Step 2: 그림자 설정

```javascript
base.castShadow = true
base.receiveShadow = true
base.frustumCulled = true
```

#### Step 3: 물리 콜라이더 추출

```javascript
const descriptions = this.game.objects.getFromModel(base, {}, {})
```

- `Objects.getFromModel()`: 모델 이름에 `physical` 포함 시 콜라이더 정보 추출
- `descriptions[1].colliders`: 동적 물체용 콜라이더 정의

#### Step 4: 재질 업데이트

```javascript
this.game.materials.updateObject(base)
```

- `Materials.updateObject()`: `base`를 traverse하며
  - `child.material`이 `MeshLambertNodeMaterial` / `MeshStandardMaterial`이면
  - `MeshDefaultMaterial`로 교체 (텍스처, 그림자, 라이트 반사 등 TSL 노드 적용)

#### Step 5: 물리 오브젝트 생성 (RAPIER)

```javascript
for (const reference of references) {
  this.objects.push(this.game.objects.add(
    {
      model: reference,
      updateMaterials: false,
      parent: null,
    },
    {
      type: 'dynamic',
      position: reference.position,
      rotation: reference.quaternion,
      friction: 0.7,
      mass: 0.1,
      sleeping: true,
      colliders: descriptions[1].colliders,
      waterGravityMultiplier: -1,
      contactThreshold: 10,
      onCollision: (force, position) => { /* ... */ }
    }
  ))
}
```

- 시각용 `model`은 reference(위치/회전 정보만 가진 Object3D)
- 물리 body는 `dynamic`, `sleeping: true`로 초기화
- 충돌 시 `onCollision` 호출 (현재 오디오는 주석 처리)

#### Step 6: InstancedMesh 생성

```javascript
this.instancedGroup = new InstancedGroup(references, base)
```

- `InstancedGroup`:
  - `base`를 traverse하며 각 Mesh마다 `THREE.InstancedMesh(geometry, material, count)` 생성
  - `references`의 world matrix를 `setMatrixAt(i, matrix)`로 각 인스턴스에 적용
  - `game.scene.add(mesh.instance)`로 씬에 추가

#### Step 7: 물리 ↔ 시각 동기화 (tick)

```javascript
this.game.ticker.events.on('tick', () => {
  for (const object of this.objects) {
    if (!object.physical.body.isSleeping() && object.physical.body.isEnabled())
      object.visual.object3D.needsUpdate = true
  }
}, 10)
```

- 물리 body가 깨어있고 활성화된 경우 `needsUpdate = true`
- InstancedGroup.update()에서 `needsUpdate`가 있으면 `reference.updateMatrixWorld()` 후 인스턴스 행렬 갱신

### 2.3 Reveal 시 초기화

```javascript
// Game.js - achievements 'reset' 시
if (this.world.benches)
  this.world.benches.instancedGroup.needsUpdate = true
```

- Reveal/리셋 시 벤치 전체 인스턴스 행렬을 다시 계산하도록 플래그 설정

---

## 3. PoleLights 렌더링

### 3.1 초기화 (World.js)

```javascript
this.poleLights = new PoleLights()
```

### 3.2 PoleLights.js 처리 흐름

#### Step 1: InstancedGroup 준비

```javascript
const [ base, references ] = InstancedGroup.getBaseAndReferencesFromInstances(
  this.game.resources.poleLightsModel.scene.children
)
this.references = references
```

#### Step 2: base 자식 메시 설정

```javascript
for (const child of base.children) {
  child.name = child.name.replace(/[0-9]+$/i, '')  // 숫자 제거
  child.castShadow = true
  child.receiveShadow = true
}
```

#### Step 3: 재질 업데이트

```javascript
this.game.materials.updateObject(base)
```

#### Step 4: InstancedGroup 생성 (자동 업데이트 비활성화)

```javascript
this.instancedGroup = new InstancedGroup(this.references, base, false)
```

- 3번째 인자 `false`: tick에서 자동으로 `update()` 호출하지 않음 (가로등은 고정이므로)

#### Step 5: glass (램프 유리) 참조

```javascript
this.glass = this.instancedGroup.meshes.find(mesh => mesh.instance.name === 'glass').instance
```

- base에 `glass`라는 이름의 메시가 있다고 가정

#### Step 6: 물리 콜라이더 (fixed)

```javascript
for (const reference of this.references) {
  this.game.objects.add(null, {
    type: 'fixed',
    position: reference.position,
    rotation: reference.quaternion,
    colliders: [{
      shape: 'cuboid',
      parameters: [0.2, 1.7, 0.2],
      category: 'object'
    }],
    onCollision: (force, position) => {
      this.game.audio.groups.get('hitDefault').playRandomNext(force, position)
    }
  })
}
```

- 시각 오브젝트 없음 (`null`), 물리만 추가
- `fixed` 타입: 이동하지 않음

#### Step 7: Fireflies (반딧불이)

```javascript
setFireflies() {
  this.firefliesScale = uniform(0)
  const countPerLight = 5
  const count = this.references.length * countPerLight
  const positions = new Float32Array(count * 3)
  // 각 가로등 주변에 5개씩 랜덤 위치
  // ...
  const material = new THREE.SpriteNodeMaterial()
  material.outputNode = this.game.materials.getFromName('emissiveOrangeRadialGradient').outputNode
  // TSL: sin 기반 flyOffset로 움직임
  material.positionNode = positionAttribute.add(flyOffset)
  material.scaleNode = this.firefliesScale
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.015, 8), material)
  mesh.count = count
  mesh.frustumCulled = false
  this.game.scene.add(mesh)
}
```

- 가로등마다 5개의 “반딧불이” 스프라이트
- 야간일 때만 `firefliesScale`이 1로 애니메이션됨

#### Step 8: DayCycles 연동 (야간/주간 전환)

```javascript
setSwitchInterval() {
  const intervalChange = (inInterval) => {
    if (inInterval) {
      this.glass.visible = true
      gsap.to(this.firefliesScale, { value: 1, duration: 5, overwrite: true })
    } else {
      this.glass.visible = false
      gsap.to(this.firefliesScale, { value: 0, duration: 5, overwrite: true })
    }
  }
  this.game.dayCycles.events.on('night', intervalChange)
  intervalChange(this.game.dayCycles.intervalEvents.get('night').inInterval)
}
```

- **야간**: `glass` 표시, 반딧불이 페이드인
- **주간**: `glass` 숨김, 반딧불이 페이드아웃

---

## 4. InstancedGroup 상세

### 4.1 역할

- 동일 메시를 여러 위치에 그리되, `InstancedMesh`로 드로우콜 절감
- `references`: 각 인스턴스의 transform (position, rotation, scale)
- `base`: 원형 메시(geometry + material)

### 4.2 setMeshes()

```javascript
this.group.traverse((_child) => {
  if (_child.isMesh) {
    mesh.instance = new THREE.InstancedMesh(_child.geometry, _child.material, this.count)
    mesh.instance.name = _child.name
    mesh.instance.castShadow = _child.castShadow
    mesh.instance.receiveShadow = _child.receiveShadow
    this.game.scene.add(mesh.instance)
    this.meshes.push(mesh)
  }
})
```

### 4.3 update()

```javascript
for (i, _reference of this.references) {
  if (this.needsUpdate || _reference.needsUpdate) {
    _reference.updateMatrixWorld()
    for (const instancedMesh of this.meshes) {
      const finalMatrix = instancedMesh.localMatrix.clone().premultiply(_reference.matrixWorld)
      instancedMesh.instance.setMatrixAt(i, finalMatrix)
    }
  }
}
if (updated)
  for (const instancedMesh of this.meshes)
    instancedMesh.instance.instanceMatrix.needsUpdate = true
```

- `references`의 world matrix × base mesh의 local matrix → 각 인스턴스에 적용

---

## 5. 재질 파이프라인 (Materials)

### 5.1 updateObject()

```javascript
mesh.traverse((child) => {
  if (child.isMesh) {
    if (!child.material.userData.prevent)
      child.material = this.getFromName(child.material.name, child.material)
  }
})
```

- `getFromName()`: 기존 `MeshLambertNodeMaterial`/`MeshStandardMaterial`을 `MeshDefaultMaterial`로 변환
- `MeshDefaultMaterial`: TSL 기반, core shadow, drop shadow, light bounce, fog 등 지원

### 5.2 Benches / PoleLights 공통

- GLB 기본 재질 → `MeshDefaultMaterial`로 교체
- `castShadow`, `receiveShadow` 유지

---

## 6. gum-frontend 적용 시 참고사항

1. **경로**: `public/models/benches.glb`, `public/models/poleLights.glb` 등으로 복사 후 사용
2. **InstancedGroup 없이**: 단순 `gltf.scene`을 씬에 추가하면, GLB에 이미 여러 인스턴스가 포함된 경우 그대로 여러 메시로 렌더링됨
3. **물리**: 레퍼런스는 RAPIER 사용. gum-frontend에서 물리가 없다면 시각만 로드
4. **DayCycles / Fireflies**: poleLights의 야간 효과는 dayCycles 시스템이 있을 때만 구현 가능
5. **Materials**: WebGL 기반이면 `MeshDefaultMaterial` 대신 `MeshStandardMaterial` + `castShadow`/`receiveShadow`로 대체 가능
