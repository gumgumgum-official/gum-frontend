# Stage3 성능 분석 및 최적화 계획

## 1. 성능 저하 원인 분석

### 1.1 포인터 이동 시 레이캐스트 (심각도: 높음)

**위치:** `handlePointerMove` → `getPointerHitTarget`

```javascript
// 매 pointermove 이벤트마다 전체 씬 레이캐스트
const hits = _iceRaycaster.intersectObjects(sceneRef.children, true);
```

- **문제:** `sceneRef.children` 전체를 `recursive: true`로 레이캐스트 → 수십~수백 개 오브젝트를 매 프레임 검사
- **빈도:** 마우스 이동 시 초당 60~120회 호출 가능
- **영향:** 메인 스레드 블로킹, 프레임 드랍

### 1.2 Cannon-es 물리 시뮬레이션 (심각도: 중간)

**위치:** `updateSpawnedIceCreams`

```javascript
iceCreamPhysicsWorld.step(1/60, delta, 3);  // substep 3
```

- **문제:** 아이스크림이 많을수록(최대 15개) 물리 계산 부담 증가
- **substep 3:** 한 프레임에 3번 물리 스텝 → CPU 사용량 3배

### 1.3 조각(Fragment) 업데이트 (심각도: 중간)

**위치:** `updateFragments`

- **문제:** 글자 타격 시 조각이 많이 생성되면(4번 타격 × 여러 shape) O(n) 루프
- **동작:** position, rotation, velocity 연산 + material.opacity 업데이트

### 1.4 글자 타격 시 삼각형 연산 (심각도: 높음, 일시적)

**위치:** `onEnterHit` → `collectTrianglesFromGroup`, `partitionTrianglesOneSlice`, `clipTriangleByPlane`

- **문제:** Enter 키 입력 시 geometry 전체를 삼각형으로 변환, 클리핑, 새 mesh 생성
- **빈도:** 타격 시에만 발생하지만, 순간적인 프레임 드랍 유발

### 1.5 getPointerHitTarget - mirror 체크

**위치:** 158번째 줄

- **현재:** `obj === mirrorRef`만 체크 → mirror의 자식 mesh 클릭 시 부모 트래버스 중 mirrorRef 도달
- **추가 확인 필요:** mirrorRef가 그룹일 때 자식 hit 감지 정상 동작 여부

### 1.6 기타

- **pixelRatio: 2** (initThreeApp) → 픽셀 4배 렌더링
- **antialias: true** → 추가 GPU 비용
- **OrbitControls** (debugControls) → 매 프레임 matrix 업데이트

---

## 2. 통합 테스트 및 검증 방법

### 2.1 내장 프레임 프로파일러

Stage3에서만 매 60프레임마다 평균/최대 프레임 시간, FPS를 콘솔에 출력합니다.

**활성화 방법 (둘 중 하나):**

```javascript
// 콘솔에서
localStorage.setItem('STAGE3_PROFILE', '1');
location.reload();
```

또는

```javascript
window.STAGE3_PROFILE = true;  // 새로고침 전에 설정 후 Stage3 진입
```

**출력 예:**
```
[Stage3 Profile] avg: 14.2ms | max: 28ms | fps: 70
```

- **avg**: 60프레임 평균 소요 시간 (ms)
- **max**: 60프레임 중 최대 프레임 시간 (스파이크 감지)
- **fps**: 1000/avg

**비활성화:** `localStorage.removeItem('STAGE3_PROFILE')` 후 새로고침

### 2.2 Chrome DevTools 프로파일

1. Performance 탭 → Record
2. Stage3에서 마우스 이동, 아이스크림 클릭, 글자 타격 동작 수행
3. Main 스레드에서 `intersectObjects`, `step`, `update` 등 호출 시간 확인

### 2.3 검증 시나리오

| 시나리오 | 측정 항목 | 목표 |
|---------|----------|------|
| 유휴(마우스 정지) | avg frame ms | < 16.67ms (60fps) |
| 마우스 연속 이동 | frame drop | 드랍 최소화 |
| 아이스크림 15개 스폰 | physics step 시간 | < 5ms |
| 글자 4회 타격 | hit 시 frame spike | < 50ms |

---

## 3. 최적화 계획

### Phase 1: 레이캐스트 최적화 (우선순위 1)

1. **클릭 가능 오브젝트만 레이캐스트**
   - `intersectObjects(sceneRef.children, true)` 대신
   - `[iceCreamCartRef, noticeRef, gameMachineRef, mirrorRef].filter(Boolean)` 배열만 사용
   - 예상 효과: 레이캐스트 대상 90% 이상 감소

2. **pointermove 쓰로틀**
   - `requestAnimationFrame` 또는 100ms throttle로 호출 빈도 제한
   - 커서 변경이 60fps일 필요 없음

### Phase 2: 물리 엔진 최적화 (우선순위 2)

1. **Cannon substep 감소**
   - `step(1/60, delta, 3)` → `step(1/60, delta, 2)` 또는 1
   - 또는 `delta` 누적 후 고정 스텝

2. **아이스크림 상한 조정**
   - config에서 maxSpawns 15 → 10 등으로 조정 가능하도록

### Phase 3: 조각/타격 최적화 (우선순위 3)

1. **Fragment 풀링**
   - 조각 mesh 재사용으로 GC 감소

2. **삼각형 연산 지연**
   - `requestIdleCallback`으로 타격 연산을 idle 시점에 분할 (복잡도 높음)

### Phase 4: 렌더러 설정 (우선순위 4)

1. **pixelRatio 동적 조정**
   - `Math.min(2, window.devicePixelRatio)` 또는 고성능 기기에서만 2

2. **antialias 옵션**
   - 성능 모드에서 antialias 비활성화 가능하도록

---

## 4. 구현 순서

1. **즉시 적용 가능:** Phase 1 (레이캐스트 최적화 + pointermove throttle)
2. **검증 후 적용:** Phase 2 (물리 substep)
3. **필요 시:** Phase 3, 4
