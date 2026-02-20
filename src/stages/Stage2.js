/**
 * Stage2: 배경 GLB + 오브제(GLB) 로드, 디버그 컨트롤로 카메라/오브제 조정
 * - 로드: assetLoaders (GLB)
 * - 입력/디버그: stageDebugControls (Orbit, Transform, Drag, C/G/S)
 * - Handwriting: Supabase Realtime으로 필기 데이터 수신 후 3D로 떨어지는 애니메이션
 * @returns {import("../types.js").StageInstance}
 */

import * as THREE from "three";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE2_CONFIG } from "../config/stages/stage2.js";
import { subscribeHandwritingRealtime } from "../utils/handwriting/handwritingRealtime.js";
import { loadSVGShapes } from "../lib/svg-loader.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";

// Phase 2: 고민 텍스트가 섬(collision.glb) 위에 떨어져 쌓이는 기준
const ISLAND_CENTER = { x: 0, y: 0, z: 0 }; // collision.glb position
const GROUND_Y = 3; // 땅 높이 (y=3.00에서 멈춤)
const SPAWN_RADIUS = 4; // 섬 위 수평 범위 (x,z)
const SPAWN_HEIGHT_ABOVE_GROUND = 50; // 더 높은 곳에서 떨어뜨림 (느리게 보이도록)
const FALL_GRAVITY = -45; // 느리게 떨어짐 (보는 맛)
const FALL_INITIAL_VY = -15; // 초기 낙하 속도 (느리게)

export function Stage2() {
  const config = STAGE2_CONFIG;
  const glbLoader = getGLBLoader();

  const objects = [];
  const propRoots = [];
  let debugControls = null;
  let realtimeSubscription = null;
  const fallingTexts = []; // 떨어지는 텍스트 메시들
  let _sceneRef = null;
  let cameraRef = null;

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
              child.raycast = () => {}; // 배경은 클릭 제외
            }
          });
          objects.push(model);
          scene.add(model);

          // 오브제 로드
          if (config.props?.length) {
            loadPropsFromConfig(
              glbLoader,
              config.props,
              scene,
              objects,
              propRoots,
              () => {
                debugControls.setDraggableObjects(propRoots);
              },
            );
          }

          // 떨어지는 글자는 Supabase Realtime으로만 생성됨 (new_handwriting 수신 시)
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

      // Handwriting: (1) 누적 로드 = 버킷에 있는 기존 SVG 전부 띄우기
      loadInitialHandwritings(scene, this.camera, fallingTexts);

      // Handwriting: (2) 실시간 수신 (태블릿 → Edge Function → broadcast)
      realtimeSubscription = subscribeHandwritingRealtime({
        onNewHandwriting: (metadata) => {
          console.log(
            "[Stage2] Realtime 수신 → falling text 생성:",
            metadata.id,
            metadata.url,
          );
          createFallingText(metadata, scene, this.camera, fallingTexts, {
            initial: false,
          });
        },
        onError: (error) => {
          console.error("[Stage2] Handwriting realtime error:", error);
        },
      });

      // 키보드 0키: 애니메이션 재시작 (디버깅용)
      const handleKeyDown = (event) => {
        if (event.key === "0" || event.code === "Digit0") {
          console.log("[Stage2] 0키: 애니메이션 재시작");
          // 모든 떨어지는 텍스트를 다시 위로 올리고 떨어뜨리기
          fallingTexts.forEach((ft) => {
            ft.group.position.y =
              GROUND_Y + SPAWN_HEIGHT_ABOVE_GROUND + Math.random() * 15;
            ft.velocity.y = FALL_INITIAL_VY - Math.random() * 10;
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
 * 버킷에 있는 기존 SVG 전부 누적 로드 (진입 시 한 번)
 * 1) Storage list(sessionId) 시도 → 2) 실패/0개면 테이블 handwriting_files 에서 경로 조회
 * (Public 버킷이라도 list 권한이 없으면 0개 나올 수 있음 → 테이블 fallback)
 */
const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files"; // session_id, storage_path, created_at, client_id

async function loadInitialHandwritings(scene, camera, fallingTextsArr) {
  if (!supabase) {
    console.warn("[Stage2] Supabase 없음, 누적 로드 스킵");
    return;
  }

  const sessionId = getSessionId();

  try {
    // 1) Storage list 시도 (exhibition-2026, 그 다음 exhibition-2026/)
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
      `[Stage2] 누적 로드: ${sessionId} 에서 ${pathsToLoad.length}개 SVG`,
    );

    const bucket = HANDWRITING_BUCKET;
    for (const { path, id, createdAt, clientId } of pathsToLoad) {
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

      await createFallingText(metadata, scene, camera, fallingTextsArr, {
        initial: true,
      });
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

    if (!rows || rows.length === 0) return [];

    console.log(
      "[Stage2] 테이블에서 경로 로드:",
      HANDWRITING_TABLE,
      rows.length,
      "개",
    );

    return rows.map((r) => ({
      path: r.storage_path || r.storagePath || "",
      id: (r.storage_path || r.storagePath || "").replace(/\.svg$/i, ""),
      createdAt: r.created_at ?? r.createdAt ?? null,
      clientId: r.client_id ?? r.clientId ?? "",
    }));
  } catch (e) {
    console.log("[Stage2] 테이블 조회 예외:", e);
    return [];
  }
}

/**
 * 떨어지는 텍스트 생성 (Supabase Realtime 또는 누적 로드)
 * @param {Object} metadata - Handwriting 메타데이터 { id, url, createdAt, clientId }
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @param {Array} fallingTextsArr - 떨어지는 텍스트 배열 (push 대상)
 * @param {{ initial?: boolean }} [options] - initial: true면 바닥에 바로 배치(누적)
 */
async function createFallingText(
  metadata,
  scene,
  camera,
  fallingTextsArr,
  options = {},
) {
  const { initial = false } = options;

  try {
    const shapes = await loadSVGShapes(metadata.url);
    if (shapes.length === 0) {
      console.warn("[Stage2] No shapes found in SVG:", metadata.id);
      return;
    }

    const group = new THREE.Group();
    const scale = 0.006; // 크기 키움 (0.002 → 0.006)
    // 둥글둥글한 3D 글자, 입체감 적게
    const extrudeSettings = {
      depth: 0.05, // 얇게 (입체감 적게)
      bevelEnabled: true,
      bevelThickness: 0.03, // 둥글게
      bevelSize: 0.02, // 둥글게
      bevelSegments: 8, // 둥글게 (2 → 8)
    };

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

      // 위에서 볼 때 읽히도록: SVG는 보통 y축 아래로 그려지므로 -scale로 반전, z축은 그대로
      mesh.scale.set(scale, -scale, 1);

      group.add(mesh);
    });

    const startX = ISLAND_CENTER.x + (Math.random() - 0.5) * 2 * SPAWN_RADIUS;
    const startZ = ISLAND_CENTER.z + (Math.random() - 0.5) * 2 * SPAWN_RADIUS;
    const startY = initial
      ? GROUND_Y
      : GROUND_Y + SPAWN_HEIGHT_ABOVE_GROUND + Math.random() * 15;

    group.position.set(startX, startY, startZ);

    // rotation 없이 똑바로 (위에서 볼 때 읽히도록)
    group.rotation.set(0, 0, 0);

    scene.add(group);

    const fallingText = {
      group,
      velocity: {
        y: initial ? 0 : FALL_INITIAL_VY - Math.random() * 10,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      },
      gravity: FALL_GRAVITY,
      groundY: GROUND_Y,
      landed: initial,
      createdAt: Date.now(),
    };

    fallingTextsArr.push(fallingText);

    console.log(
      `[Stage2] ${initial ? "누적" : "Realtime"} SVG → falling text: ${metadata.id} (${shapes.length} shapes), 위치 (${startX.toFixed(1)}, ${startY.toFixed(1)}, ${startZ.toFixed(1)})`,
    );
  } catch (error) {
    console.error(
      `[Stage2] Failed to create falling text for ${metadata.id}:`,
      error,
    );
  }
}

/**
 * 떨어지는 텍스트 애니메이션 업데이트
 * @param {number} delta - 프레임 간 시간 차이 (초)
 * @param {THREE.PerspectiveCamera} camera
 * @param {Array} fallingTextsArr - 떨어지는 텍스트 배열
 */
function updateFallingTexts(delta, camera, fallingTextsArr) {
  if (!fallingTextsArr) return;

  for (let i = 0; i < fallingTextsArr.length; i++) {
    const fallingText = fallingTextsArr[i];
    const { group, velocity, gravity, groundY, landed } = fallingText;

    if (landed) continue; // 이미 바닥에 쌓인 것은 그대로 둠

    // 중력 적용
    velocity.y += gravity * delta;

    // 위치 업데이트 (rotation 없음 - 똑바로 떨어짐)
    group.position.y += velocity.y * delta;

    // 일정 y(groundY)에 도달하면 그만 둠 → 바닥에 멈춤
    if (group.position.y <= groundY) {
      group.position.y = groundY;
      velocity.y = 0;
      velocity.rotationX = 0;
      velocity.rotationY = 0;
      velocity.rotationZ = 0;
      fallingText.landed = true;
      console.log(
        `[Stage2] 바닥 도달 (y=${groundY}), 멈춤. 남은 falling 수: ${fallingTextsArr.filter((f) => !f.landed).length}`,
      );
    }
  }
}
