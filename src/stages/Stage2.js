/**
 * Stage2: 배경 GLB + 오브제(GLB) 로드, 디버그 컨트롤로 카메라/오브제 조정
 * - 로드: assetLoaders (GLB)
 * - 입력/디버그: stageDebugControls (Orbit, Transform, Drag, C/G/S)
 * - Handwriting (제거 예정): Realtime/Storage SVG → handwritingSvgPlane 평면 메시
 * @returns {import("../types.js").StageInstance}
 */

import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../utils/common/gltfTemplateCache.js";
import { createAutonomousCharacters } from "../utils/stages/stage2/autonomousCharacters.js";
import {
  circleOverlapsAny,
  collectIslandStaticColliderBoxes,
  filterCollidersExcludingDominantTerrain,
} from "../utils/stages/stage3/islandStaticColliders.js";
import { createStage2GumSpeechBubbles } from "../utils/stages/stage2/stage2GumSpeechBubbles.js";
import { STAGE2_GUM_SPEECH_LINES } from "../config/stages/stage2/gumSpeechLines.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE2_CONFIG } from "../config/stages/stage2.js";
import { subscribeHandwritingRealtime } from "../utils/handwriting/handwritingRealtime.js";
import {
  createHandwritingSvgPlaneGroup,
  disposeHandwritingSvgPlaneGroup,
} from "../utils/handwritingSvgPlane.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

// Phase 2: 고민 텍스트가 섬 위에 떨어져 쌓이는 기준
// ----------------------------------------
const LEGACY_ISLAND_BOUNDS = {
  minX: -8.06,
  maxX: 7.94,
  minZ: -3.21,
  maxZ: 6.89,
};
const GROUND_Y = 0.7;
// island.glb Box3는 메쉬를 감싸는 '사각형'이라 모서리가 섬 밖으로 나감 → 안쪽으로 줄인 범위만 사용
/** 섬 박스에서 이 비율만큼 안쪽으로 줄인 영역만 캐릭터/스폰에 사용 (0.15 = 15%씩 각 변에서 제외) */
const ISLAND_BOUNDS_INSET_RATIO = 0.08;
const SPAWN_HEIGHT_MIN = 10; // 낙하 시작 높이 하한
const SPAWN_HEIGHT_MAX = 30; // 최대 시작 높이
// 속도: 아래 값이 맥시멈. 실제는 speedFactor(0.25~1.0) 곱해서 더 느리게 랜덤 적용
// 기존 대비 약 20% 빠르게 (체감 속도 개선)
const FALL_SPEED_MULTIPLIER = 1.2;
const FALL_GRAVITY_MAX = -22 * 0.15 * FALL_SPEED_MULTIPLIER;
const FALL_INITIAL_VY_MAX = -6 * 0.15 * FALL_SPEED_MULTIPLIER;
// Stage3(운석)처럼 "통통" 한 번만 바운스
// 너무 크게 튀지 않게(얌전하게) 탄성 낮춤
const LETTER_BOUNCE_RESTITUTION = 0.22;
const LETTER_MAX_BOUNCES = 1;
/** 카메라 상하 각도에 맞춘 눕힘: 1에 가까울수록 시선에 정면에 가깝게 기울임 */
const LETTER_CAMERA_TILT_FACTOR = 0.92;
/** 과도하게 눕혀 지면과 거의 평행해지는 것 방지 (라디안) */
const LETTER_MAX_TILT_RAD = THREE.MathUtils.degToRad(68);

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

/** Stage3 배경 로더와 같이 이름이 island인 첫 오브젝트(섬 지형) */
function findIslandNamedObject(model) {
  let found = null;
  model.traverse((obj) => {
    if (found) return;
    const n = typeof obj.name === "string" ? obj.name.trim() : "";
    if (n.toLowerCase() === "island") found = obj;
  });
  return found;
}

/** 울타리 경계용 — 이름에 fence 또는 울타리가 포함된 첫 오브젝트 (OBJ_Fence 포함) */
function findFenceNamedObject(model) {
  if (!model) return null;
  let found = null;
  model.traverse((obj) => {
    if (found) return;
    const n = typeof obj.name === "string" ? obj.name.trim() : "";
    const lower = n.toLowerCase();
    if (lower.includes("fence") || lower.includes("울타리")) {
      found = obj;
    }
  });
  return found;
}

/**
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} a
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} b
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number } | null}
 */
function intersectXZBounds(a, b) {
  const o = {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(b.maxZ, a.maxZ),
  };
  if (o.minX > o.maxX || o.minZ > o.maxZ) return null;
  return o;
}

/**
 * 섬 걸음 영역 ∩ 울타리(config 또는 GLB). 캐릭터는 이 안에서만 이동.
 * @param {import("../types.js").Stage2Config} config
 */
function computeCharacterMoveBounds(islandBounds, fenceSourceModel, config) {
  if (!islandBounds) return null;
  /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} */
  let fenceXZ = null;
  const cfgFence = config?.characterFenceBounds;
  if (
    cfgFence &&
    typeof cfgFence.minX === "number" &&
    typeof cfgFence.maxX === "number" &&
    typeof cfgFence.minZ === "number" &&
    typeof cfgFence.maxZ === "number"
  ) {
    fenceXZ = {
      minX: cfgFence.minX,
      maxX: cfgFence.maxX,
      minZ: cfgFence.minZ,
      maxZ: cfgFence.maxZ,
    };
  } else if (fenceSourceModel) {
    const fenceRoot = findFenceNamedObject(fenceSourceModel);
    if (fenceRoot) {
      fenceRoot.updateMatrixWorld(true);
      const fbox = new THREE.Box3().setFromObject(fenceRoot);
      fenceXZ = {
        minX: fbox.min.x,
        maxX: fbox.max.x,
        minZ: fbox.min.z,
        maxZ: fbox.max.z,
      };
      if (import.meta.env.DEV) {
        console.log(
          `[Stage2] 울타리 메쉬로 걸음 영역 축소: minX=${fenceXZ.minX.toFixed(2)}, maxX=${fenceXZ.maxX.toFixed(2)}, minZ=${fenceXZ.minZ.toFixed(2)}, maxZ=${fenceXZ.maxZ.toFixed(2)}`,
        );
      }
    }
  }
  if (!fenceXZ) return islandBounds;
  const inter = intersectXZBounds(islandBounds, fenceXZ);
  if (!inter) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Stage2] 섬과 울타리 XZ가 겹치지 않아 섬 경계만 사용합니다.",
      );
    }
    return islandBounds;
  }
  return inter;
}

/** 섬 메쉬 AABB 상단 = 지면에 가깝게 (lerp는 메쉬 내부로 파묻히기 쉬움) */
const ISLAND_GROUND_SURFACE_EPS = 0.06;

/**
 * 배경에서 XZ 걸음 영역 + 지면 Y 후보 (Walkable → island 이름 → 루트)
 * @returns {{
 *   usedWalkable: boolean,
 *   bounds: { minX: number, maxX: number, minZ: number, maxZ: number },
 *   suggestedGroundY: number,
 * }}
 */
function computeIslandBoundsFromModel(model) {
  model.updateMatrixWorld(true);
  const walkableObj = findChildByName(model, "Walkable");
  const islandObj = findIslandNamedObject(model);
  const boundsSource = walkableObj || islandObj;
  const groundSource = boundsSource || model;
  if (
    import.meta.env.DEV &&
    !walkableObj &&
    !islandObj &&
    boundsSource == null
  ) {
    console.warn(
      "[Stage2] 배경에 Walkable/Island 메쉬가 없어 섬 경계를 확정하지 못했습니다. collision.glb 또는 LEGACY 경계로 fallback 합니다.",
    );
  }
  groundSource.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(groundSource);

  const maxY = box.max.y;
  const suggestedGroundY = maxY + ISLAND_GROUND_SURFACE_EPS;

  if (!boundsSource) {
    return {
      usedWalkable: false,
      bounds: null,
      suggestedGroundY,
    };
  }

  const boundsBox = new THREE.Box3().setFromObject(boundsSource);

  if (walkableObj) {
    return {
      usedWalkable: true,
      bounds: {
        minX: boundsBox.min.x,
        maxX: boundsBox.max.x,
        minZ: boundsBox.min.z,
        maxZ: boundsBox.max.z,
      },
      suggestedGroundY,
    };
  }
  const w = boundsBox.max.x - boundsBox.min.x;
  const d = boundsBox.max.z - boundsBox.min.z;
  const inset = ISLAND_BOUNDS_INSET_RATIO;
  return {
    usedWalkable: false,
    bounds: {
      minX: boundsBox.min.x + w * inset,
      maxX: boundsBox.max.x - w * inset,
      minZ: boundsBox.min.z + d * inset,
      maxZ: boundsBox.max.z - d * inset,
    },
    suggestedGroundY,
  };
}

/**
 * boundsPadding 적용 후에도 min≤max·최소 폭이 되도록 바깥 박스를 확장한다.
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} raw
 */
function sanitizeWalkBoundsXZ(raw) {
  const ok = (n) => typeof n === "number" && Number.isFinite(n);
  if (
    !raw ||
    !ok(raw.minX) ||
    !ok(raw.maxX) ||
    !ok(raw.minZ) ||
    !ok(raw.maxZ)
  ) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Stage2] 걸음 XZ 경계가 유효하지 않음 — 기본 사각 영역(-10~10) 사용",
      );
    }
    return { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  }
  return raw;
}

function ensureWalkBoundsMinSpanForPadding(raw, padding) {
  const minSpan = 2 * padding + 1.0;
  let { minX, maxX, minZ, maxZ } = raw;
  if (maxX - minX < minSpan) {
    const c = (minX + maxX) * 0.5;
    minX = c - minSpan * 0.5;
    maxX = c + minSpan * 0.5;
  }
  if (maxZ - minZ < minSpan) {
    const c = (minZ + maxZ) * 0.5;
    minZ = c - minSpan * 0.5;
    maxZ = c + minSpan * 0.5;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * island.glb 기반 자동 계산 bounds가 너무 좁게 잡히는 경우(메쉬/스케일/원점 이슈 등),
 * 예전 수동 측정값(LEGACY_ISLAND_BOUNDS)으로 안전하게 fallback 한다.
 */
function getSafeIslandBounds(bounds) {
  if (!bounds) return LEGACY_ISLAND_BOUNDS;
  const { minX, maxX, minZ, maxZ } = bounds;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ) ||
    minX >= maxX ||
    minZ >= maxZ
  ) {
    return LEGACY_ISLAND_BOUNDS;
  }
  const w = maxX - minX;
  const d = maxZ - minZ;
  // 섬이 이보다 작게 잡히면 스폰 영역이 과도하게 좁아져 겹침이 급증하므로 fallback
  // 너무 큰 값도 대부분 "섬+바다 전체 박스"인 경우라 fallback.
  if (
    !Number.isFinite(w) ||
    !Number.isFinite(d) ||
    w < 6 ||
    d < 6 ||
    w > 120 ||
    d > 120
  ) {
    return LEGACY_ISLAND_BOUNDS;
  }
  return { minX, maxX, minZ, maxZ };
}

export function Stage2() {
  const config = STAGE2_CONFIG;

  const objects = [];
  const propRoots = [];
  let debugControls = null;
  let autonomousCharacters = null;
  /** @type {{ update: (delta: number) => void, cleanup: () => void } | null} */
  let gumSpeechBubbles = null;
  let realtimeSubscription = null;
  const fallingTexts = [];
  /** 초기 로드 + Realtime 공통 중복 방지 키 저장소 */
  const processedHandwritingKeys = new Set();
  /** cleanup 이후 stale 비동기 작업(loadInitial, ingest)이 scene에 추가되지 않도록 차단 */
  let isStage2Active = false;
  /** Realtime SVG 직렬 처리 큐 — 동시에 여러 SVG가 도착해도 한 번에 하나씩 처리 */
  const svgQueue = [];
  let svgQueueDraining = false;
  const drainSvgQueue = async () => {
    if (svgQueueDraining) return;
    svgQueueDraining = true;
    while (svgQueue.length > 0) {
      if (!isStage2Active) break;
      const fn = svgQueue.shift();
      await fn();
      if (svgQueue.length > 0)
        await new Promise((r) => setTimeout(r, STAGGER_MS));
    }
    svgQueueDraining = false;
  };
  let cameraRef = null;
  /** 섬 XZ 범위 — island.glb 로드 시 자동 계산됨 (검증: 예전 수치 fallback 없이 이 값만 사용) */
  let islandBounds = null;
  /** 섬 ∩ 울타리 — 자율 이동 캐릭터 클램프용 (필기 스폰은 islandBounds 유지) */
  let characterMoveBounds = null;
  /** 배경 바운딩 기준 껌 캐릭터 발 Y (island4_1 등 큰 섬에서도 지면 위에 서게 함) */
  let characterWalkGroundY = GROUND_Y;
  /** 오브제 통과 방지용 정적 충돌 박스 */
  let characterObstacleBoxes = [];
  /** SPAWN_ZONE 메쉬 기반 "이 XZ가 유효 이동/스폰 지점인가" 검증 함수 */
  let islandValidator = null;
  /** 로드 타임 레이캐스트로 미리 계산한 유효 스폰 지점 배열 (섬 실제 형태 반영) */
  let validSpawnGrid = null;
  /** GLB 내 SPAWN_ZONE 메쉬 — 글자 스폰 허용 영역을 디자이너가 직접 정의 */
  let spawnZoneMeshes = [];
  /** beam_gum_tent_scene.glb 애니메이션 믹서 (3개 클립 동시 무한 재생) */
  let fireMixer = null;

  function updateIslandBoundsFromRoots(roots) {
    if (!roots || roots.length === 0) {
      islandBounds = null;
      characterMoveBounds = null;
      return false;
    }
    // collision.glb가 여러 조각(여러 root)으로 로드되는 경우가 있어,
    // 첫 번째 root만 쓰면 "맨 위/왼쪽/오른쪽/아래" 일부만 잡혀 스폰 영역이 과도하게 좁아질 수 있다.
    // 따라서 전체 roots를 union(Box3) 해서 섬 전체 XZ 범위를 구한다.
    const box = new THREE.Box3();
    roots.forEach((r) => box.expandByObject(r));
    if (box.isEmpty()) return false;
    const minX = box.min.x;
    const maxX = box.max.x;
    const minZ = box.min.z;
    const maxZ = box.max.z;
    islandBounds = getSafeIslandBounds({ minX, maxX, minZ, maxZ });
    characterMoveBounds = computeCharacterMoveBounds(
      islandBounds,
      null,
      config,
    );
    return true;
  }

  return {
    camera: null,

    setup(scene, renderer) {
      isStage2Active = true;
      const canvas = renderer.domElement;
      const toDedupKey = (metadata) => {
        const rawUrl = metadata?.url != null ? String(metadata.url).trim() : "";
        if (rawUrl) {
          return `url:${rawUrl.split("?")[0]}`;
        }
        const rawId = metadata?.id != null ? String(metadata.id).trim() : "";
        if (rawId) return `id:${rawId}`;
        return null;
      };

      const ingestHandwriting = async (metadata, source) => {
        if (!isStage2Active) return;
        const key = toDedupKey(metadata);
        if (!key) {
          console.warn(
            `[Stage2] ${source} 스킵: dedupe key 생성 실패`,
            metadata,
          );
          return;
        }
        if (processedHandwritingKeys.has(key)) {
          console.log(`[Stage2] 중복 스킵 (${source}):`, key);
          return;
        }
        processedHandwritingKeys.add(key);
        if (!isStage2Active) return;
        await createFallingText(metadata, scene, this.camera, fallingTexts, {
          initial: false,
          groundY: characterWalkGroundY,
          validSpawnGrid,
        });
      };

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
          /** 고정 카메라: config.camera + lookAt, Orbit 비활성 */
          enableOrbit: false,
        },
      });

      const perfEnabled =
        typeof window !== "undefined" &&
        (window.STAGE2_PROFILE ||
          localStorage.getItem("STAGE2_PROFILE") === "1");
      const mark = (_label) => (perfEnabled ? window.performance.now() : 0);
      const logDuration = (label, start) => {
        if (!perfEnabled) return;
        const end = window.performance.now();

        console.log("[Stage2Perf]", label, "ms=", (end - start).toFixed(1));
      };

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
          config,
          scene,
          objects,
          (controller, characterModels) => {
            autonomousCharacters = controller;
            if (gumSpeechBubbles) {
              gumSpeechBubbles.cleanup();
              gumSpeechBubbles = null;
            }
            if (
              characterModels &&
              characterModels.length > 0 &&
              STAGE2_GUM_SPEECH_LINES.length > 0
            ) {
              gumSpeechBubbles = createStage2GumSpeechBubbles({
                camera: this.camera,
                renderer,
                models: characterModels,
                lines: STAGE2_GUM_SPEECH_LINES,
                options: {
                  minIntervalSec: 5,
                  maxIntervalSec: 6,
                  visibleSec: 2.2,
                },
              });
            }
          },
          characterMoveBounds ?? islandBounds,
          characterWalkGroundY,
          islandValidator,
          characterObstacleBoxes,
        );
        const tHandwritingStart = mark("loadInitialHandwritings:start");
        loadInitialHandwritings(
          scene,
          this.camera,
          fallingTexts,
          (metadata) => ingestHandwriting(metadata, "initial"),
          characterWalkGroundY,
        );
        logDuration("loadInitialHandwritings", tHandwritingStart);
      };

      const finishBackground = (allModels, islandModel) => {
        if (!isStage2Active) return;

        // SPAWN_ZONE 메쉬 수집 — applyModel에서 child.raycast = () => {} 로 비활성화되므로
        // THREE.Mesh.prototype.raycast.call(mesh, ...) 을 직접 사용해야 함.
        spawnZoneMeshes = [];
        allModels.forEach((m) =>
          m.traverse((child) => {
            if (!child.isMesh) return;
            if ((child.name || "").toLowerCase().includes("spawn_zone")) {
              child.visible = false;
              spawnZoneMeshes.push(child);
            }
          }),
        );
        const box = new THREE.Box3();
        allModels.forEach((m) => box.expandByObject(m));
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (debugControls) debugControls.setOrbitTarget(center);
        this.camera.far = Math.max(config.camera.far ?? 10000, maxDim * 10);
        this.camera.updateProjectionMatrix();

        let suggestedGroundY = GROUND_Y;
        if (!box.isEmpty()) {
          suggestedGroundY = box.max.y + ISLAND_GROUND_SURFACE_EPS;
        }

        if (islandModel) {
          const {
            usedWalkable,
            bounds,
            suggestedGroundY: sg,
          } = computeIslandBoundsFromModel(islandModel);
          islandBounds = bounds ? getSafeIslandBounds(bounds) : null;
          suggestedGroundY = sg;
          if (usedWalkable && islandBounds) {
            console.log(
              `📐 [Stage2] island.glb Walkable 사용 (디자이너 정의): minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          } else if (islandBounds) {
            console.log(
              `📐 [Stage2] island.glb Walkable 없음 → island 이름·루트 박스 + ${(ISLAND_BOUNDS_INSET_RATIO * 100).toFixed(0)}% inset: minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          } else {
            console.warn(
              "[Stage2] island.glb에서 Walkable/Island를 찾지 못해 collision.glb fallback 대기",
            );
          }
        } else if (allModels.length > 0) {
          const {
            usedWalkable,
            bounds,
            suggestedGroundY: sg,
          } = computeIslandBoundsFromModel(allModels[0]);
          islandBounds = bounds ? getSafeIslandBounds(bounds) : null;
          suggestedGroundY = sg;
          if (usedWalkable && islandBounds) {
            console.log(
              `📐 [Stage2] 배경 GLB Walkable 사용: minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          } else if (islandBounds) {
            console.log(
              `📐 [Stage2] 단일 배경 GLB → island 이름·XZ inset ${(ISLAND_BOUNDS_INSET_RATIO * 100).toFixed(0)}%: minX=${islandBounds.minX.toFixed(2)}, maxX=${islandBounds.maxX.toFixed(2)}, minZ=${islandBounds.minZ.toFixed(2)}, maxZ=${islandBounds.maxZ.toFixed(2)}`,
            );
          } else {
            console.warn(
              "[Stage2] 배경 GLB에서 Walkable/Island를 찾지 못해 collision.glb fallback 대기",
            );
          }
        }
        const backgroundBoundsSourceModel =
          islandModel ?? (allModels.length > 0 ? allModels[0] : null);
        if (islandBounds) {
          characterMoveBounds = computeCharacterMoveBounds(
            islandBounds,
            backgroundBoundsSourceModel,
            config,
          );
        } else {
          characterMoveBounds = null;
        }

        const ensureFinalIslandBounds = () => {
          // beam1.glb의 bounds를 그대로 유지 (propRoots는 사용하지 않음).
          // 배경 GLB 자체가 Walkable/island 메쉬로부터 정확한 섬 경계를 제공한다.
          if (!islandBounds) {
            islandBounds = LEGACY_ISLAND_BOUNDS;
            characterMoveBounds = computeCharacterMoveBounds(
              islandBounds,
              backgroundBoundsSourceModel,
              config,
            );
            console.warn(
              "[Stage2] 배경 GLB에서 섬 경계를 확정하지 못해 LEGACY_ISLAND_BOUNDS 사용",
            );
          }
        };

        {
          const cfgY = config.characterGroundY;
          characterWalkGroundY =
            typeof cfgY === "number" && Number.isFinite(cfgY)
              ? cfgY
              : suggestedGroundY;
        }
        // SPAWN_ZONE이 있으면 글자 스폰 + 캐릭터 이동 범위 모두 SPAWN_ZONE이 정의
        if (spawnZoneMeshes.length > 0) {
          const spawnBox = new THREE.Box3();
          spawnZoneMeshes.forEach((m) => spawnBox.expandByObject(m));
          const spawnBounds = {
            minX: spawnBox.min.x,
            maxX: spawnBox.max.x,
            minZ: spawnBox.min.z,
            maxZ: spawnBox.max.z,
          };
          characterMoveBounds = spawnBounds;
          islandValidator = buildSpawnZoneValidator(
            spawnZoneMeshes,
            characterWalkGroundY,
          );
          validSpawnGrid = buildValidSpawnGrid(
            spawnZoneMeshes,
            characterWalkGroundY,
            spawnBounds,
          );
        } else {
          console.error(
            "[Stage2] SPAWN_ZONE 메쉬 없음 — beam4.glb에 SPAWN_ZONE이 있어야 합니다.",
          );
        }
        const refreshCharacterObstacleBoxes = () => {
          characterObstacleBoxes = buildStage2CharacterObstacleBoxes(
            [...allModels, ...propRoots],
            box,
          );
        };

        if (config.props?.length) {
          const tPropsStart = mark("props:loadAll");
          loadPropsFromConfig(config.props, scene, objects, propRoots, () => {
            logDuration("props:loadAll", tPropsStart);
            debugControls.setDraggableObjects(propRoots);
            ensureFinalIslandBounds();
            refreshCharacterObstacleBoxes();
            onReady();
          });
        } else {
          ensureFinalIslandBounds();
          refreshCharacterObstacleBoxes();
          onReady();
        }
      };

      if (config.model.island || config.model.sea || config.model.sky) {
        const tBgStart = mark("background:loadAll");
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
        Promise.all(
          urls.map((url) =>
            loadGltfTemplateCached(resolvePublicAssetUrl(url)).then((gltf) =>
              gltf.scene.clone(true),
            ),
          ),
        )
          .then((gltfs) => {
            logDuration("background:loadAll", tBgStart);
            let islandModel = null;
            gltfs.forEach((model, i) => {
              applyModel(model);
              if (parts[i] === "island") islandModel = model;
            });
            finishBackground(gltfs, islandModel);
          })
          .catch((err) => console.error("❌ Stage2 배경 로드 에러:", err));
      } else {
        const tBgStart = mark("background:loadSingle");
        loadGltfTemplateCached(resolvePublicAssetUrl(config.model.path))
          .then((gltf) => {
            logDuration("background:loadSingle", tBgStart);
            const model = SkeletonUtils.clone(gltf.scene);
            applyModel(model);

            // 불꽃 메시 투명 처리 (셰이프 키 모프 타겟 기반)
            model.traverse((obj) => {
              if (!obj.isMesh) return;
              const n = obj.name ?? "";
              if (n.includes("Fire") || n.includes("fire")) {
                obj.material.transparent = true;
                obj.material.depthWrite = false;
                obj.material.alphaTest = 0.01;
              }
            });

            // 흔들그네 어셈블리 전체(캐릭터 포함) 70% 축소
            // SwingPivot의 부모를 루트로 삼아 통째로 스케일 — 이름과 무관한 자식(캐릭터 등)까지 포함
            /** @type {import("three").Object3D | null} */
            let swingAssemblyRoot = null;
            model.traverse((obj) => {
              if (swingAssemblyRoot !== null) return;
              if (obj.name === "SwingPivot") {
                swingAssemblyRoot =
                  obj.parent && obj.parent !== model ? obj.parent : obj;
              }
            });
            if (swingAssemblyRoot !== null) {
              swingAssemblyRoot.scale.multiplyScalar(0.7);
              console.log("[Stage2] swing 70% 축소:", swingAssemblyRoot.name);
            } else {
              console.warn(
                "[Stage2] SwingPivot을 찾을 수 없음 — GLB 오브젝트 이름 확인 필요",
              );
              // fallback: 씬 전체에서 Swing 포함 최상위 노드 스케일
              model.traverse((obj) => {
                if (!obj.name.includes("Swing")) return;
                if (obj.parent?.name?.includes("Swing")) return;
                obj.scale.multiplyScalar(0.7);
              });
            }

            // 전체 애니메이션 클립 무한 재생 (이름 필터 없이 전부)
            const clips = gltf.animations ?? [];
            console.log(
              "[Stage2] beam_animations:",
              clips.map((c) => c.name),
            );
            if (clips.length > 0) {
              fireMixer = new THREE.AnimationMixer(model);
              clips.forEach((clip) => {
                const action = fireMixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.clampWhenFinished = false;
                action.play();
              });
            } else {
              console.warn(
                "[Stage2] gum_tent_scene.glb에 애니메이션 클립 없음 — Blender export 확인 필요",
              );
            }

            finishBackground([model], null);
          })
          .catch((err) => console.error("❌ Stage2 배경 로드 에러:", err));
      }

      // Handwriting: 실시간 수신 (누적 로드는 GLB 로드 후 섬 땅 높이 적용 뒤 호출)
      realtimeSubscription = subscribeHandwritingRealtime({
        onNewHandwriting: (metadata) => {
          svgQueue.push(() => ingestHandwriting(metadata, "realtime"));
          void drainSvgQueue();
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
          const spawn = characterMoveBounds;
          if (!spawn) return;
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
            if (cameraRef) {
              setReadableRotationTowardCamera(ft.group, cameraRef, ft.groundY);
            } else {
              ft.group.rotation.set(0, 0, 0);
            }

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
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      if (autonomousCharacters) autonomousCharacters.update(delta);
      if (gumSpeechBubbles) gumSpeechBubbles.update(delta);
      if (fireMixer) fireMixer.update(delta);

      // 떨어지는 텍스트 애니메이션 업데이트
      updateFallingTexts(delta, cameraRef, fallingTexts);
    },

    cleanup(scene) {
      isStage2Active = false;
      svgQueue.length = 0;

      // Realtime 구독 해제
      if (realtimeSubscription) {
        realtimeSubscription.unsubscribe();
        realtimeSubscription = null;
      }

      // 떨어지는 텍스트 정리
      fallingTexts.forEach((fallingText) => {
        scene.remove(fallingText.group);
        disposeHandwritingSvgPlaneGroup(fallingText.group);
      });
      fallingTexts.length = 0;
      processedHandwritingKeys.clear();
      validSpawnGrid = null;

      if (gumSpeechBubbles) {
        gumSpeechBubbles.cleanup();
        gumSpeechBubbles = null;
      }
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
      islandBounds = null;
      characterMoveBounds = null;
      spawnZoneMeshes = [];
      if (fireMixer) {
        fireMixer.stopAllAction();
        fireMixer.uncacheRoot(fireMixer.getRoot());
        fireMixer = null;
      }
      characterObstacleBoxes = [];
      islandValidator = null;
    },
  };
}

/**
 * Stage2 모델 루트들에서 캐릭터 통과 불가 오브제 AABB를 수집한다.
 * Stage3 명명 규칙(INT_/OBJ_)을 우선 사용하고, 없으면 이름 기반 휴리스틱으로 fallback.
 * @param {THREE.Object3D[]} roots
 * @param {THREE.Box3} backgroundBounds
 * @returns {import("../utils/stages/stage3/islandStaticColliders.js").IslandColliderAabb[]}
 */
function buildStage2CharacterObstacleBoxes(roots, backgroundBounds) {
  if (!Array.isArray(roots) || roots.length === 0) return [];
  const preferred = [];
  roots.forEach((root) => {
    preferred.push(...collectIslandStaticColliderBoxes(root));
  });
  const filteredPreferred = filterCollidersExcludingDominantTerrain(
    preferred,
    backgroundBounds,
  );
  if (filteredPreferred.length > 0) return filteredPreferred;

  const skipWords = [
    "fence",
    "울타리",
    "walkable",
    "island",
    "sea",
    "sky",
    "water",
    "ground",
    "floor",
    "terrain",
    "collision",
  ];
  const fallback = [];
  const tmp = new THREE.Box3();
  roots.forEach((root) =>
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const lower = String(obj.name ?? "").toLowerCase();
      if (skipWords.some((w) => lower.includes(w))) return;
      tmp.setFromObject(obj);
      if (tmp.isEmpty()) return;
      fallback.push({
        minX: tmp.min.x,
        maxX: tmp.max.x,
        minZ: tmp.min.z,
        maxZ: tmp.max.z,
        minY: tmp.min.y,
        maxY: tmp.max.y,
      });
    }),
  );
  return filterCollidersExcludingDominantTerrain(fallback, backgroundBounds);
}

/**
 * 캐릭터 GLB 로드 후 자율 이동 컨트롤러 생성 (자유의지 랜덤 걷기, 걸을 때만 애니메이션)
 * @param {object} config - STAGE2_CONFIG
 * @param {import("three").Scene} scene
 * @param {import("three").Object3D[]} objects
 * @param {(controller: { update: function, cleanup: function } | null, characterModels: import("three").Object3D[]) => void} onControllerReady
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number } | null} [bounds] - 섬∩울타리 XZ (또는 characterWalkBounds)
 * @param {number} [walkGroundY] - 껌 캐릭터 발 Y (배경 상단 기준)
 * @param {((x: number, z: number) => boolean) | null} [islandValidator] - 울타리 내부 유효성 검사 함수
 * @param {import("../utils/stages/stage3/islandStaticColliders.js").IslandColliderAabb[]} [obstacleBoxes] - 통과 불가 오브제 AABB
 */
function loadCharacters(
  config,
  scene,
  objects,
  onControllerReady,
  bounds,
  walkGroundY = GROUND_Y,
  islandValidator = null,
  obstacleBoxes = [],
) {
  const characterPath =
    config.characterModelPath ?? "/models/common/gum_walk_final.glb";
  const characterIdlePath =
    config.characterIdleModelPath ?? "/models/common/gum_idle.glb";
  const characterPositions = config.characters ?? [
    { position: {} },
    { position: {} },
    { position: {} },
    { position: {} },
    { position: {} },
  ];

  const padding = 0.5;
  const rawWalkBounds = sanitizeWalkBoundsXZ(
    config.characterWalkBounds ??
      bounds ??
      (() => {
        console.warn(
          "[Stage2] island bounds 없음 — 배경·prop에서도 못 찾으면 임시 영역 사용.",
        );
        return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
      })(),
  );
  const walkBounds = ensureWalkBoundsMinSpanForPadding(rawWalkBounds, padding);

  const buildCharacters = (walkGltf, idleGltf = null) => {
    const source = walkGltf.scene;
    const idleSource = idleGltf?.scene ?? null;
    const count = characterPositions.length;
    const scale = config.characterScale ?? 1;
    const characterModels = [];
    const characterIdleModels = [];
    const minX = walkBounds.minX + padding;
    const maxX = walkBounds.maxX - padding;
    const minZ = walkBounds.minZ + padding;
    const maxZ = walkBounds.maxZ - padding;
    const yExtra = config.characterGroundYOffset ?? 0;
    const surfaceY = walkGroundY + yExtra;
    const scatter = config.scatterCharacters !== false;
    const minSep = Math.max(0, config.characterScatterMinDistance ?? 3.5);
    // Stage2 스폰 시 울타리 바로 옆에 붙지 않도록 내부 여유 반경을 둔다.
    const spawnFenceClearance = Math.max(
      padding * 1.8,
      config.characterSpawnFenceClearance ?? 1.2,
    );
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    /** @type {{ x: number, z: number }[]} */
    const scatterPlaced = [];
    const centerX = minX + spanX * 0.5;
    const centerZ = minZ + spanZ * 0.5;
    const fiveDirectionBaseRadius = Math.max(
      2.2,
      Math.min(spanX, spanZ) * 0.32,
    );
    const fiveDirectionDiagRadius = fiveDirectionBaseRadius * 0.86;

    function randomXZ() {
      return {
        x: minX + Math.random() * spanX,
        z: minZ + Math.random() * spanZ,
      };
    }
    function isInsideFence(x, z) {
      return typeof islandValidator === "function"
        ? islandValidator(x, z)
        : true;
    }
    function hasFenceClearance(x, z) {
      if (typeof islandValidator !== "function") return true;
      if (!isInsideFence(x, z)) return false;
      const r = spawnFenceClearance;
      const diag = r * 0.7071067811865476;
      return (
        islandValidator(x + r, z) &&
        islandValidator(x - r, z) &&
        islandValidator(x, z + r) &&
        islandValidator(x, z - r) &&
        islandValidator(x + diag, z + diag) &&
        islandValidator(x + diag, z - diag) &&
        islandValidator(x - diag, z + diag) &&
        islandValidator(x - diag, z - diag)
      );
    }
    function isBlockedByObstacle(x, z) {
      return obstacleBoxes.length > 0
        ? circleOverlapsAny(x, z, padding, obstacleBoxes)
        : false;
    }
    function resolveNearestValidSpawn(targetX, targetZ) {
      const clampedX = THREE.MathUtils.clamp(targetX, minX, maxX);
      const clampedZ = THREE.MathUtils.clamp(targetZ, minZ, maxZ);
      const isValid = (x, z) =>
        isInsideFence(x, z) && !isBlockedByObstacle(x, z);
      if (isValid(clampedX, clampedZ)) return { x: clampedX, z: clampedZ };

      const maxRadius = Math.max(spanX, spanZ);
      const ringStep = 0.6;
      const samplesPerRing = 24;
      for (let radius = ringStep; radius <= maxRadius; radius += ringStep) {
        for (let i = 0; i < samplesPerRing; i++) {
          const t = (i / samplesPerRing) * Math.PI * 2;
          const candX = THREE.MathUtils.clamp(
            clampedX + Math.cos(t) * radius,
            minX,
            maxX,
          );
          const candZ = THREE.MathUtils.clamp(
            clampedZ + Math.sin(t) * radius,
            minZ,
            maxZ,
          );
          if (isValid(candX, candZ)) return { x: candX, z: candZ };
        }
      }
      return { x: minX + spanX * 0.5, z: minZ + spanZ * 0.5 };
    }
    function getFiveDirectionTarget(index) {
      switch (index) {
        case 0:
          return { x: centerX, z: centerZ - fiveDirectionBaseRadius }; // 북
        case 1:
          return { x: centerX + fiveDirectionBaseRadius, z: centerZ }; // 동
        case 2:
          return { x: centerX, z: centerZ + fiveDirectionBaseRadius }; // 남
        case 3:
          return { x: centerX - fiveDirectionBaseRadius, z: centerZ }; // 서
        default:
          return {
            x: centerX + fiveDirectionDiagRadius,
            z: centerZ - fiveDirectionDiagRadius,
          }; // 북동
      }
    }

    function tooClose(x, z) {
      if (minSep <= 0 || scatterPlaced.length === 0) return false;
      const r2 = minSep * minSep;
      return scatterPlaced.some((p) => {
        const dx = p.x - x;
        const dz = p.z - z;
        return dx * dx + dz * dz < r2;
      });
    }

    for (let i = 0; i < count; i++) {
      const model = i === 0 ? source : SkeletonUtils.clone(source);
      model.scale.setScalar(scale);
      const idleModel = idleSource
        ? i === 0
          ? idleSource
          : SkeletonUtils.clone(idleSource)
        : null;
      if (idleModel) idleModel.scale.setScalar(scale);
      const pos = characterPositions[i]?.position ?? {};
      let x;
      let z;
      if (scatter && spanX > 1e-6 && spanZ > 1e-6) {
        let attempts = 0;
        x = minX + spanX * 0.5;
        z = minZ + spanZ * 0.5;
        do {
          const p = randomXZ();
          x = p.x;
          z = p.z;
          attempts++;
        } while (
          attempts < 220 &&
          (!hasFenceClearance(x, z) ||
            isBlockedByObstacle(x, z) ||
            tooClose(x, z))
        );
        if (!hasFenceClearance(x, z) || isBlockedByObstacle(x, z)) {
          // 난수 시도 실패 시 bounds 중앙을 시작점으로 사용하고 경계 검증에 맡긴다.
          x = minX + spanX * 0.5;
          z = minZ + spanZ * 0.5;
          if (!hasFenceClearance(x, z)) {
            // 중앙도 불안정하면 가장 안쪽 후보를 짧게 재탐색해 스폰 안정성을 높인다.
            let best = { x, z };
            let bestScore = -Infinity;
            for (let k = 0; k < 80; k++) {
              const p = randomXZ();
              if (!isInsideFence(p.x, p.z) || isBlockedByObstacle(p.x, p.z))
                continue;
              const score =
                (islandValidator?.(p.x + spawnFenceClearance, p.z) ? 1 : 0) +
                (islandValidator?.(p.x - spawnFenceClearance, p.z) ? 1 : 0) +
                (islandValidator?.(p.x, p.z + spawnFenceClearance) ? 1 : 0) +
                (islandValidator?.(p.x, p.z - spawnFenceClearance) ? 1 : 0);
              if (score > bestScore) {
                bestScore = score;
                best = p;
              }
              if (score >= 4) break;
            }
            x = best.x;
            z = best.z;
          }
        }
        scatterPlaced.push({ x, z });
      } else {
        const target = getFiveDirectionTarget(i);
        x = target.x;
        z = target.z;
        const resolved = resolveNearestValidSpawn(x, z);
        x = resolved.x;
        z = resolved.z;
      }
      if (pos.y != null && Number.isFinite(pos.y)) {
        model.position.set(x, pos.y, z);
        if (idleModel) idleModel.position.set(x, pos.y, z);
      } else {
        model.position.set(x, 0, z);
        model.updateMatrixWorld(true);
        const charBox = new THREE.Box3().setFromObject(model);
        model.position.y = surfaceY - charBox.min.y;
        if (idleModel) {
          idleModel.position.set(x, 0, z);
          idleModel.updateMatrixWorld(true);
          const idleBox = new THREE.Box3().setFromObject(idleModel);
          idleModel.position.y = surfaceY - idleBox.min.y;
        }
      }
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      objects.push(model);
      characterModels.push(model);
      scene.add(model);
      if (idleModel) {
        idleModel.visible = false;
        idleModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        objects.push(idleModel);
        characterIdleModels.push(idleModel);
        scene.add(idleModel);
      }
    }
    const rootYForWalk = characterModels[0]?.position.y ?? surfaceY;
    const walkClips = walkGltf.animations ?? [];
    const idleClips = idleGltf?.animations ?? [];
    const findClipByName = (regex) =>
      walkClips.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
    const findIdleClipByName = (regex) =>
      idleClips.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
    const walkClip =
      walkClips.length > 0
        ? (findClipByName(/walk|run|move/i) ?? walkClips[0] ?? null)
        : null;
    const runClip =
      walkClips.length > 0 ? (findClipByName(/run|sprint|jog/i) ?? null) : null;
    const idleClipFromIdleModel =
      idleClips.length > 0
        ? (findIdleClipByName(/idle|stand|wait|pose|breath|rest/i) ??
          idleClips[0] ??
          null)
        : null;
    const idleClipFromWalkModel =
      walkClips.length > 0
        ? (findClipByName(/idle|stand|wait|pose|breath|rest/i) ?? null)
        : null;
    const idleClip = idleClipFromIdleModel ?? idleClipFromWalkModel;
    if (walkClips.length === 0 && import.meta.env.DEV) {
      console.warn(
        "[Stage2] 캐릭터 GLB에 애니메이션 클립이 없습니다. 이동만 적용합니다.",
      );
    }
    // 타원 근사로 AABB 모서리 진입 방지 (레이캐스트 대신 O(1) 연산)
    const _ellipseCx = (walkBounds.minX + walkBounds.maxX) * 0.5;
    const _ellipseCz = (walkBounds.minZ + walkBounds.maxZ) * 0.5;
    const _ellipseRx = (walkBounds.maxX - walkBounds.minX) * 0.5 * 0.92;
    const _ellipseRz = (walkBounds.maxZ - walkBounds.minZ) * 0.5 * 0.92;
    const ellipseValidator = (x, z) => {
      const dx = (x - _ellipseCx) / _ellipseRx;
      const dz = (z - _ellipseCz) / _ellipseRz;
      return dx * dx + dz * dz <= 1.0;
    };

    const controller = createAutonomousCharacters({
      models: characterModels,
      idleModels: characterIdleModels,
      walkClip,
      idleClip,
      runClip,
      bounds: walkBounds,
      groundY: rootYForWalk,
      isPositionValid: ellipseValidator,
      staticColliderBoxes: obstacleBoxes,
      options: {
        moveSpeed: 0.8,
        boundsPadding: padding,
        collisionRadius: padding,
      },
    });
    onControllerReady(controller, characterModels);
    console.log(
      `✅ Stage2 캐릭터 ${count}명 로드 완료 (${scatter ? "초기 분산·" : ""}걸음 영역 안에서만 이동)`,
    );
  };

  const perfEnabled =
    typeof window !== "undefined" &&
    (window.STAGE2_PROFILE || localStorage.getItem("STAGE2_PROFILE") === "1");
  const mark = (_label) => (perfEnabled ? window.performance.now() : 0);
  const logDuration = (label, start) => {
    if (!perfEnabled) return;
    const end = window.performance.now();

    console.log("[Stage2Perf]", label, "ms=", (end - start).toFixed(1));
  };

  const tCharsStart = mark("characters:loadWalk+Idle");
  Promise.allSettled([
    loadGltfTemplateCached(resolvePublicAssetUrl(characterPath)),
    loadGltfTemplateCached(resolvePublicAssetUrl(characterIdlePath)),
  ])
    .then(([walkRes, idleRes]) => {
      if (walkRes.status !== "fulfilled") {
        console.error("❌ Stage2 캐릭터 로드 에러:", walkRes.reason);
        onControllerReady(null, []);
        return;
      }
      logDuration("characters:loadWalk+Idle", tCharsStart);
      const walkGltf = {
        ...walkRes.value,
        scene: SkeletonUtils.clone(walkRes.value.scene),
      };
      const idleGltf =
        idleRes.status === "fulfilled"
          ? {
              ...idleRes.value,
              scene: SkeletonUtils.clone(idleRes.value.scene),
            }
          : null;
      if (idleRes.status === "rejected") {
        console.warn(
          `[Stage2] idle GLB 로드 실패(${characterIdlePath}) — walk 모델 idle 클립으로 fallback`,
          idleRes.reason,
        );
      }
      buildCharacters(walkGltf, idleGltf);
    })
    .catch((err) => {
      console.error("❌ Stage2 캐릭터 로드 에러:", err);
      onControllerReady(null, []);
    });
}

/**
 * config.props 배열 기준으로 GLB 로드 후 scene에 추가
 * @param {import("../types.js").Stage2PropConfig[]} propsConfig
 * @param {import("three").Scene} scene
 * @param {import("three").Object3D[]} objects - dispose용
 * @param {import("three").Object3D[]} propRoots - 선택/드래그용
 * @param {() => void} onAllDone
 */
function loadPropsFromConfig(
  propsConfig,
  scene,
  objects,
  propRoots,
  onAllDone,
) {
  Promise.allSettled(
    propsConfig.map((propConfig) =>
      loadGltfTemplateCached(resolvePublicAssetUrl(propConfig.path)).then(
        (gltf) => ({ propConfig, gltf }),
      ),
    ),
  ).then((results) => {
    results.forEach((result) => {
      if (result.status !== "fulfilled") {
        console.error("❌ 오브제 로드 실패:", result.reason);
        return;
      }
      const { propConfig, gltf } = result.value;
      const root = gltf.scene.clone(true);
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
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(root);
      objects.push(root);
      propRoots.push(root);
      console.log(`✅ 오브제 로드: ${propConfig.path}`);
    });
    onAllDone();
  });
}

/**
 * 버킷/테이블에 있는 기존 SVG 전부 로드 후, 땅에 두지 않고 공중에서 순차 낙하 시작.
 * - 첫 프레임: 땅엔 아무것도 없음. 렌더 시작되자마자 첫 글자부터 낙하 애니메이션 시작.
 * - Realtime 인식 시에는 handwritingRealtime에서 createFallingText(initial: false) 호출.
 */
const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files"; // session_id, storage_path, created_at, client_id
const STAGGER_MS = 90; // 기본 간격 (동적 스케줄에서 기준값으로 사용)
const MAX_FALLING_TEXTS = 70; // 씬에 동시에 존재할 수 있는 SVG 평면 최대 수

// ------------------------------------------------------------
// 글씨 스케일 정규화 (Stage3 방식)
// - 입력 SVG 크기와 무관하게 "최종 월드 높이(Y)"를 목표치로 고정
// - 각 글자마다 randomFactor를 곱해 크기 편차 부여
// - 최대 크기 ≈ 3.0m (TARGET * RANDOM_MAX), 최소 ≈ 1.38m (TARGET * RANDOM_MIN)
// ------------------------------------------------------------
const LETTER_TARGET_HEIGHT = 2.3;
const LETTER_HEIGHT_RANDOM_MIN = 0.826; // 2.3 * 0.826 ≈ 1.9m
const LETTER_HEIGHT_RANDOM_MAX = 1.304; // 2.3 * 1.304 ≈ 3.0m

async function loadInitialHandwritings(
  scene,
  camera,
  fallingTextsArr,
  onMetadata,
  groundY = GROUND_Y,
) {
  if (!supabase) {
    console.warn("[Stage2] Supabase 없음, 누적 로드 스킵");
    return;
  }

  const sessionId = getSessionId();

  try {
    const tPathsStart =
      typeof window !== "undefined" &&
      (window.STAGE2_PROFILE || localStorage.getItem("STAGE2_PROFILE") === "1")
        ? window.performance.now()
        : 0;
    const [storageRes, tableRes] = await Promise.allSettled([
      listStoragePaths(sessionId),
      loadPathsFromTable(sessionId),
    ]);
    let pathsToLoad = [];
    if (storageRes.status === "fulfilled" && storageRes.value.length > 0) {
      pathsToLoad = storageRes.value;
    } else if (tableRes.status === "fulfilled" && tableRes.value.length > 0) {
      pathsToLoad = tableRes.value;
    }
    if (tPathsStart) {
      const end = window.performance.now();

      console.log(
        "[Stage2Perf]",
        "handwriting:list+table ms=",
        (end - tPathsStart).toFixed(1),
        "storageCount=",
        storageRes.status === "fulfilled" ? storageRes.value.length : -1,
        "tableCount=",
        tableRes.status === "fulfilled" ? tableRes.value.length : -1,
      );
    }
    if (pathsToLoad.length === 0) {
      console.log(
        "[Stage2] 누적 SVG 없음, 실시간만 수신. (list=0이면 Storage 정책에서 list 허용 또는 테이블 사용)",
      );
      return;
    }

    const count = pathsToLoad.length;
    console.log(
      `[Stage2] 누적 로드: ${sessionId} 에서 ${count}개 SVG → 공중에서 순차 낙하`,
    );

    const bucket = HANDWRITING_BUCKET;
    // SVG 수에 따라 전체 스폰 시간을 제한하는 동적 간격(ms)
    const totalTargetMs = 4000; // 누적 스폰을 대략 4초 안에 끝내기
    const dynamicStagger =
      count > 1 ? Math.min(STAGGER_MS, totalTargetMs / (count - 1)) : 0;

    for (let i = 0; i < pathsToLoad.length; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, dynamicStagger));
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

      if (typeof onMetadata === "function") {
        await onMetadata(metadata);
      } else {
        await createFallingText(metadata, scene, camera, fallingTextsArr, {
          initial: false,
          groundY,
        });
      }
    }
  } catch (err) {
    console.error("[Stage2] 누적 로드 중 오류:", err);
  }
}

/** Storage list로 경로 목록 얻기 (가능하면) */
async function listStoragePaths(sessionId) {
  const bucket = HANDWRITING_BUCKET;
  const paths = [];
  const folder = String(sessionId ?? "").replace(/\/$/, "");
  const { data: files, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 500 });

  console.log(
    "[Stage2] Storage list:",
    "path=",
    folder,
    "error=",
    error?.message ?? null,
    "items=",
    (files || []).length,
  );

  if (error) return paths;

  const svgFiles = (files || []).filter(
    (f) => f.name && String(f.name).toLowerCase().endsWith(".svg"),
  );
  const prefix = folder ? `${folder}/` : "";
  for (const f of svgFiles) {
    paths.push({
      path: prefix + f.name,
      id: f.name.replace(/\.svg$/i, ""),
      createdAt: f.created_at ?? null,
      clientId: "",
    });
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
 * 떨어지는 텍스트 생성 — 위치는 생성 시 한 번만 설정, 이후엔 position.y만 변경
 * (SVG plane: handwritingSvgPlane.js — 기능 제거 시 해당 모듈·import·호출부 일괄 제거)
 */

async function createFallingText(
  metadata,
  scene,
  camera,
  fallingTextsArr,
  options = {},
) {
  const {
    initial = false,
    groundY: optGroundY,
    validSpawnGrid: optValidSpawnGrid = null,
  } = options;
  const groundY =
    typeof optGroundY === "number" && Number.isFinite(optGroundY)
      ? optGroundY
      : GROUND_Y;

  // 씬 SVG 수 상한 — 착지된 것 중 가장 오래된 것부터 제거
  if (fallingTextsArr.length >= MAX_FALLING_TEXTS) {
    const oldestIdx = fallingTextsArr.findIndex((ft) => ft.landed);
    if (oldestIdx >= 0) {
      const old = fallingTextsArr.splice(oldestIdx, 1)[0];
      scene.remove(old.group);
      disposeHandwritingSvgPlaneGroup(old.group);
    } else {
      return; // 아직 낙하 중인 것만 있으면 이번 SVG 스킵
    }
  }

  try {
    // 50% 확률로 최솟값, 나머지 50%는 전체 범위 내 균일 랜덤
    const randomFactor =
      Math.random() < 0.5
        ? LETTER_HEIGHT_RANDOM_MIN
        : LETTER_HEIGHT_RANDOM_MIN +
          Math.random() * (LETTER_HEIGHT_RANDOM_MAX - LETTER_HEIGHT_RANDOM_MIN);
    const targetH = LETTER_TARGET_HEIGHT * randomFactor;

    const built = await createHandwritingSvgPlaneGroup(metadata.url, {
      targetWorldHeight: targetH,
    });
    if (!built) {
      console.warn("[Stage2] SVG plane 생성 실패:", metadata.id);
      return;
    }

    const { group, planeW, planeH } = built;
    group.updateMatrixWorld(true);

    // 낙하 중 X/Z 회전으로 코너가 중심보다 아래로 내려갈 수 있음.
    // 최악의 경우(코너가 완전히 아래를 향할 때) = 대각선 절반 = hypot(halfW, halfH).
    // 이 값을 landingY 기준으로 써야 회전 중 땅을 파고드는 현상이 사라진다.
    const preBox = new THREE.Box3().setFromObject(group);
    const halfH = Math.max(0, (preBox.max.y - preBox.min.y) / 2);
    const halfW = Math.max(0, (preBox.max.x - preBox.min.x) / 2);
    const landingY = groundY + Math.hypot(halfW, halfH);

    const { x: startX, z: startZ } = pickSpawnXZ(
      fallingTextsArr,
      planeW,
      planeH,
      optValidSpawnGrid,
    );
    const startY = initial
      ? landingY
      : landingY +
        SPAWN_HEIGHT_MIN +
        Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);

    // 착지 후 고정될 글자별 고유 방향 — 카메라 정면에서 좌우로 약간씩 틀어져 자유분방한 느낌
    const yawJitter = (Math.random() - 0.5) * THREE.MathUtils.degToRad(64); // ±32°
    const pitchJitter = 0; // 글자 자체를 앞뒤로 눕히지 않음 — 기울어지면 가독성 저하

    group.position.set(startX, startY, startZ);
    group.rotation.set(0, 0, 0);
    setReadableRotationTowardCamera(
      group,
      camera,
      landingY,
      yawJitter,
      pitchJitter,
    );

    const speedFactor = 0.25 + Math.random() * 0.75;
    const gravity = FALL_GRAVITY_MAX * speedFactor;
    const initialVy = (FALL_INITIAL_VY_MAX - Math.random() * 0.3) * speedFactor;
    const rotationVelocity = initial
      ? { x: 0, y: 0, z: 0 }
      : computeFallRotationVelocities(startY, landingY, initialVy, gravity);

    scene.add(group);

    const fallingText = {
      group,
      radius: Math.hypot(planeW / 2, planeH / 2), // XZ 바운딩 원 반경 (겹침 계산용)
      velocity: {
        y: initial ? 0 : initialVy,
        rotationX: rotationVelocity.x,
        rotationY: rotationVelocity.y,
        rotationZ: rotationVelocity.z,
      },
      gravity,
      groundY: landingY,
      baseGroundY: groundY, // 섬 지면 실제 Y (landing 후 위치 보정용)
      bounces: 0,
      landed: initial,
      yawJitter,
      pitchJitter,
    };

    fallingTextsArr.push(fallingText);

    console.log(
      `[Stage2] ${initial ? "\ub204\uc801" : "Realtime"} SVG \u2192 ${metadata.id}, \uc704\uce58 (${startX.toFixed(2)}, ${startY.toFixed(2)}, ${startZ.toFixed(2)})`,
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

  // 탭 비활성화 / rAF 지연으로 delta가 비정상적으로 커지면
  // 바운스 직후 양(+)의 velocity.y 상태에서 position.y가 수백m 튀어오르는
  // "승천" 버그 발생. 물리 안정성을 위해 상한을 둔다.
  const d = Math.min(delta, 0.05);

  for (let i = 0; i < fallingTextsArr.length; i++) {
    const ft = fallingTextsArr[i];
    if (ft.landed) continue;

    const { group, velocity, gravity, groundY } = ft;
    const nextY = group.position.y + velocity.y * d;

    if (nextY <= groundY) {
      // Stage3처럼 첫 충돌 시 한 번만 가볍게 바운스해서 "통통" 무게감 표현
      if ((ft.bounces ?? 0) < LETTER_MAX_BOUNCES && Math.abs(velocity.y) > 2) {
        // X/Z 회전을 초기화하고 실제 바닥 Y 기준으로 위치 보정
        group.rotation.set(0, group.rotation.y, 0);
        const baseY = ft.baseGroundY ?? GROUND_Y;
        group.position.y = baseY;
        group.updateMatrixWorld(true);
        const bounceBox = new THREE.Box3().setFromObject(group);
        const bounceHalfH = (bounceBox.max.y - bounceBox.min.y) / 2;
        group.position.y = baseY + bounceHalfH; // bottom이 baseY에 닿도록
        ft.groundY = baseY + bounceHalfH; // 이후 재착지 기준 갱신 (Y회전만 남으므로 halfH면 충분)

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

      velocity.y = 0;
      velocity.rotationX = 0;
      velocity.rotationY = 0;
      velocity.rotationZ = 0;
      // 회전 초기화 후 카메라 방향으로 정렬, 그 다음 실제 바닥 Y 기준으로 보정
      group.rotation.set(0, 0, 0);
      const baseY = ft.baseGroundY ?? GROUND_Y;
      group.position.y = baseY;
      setReadableRotationTowardCamera(
        group,
        camera,
        baseY,
        ft.yawJitter ?? 0,
        ft.pitchJitter ?? 0,
      );
      group.updateMatrixWorld(true);
      const landedBox = new THREE.Box3().setFromObject(group);
      group.position.y += baseY - landedBox.min.y; // bottom이 baseY에 닿도록
      ft.landed = true;
      continue;
    }

    velocity.y += gravity * d;
    group.position.y = nextY;

    group.rotation.x += velocity.rotationX * d;
    group.rotation.y += velocity.rotationY * d;
    group.rotation.z += velocity.rotationZ * d;
  }
}

/**
 * 착지·낙하 공통: 글자 평면이 지면에 완전 수직이면 위에서 내려다보는 카메라에 각도가 세서
 * 가독성이 떨어진다. 수평 yaw로 카메라 쪽을 본 뒤, 시선의 고도에 맞춰 약간 눕혀(피치)
 * 평면이 시선에 가깝게 정면을 향하도록 한다.
 */
function setReadableRotationTowardCamera(
  group,
  camera,
  _groundY,
  yawJitter = 0,
  pitchJitter = 0,
) {
  const toCam = new THREE.Vector3(
    camera.position.x - group.position.x,
    camera.position.y - group.position.y,
    camera.position.z - group.position.z,
  );
  const horizLen = Math.hypot(toCam.x, toCam.z);
  if (horizLen < 1e-6 && Math.abs(toCam.y) < 1e-6) return;
  toCam.normalize();

  const yaw = Math.atan2(toCam.x, toCam.z) + yawJitter;
  const elev = Math.atan2(toCam.y, Math.max(1e-6, horizLen));
  const tilt = THREE.MathUtils.clamp(
    elev * LETTER_CAMERA_TILT_FACTOR + pitchJitter,
    -LETTER_MAX_TILT_RAD,
    LETTER_MAX_TILT_RAD,
  );

  // SVG → readable face +Z. 먼저 Y로 수평 정렬 후, 그 로컬 +X 축(월드에서 (cos y, 0, -sin y))으로 피치.
  const qYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );
  const pitchAxis = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const qPitch = new THREE.Quaternion().setFromAxisAngle(pitchAxis, tilt);
  group.quaternion.copy(qPitch).multiply(qYaw);
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

  const signX = Math.random() < 0.5 ? -1 : 1;
  const turnsX = Math.random() * 0.5; // 0~0.5 바퀴 (앞뒤 텀블)

  return {
    x: (signX * 2 * Math.PI * turnsX) / T,
    y: (sign * 2 * Math.PI * turnsY) / T,
    z: 0, // 좌우 roll 없음 — 땅에 박히는 느낌 방지
  };
}

/**
 * SPAWN_ZONE 메쉬 기반 이동 범위 검증기 — 아래로 레이를 쏴서 SPAWN_ZONE 위면 유효.
 * applyModel이 child.raycast를 비활성화하므로 prototype 직접 호출.
 * @param {THREE.Mesh[]} spawnZoneMeshes
 * @param {number} groundY
 * @returns {((x: number, z: number) => boolean) | null}
 */
function buildSpawnZoneValidator(spawnZoneMeshes, groundY) {
  if (!spawnZoneMeshes || spawnZoneMeshes.length === 0) return null;
  const meshRaycast = THREE.Mesh.prototype.raycast;
  const rc = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  return (x, z) => {
    origin.set(x, groundY + 100, z);
    rc.set(origin, down);
    const ints = [];
    for (const m of spawnZoneMeshes) meshRaycast.call(m, rc, ints);
    return ints.length > 0;
  };
}

/**
 * 섬 지면 메쉬 위 유효 스폰 지점을 로드 타임에 레이캐스트로 미리 계산한다.
 * SPAWN_ZONE 메쉬와 bbox를 넘긴다.
 * @param {THREE.Mesh[]} groundMeshes 레이캐스트 대상 메쉬
 * @param {number} groundY
 * @param {{ minX, maxX, minZ, maxZ }} bounds 탐색 범위
 * @param {number} [step=1.0] 그리드 간격(m)
 */
function buildValidSpawnGrid(groundMeshes, groundY, bounds, step = 1.0) {
  if (!groundMeshes || groundMeshes.length === 0) return null;
  const b = getSafeIslandBounds(bounds);
  const meshRaycast = THREE.Mesh.prototype.raycast;
  const rcDown = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const Y_FLOOR = groundY - 1.0;
  const { minX, maxX, minZ, maxZ } = b;
  const points = [];
  for (let x = minX; x <= maxX; x += step) {
    for (let z = minZ; z <= maxZ; z += step) {
      origin.set(x, groundY + 100, z);
      rcDown.set(origin, down);
      const ints = [];
      for (const m of groundMeshes) meshRaycast.call(m, rcDown, ints);
      if (ints.length === 0) continue;
      ints.sort((a, bv) => a.distance - bv.distance);
      if (ints[0].point.y < Y_FLOOR) continue;
      points.push({ x, z });
    }
  }
  if (import.meta.env.DEV) {
    console.log(
      `[Stage2] validSpawnGrid: ${points.length}개 유효 지점 (step=${step}m)`,
    );
  }
  return points.length > 0 ? points : null;
}

function pickSpawnXZ(
  fallingTextsArr,
  letterWidth = 0,
  letterHeight = 0,
  validSpawnGrid = null,
) {
  const newR = Math.hypot(letterWidth / 2, letterHeight / 2);
  const allTexts = fallingTextsArr || [];

  // 바운딩 원 기반 간격: dist - r_new - r_existing = 실제 가장자리 간격 (양수=떨어짐, 음수=겹침)
  const edgeGap = (x, z) => {
    if (allTexts.length === 0) return Infinity;
    let minGap = Infinity;
    for (const f of allTexts) {
      const dx = f.group.position.x - x;
      const dz = f.group.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const fR = typeof f.radius === "number" ? f.radius : 0;
      minGap = Math.min(minGap, dist - newR - fR);
    }
    return minGap;
  };

  // 카메라가 +X 방향에서 바라보므로 X = 심도(depth) 축.
  // Z가 충분히 가까운 글자끼리만 X 최소 간격을 강제 — Z가 멀면 겹쳐 보이지 않으므로 skip.
  const depthGapOk = (x, z, minXGap) => {
    for (const f of allTexts) {
      const fR = typeof f.radius === "number" ? f.radius : 0;
      const zDist = Math.abs(f.group.position.z - z);
      if (zDist > newR + fR + 3.0) continue; // Z 멀면 카메라상 겹침 없음
      if (Math.abs(f.group.position.x - x) < newR + fR + minXGap) return false;
    }
    return true;
  };

  if (!validSpawnGrid || validSpawnGrid.length === 0) {
    console.error("[Stage2] validSpawnGrid 없음 — SPAWN_ZONE 메쉬 필요");
    return { x: 0, z: 0 };
  }

  const randomGap = 1.8 + Math.random() * 1.2;
  const gapLevels = [randomGap, 1.2, 0.6, 0.0];
  const depthGaps = [2.0, 1.5, 0.0, 0.0]; // gap이 0.6 이하로 떨어지면 depth 체크 포기
  const grid = validSpawnGrid;
  const N = grid.length;
  for (let li = 0; li < gapLevels.length; li++) {
    const minGap = gapLevels[li];
    const minDepth = depthGaps[li];
    for (let t = 0; t < N; t++) {
      const idx = t + Math.floor(Math.random() * (N - t));
      const tmp = grid[t];
      grid[t] = grid[idx];
      grid[idx] = tmp;
      const { x, z } = grid[t];
      if (edgeGap(x, z) >= minGap && depthGapOk(x, z, minDepth))
        return { x, z };
    }
  }
  let best = grid[0];
  let bestGap = edgeGap(grid[0].x, grid[0].z);
  for (let i = 1; i < N; i++) {
    const g = edgeGap(grid[i].x, grid[i].z);
    if (g > bestGap) {
      bestGap = g;
      best = grid[i];
    }
  }
  return best;
}
