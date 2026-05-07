import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import "./TentSceneViewer.css";

const BUBBLES = [
  "안녕! 만나서 반가워! ",
  "여기는 너에게 필요한 껌딱지 카드를 고를 수 있는 타로점이야",
];

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
  const onCardOpenRef = useRef(onCardOpen);
  useEffect(() => {
    onCardOpenRef.current = onCardOpen;
  }, [onCardOpen]);

  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const [camText, setCamText] = useState("");
  const [bubble, setBubble] = useState({ msg: "", visible: false });

  // 말풍선 자동 시퀀스 → 모달 자동 오픈
  useEffect(() => {
    const T = [
      setTimeout(() => setBubble({ msg: BUBBLES[0], visible: true }), 600),
      setTimeout(() => setBubble((b) => ({ ...b, visible: false })), 3100),
      setTimeout(() => setBubble({ msg: BUBBLES[1], visible: true }), 3600),
      setTimeout(() => setBubble((b) => ({ ...b, visible: false })), 7100),
      setTimeout(() => onCardOpenRef.current?.(), 7600),
    ];
    return () => T.forEach(clearTimeout);
  }, []);

  const handleLock = useCallback(() => {
    const { camera, controls } = threeRef.current ?? {};
    if (!camera || !controls) return;
    controls.enabled = false;
    lockedRef.current = true;
    setLocked(true);
    const p = camera.position;
    const t = controls.target;
    setCamText(
      `position: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}],\ntarget:   [${t.x.toFixed(3)}, ${t.y.toFixed(3)}, ${t.z.toFixed(3)}],`,
    );
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.33;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0c1c);
    scene.environmentIntensity = 0.85;
    new EXRLoader().load("/hdri/sunny_rose_garden_1k.exr", (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = tex;
    });

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

    const isDefaultCam =
      cfg.position[0] === 0 && cfg.position[1] === 2 && cfg.position[2] === 5;

    getGLBLoader().load("/models/stage3/tent_scene.glb", {
      onLoad: (gltf) => {
        gltf.scene.traverse((obj) => {
          if (obj.isLight) obj.intensity *= 0.0005;
        });
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
      if (lockedRef.current) onCardOpenRef.current?.();
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
      scene.environment?.dispose();
      scene.traverse((obj) => {
        const mesh = /** @type {any} */ (obj);
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = mesh.material
          ? Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
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

      {/* Stage6 스타일 말풍선 */}
      <div
        className={`speech-bubble-stage6 tent-bubble${bubble.visible ? " is-visible" : ""}`}
        style={{ left: "50%", top: "58%" }}
      >
        {bubble.msg}
      </div>

      <div className="tent-scene-ui">
        <div className="tent-scene-hint">
          {locked
            ? "어디든 클릭하면 카드를 뽑을 수 있어요"
            : "드래그로 시점 조정 · 스크롤로 줌 · 각도 정해지면 고정"}
        </div>
        {locked && camText && (
          <pre
            className="tent-scene-camtext"
            onClick={() => window.navigator?.clipboard?.writeText(camText)}
          >
            {camText}
          </pre>
        )}
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
