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
import { loadSVGShapes } from "../lib/svg-loader.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

// Phase 2: 고민 텍스트가 섬 위에 떨어져 쌓이는 기준
/** 섬 전체 XZ 범위 (위·아래·왼쪽·오른쪽 모서리 collision 기준) — 이 안에서만 스폰 */
const ISLAND_BOUNDS = {
  minX: -8.06,
  maxX: 7.94,
  minZ: -3.21,
  maxZ: 6.89,
};
const GROUND_Y = 0.7;
/** 글자끼리 최소 거리(m). 이 값보다 가깝게 스폰되지 않음. */
const MIN_DISTANCE_BETWEEN = 5.2;
const SPAWN_INSET_RATIO = 0.15; // 위·앞 15% 안쪽
const SPAWN_INSET_SIDE_RATIO = 0.28; // 왼쪽·오른쪽 여유 더 줌 (튀어나오지 않게)
const SPAWN_INSET_BOTTOM_RATIO = 0.45; // 아래(세모 부분)는 더 많이 빼서 중간·위 위주로 스폰
const SPAWN_HEIGHT_MIN = 3; // 낙하 시작 높이 하한 (빨리 보이게)
const SPAWN_HEIGHT_MAX = 14; // 최대 시작 높이 (너무 높으면 오래 걸림)
// 속도: 아래 값이 맥시멈. 실제는 speedFactor(0.25~1.0) 곱해서 더 느리게 랜덤 적용
const FALL_GRAVITY_MAX = -22 * 0.15;
const FALL_INITIAL_VY_MAX = -6 * 0.15;
const TUMBLE_SPEED = 1.4;

export function Stage2() {
  const config = STAGE2_CONFIG;
  const glbLoader = getGLBLoader();

  const objects = [];
  const propRoots = [];
  let debugControls = null;
  let autonomousCharacters = null;
  let realtimeSubscription = null;
  const fallingTexts = [];
  let _sceneRef = null;
  let cameraRef = null;
  /** 섬(collision) XZ 범위 (로깅용). 스폰은 ISLAND_BOUNDS 사용 */
  let islandBounds = null;

  function updateIslandBoundsFromRoots(roots) {
    if (!roots || roots.length === 0) {
      islandBounds = null;
      return;
    }
    const root = roots[0];
    const box = new THREE.Box3().setFromObject(root);
    const minX = box.min.x;
    const maxX = box.max.x;
    const minZ = box.min.z;
    const maxZ = box.max.z;
    islandBounds = { minX, maxX, minZ, maxZ };
    const p = root.position;
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
      _sceneRef = scene;

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

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          // 카메라 고정 모드(config.camera.lookAt 있음): 위치/타깃 덮어쓰지 않음
          // lookAt이 없으면 OrbitControls 활성화되므로 초기 위치 유지 (배경 로드 시 덮어쓰지 않음)
          if (!config.camera.lookAt) {
            // OrbitControls 활성화 상태에서는 초기 config 위치 유지
            // 필요시 Orbit 타깃만 모델 중심으로 설정
            debugControls.setOrbitTarget(center);
          }
          this.camera.far = Math.max(config.camera.far ?? 10000, maxDim * 10);
          this.camera.updateProjectionMatrix();

          model.traverse((child) => {
            if (child.isMesh) {
              if (child.material) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
              child.raycast = () => {};
            }
          });

          objects.push(model);
          scene.add(model);

          // 오브제(collision 등) 로드 후 범위 갱신 → 캐릭터 로드 → 누적 SVG 로드
          const onReady = () => {
            loadCharacters(glbLoader, config, scene, objects, (controller) => {
              autonomousCharacters = controller;
            });
            loadInitialHandwritings(
              scene,
              this.camera,
              fallingTexts,
              () => islandBounds,
            );
          };

          if (config.props?.length) {
            loadPropsFromConfig(
              glbLoader,
              config.props,
              scene,
              objects,
              propRoots,
              () => {
                debugControls.setDraggableObjects(propRoots);
                updateIslandBoundsFromRoots(propRoots);
                onReady();
              },
            );
          } else {
            onReady();
          }
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage2 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage2 배경 로드 에러:", err),
      });

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
          console.log("[Stage2] 0키: 재낙하");
          const spawn = getSpawnBounds();
          const { minX, maxX, minZ, maxZ } = spawn;
          fallingTexts.forEach((ft) => {
            const speedFactor = 0.25 + Math.random() * 0.75; // 0.25~1.0 (현재=맥시멈)
            ft.group.position.y =
              GROUND_Y +
              SPAWN_HEIGHT_MIN +
              Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);
            ft.group.position.x = minX + Math.random() * (maxX - minX);
            ft.group.position.z = minZ + Math.random() * (maxZ - minZ);
            ft.velocity.y =
              (FALL_INITIAL_VY_MAX - Math.random() * 0.3) * speedFactor;
            ft.velocity.rotationX = (Math.random() - 0.5) * TUMBLE_SPEED;
            ft.velocity.rotationY = (Math.random() - 0.5) * TUMBLE_SPEED;
            ft.velocity.rotationZ = (Math.random() - 0.5) * TUMBLE_SPEED;
            ft.gravity = FALL_GRAVITY_MAX * speedFactor;
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
      _sceneRef = null;
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
 */
function loadCharacters(loader, config, scene, objects, onControllerReady) {
  const characterPath =
    config.characterModelPath ?? "/models/common/user_walking2.glb";
  const characterPositions = config.characters ?? [
    { position: { x: -4, y: 0.7, z: 1 } },
    { position: { x: -2, y: 0.7, z: 2 } },
    { position: { x: 0, y: 0.7, z: 2 } },
    { position: { x: 2, y: 0.7, z: 2 } },
    { position: { x: 4, y: 0.7, z: 1 } },
  ];

  loader.load(characterPath, {
    onLoad: (gltf) => {
      const source = gltf.scene;
      const count = characterPositions.length;
      const scale = config.characterScale ?? 1;
      const characterModels = [];
      for (let i = 0; i < count; i++) {
        const model = i === 0 ? source : SkeletonUtils.clone(source);
        model.scale.setScalar(scale);
        const pos = characterPositions[i]?.position ?? {};
        model.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
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
          bounds: ISLAND_BOUNDS,
          groundY: GROUND_Y,
          options: { moveSpeed: 0.8, boundsPadding: 0.5 },
        });
      }
      onControllerReady(controller);
      console.log(`✅ Stage2 캐릭터 ${count}명 로드 완료`);
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
    const shapes = await loadSVGShapes(metadata.url);
    if (shapes.length === 0) {
      console.warn("[Stage2] No shapes found in SVG:", metadata.id);
      return;
    }

    const group = new THREE.Group();
    const scale = 0.006 * 0.75; // 현재 대비 75% 크기
    const extrudeSettings = {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 8,
    };

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
      mesh.scale.set(scale, scale, 1);
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
    group.rotation.set(-Math.PI / 2, 0, 0);

    if (initial) {
      setReadableRotationTowardCamera(group, camera, GROUND_Y);
    }

    const speedFactor = 0.25 + Math.random() * 0.75;
    const gravity = FALL_GRAVITY_MAX * speedFactor;
    const initialVy = (FALL_INITIAL_VY_MAX - Math.random() * 0.3) * speedFactor;

    scene.add(group);

    const fallingText = {
      group,
      velocity: {
        y: initial ? 0 : initialVy,
        rotationX: initial ? 0 : (Math.random() - 0.5) * TUMBLE_SPEED,
        rotationY: initial ? 0 : (Math.random() - 0.5) * TUMBLE_SPEED,
        rotationZ: initial ? 0 : (Math.random() - 0.5) * TUMBLE_SPEED,
      },
      gravity,
      groundY: GROUND_Y,
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
 * 착지/누적 시: 읽는 면이 카메라 쪽을 보게 한 뒤, 위에서 내려다보는 각도로 고정 기울임.
 * TILT_DEGREES: 글자 면을 뒤로 기울이는 각도(도). 클수록 더 위에서 보는 느낌.
 */
const TILT_DEGREES = 32;

function setReadableRotationTowardCamera(group, camera, groundY) {
  const dir = new THREE.Vector3(
    camera.position.x - group.position.x,
    camera.position.y - groundY,
    camera.position.z - group.position.z,
  );
  const len = dir.length();
  if (len < 1e-6) return;
  dir.normalize();

  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  // 로컬 X축 기준으로 뒤로 기울이기 → 위에서 내려다보는 각도
  group.rotateX(-(TILT_DEGREES * Math.PI) / 180);
}

/**
 * 스폰용 XZ 범위: 중간·위쪽 위주. 아래(세모 부분)는 여유 있게 빼서 덜 떨어뜨림
 */
function getSpawnBounds() {
  const b = ISLAND_BOUNDS;
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
  const spawn = getSpawnBounds();
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

  for (let tryCount = 0; tryCount < 120; tryCount++) {
    const x = minX + Math.random() * (maxX - minX);
    const z = minZ + Math.random() * (maxZ - minZ);
    if (minDist(x, z) >= MIN_DISTANCE_BETWEEN) return { x, z };
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
