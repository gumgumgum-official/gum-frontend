/**
 * Stage2: 배경 GLB + 오브제(GLB) 로드, 디버그 컨트롤로 카메라/오브제 조정
 * - 로드: assetLoaders (GLB)
 * - 입력/디버그: stageDebugControls (Orbit, Transform, Drag, C/G/S)
 * - Handwriting: Supabase Realtime으로 필기 데이터 수신 후 3D로 떨어지는 애니메이션
 * @returns {import("../types.js").StageInstance}
 */

import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createAutonomousCharacters } from "../utils/stages/stage2/autonomousCharacters.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE2_CONFIG } from "../config/stages/stage2.js";
import { subscribeHandwritingRealtime } from "../utils/handwriting/handwritingRealtime.js";
import { loadSVGShapes, expandShapesStroke } from "../lib/svg-loader.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

// Phase 2: 고민 텍스트가 섬 위에 떨어져 쌓이는 기준
// ----------------------------------------
// [검증용] 예전 수동 측정값 주석 처리 — island.glb 자동 계산만 사용하는지 검증하려면 아래 사용 안 함.
// 검증 끝나면 주석 해제하고 getSpawnBounds/loadCharacters fallback 다시 ISLAND_BOUNDS로.
const LEGACY_ISLAND_BOUNDS = {
  minX: -8.06,
  maxX: 7.94,
  minZ: -3.21,
  maxZ: 6.89,
};
const GROUND_Y = 0.7;
/** 글자끼리 최소 거리(m). 이 값보다 가깝게 스폰되지 않음. */
const MIN_DISTANCE_BETWEEN = 5.2;
// island.glb Box3는 메쉬를 감싸는 '사각형'이라 모서리가 섬 밖으로 나감 → 안쪽으로 줄인 범위만 사용
/** 섬 박스에서 이 비율만큼 안쪽으로 줄인 영역만 캐릭터/스폰에 사용 (0.15 = 15%씩 각 변에서 제외) */
const ISLAND_BOUNDS_INSET_RATIO = 0.08;
// 스폰 시 그 안에서 다시 앞·뒤·좌우 살짝만 더 빼기 (섬 전체에 퍼지도록 작게)
const SPAWN_INSET_RATIO = 0.05;
const SPAWN_INSET_SIDE_RATIO = 0.06;
const SPAWN_INSET_BOTTOM_RATIO = 0.1;
const SPAWN_HEIGHT_MIN = 3; // 낙하 시작 높이 하한 (빨리 보이게)
const SPAWN_HEIGHT_MAX = 14; // 최대 시작 높이 (너무 높으면 오래 걸림)
// 속도: 아래 값이 맥시멈. 실제는 speedFactor(0.25~1.0) 곱해서 더 느리게 랜덤 적용
// 기존 대비 약 20% 빠르게 (체감 속도 개선)
const FALL_SPEED_MULTIPLIER = 1.2;
const FALL_GRAVITY_MAX = -22 * 0.15 * FALL_SPEED_MULTIPLIER;
const FALL_INITIAL_VY_MAX = -6 * 0.15 * FALL_SPEED_MULTIPLIER;
// Stage3(운석)처럼 "통통" 한 번만 바운스
// 너무 크게 튀지 않게(얌전하게) 탄성 낮춤
const LETTER_BOUNCE_RESTITUTION = 0.22;
const LETTER_MAX_BOUNCES = 1;

/** 자식/손자 중 name이 일치하는 첫 오브젝트 반환 (디자이너가 넣은 Walkable 등) */
function findChildByName(obj, name) {
  if (!obj) return null;
  if (obj.name === name) return obj;
  for (const child of obj.children) {
    const found = findChildByName(child, name);
    if (found) return found;
  }
  return null;
}

/**
 * island.glb 기반 자동 계산 bounds가 너무 좁게 잡히는 경우(메쉬/스케일/원점 이슈 등),
 * 예전 수동 측정값(LEGACY_ISLAND_BOUNDS)으로 안전하게 fallback 한다.
 */
function getSafeIslandBounds(bounds) {
  if (!bounds) return LEGACY_ISLAND_BOUNDS;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  // 섬이 이보다 작게 잡히면 스폰 영역이 과도하게 좁아져 겹침이 급증하므로 fallback
  if (!Number.isFinite(w) || !Number.isFinite(d) || w < 6 || d < 6) {
    return LEGACY_ISLAND_BOUNDS;
  }
  return bounds;
}

export function Stage2() {
  const config = STAGE2_CONFIG;
  const glbLoader = getGLBLoader();

  const objects = [];
  const propRoots = [];
  let debugControls = null;
  let autonomousCharacters = null;
  let realtimeSubscription = null;
  const fallingTexts = [];
  let cameraRef = null;
  /** 섬 XZ 범위 — island.glb 로드 시 자동 계산됨 (검증: 예전 수치 fallback 없이 이 값만 사용) */
  let islandBounds = null;

  function updateIslandBoundsFromRoots(roots) {
    if (!roots || roots.length === 0) {
      islandBounds = null;
      return;
    }
    // collision.glb가 여러 조각(여러 root)으로 로드되는 경우가 있어,
    // 첫 번째 root만 쓰면 "맨 위/왼쪽/오른쪽/아래" 일부만 잡혀 스폰 영역이 과도하게 좁아질 수 있다.
    // 따라서 전체 roots를 union(Box3) 해서 섬 전체 XZ 범위를 구한다.
    const box = new THREE.Box3();
    roots.forEach((r) => box.expandByObject(r));
    const minX = box.min.x;
    const maxX = box.max.x;
    const minZ = box.min.z;
    const maxZ = box.max.z;
    islandBounds = { minX, maxX, minZ, maxZ };
    const p = roots[0]?.position ?? { x: 0, y: 0, z: 0 };
    console.log(
      `📐 [Stage2] collision (prop[0]) position: x=${p.x.toFixed(2)}, y=${p.y.toFixed(2)}, z=${p.z.toFixed(2)}`,
    );
    console.log(
      `📐 [Stage2] 섬 범위 (XZ): minX=${minX.toFixed(2)}, maxX=${maxX.toFixed(2)}, minZ=${minZ.toFixed(2)}, maxZ=${maxZ.toFixed(2)}`,
    );
  }

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;

      scene.fog = new THREE.Fog(
        config.fog.color,
        config.fog.near,
        config.fog.far,
      );
      scene.background = new THREE.Color(config.background.color);

      const cam = config.camera;
      this.camera = new THREE.PerspectiveCamera(
        cam.fov ?? 45,
        window.innerWidth / window.innerHeight,
        cam.near ?? 0.1,
        cam.far ?? 10000,
      );
      this.camera.position.set(
        cam.position?.x ?? 0,
        cam.position?.y ?? 0,
        cam.position?.z ?? 0,
      );
      if (cam.lookAt) {
        this.camera.lookAt(
          cam.lookAt.x ?? 0,
          cam.lookAt.y ?? 0,
          cam.lookAt.z ?? 0,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }
      cameraRef = this.camera;

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => propRoots,
        getPropPath: (i) => config.props?.[i]?.path ?? "",
        options: {
          stageName: "stage2",
          getInitialCameraConfig: () => config.camera,
          onConfigChange: (roots) => updateIslandBoundsFromRoots(roots),
        },
      });

      // 배경 GLB 로드 (단일 path 또는 island/sea/sky 분리)
      const pos = config.model.position ?? { x: 0, y: 0, z: 0 };
      const applyModel = (model) => {
        model.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
        model.updateMatrixWorld(true);
        model.traverse((child) => {
          if (child.isMesh) {
            if (config.model.castShadow !== undefined)
              child.castShadow = config.model.castShadow;
            if (config.model.receiveShadow !== undefined)
              child.receiveShadow = config.model.receiveShadow;
            child.raycast = () => {};
          }
        });
        scene.add(model);
        objects.push(model);
      };

      const onReady = () => {
        loadCharacters(
          glbLoader,
          config,
          scene,
          objects,
          (controller) => {
            autonomousCharacters = controller;
          },
          islandBounds,
        );
        loadInitialHandwritings(
          scene,
          this.camera,
          fallingTexts,
          () => islandBounds,
        );
      };

      const finishBackground = (allModels, islandModel) => {
        const box = new THREE.Box3();
        allModels.forEach((m) => box.expandByObject(m));
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (!config.camera.lookAt) debugControls.setOrbitTarget(center);
        this.camera.far = Math.max(config.camera.far ?? 10000, maxDim * 10);
        this.camera.updateProjectionMatrix();
        if (islandModel) {
          islandModel.updateMatrixWorld(true);
          // 디자이너가 "걸을 수 있는 영역" 메쉬를 Walkable 이름으로 넣어두면 그걸로만 사용 (inset 불필요)
          const walkableObj = findChildByName(islandModel, "Walkable");
          const boundsSource = walkableObj || islandModel;
          boundsSource.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(boundsSource);
          if (walkableObj) {
            islandBounds = {
              minX: box.min.x,
              maxX: box.max.x,
              minZ: box.min.z,
              maxZ: box.max.z,
            };
            console.log(
              `📐 [Stage2] island.glb Walkable 사용 (디자이너 정의): minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          } else {
            const w = box.max.x - box.min.x;
            const d = box.max.z - box.min.z;
            const inset = ISLAND_BOUNDS_INSET_RATIO;
            islandBounds = {
              minX: box.min.x + w * inset,
              maxX: box.max.x - w * inset,
              minZ: box.min.z + d * inset,
              maxZ: box.max.z - d * inset,
            };
            console.log(
              `📐 [Stage2] island.glb Walkable 없음 → 전체 박스 + ${(inset * 100).toFixed(0)}% inset: minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          }
        }
        if (config.props?.length) {
          loadPropsFromConfig(
            glbLoader,
            config.props,
            scene,
            objects,
            propRoots,
            () => {
              debugControls.setDraggableObjects(propRoots);
              if (!islandModel) updateIslandBoundsFromRoots(propRoots);
              onReady();
            },
          );
        } else {
          onReady();
        }
      };

      if (config.model.island || config.model.sea || config.model.sky) {
        const parts = [
          config.model.island && "island",
          config.model.sea && "sea",
          config.model.sky && "sky",
        ].filter(Boolean);
        const urls = [
          config.model.island,
          config.model.sea,
          config.model.sky,
        ].filter(Boolean);
        Promise.all(urls.map((url) => glbLoader.loadAsync(url)))
          .then((gltfs) => {
            let islandModel = null;
            gltfs.forEach((gltf, i) => {
              const model = gltf.scene;
              applyModel(model);
              if (parts[i] === "island") islandModel = model;
            });
            finishBackground(
              gltfs.map((g) => g.scene),
              islandModel,
            );
            console.log("✅ Stage2 배경 로드 완료 (island/sea/sky)");
          })
          .catch((err) => console.error("❌ Stage2 배경 로드 에러:", err));
      } else {
        glbLoader.load(config.model.path, {
          onLoad: (gltf) => {
            const model = gltf.scene;
            applyModel(model);
            finishBackground([model], null);
            console.log("✅ Stage2 배경 로드 완료 (단일)");
          },
          onProgress: (xhr) => {
            if (xhr.total > 0)
              console.log(
                `Stage2 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
              );
          },
          onError: (err) => console.error("❌ Stage2 배경 로드 에러:", err),
        });
      }

      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);
      objects.push(axesHelper);

      // Handwriting: 실시간 수신 (누적 로드는 GLB 로드 후 섬 땅 높이 적용 뒤 호출)
      realtimeSubscription = subscribeHandwritingRealtime({
        onNewHandwriting: (metadata) => {
          console.log(
            "[Stage2] Realtime 수신 → falling text 생성:",
            metadata.id,
            metadata.url,
          );
          createFallingText(
            metadata,
            scene,
            this.camera,
            fallingTexts,
            {
              initial: false,
            },
            () => islandBounds,
          );
        },
        onError: (error) => {
          console.error("[Stage2] Handwriting realtime error:", error);
        },
      });

      // 키보드 0키: 이미 있는 글자들만 다시 공중으로 올려서 재낙하 (디버그용)
      const handleKeyDown = (event) => {
        if (event.key === "0" || event.code === "Digit0") {
          if (fallingTexts.length === 0) {
            console.warn(
              "[Stage2] 0키: 재낙하할 글자가 없습니다. Supabase Storage/Realtime에서 필기 데이터가 들어와야 글자가 생성됩니다. (session 확인 또는 태블릿에서 필기 후 브로드캐스트)",
            );
            return;
          }
          console.log(`[Stage2] 0키: 재낙하 (${fallingTexts.length}개 글자)`);
          const spawn = getSpawnBounds(islandBounds);
          const { minX, maxX, minZ, maxZ } = spawn;
          fallingTexts.forEach((ft) => {
            const speedFactor = 0.25 + Math.random() * 0.75; // 0.25~1.0 (현재=맥시멈)
            const startY =
              GROUND_Y +
              SPAWN_HEIGHT_MIN +
              Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);
            const startX = minX + Math.random() * (maxX - minX);
            const startZ = minZ + Math.random() * (maxZ - minZ);
            const gravity = FALL_GRAVITY_MAX * speedFactor;
            const initialVy =
              (FALL_INITIAL_VY_MAX - Math.random() * 0.3) * speedFactor;
            const rotationVelocity = computeFallRotationVelocities(
              startY,
              GROUND_Y,
              initialVy,
              gravity,
            );

            ft.group.position.set(startX, startY, startZ);
            ft.group.rotation.set(0, 0, 0);

            ft.velocity.y = initialVy;
            ft.velocity.rotationX = rotationVelocity.x;
            ft.velocity.rotationY = rotationVelocity.y;
            ft.velocity.rotationZ = rotationVelocity.z;
            ft.gravity = gravity;
            ft.groundY = GROUND_Y;
            ft.landed = false;
          });
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      objects.push({
        dispose: () => window.removeEventListener("keydown", handleKeyDown),
      });

      console.log("✅ Stage2 setup 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      if (autonomousCharacters) autonomousCharacters.update(delta);

      // 떨어지는 텍스트 애니메이션 업데이트
      updateFallingTexts(delta, cameraRef, fallingTexts);
    },

    cleanup(scene) {
      // Realtime 구독 해제
      if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
      }

      // 떨어지는 텍스트 정리
      fallingTexts.forEach((fallingText) => {
        scene.remove(fallingText.group);
        fallingText.group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      });
      fallingTexts.length = 0;

      if (autonomousCharacters) {
        autonomousCharacters.cleanup();
        autonomousCharacters = null;
      }
      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }
      propRoots.length = 0;

      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      objects.length = 0;
      scene.fog = null;
      scene.background = null;
      cameraRef = null;
      console.log("🧹 Stage2 정리 완료");
    },
  };
}

/**
 * 캐릭터 GLB 로드 후 자율 이동 컨트롤러 생성 (자유의지 랜덤 걷기, 걸을 때만 애니메이션)
 * @param {{ load: function(string, { onLoad: function, onError?: function }): void }} loader
 * @param {object} config - STAGE2_CONFIG
 * @param {import("three").Scene} scene
 * @param {import("three").Object3D[]} objects
 * @param {(controller: { update: function, cleanup: function } | null) => void} onControllerReady
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} [bounds] - 섬 XZ 범위 (island.glb 자동 계산값만 사용 중, 검증용)
 */
function loadCharacters(
  loader,
  config,
  scene,
  objects,
  onControllerReady,
  bounds,
) {
  const characterPath =
    config.characterModelPath ?? "/models/common/user_walking2.glb";
  const characterPositions = config.characters ?? [
    { position: { x: -4, y: 0.7, z: 1 } },
    { position: { x: -2, y: 0.7, z: 2 } },
    { position: { x: 0, y: 0.7, z: 2 } },
    { position: { x: 2, y: 0.7, z: 2 } },
    { position: { x: 4, y: 0.7, z: 1 } },
  ];

  // island.glb 기준 이동 범위 — 캐릭터는 이 안에서만 걸음 (초기 위치도 여기 안으로 클램프)
  const walkBounds =
    bounds ??
    (() => {
      console.warn(
        "[Stage2] island bounds 없음 — island.glb 로드 후 자동 계산된 값만 사용 중. 단일 배경이면 bounds가 null일 수 있음.",
      );
      return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    })();
  const padding = 0.5;

  loader.load(characterPath, {
    onLoad: (gltf) => {
      const source = gltf.scene;
      const count = characterPositions.length;
      const scale = config.characterScale ?? 1;
      const characterModels = [];
      const minX = walkBounds.minX + padding;
      const maxX = walkBounds.maxX - padding;
      const minZ = walkBounds.minZ + padding;
      const maxZ = walkBounds.maxZ - padding;
      for (let i = 0; i < count; i++) {
        const model = i === 0 ? source : SkeletonUtils.clone(source);
        model.scale.setScalar(scale);
        const pos = characterPositions[i]?.position ?? {};
        let x = pos.x ?? 0;
        let z = pos.z ?? 0;
        x = THREE.MathUtils.clamp(x, minX, maxX);
        z = THREE.MathUtils.clamp(z, minZ, maxZ);
        model.position.set(x, pos.y ?? GROUND_Y, z);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        objects.push(model);
        characterModels.push(model);
        scene.add(model);
      }
      let controller = null;
      if (gltf.animations?.length > 0) {
        controller = createAutonomousCharacters({
          models: characterModels,
          walkClip: gltf.animations[0],
          bounds: walkBounds,
          groundY: GROUND_Y,
          options: { moveSpeed: 0.8, boundsPadding: padding },
        });
      }
      onControllerReady(controller);
      console.log(
        `✅ Stage2 캐릭터 ${count}명 로드 완료 (island.glb 범위 안에서만 이동)`,
      );
    },
    onError: (err) => {
      console.error("❌ Stage2 캐릭터 로드 에러:", err);
      onControllerReady(null);
    },
  });
}

/**
 * config.props 배열 기준으로 GLB 로드 후 scene에 추가
 * @param {{ load: function(string, { onLoad: function, onError?: function }): void }} loader - GLB 로더
 * @param {import("../types.js").Stage2PropConfig[]} propsConfig
 * @param {import("three").Scene} scene
 * @param {import("three").Object3D[]} objects - dispose용
 * @param {import("three").Object3D[]} propRoots - 선택/드래그용
 * @param {() => void} onAllDone
 */
function loadPropsFromConfig(
  loader,
  propsConfig,
  scene,
  objects,
  propRoots,
  onAllDone,
) {
  let done = 0;
  const total = propsConfig.length;

  propsConfig.forEach((propConfig) => {
    loader.load(propConfig.path, {
      onLoad: (gltf) => {
        const root = gltf.scene;
        root.position.set(
          propConfig.position?.x ?? 0,
          propConfig.position?.y ?? 0,
          propConfig.position?.z ?? 0,
        );
        root.rotation.set(
          THREE.MathUtils.degToRad(propConfig.rotation?.x ?? 0),
          THREE.MathUtils.degToRad(propConfig.rotation?.y ?? 0),
          THREE.MathUtils.degToRad(propConfig.rotation?.z ?? 0),
        );
        root.scale.set(
          propConfig.scale?.x ?? 1,
          propConfig.scale?.y ?? 1,
          propConfig.scale?.z ?? 1,
        );
        root.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(root);
        objects.push(root);
        propRoots.push(root);
        console.log(`✅ 오브제 로드: ${propConfig.path}`);
        done++;
        if (done === total) onAllDone();
      },
      onError: (err) => {
        console.error(`❌ 오브제 로드 실패: ${propConfig.path}`, err);
        done++;
        if (done === total) onAllDone();
      },
    });
  });
}

/**
 * 버킷/테이블에 있는 기존 SVG 전부 로드 후, 땅에 두지 않고 공중에서 순차 낙하 시작.
 * - 첫 프레임: 땅엔 아무것도 없음. 렌더 시작되자마자 첫 글자부터 낙하 애니메이션 시작.
 * - Realtime 인식 시에는 handwritingRealtime에서 createFallingText(initial: false) 호출.
 */
const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files"; // session_id, storage_path, created_at, client_id
const STAGGER_MS = 90; // 첫 글자 즉시, 이후 글자는 이 간격으로 순차 스폰

// ------------------------------------------------------------
// 글씨 스케일 정규화 (입력 크기 무관)
// - 최대 기준: '남친이랑 맨날 싸움' SVG
// - 최소: 그 75%  (0.75~1.0 범위 랜덤)
// ------------------------------------------------------------
const REFERENCE_SVG_URL =
  "https://cffuybxttyrfjetyqrww.supabase.co/storage/v1/object/public/handwriting/exhibition-2026/2216b9af-0c5f-43dd-b41c-8f87de5046a7_2026-03-17T07:06:57.209Z_84brj4j.svg";
// 기존 Stage2에서 체감 “최대 크기”로 보이던 값 유지 (reference가 이 크기를 1.0으로 삼음)
const BASE_MAX_SCALE = 0.006 * 0.75;
const RANDOM_SCALE_MIN = 0.5;
const RANDOM_SCALE_MAX = 0.75;
// 입력 SVG가 극단적으로 작거나 클 때 스케일 폭주 방지용 클램프
const NORMALIZED_SCALE_MIN = BASE_MAX_SCALE * 0.35;
const NORMALIZED_SCALE_MAX = BASE_MAX_SCALE * 2.2;

let referenceLocalHeight = null;
let referenceHeightPromise = null;

function computeLocalHeightFromShapes(shapes, extrudeSettings) {
  if (!Array.isArray(shapes) || shapes.length === 0) return null;
  const box = new THREE.Box3();
  const temp = new THREE.Box3();
  let hasAny = false;
  for (const shape of shapes) {
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      temp.copy(geometry.boundingBox);
      box.union(temp);
      hasAny = true;
    }
    geometry.dispose();
  }
  if (!hasAny) return null;
  const h = box.max.y - box.min.y;
  if (!Number.isFinite(h) || h <= 1e-6) return null;
  return h;
}

function ensureReferenceLocalHeight(extrudeSettings) {
  if (referenceLocalHeight && Number.isFinite(referenceLocalHeight)) return;
  if (referenceHeightPromise) return;
  referenceHeightPromise = (async () => {
    try {
      let shapes = await loadSVGShapes(REFERENCE_SVG_URL);
      if (!Array.isArray(shapes) || shapes.length === 0) return;
      shapes = expandShapesStroke(shapes, 1.3);
      const h = computeLocalHeightFromShapes(shapes, extrudeSettings);
      if (h && Number.isFinite(h)) {
        referenceLocalHeight = h;
        console.log(
          `[Stage2] 기준 글씨(reference) 높이 측정 완료: h=${referenceLocalHeight.toFixed(2)}`,
        );
      }
    } catch (e) {
      // 네트워크/권한/일시 오류 등일 수 있어 조용히 fallback 유지
      console.warn("[Stage2] 기준 글씨(reference) 로드/측정 실패:", e);
    }
  })();
}

async function loadInitialHandwritings(
  scene,
  camera,
  fallingTextsArr,
  getIslandBounds,
) {
  if (!supabase) {
    console.warn("[Stage2] Supabase 없음, 누적 로드 스킵");
    return;
  }

  const sessionId = getSessionId();

  try {
    let pathsToLoad = await listStoragePaths(sessionId);
    if (pathsToLoad.length === 0) {
      pathsToLoad = await loadPathsFromTable(sessionId);
    }
    if (pathsToLoad.length === 0) {
      console.log(
        "[Stage2] 누적 SVG 없음, 실시간만 수신. (list=0이면 Storage 정책에서 list 허용 또는 테이블 사용)",
      );
      return;
    }

    console.log(
      `[Stage2] 누적 로드: ${sessionId} 에서 ${pathsToLoad.length}개 SVG → 공중에서 순차 낙하`,
    );

    const bucket = HANDWRITING_BUCKET;
    for (let i = 0; i < pathsToLoad.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
      const { path, id, createdAt, clientId } = pathsToLoad[i];
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);
      const url = urlData?.publicUrl ?? "";

      const metadata = {
        id: id || path.replace(/\.svg$/i, ""),
        url,
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        clientId: clientId ?? "",
      };

      await createFallingText(
        metadata,
        scene,
        camera,
        fallingTextsArr,
        { initial: false },
        getIslandBounds,
      );
    }
  } catch (err) {
    console.error("[Stage2] 누적 로드 중 오류:", err);
  }
}

/** Storage list로 경로 목록 얻기 (가능하면) */
async function listStoragePaths(sessionId) {
  const bucket = HANDWRITING_BUCKET;
  const paths = [];

  for (const folder of [sessionId, sessionId + "/"]) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(folder.replace(/\/$/, ""), { limit: 500 });

    console.log(
      "[Stage2] Storage list:",
      "path=",
      folder,
      "error=",
      error?.message ?? null,
      "items=",
      (files || []).length,
    );

    if (error) continue;

    const svgFiles = (files || []).filter(
      (f) => f.name && String(f.name).toLowerCase().endsWith(".svg"),
    );
    const prefix = folder.replace(/\/$/, "")
      ? folder.replace(/\/$/, "") + "/"
      : "";

    for (const f of svgFiles) {
      paths.push({
        path: prefix + f.name,
        id: f.name.replace(/\.svg$/i, ""),
        createdAt: f.created_at ?? null,
        clientId: "",
      });
    }
    if (paths.length > 0) break;
  }

  return paths;
}

/** 테이블에서 storage_path 목록 조회 (list 권한 없을 때 사용) */
async function loadPathsFromTable(sessionId) {
  try {
    const { data: rows, error } = await supabase
      .from(HANDWRITING_TABLE)
      .select("storage_path, created_at, client_id")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) {
      console.log(
        "[Stage2] 테이블 조회 실패 (테이블 없거나 RLS):",
        error.message,
      );
      return [];
    }

    const list = Array.isArray(rows)
      ? rows.filter((r) => r && typeof r === "object")
      : [];
    if (list.length === 0) return [];

    console.log(
      "[Stage2] 테이블에서 경로 로드:",
      HANDWRITING_TABLE,
      list.length,
      "개",
    );

    return list.map((r) => {
      const path = String(r.storage_path ?? "");
      return {
        path,
        id: path.replace(/\.svg$/i, ""),
        createdAt: r.created_at ?? null,
        clientId: String(r.client_id ?? ""),
      };
    });
  } catch (e) {
    console.warn("[Stage2] 테이블 조회 예외:", e);
    return [];
  }
}

/**
 * 그룹 안 여러 메시의 지오메트리를 한꺼번에 센터링 (합쳐진 중심이 원점이 되도록)
 * - shape마다 따로 센터링하면 전부 (0,0,0)에 겹쳐서 별처럼 보이므로, 전체 중심만 원점으로
 */
function centerGroupGeometries(meshes) {
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    tempBox.copy(mesh.geometry.boundingBox);
    box.union(tempBox);
  }
  const center = new THREE.Vector3();
  box.getCenter(center);
  for (const mesh of meshes) {
    mesh.geometry.translate(-center.x, -center.y, -center.z);
  }
}

/**
 * 떨어지는 텍스트 생성 — 위치는 생성 시 한 번만 설정, 이후엔 position.y만 변경
 */
async function createFallingText(
  metadata,
  scene,
  camera,
  fallingTextsArr,
  options = {},
  getIslandBounds,
) {
  const { initial = false } = options;

  try {
    let shapes = await loadSVGShapes(metadata.url);
    if (shapes.length === 0) {
      console.warn("[Stage2] No shapes found in SVG:", metadata.id);
      return;
    }
    shapes = expandShapesStroke(shapes, 1.3);

    const group = new THREE.Group();
    // 채팅 시작 전 스타일(작은 베벨) + 두께 더 굵게, 수직 유지
    const extrudeSettings = {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 8,
    };

    // reference 기준 높이 측정은 한 번만(비동기) 수행
    ensureReferenceLocalHeight(extrudeSettings);

    const localHeight = computeLocalHeightFromShapes(shapes, extrudeSettings);
    const randomFactor =
      RANDOM_SCALE_MIN + Math.random() * (RANDOM_SCALE_MAX - RANDOM_SCALE_MIN);
    const normalizedScale =
      referenceLocalHeight && localHeight
        ? BASE_MAX_SCALE * (referenceLocalHeight / localHeight) * randomFactor
        : BASE_MAX_SCALE * randomFactor;
    const finalScaleRaw = Number.isFinite(normalizedScale)
      ? normalizedScale
      : BASE_MAX_SCALE * randomFactor;
    const finalScale = THREE.MathUtils.clamp(
      finalScaleRaw,
      NORMALIZED_SCALE_MIN,
      NORMALIZED_SCALE_MAX,
    );

    const meshes = [];
    shapes.forEach((shape) => {
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const material = new THREE.MeshStandardMaterial({
        color: 0x2e2e2e,
        metalness: 0.1,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.set(finalScale, finalScale, 1.45);
      group.add(mesh);
      meshes.push(mesh);
    });
    centerGroupGeometries(meshes);

    const bounds =
      typeof getIslandBounds === "function" ? getIslandBounds() : null;
    const { x: startX, z: startZ } = pickSpawnXZ(
      fallingTextsArr,
      initial,
      bounds,
    );
    const startY = initial
      ? GROUND_Y
      : GROUND_Y +
        SPAWN_HEIGHT_MIN +
        Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);

    group.position.set(startX, startY, startZ);
    group.rotation.set(0, 0, 0);

    if (initial) {
      setReadableRotationTowardCamera(group, camera, GROUND_Y);
    }

    const speedFactor = 0.25 + Math.random() * 0.75;
    const gravity = FALL_GRAVITY_MAX * speedFactor;
    const initialVy = (FALL_INITIAL_VY_MAX - Math.random() * 0.3) * speedFactor;
    const rotationVelocity = initial
      ? { x: 0, y: 0, z: 0 }
      : computeFallRotationVelocities(startY, GROUND_Y, initialVy, gravity);

    scene.add(group);

    const fallingText = {
      group,
      velocity: {
        y: initial ? 0 : initialVy,
        rotationX: rotationVelocity.x,
        rotationY: rotationVelocity.y,
        rotationZ: rotationVelocity.z,
      },
      gravity,
      groundY: GROUND_Y,
      bounces: 0,
      landed: initial,
    };

    fallingTextsArr.push(fallingText);

    console.log(
      `[Stage2] ${initial ? "누적" : "Realtime"} SVG → ${metadata.id}, 위치 (${startX.toFixed(2)}, ${startY.toFixed(2)}, ${startZ.toFixed(2)})`,
    );
  } catch (error) {
    console.error(
      `[Stage2] Failed to create falling text for ${metadata.id}:`,
      error,
    );
  }
}

/**
 * 떨어지는 텍스트 업데이트
 * - x, z: 생성 이후 절대 변경 안 함.
 * - y: 떨어지는 동안만 변경. y가 groundY에 도달하면 그 값으로 고정하고 더 이상 내려가지 않음 (그 자리에서 멈춤).
 */
function updateFallingTexts(delta, camera, fallingTextsArr) {
  if (!fallingTextsArr) return;

  for (let i = 0; i < fallingTextsArr.length; i++) {
    const ft = fallingTextsArr[i];
    if (ft.landed) continue;

    const { group, velocity, gravity, groundY } = ft;
    const nextY = group.position.y + velocity.y * delta;

    if (nextY <= groundY) {
      // Stage3처럼 첫 충돌 시 한 번만 가볍게 바운스해서 "통통" 무게감 표현
      if ((ft.bounces ?? 0) < LETTER_MAX_BOUNCES && Math.abs(velocity.y) > 2) {
        group.position.y = groundY;
        const vyUp = -velocity.y * LETTER_BOUNCE_RESTITUTION; // 위로 튀는 속도(양수)
        velocity.y = vyUp;
        ft.bounces = (ft.bounces ?? 0) + 1;

        // 바운스 구간에서도 더 얌전하게: "약 0.15~0.55바퀴"만 랜덤 (칼처럼)
        const T = (2 * vyUp) / Math.max(1e-6, -gravity); // 올라갔다 내려오는 대략 시간
        const sign = Math.random() < 0.5 ? -1 : 1;
        const turnsY = 0.15 + Math.random() * 0.4; // 0.15~0.55
        velocity.rotationY = (sign * 2 * Math.PI * turnsY) / Math.max(1e-3, T);
        velocity.rotationX = 0;
        velocity.rotationZ = 0;
        continue;
      }

      group.position.y = groundY;
      velocity.y = 0;
      velocity.rotationX = 0;
      velocity.rotationY = 0;
      velocity.rotationZ = 0;
      setReadableRotationTowardCamera(group, camera, groundY);
      ft.landed = true;
      continue;
    }

    velocity.y += gravity * delta;
    group.position.y = nextY;

    group.rotation.x += velocity.rotationX * delta;
    group.rotation.y += velocity.rotationY * delta;
    group.rotation.z += velocity.rotationZ * delta;
  }
}

/**
 * 착지/누적 시: 글자를 땅에 수직으로 세운 뒤, 카메라 쪽을 바라보도록 수평 회전만 맞춘다.
 */
function setReadableRotationTowardCamera(group, camera, _groundY) {
  const dir = new THREE.Vector3(
    camera.position.x - group.position.x,
    0,
    camera.position.z - group.position.z,
  );
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  group.rotation.set(0, yaw, 0);
}

/**
 * 낙하 시간에 맞춰 "최대 한 바퀴 정도"만 돌도록 각속도를 계산.
 * - startY, groundY, initialVy, gravity로 낙하 시간 T를 근사 계산.
 * - 너무 팔랑팔랑하지 않도록 Y축만 0.35~1.0바퀴, X/Z는 회전하지 않음.
 */
function computeFallRotationVelocities(startY, groundY, initialVy, gravity) {
  const height = startY - groundY;
  if (height <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const a = 0.5 * gravity;
  const b = initialVy;
  const c = height;
  if (Math.abs(a) < 1e-6) {
    return { x: 0, y: 0, z: 0 };
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  const T = Math.max(t1, t2);
  if (!Number.isFinite(T) || T <= 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const sign = Math.random() < 0.5 ? -1 : 1;
  const turnsY = 0.35 + Math.random() * 0.65; // 0.35~1.0 바퀴

  return {
    x: 0,
    y: (sign * 2 * Math.PI * turnsY) / T,
    z: 0,
  };
}

/**
 * 스폰용 XZ 범위 — island.glb 범위에서 inset만 적용 (inset 작으면 섬 전체에 고르게 퍼짐)
 */
function getSpawnBounds(bounds) {
  const b = getSafeIslandBounds(bounds);
  const fullW = b.maxX - b.minX;
  const fullD = b.maxZ - b.minZ;
  const insetX = fullW * SPAWN_INSET_SIDE_RATIO;
  const insetZTop = fullD * SPAWN_INSET_RATIO;
  const insetZBottom = fullD * SPAWN_INSET_BOTTOM_RATIO;
  return {
    minX: b.minX + insetX,
    maxX: b.maxX - insetX,
    minZ: b.minZ + insetZTop,
    maxZ: b.maxZ - insetZBottom,
  };
}

/**
 * 글자끼리 겹치지 않도록 x,z 선택. 이미 착지한 글자 + 떨어지는 글자 전부와 MIN_DISTANCE_BETWEEN 이상 유지.
 * 자리가 없으면 랜덤 겹침 반환하지 않고, "가장 가까운 글자와의 거리가 최대인" 지점을 반환.
 */
function pickSpawnXZ(fallingTextsArr, _isInitial, _bounds) {
  const spawn = getSpawnBounds(_bounds);
  const { minX, maxX, minZ, maxZ } = spawn;
  const allTexts = fallingTextsArr || [];

  const minDist = (x, z) => {
    if (allTexts.length === 0) return Infinity;
    let d = Infinity;
    for (const f of allTexts) {
      const dx = f.group.position.x - x;
      const dz = f.group.position.z - z;
      d = Math.min(d, Math.sqrt(dx * dx + dz * dz));
    }
    return d;
  };

  // 스폰 영역이 좁아지면 MIN_DISTANCE_BETWEEN 고정값 때문에 자리가 안 나서 겹침이 급증할 수 있음.
  // -> 영역/상황에 맞게 최소거리를 단계적으로 완화하면서 "최대한 안 겹치게" 배치한다.
  const MIN_DIST_FLOOR = 2.0;
  let required = MIN_DISTANCE_BETWEEN;
  for (let pass = 0; pass < 4; pass++) {
    for (let tryCount = 0; tryCount < 120; tryCount++) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);
      if (minDist(x, z) >= required) return { x, z };
    }
    required = Math.max(MIN_DIST_FLOOR, required * 0.82);
  }

  // 실패 시: 그리드 후보 중 "가장 가까운 글자와의 거리"가 최대인 점 선택 (겹침 최소화)
  const steps = 12;
  let best = { x: minX + (maxX - minX) / 2, z: minZ + (maxZ - minZ) / 2 };
  let bestD = minDist(best.x, best.z);
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = minX + (i / steps) * (maxX - minX);
      const z = minZ + (j / steps) * (maxZ - minZ);
      const d = minDist(x, z);
      if (d > bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return best;
}
