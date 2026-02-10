/**
 * 스테이지용 디버그 컨트롤 (카메라·오브제 조정 + config 출력)
 * - OrbitControls: 카메라 회전/줌
 * - TransformControls: 선택 오브제 축으로 이동/회전/크기
 * - DragControls: 오브제 드래그로 이동
 * - C/G/S 키: 콘솔에 config 형식 출력 (복사 후 stageConfig에 붙여넣기)
 *
 * 책임: 입력/컨트롤만. 로드·배치·config 구조는 스테이지가 담당.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { DragControls } from "three/examples/jsm/controls/DragControls.js";

/**
 * @param {Object} params
 * @param {THREE.Scene} params.scene
 * @param {THREE.PerspectiveCamera} params.camera
 * @param {HTMLCanvasElement} params.domElement
 * @param {() => THREE.Object3D[]} params.getPropRoots - 선택/드래그 대상 루트 배열 (참조로 갱신)
 * @param {(index: number) => string} params.getPropPath - prop index → 경로 (config 출력용)
 * @param {Object} [params.options]
 * @param {boolean} [params.options.enableOrbit=true] - false 또는 config에 lookAt 있으면 카메라 고정
 * @param {boolean} [params.options.enableDrag=true]
 * @param {string} [params.options.stageName='stage']
 * @param {() => { position?: {x,y,z}, lookAt?: {x,y,z}, fov?, near?, far? }} [params.options.getInitialCameraConfig] - 있으면 적용. lookAt 있으면 Orbit 미생성(고정)
 */
export function createStageDebugControls(params) {
  const {
    scene,
    camera,
    domElement,
    getPropRoots,
    getPropPath,
    options = {},
  } = params;

  const {
    enableOrbit = true,
    enableDrag = true,
    stageName = "stage",
    getInitialCameraConfig,
  } = options;

  const mouse = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const fixedLookAt = new THREE.Vector3();

  let orbitControls = null;
  let transformControls = null;
  let dragControls = null;
  let onKeyDown = null;
  let onPointerDown = null;
  let onPointerMove = null;
  let useFixedCamera = false;

  // ---- 카메라 초기값 적용
  const initialCam = getInitialCameraConfig?.();
  if (initialCam) {
    if (initialCam.position) {
      camera.position.set(
        initialCam.position.x ?? 0,
        initialCam.position.y ?? 0,
        initialCam.position.z ?? 0,
      );
    }
    if (initialCam.fov != null) camera.fov = initialCam.fov;
    if (initialCam.near != null) camera.near = initialCam.near;
    if (initialCam.far != null) camera.far = initialCam.far;
    camera.updateProjectionMatrix();
    if (initialCam.lookAt != null && typeof initialCam.lookAt.x === "number") {
      fixedLookAt.set(
        initialCam.lookAt.x,
        initialCam.lookAt.y,
        initialCam.lookAt.z,
      );
      useFixedCamera = true; // lookAt 있으면 Orbit 끄고 고정
    }
  }

  // ---- OrbitControls (고정 모드가 아닐 때만)
  let orbitLogTimeout = null;
  if (enableOrbit && !useFixedCamera) {
    orbitControls = new OrbitControls(camera, domElement);
    orbitControls.enableDamping = true;
    orbitControls.target.set(0, 0, 0);
    if (initialCam?.lookAt) {
      orbitControls.target.copy(fixedLookAt);
    }
    // 배경(뷰) 드래그 끝날 때 콘솔 출력 (change 디바운스)
    orbitControls.addEventListener("change", () => {
      if (orbitLogTimeout) clearTimeout(orbitLogTimeout);
      orbitLogTimeout = setTimeout(() => {
        orbitLogTimeout = null;
        logConfigToConsole();
      }, 200);
    });
  }

  // ---- TransformControls (축 조정)
  transformControls = new TransformControls(camera, domElement);
  transformControls.setMode("translate");
  scene.add(transformControls);
  transformControls.addEventListener("dragging-changed", (e) => {
    if (orbitControls) orbitControls.enabled = !e.value;
    if (!e.value) logConfigToConsole(); // 축 드래그 끝날 때마다 콘솔 출력
  });

  // ---- 클릭 시 TransformControls 부착 (오브제만, getPropRoots 기준)
  function findPropRoot(obj, roots) {
    let current = obj;
    while (current) {
      if (roots.includes(current)) return current;
      current = current.parent;
    }
    return null;
  }

  onPointerDown = (e) => {
    if (e.button !== 0) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const roots = getPropRoots();
    const intersects = raycaster.intersectObjects(roots, true);
    if (intersects.length > 0) {
      const root = findPropRoot(intersects[0].object, roots);
      if (root) transformControls.attach(root);
    } else {
      transformControls.detach();
    }
  };
  domElement.addEventListener("pointerdown", onPointerDown);

  // ---- 오브제 위에서만 포인터 커서
  onPointerMove = (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(getPropRoots(), true);
    domElement.style.cursor = intersects.length > 0 ? "pointer" : "default";
  };
  domElement.addEventListener("pointermove", onPointerMove);

  // ---- C/G/S/T/R/E 키: config 출력 (1,2,3은 main에서 스테이지 전환용이라 T/R/E 사용)
  function getLookAtTarget() {
    return orbitControls ? orbitControls.target : fixedLookAt;
  }

  function formatCameraConfig() {
    const pos = camera.position;
    const target = getLookAtTarget();
    return `camera: {
  fov: ${camera.fov.toFixed(1)},
  near: ${camera.near},
  far: ${camera.far.toFixed(0)},
  position: { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)}, z: ${pos.z.toFixed(1)} },
  lookAt: { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} },
},`;
  }

  function formatPropConfig(obj, index) {
    const path = getPropPath(index);
    const p = obj.position;
    const r = obj.rotation;
    const s = obj.scale;
    return `{ path: "${path}",
  position: { x: ${p.x.toFixed(2)}, y: ${p.y.toFixed(2)}, z: ${p.z.toFixed(2)} },
  rotation: { x: ${THREE.MathUtils.radToDeg(r.x).toFixed(2)}, y: ${THREE.MathUtils.radToDeg(r.y).toFixed(2)}, z: ${THREE.MathUtils.radToDeg(r.z).toFixed(2)} },
  scale: { x: ${s.x.toFixed(2)}, y: ${s.y.toFixed(2)}, z: ${s.z.toFixed(2)} },
},`;
  }

  /** 콘솔에 카메라 + 오브제 전체 config 출력 (복사용). 드래그 끝날 때마다 호출됨. */
  function logConfigToConsole() {
    const roots = getPropRoots();
    const target = getLookAtTarget();
    const cameraBlock = `  camera: {
    fov: ${camera.fov.toFixed(1)},
    near: ${camera.near},
    far: ${camera.far.toFixed(0)},
    position: { x: ${camera.position.x.toFixed(1)}, y: ${camera.position.y.toFixed(1)}, z: ${camera.position.z.toFixed(1)} },
    lookAt: { x: ${target.x.toFixed(1)}, y: ${target.y.toFixed(1)}, z: ${target.z.toFixed(1)} },
  },`;
    const propsBlock = roots
      .map((root, i) => formatPropConfig(root, i))
      .join(",\n");
    console.log(`📋 [${stageName}] config (stageConfig에 복사):`);
    console.log(
      `  ${stageName}: {\n${cameraBlock}\n    props: [\n${propsBlock}\n    ],\n  },`,
    );
  }

  const DEBUG_KEYS = [
    "c",
    "C",
    "g",
    "G",
    "s",
    "S",
    "t",
    "T",
    "r",
    "R",
    "e",
    "E",
  ];
  const useCapture = true;

  onKeyDown = (e) => {
    const key = e.key;
    if (!DEBUG_KEYS.includes(key)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.(); // 다른 리스너 막기

    const roots = getPropRoots();

    if (key === "c" || key === "C") {
      console.log(`📋 [${stageName}] 카메라 설정 (stageConfig에 복사):`);
      console.log(formatCameraConfig());
    }

    if (key === "g" || key === "G") {
      const obj = transformControls?.object;
      if (obj) {
        const idx = roots.indexOf(obj);
        console.log(
          `📋 [${stageName}] 오브제 설정 (stageConfig props[]에 복사):`,
        );
        console.log(formatPropConfig(obj, idx));
      } else {
        console.log(`💡 오브제를 클릭한 뒤 G 키 (배경은 선택되지 않습니다)`);
      }
    }

    if (key === "s" || key === "S") logConfigToConsole();

    // T=이동, R=회전, E=크기 (1,2,3은 main에서 스테이지 전환용)
    if (transformControls) {
      if (key === "t" || key === "T") transformControls.setMode("translate");
      if (key === "r" || key === "R") transformControls.setMode("rotate");
      if (key === "e" || key === "E") transformControls.setMode("scale");
    }
  };
  window.addEventListener("keydown", onKeyDown, useCapture);
  domElement.setAttribute("tabindex", "0");
  domElement.style.outline = "none";
  domElement.focus(); // 포커스를 캔버스로 두어 키가 페이지로 가도록

  console.log(
    `🎮 [${stageName}] 오브제/축 드래그 끝날 때마다 콘솔에 config 출력 → 복사해서 stageConfig에 붙여넣기`,
  );
  if (useFixedCamera) {
    console.log(`📷 [${stageName}] 카메라 고정 모드 (config.lookAt 적용)`);
  }

  return {
    getCamera: () => camera,
    getOrbitControls: () => orbitControls,
    getTransformControls: () => transformControls,

    /**
     * 드래그 가능 오브제 설정 (로드 완료 후 호출)
     * @param {THREE.Object3D[]} objects
     */
    setDraggableObjects(objects) {
      if (dragControls) {
        dragControls.dispose();
        dragControls = null;
      }
      if (!enableDrag || !objects.length) return;
      dragControls = new DragControls(objects, camera, domElement);
      dragControls.addEventListener("dragstart", () => {
        if (orbitControls) orbitControls.enabled = false;
      });
      dragControls.addEventListener("dragend", () => {
        if (orbitControls) orbitControls.enabled = true;
        logConfigToConsole(); // 오브제 드래그 끝날 때마다 콘솔 출력
      });
    },

    /**
     * Orbit 타겟 설정 (배경 중심 등)
     * @param {THREE.Vector3} target
     */
    setOrbitTarget(target) {
      if (orbitControls) orbitControls.target.copy(target);
    },

    update(_delta) {
      if (orbitControls) orbitControls.update();
      if (useFixedCamera) camera.lookAt(fixedLookAt);
    },

    dispose() {
      if (orbitLogTimeout) {
        clearTimeout(orbitLogTimeout);
        orbitLogTimeout = null;
      }
      window.removeEventListener("keydown", onKeyDown, useCapture);
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointermove", onPointerMove);
      if (transformControls) {
        transformControls.detach();
        scene.remove(transformControls);
        transformControls.dispose();
      }
      if (dragControls) {
        dragControls.dispose();
      }
      if (orbitControls) {
        orbitControls.dispose();
      }
    },
  };
}
