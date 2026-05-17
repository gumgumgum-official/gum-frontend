import { useEffect, useRef, useState } from "react";
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
  const FADE_IN_MS = 600;
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const onCardOpenRef = useRef(onCardOpen);
  useEffect(() => {
    onCardOpenRef.current = onCardOpen;
  }, [onCardOpen]);

  const [bubble, setBubble] = useState({ msg: "", visible: false });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const runBubbleSequence = () => [
      setTimeout(() => setBubble({ msg: BUBBLES[0], visible: true }), 600),
      setTimeout(() => setBubble((b) => ({ ...b, visible: false })), 3100),
      setTimeout(() => setBubble({ msg: BUBBLES[1], visible: true }), 3600),
      setTimeout(() => setBubble((b) => ({ ...b, visible: false })), 7100),
      setTimeout(() => onCardOpenRef.current?.(), 7600),
    ];

    const rootEl = rootRef.current;
    if (!rootEl) {
      const timers = runBubbleSequence();
      return () => timers.forEach(clearTimeout);
    }

    /** @type {number[]} */
    let timers = [];
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      timers = runBubbleSequence();
    };

    // 페이드 인 트랜지션이 끝난 뒤 자막 시퀀스를 시작한다.
    const onFadeInEnd = (event) => {
      if (event.target !== rootEl) return;
      if (event.propertyName !== "opacity") return;
      start();
    };
    rootEl.addEventListener("transitionend", onFadeInEnd);

    // 애니메이션 이벤트가 누락되는 환경 대비 fallback.
    const fallbackId = setTimeout(start, FADE_IN_MS + 100);

    return () => {
      rootEl.removeEventListener("transitionend", onFadeInEnd);
      clearTimeout(fallbackId);
      timers.forEach(clearTimeout);
    };
  }, [FADE_IN_MS]);

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
    let unmounted = false;
    new EXRLoader().load("/hdri/sunny_rose_garden_1k.exr", (tex) => {
      if (unmounted) {
        tex.dispose();
        return;
      }
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
    controls.enabled = false;
    controls.update();

    getGLBLoader().load("/models/stage3/tent_gum_scene.glb", {
      onLoad: (gltf) => {
        gltf.scene.traverse((obj) => {
          if (obj.isLight) obj.intensity *= 0.0005;
        });
        scene.add(gltf.scene);
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

    return () => {
      unmounted = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
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
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`tent-scene-viewer${isVisible ? " is-visible" : ""}`}
    >
      <canvas ref={canvasRef} className="tent-scene-canvas" />
      <div
        className={`speech-bubble-stage6 tent-bubble${bubble.visible ? " is-visible" : ""}`}
        style={{ left: "53%", top: "22%" }}
      >
        {bubble.msg}
      </div>
      <button className="tent-btn tent-btn--close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
