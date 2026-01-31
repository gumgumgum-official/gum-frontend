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
 * @param {boolean} [params.options.enableOrbit=true]
 * @param {boolean} [params.options.enableDrag=true]
 * @param {string} [params.options.stageName='stage'] - 로그용 (예: 'stage2')
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
  } = options;

  const mouse = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  let orbitControls = null;
  let transformControls = null;
  let dragControls = null;
  let onKeyDown = null;
  let onPointerDown = null;
  let onPointerMove = null;

  // ---- OrbitControls
  if (enableOrbit) {
    orbitControls = new OrbitControls(camera, domElement);
    orbitControls.enableDamping = true;
    orbitControls.target.set(0, 0, 0);
  }

  // ---- TransformControls (축 조정)
  transformControls = new TransformControls(camera, domElement);
  transformControls.setMode("translate");
  scene.add(transformControls);
  transformControls.addEventListener("dragging-changed", (e) => {
    if (orbitControls) orbitControls.enabled = !e.value;
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

  // ---- C/G/S 키: config 콘솔 출력
  function formatCameraConfig() {
    const pos = camera.position;
    const target = orbitControls
      ? orbitControls.target
      : new THREE.Vector3(0, 0, 0);
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

  onKeyDown = (e) => {
    const roots = getPropRoots();

    if (e.key === "c" || e.key === "C") {
      console.log(`📋 [${stageName}] 카메라 설정 (stageConfig에 복사):`);
      console.log(formatCameraConfig());
    }

    if (e.key === "g" || e.key === "G") {
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

    if (e.key === "s" || e.key === "S") {
      const target = orbitControls
        ? orbitControls.target
        : new THREE.Vector3(0, 0, 0);
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
      console.log(`📋 [${stageName}] 전체 config (stageConfig에 덮어쓰기):`);
      console.log(
        `  ${stageName}: {\n${cameraBlock}\n    props: [\n${propsBlock}\n    ],\n  },`,
      );
    }

    if (transformControls && ["1", "2", "3"].includes(e.key)) {
      const modes = { 1: "translate", 2: "rotate", 3: "scale" };
      transformControls.setMode(modes[e.key]);
    }
  };
  window.addEventListener("keydown", onKeyDown);

  console.log(
    `🎮 [${stageName}] 디버그 컨트롤: 드래그=카메라, 오브제 끌기=이동, 클릭=축 조정 | C/G/S=config 출력`,
  );

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
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown);
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
