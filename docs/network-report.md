# 전시 환경 네트워크 최적화 검증 리포트

> `docs/network.md` 브리프에 대한 실제 코드 분석 결과 (2026-05-23 기준, 브랜치 `feat/124`)

---

## 0. 전제 정정 — 이 프로젝트는 React Three Fiber가 아니다

브리프는 `useGLTF` / `useLoader` / `Suspense` / R3F를 전제로 작성됐지만, **실제 코드는 순수 Three.js**다.

- React(`ThreeCanvas.jsx`)는 `<canvas>` 컨테이너 + 라이프사이클만 담당
- 3D 로직은 `initThreeApp.js` → `StageManager` → `Stage2/3/6` 으로 React 바깥에서 동작
- 따라서 "useGLTF 캐시", "Suspense fallback 중복 로딩"이라는 브리프 항목 **7·9번은 이 코드베이스에 해당 사항 없음**. 대신 앱이 직접 만든 Promise 캐시를 검증 대상으로 본다.

결론적으로 **R3F 특유의 재fetch 위험(컴포넌트 언마운트 시 useGLTF 캐시 무효화 등)은 구조적으로 존재하지 않는다.**

---

## 1. GLB 로딩 구조

| 요소 | 위치 | 비고 |
|---|---|---|
| 로더 싱글톤 | `src/utils/common/assetLoaders.js:26-113` | `createGLBLoader()` → `getGLBLoader()`로 전역 1개 재사용 |
| GLTFLoader 구성 | `assetLoaders.js:36-39` | DRACO + KTX2 + meshopt 디코더 모두 연결 |
| 디코더 워밍업 | `initThreeApp.js:171` | `attachRenderer(renderer).preloadDecoders()` — GPU 포맷 감지 + Draco WASM 사전 로드 |

로더가 **앱 전역 싱글톤**이라 GLTFLoader가 매번 새로 만들어지지 않는다. 디코더 WASM도 앱 시작 시 1회만 받는다. → 통과.

---

## 2. 캐시 구조 (브리프 1·5번)

핵심은 `src/utils/common/gltfTemplateCache.js`:

```js
const _gltfByAbsoluteUrl = new Map();      // URL → Promise<GLTF>

export function loadGltfTemplateCached(absoluteUrl) {
  let p = _gltfByAbsoluteUrl.get(absoluteUrl);
  if (!p) {
    p = getGLBLoader().loadAsync(absoluteUrl)
      .catch((err) => { _gltfByAbsoluteUrl.delete(absoluteUrl); throw err; });
    _gltfByAbsoluteUrl.set(absoluteUrl, p);
  }
  return p;            // 같은 URL → 항상 같은 Promise
}
```

- **Promise 자체를 캐시**한다. 동시에 여러 곳이 같은 GLB를 요청해도 fetch는 1회.
- 캐시 키가 **절대 URL**이므로 상대경로 표기 차이로 인한 중복 로드 방지.
- 실패 시에만 캐시에서 삭제 → 재시도 가능.
- 이 캐시는 **JS 메모리 상주**다. 브라우저 HTTP 캐시와 무관하게, 한 번 파싱된 GLTF 객체(geometry/texture까지)가 메모리에 남는다.
- `THREE.Cache.enabled`는 사용하지 않음 — 앱 자체 캐시가 그 역할을 대신하므로 문제 없음.

**브리프 1번(최초 1회만 fetch) → 통과. 5번(메모리 캐시 유지) → 통과.**

> ⚠️ **브리프 2번 관련 — 다음 이용자 복귀 시 재다운로드?**
> `clearGltfTemplateCache()` 함수는 `gltfTemplateCache.js:12`에 **정의돼 있으나 코드 어디에서도 호출되지 않는다(dead code).**
> `resetClientForNextKioskVisitor.js` 주석이 명시: *"GLB 캐시·전체 localStorage 삭제는 하지 않아 재로딩 버벅임을 줄임."*
> → **의도적 설계.** 키오스크에서 다음 이용자가 와도 GLB는 메모리에 남아 재다운로드 없음. 전시 환경에 유리.
> → 정리 권장: 안 쓸 함수면 `clearGltfTemplateCache`를 삭제하거나, 쓸 거면 호출부를 명시. 지금은 "언젠가 누가 호출하면 전시 중 전체 재다운로드"라는 잠재 지뢰.

---

## 3. Preload (브리프 8번)

Stage 초기화 시 백그라운드 워밍업이 실제로 동작한다 — `initThreeApp.js:194-211`:

```js
if (allowedStages.includes(6)) preloadStage6AirportGlb();
if (allowedStages.includes(2)) warmStage2GltfTemplateUrls();
if (allowedStages.includes(3)) { warmStage3GltfTemplateUrls(); preloadStage6AirportGlb(); }
```

| Stage | 워밍업 파일 | 동작 |
|---|---|---|
| 2 | `stage2GltfWarmup.js:39-43` | 배경·프롭·캐릭터 GLB 비동기 로드 |
| 3 | `stage3GltfWarmup.js:50-74` | 섬·캐릭터·껌딱지 GLB. `waitForStage3GltfTemplatesReady()`로 `/kiosk` 진입 전 대기 가능 |
| 6 | `stage6AirportPreload.js:11-16` | 공항 배경 GLB 사전 로드 |

워밍업은 결국 `loadGltfTemplateCached()`를 호출하므로 **본 로딩과 같은 캐시를 채운다**. preload → 실제 사용 시 캐시 히트. 중복 다운로드 없음.

**브리프 8번 → 통과.** Stage3는 인트로 화면에서 미리 받아두고, 본편 진입을 캐시 완료까지 대기시킬 수 있어 전시용으로 잘 설계됨.

---

## 4. 텍스처 로딩 (브리프 4번)

- **거의 모든 텍스처가 GLB 내장**이다. GLTFLoader가 GLB 파싱 시 함께 디코드 → 별도 HTTP 요청 없음.
- 예외: HDRI 환경광만 `EXRLoader`로 별도 로드 (`initThreeApp.js:130-139`) — 1회성.
- 별도 `TextureLoader` fetch 패턴 없음.

**브리프 4번 → 텍스처는 별도 fetch 구조가 아님. GLB 1회 fetch에 포함됨. 통과.**

---

## 5. Stage 전환 & 리렌더 시 재fetch (브리프 2·6번)

### StageManager (`StageManager.js:30-51`)
```js
switchToStage(n) {
  if (currentStageNumber === n) return;        // 동일 Stage 재진입 차단
  currentStage?.cleanup?.(scene);              // 이전 Stage 리소스 dispose
  stages.get(n)?.setup(scene, renderer);       // 새 Stage setup
}
```

Stage 전환 흐름:
1. **첫 진입** — `loadGltfTemplateCached()` → 캐시 미스 → 네트워크 1회
2. **재진입** — 캐시 히트 → **네트워크 없음**, `SkeletonUtils.clone()` / `deepCloneSceneForStage3Instance()`로 인스턴스만 새로 복제
3. `cleanup()`은 **씬 인스턴스의 geometry/material만 dispose**하고 **템플릿 캐시(`_gltfByAbsoluteUrl`)는 보존**

→ Stage를 오가도 GLB는 재다운로드되지 않는다. **브리프 2·6번 → 통과.**

### React 리렌더 재초기화 위험 — 점검 완료
`ThreeCanvas.jsx:54`의 useEffect 의존성: `[allowedStages, initialStage, enableKeyboardSwitch, skipStage3Intro]`. 이 중 `allowedStages`가 매 렌더 새 배열이면 `initThreeApp`이 재실행돼 **전체 씬 + GLB가 다시 로드**된다 (가장 큰 잠재 위험).

실제 호출부를 전부 확인한 결과 — **모두 안정 참조**:

| 페이지 | 코드 | 안전 |
|---|---|---|
| `App.jsx:376` (kiosk) | `KIOSK_ALLOWED_STAGES` = `Object.freeze([3])` 모듈 상수 | ✅ |
| `DevPage.jsx:10` | `useMemo(() => DEV_STAGES, [])` | ✅ |
| `BeamPage.jsx:9` | `useMemo(() => BEAM_STAGES, [])` | ✅ |
| `AirportPage.jsx:11` | `useMemo(() => AIRPORT_STAGES, [])` | ✅ |
| `MemoryTestPage.jsx:45` | `useMemo(() => TEST_STAGES, [])` | ✅ |

→ **리렌더로 인한 GLB 재fetch 위험: 현재 없음.** 단, ThreeCanvas의 새 사용처를 추가할 때 인라인 배열(`allowedStages={[3]}`)을 절대 쓰지 말 것 — 그 순간 매 렌더 재초기화.

**브리프 6번 → 통과 (단, 신규 코드 주의).**

---

## 6. 애니메이션 처리 (브리프 3번)

- GLB **내장 애니메이션 클립**을 `THREE.AnimationMixer`로 재생.
- Stage3 캐릭터: `characterController.js:347` `new THREE.AnimationMixer(characterModel)`, walk/idle/punch/balloon 클립.
- Stage2 자율 캐릭터(`autonomousCharacters.js:70`), Stage6(`Stage6.js:861`)도 동일 패턴.
- 클립 데이터는 GLB 파싱 시점에 이미 메모리에 들어있다.

→ **애니메이션 재생은 순수 GPU/CPU 연산. 추가 네트워크 요청 0회. 브리프 3번 → 통과.**

---

## 7. 캐릭터 클론 — 1회 로드 후 복제

`characterController.js:280-296`:
```js
Promise.all([
  loadGltfTemplateCached(characterUrl),
  loadGltfTemplateCached(idleUrl).catch(() => null),
  loadGltfTemplateCached(punchUrl).catch(() => null),
  loadGltfTemplateCached(balloonUrl).catch(() => null),
]).then(([gltf, ...]) => {
  characterModel = SkeletonUtils.clone(gltf.scene);   // 템플릿 복제
  characterMixer = new THREE.AnimationMixer(characterModel);
});
```

GLB 템플릿 1개 → `SkeletonUtils.clone()`으로 N개 인스턴스. Gum Follower 등 다중 캐릭터도 같은 템플릿 재사용 → **캐릭터 수가 늘어도 fetch는 캐릭터 종류 수만큼만**.

---

## 8. dispose & 메모리 (브리프 10번)

- `Stage3.js:590-661` `cleanup()` → `teardownStage3Scene()` (`stage3SceneTeardown.js:21-83`)에서 씬 오브젝트 geometry/material/texture를 순회 dispose.
- `gumFollowerController.js:88-111` `disposeClonedModelTree()` — **복제본만** dispose, 템플릿은 보존.
- 즉 **dispose 대상 = 인스턴스(클론), 보존 대상 = 템플릿 캐시**. 분리가 명확.

→ dispose 후 같은 Stage 재진입 시 템플릿 캐시 히트라 **재fetch 없음**, GPU 리소스만 clone으로 다시 생성. 메모리 누수 없이 빠른 재진입. `/memory-test` 페이지로 마운트/언마운트 반복 검증 가능.

---

## 9. Safari / iPad 위험성 (브리프)

순수 Three.js + WebGL2라 R3F 이슈는 없지만, iPad 전시 시 점검 포인트:

1. **KTX2 / Basis 트랜스코딩** — `assetLoaders.js`가 `renderer`로 `detectSupport()` 호출. iPad는 보통 ASTC를 고른다. `/basis/` 트랜스코더 WASM이 빌드 산출물(`public/basis/`)에 포함됐는지 확인. 없으면 iPad에서 텍스처 디코드 실패.
2. **JS 힙 한계** — iPad Safari는 탭당 대략 1GB 안팎에서 메모리 압박 시 페이지를 강제 리로드한다. 리로드되면 **모든 GLB 캐시가 날아가고 혼잡 네트워크에서 전체 재다운로드** → 전시 중 최악 시나리오. `/memory-test`로 장시간 누수 여부를 반드시 확인.
3. **WebGL 컨텍스트 손실** — iPad는 백그라운드 전환·메모리 압박 시 `webglcontextlost`가 발생할 수 있다. 컨텍스트 복구 핸들러가 없으면 검은 화면. (현재 코드에 핸들러 유무는 별도 점검 권장.)
4. **Draco WASM** — iOS Safari에서 WASM 워커는 동작하나, 초기 디코더 로드가 느릴 수 있어 `preloadDecoders()`가 앱 시작 시 호출되는 현 구조가 유리.
5. **HTTP 캐시 휘발성** — iOS Safari는 디스크 캐시를 데스크톱보다 공격적으로 비운다. 서버 `Cache-Control: max-age` 헤더 + 파일명 해시(Vite 기본)로 강제하지 않으면 재방문 시 재다운로드.

---

## 10. 가장 위험한 anti-pattern (브리프)

이 코드베이스 기준, 우선순위 순:

1. **🔴 페이지 리로드 = 모든 캐시 소실.**
   GLB 캐시는 JS 메모리에만 있다. 키오스크가 어떤 이유로든(에러, iPad 메모리 압박, 새로고침 키오스크 앱 설정) 페이지를 리로드하면 혼잡 네트워크에서 모든 GLB를 다시 받는다. → **방어책: ① 서버에서 GLB에 `Cache-Control: max-age=31536000, immutable` + 해시 파일명 → 리로드돼도 HTTP 캐시(디스크)에서 즉시. ② 키오스크는 리로드를 막거나, 리로드 후 워밍업 완료까지 인트로 화면 유지.**

2. **🔴 `clearGltfTemplateCache()` 오용.**
   현재 dead code지만, 누가 "다음 이용자 초기화"에 끼워 넣으면 전시 중 매 이용자마다 전체 GLB 재다운로드가 된다. → 함수를 삭제하거나, 호출 금지 주석을 명시.

3. **🟡 ThreeCanvas에 인라인 배열 props.**
   `allowedStages={[3]}` 처럼 쓰면 매 렌더 새 참조 → `initThreeApp` 재실행 → 씬 전체 + GLB 재로드. 현재는 전부 `useMemo`/`Object.freeze`로 안전하나, 신규 코드에서 깨지기 쉽다.

4. **🟡 GLB 파일 분할 과다.**
   GLB가 잘게 쪼개져 있으면 혼잡 네트워크에서 요청 수만큼 waterfall 지연이 누적된다. 적은 수의 큰 GLB가 유리(단, 한 파일이 너무 크면 첫 파싱 블로킹). 현 워밍업 구조는 병렬 로드라 어느 정도 완화됨.

5. **🟢 (해당 없음) R3F useGLTF/Suspense 중복 로딩** — R3F 미사용이라 발생하지 않음.

---

## 11. 실제 검증 방법 — Chrome DevTools

### A. fetch가 재발생하는지 확인 (Network 탭)
1. DevTools → **Network** 탭, 필터에 `glb` 입력 (또는 `gltf`).
2. **Size 열**을 본다:
   - 숫자(예: `4.2 MB`) → 실제 네트워크 다운로드
   - `(disk cache)` → HTTP 디스크 캐시 히트 (네트워크 안 탐, 리로드해도 빠름)
   - `(memory cache)` → HTTP 메모리 캐시 히트 (탭 살아있는 동안)
   - **목록에 아예 안 나타남** → 앱의 `_gltfByAbsoluteUrl` Promise 캐시 히트 (= 정상, 가장 바람직)
3. 검증 시나리오:
   - 앱 진입 → 각 GLB가 **딱 1줄**씩 나오면 정상 (브리프 1번).
   - Stage 2↔3↔6 전환 반복 → **새 GLB 줄이 추가되지 않으면** 통과 (브리프 2·6번).
   - 캐릭터 애니메이션(걷기/펀치) 실행 → **새 요청 0개** 확인 (브리프 3번).
4. **Initiator 열**로 어떤 코드가 요청했는지 추적 가능 — 예상외 재요청의 출처 파악용.

### B. Disable cache ON/OFF 테스트
"Disable cache" 체크박스는 **HTTP 캐시만** 끈다. 앱의 JS Promise 캐시(`_gltfByAbsoluteUrl`)는 영향받지 않는다. 이걸 이용해 두 캐시 층을 분리 검증:

| Disable cache | Stage 전환 시 GLB 요청 | 해석 |
|---|---|---|
| **ON** | 안 나옴 | ✅ 앱 Promise 캐시가 잡고 있음 (정상) |
| **ON** | 매번 풀 다운로드 | 🔴 앱 캐시가 안 먹음 — 재초기화 의심 |
| **OFF** | 안 나오거나 `(disk cache)` | ✅ 정상 |

→ **Disable cache ON 상태에서 Stage를 오가며 GLB 요청이 0이면**, 앱 레벨 캐시가 제대로 동작하는 것. 이게 핵심 검증.
→ **페이지 새로고침(F5)** 후엔 앱 캐시가 사라지므로: Disable cache OFF면 `(disk cache)`로 빨라야 하고, ON이면 풀 다운로드된다. 이걸로 "리로드 시 서버 캐시 헤더가 잘 박혔는지" 확인.

### C. 전시장 혼잡 네트워크 시뮬레이션 (Throttling)
1. Network 탭 → throttling 드롭다운(기본 `No throttling`).
2. **`Slow 3G`** 선택 → 최악의 전시장 와이파이 근사. `Fast 3G`는 중간 수준.
3. **커스텀 프로파일** 추가 권장: dropdown → `Add…` → 예: 다운로드 1.5 Mbps / 업로드 0.75 Mbps / 지연(latency) 300ms. 전시장은 대역폭보다 **동시 접속 다수로 인한 latency**가 문제이므로 latency를 높게.
4. 검증: throttling 켠 채 첫 진입 로딩 시간 측정 → 인트로/로딩 화면이 워밍업 완료까지 사용자를 잡아두는지 확인 (`waitForStage3GltfTemplatesReady`).
5. **CPU throttling**(Performance 탭의 4×/6× slowdown)도 병행 — iPad는 데스크톱보다 느리므로 GLB 파싱 블로킹 시간을 현실적으로 본다.

### D. 전체 워터폴 점검
- Network 탭 우측 **Waterfall 열**: 막대가 계단식으로 길게 늘어지면 직렬 의존 로딩. 워밍업이 병렬이라 막대들이 겹쳐 보여야 정상.
- **`Disable cache` + `Slow 3G` + 새로고침**으로 "차가운 첫 방문자" 재현 → 총 로딩 시간이 허용 범위인지.

---

## 12. 결론 요약

| 브리프 검증 목표 | 결과 |
|---|---|
| 1. GLB 최초 1회만 fetch | ✅ 통과 (Promise URL 캐시) |
| 2. 페이지 이동/상태 변경 시 재다운로드 | ✅ 통과 (캐시 보존, 캐시 clear는 dead code) |
| 3. 애니메이션 실행 시 추가 요청 | ✅ 통과 (GLB 내장 클립, 요청 0) |
| 4. texture 별도 fetch 구조 | ✅ GLB 내장 (HDRI만 예외) |
| 5. 브라우저/메모리 캐시 | ✅ 앱 메모리 캐시 상주 |
| 6. React rerender 재로드 | ✅ 통과 (모든 호출부 useMemo/freeze) |
| 7. useGLTF/useLoader 캐시 | — 해당 없음 (R3F 미사용) |
| 8. preload 적용 | ✅ 통과 (Stage별 워밍업 실동작) |
| 9. Suspense 중복 로딩 | — 해당 없음 (R3F 미사용) |
| 10. 가장 위험한 재요청 패턴 | 🔴 **페이지 리로드 시 전체 캐시 소실** (§10 참고) |

**총평:** 로딩/캐시 구조는 전시 환경 기준으로 잘 설계돼 있다. Promise 기반 템플릿 캐시 + 인스턴스 클론 분리 + Stage별 워밍업이 핵심 강점. 남은 리스크는 코드 결함이 아니라 **운영 레벨**이다 — ① 서버 GLB `Cache-Control` 헤더로 리로드 방어, ② 키오스크 리로드 차단, ③ `clearGltfTemplateCache` dead code 정리, ④ iPad 메모리 누수를 `/memory-test`로 장시간 검증.
