import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import "./TentSceneViewer.css";

function getCamCfg() {
  return (
    STAGE3_OBJECTS_CONFIG.tent?.tentSceneCamera ?? {
      position: [0, 2, 5],
      target: [0, 0, 0],
    }
  );
}

export function TentSceneViewer({ onClose, onCardOpen }) {
  const canvasRef = useRef(null);
  const threeRef = useRef(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);

  const handleLock = useCallback(() => {
    const { controls } = threeRef.current ?? {};
    if (controls) controls.enabled = false;
    lockedRef.current = true;
    setLocked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    const { controls } = threeRef.current ?? {};
    if (controls) controls.enabled = true;
    lockedRef.current = false;
    setLocked(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0c1c);

    const cfg = getCamCfg();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.fromArray(cfg.position);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.fromArray(cfg.target);
    controls.update();

    let logTimer = null;
    const logCameraToConsole = () => {
      if (logTimer) clearTimeout(logTimer);
      logTimer = setTimeout(() => {
        logTimer = null;
        const p = camera.position;
        const t = controls.target;
        console.log(
          "[TentScene] 현재 카메라 — stage3ObjectsConfig.js tentSceneCamera에 붙여넣으세요:\n" +
            `tentSceneCamera: {\n` +
            `  position: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}],\n` +
            `  target:   [${t.x.toFixed(3)}, ${t.y.toFixed(3)}, ${t.z.toFixed(3)}],\n` +
            `},`,
        );
      }, 200);
    };
    controls.addEventListener("end", logCameraToConsole);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const isDefaultCam =
      cfg.position[0] === 0 && cfg.position[1] === 2 && cfg.position[2] === 5;

    getGLBLoader().load("/models/stage3/tent_scene.glb", {
      onLoad: (gltf) => {
        scene.add(gltf.scene);
        if (isDefaultCam) {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          camera.position.set(
            center.x,
            center.y + maxDim * 0.4,
            center.z + maxDim * 1.5,
          );
          controls.target.copy(center);
          controls.update();
        }
        console.log("[TentScene] GLB 로드 완료 — 드래그로 시점 조정 가능");
      },
      onError: (err) => console.error("[TentScene] GLB 로드 실패:", err),
    });

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const nw = canvas.clientWidth;
      const nh = canvas.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    };
    window.addEventListener("resize", onResize);

    const onClick = () => {
      if (lockedRef.current) onCardOpen?.();
    };
    canvas.addEventListener("click", onClick);

    threeRef.current = { renderer, scene, controls, camera };

    return () => {
      cancelAnimationFrame(animId);
      if (logTimer) clearTimeout(logTimer);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("click", onClick);
      controls.removeEventListener("end", logCameraToConsole);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = obj.material
          ? Array.isArray(obj.material)
            ? obj.material
            : [obj.material]
          : [];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      threeRef.current = null;
    };
  }, []);

  return (
    <div
      className={`tent-scene-viewer${locked ? " tent-scene-viewer--locked" : ""}`}
    >
      <canvas ref={canvasRef} className="tent-scene-canvas" />
      <div className="tent-scene-ui">
        <div className="tent-scene-hint">
          {locked
            ? "어디든 클릭하면 카드를 뽑을 수 있어요"
            : "드래그로 시점 조정 · 스크롤로 줌 · 각도 정해지면 고정"}
        </div>
        <div className="tent-scene-buttons">
          {locked ? (
            <button
              className="tent-btn tent-btn--secondary"
              onClick={handleUnlock}
            >
              시점 조정
            </button>
          ) : (
            <button className="tent-btn tent-btn--primary" onClick={handleLock}>
              카메라 고정
            </button>
          )}
          <button className="tent-btn tent-btn--close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
