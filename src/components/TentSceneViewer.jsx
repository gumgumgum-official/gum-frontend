import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import {
  STAGE6_SUBTITLE_HIDE_EVENT,
  STAGE6_SUBTITLE_SEQUENCE_EVENT,
} from "../events/stage6Events.js";
import { isElectronLikeUserAgent } from "../utils/common/envUtils.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../utils/common/gltfTemplateCache.js";
import { TENT_SCENE_GLB_PATH } from "../utils/common/kioskExhibitionWarmup.js";
import { preloadTentSceneSubtitleFonts } from "../utils/common/preloadGangwonEduFont.js";
import {
  getTentSceneEnvironmentTexture,
  takePreparedTentModel,
  warmTentSceneVisualAssets,
} from "../utils/common/tentScenePrewarm.js";
import "./TentSceneViewer.css";

function getCamCfg() {
  return (
    STAGE3_OBJECTS_CONFIG.tent?.tentSceneCamera ?? {
      position: [0, 2, 5],
      target: [0, 0, 0],
    }
  );
}

function getTentSubtitleCfg() {
  const tent = STAGE3_OBJECTS_CONFIG.tent;
  return {
    messages: tent?.tentSceneSubtitles ?? [],
    label: tent?.tentSceneSubtitleLabel ?? "타로껌",
    totalMs: tent?.tentSceneSubtitleTotalMs ?? 7400,
    startDelayMs: tent?.tentSceneSubtitleStartDelayMs ?? 900,
  };
}

function dispatchTentSubtitleHide() {
  window.dispatchEvent(new CustomEvent(STAGE6_SUBTITLE_HIDE_EVENT));
}

export function TentSceneViewer({ onCardOpen, skipBubbleSequence = false }) {
  const FADE_IN_MS = 2000;
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const onCardOpenRef = useRef(onCardOpen);
  useEffect(() => {
    onCardOpenRef.current = onCardOpen;
  }, [onCardOpen]);

  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        isVisibleRef.current = true;
        setIsVisible(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    return () => {
      dispatchTentSubtitleHide();
    };
  }, []);

  useEffect(() => {
    if (skipBubbleSequence) return;

    const { messages, label, totalMs, startDelayMs } = getTentSubtitleCfg();
    if (messages.length === 0) return;

    let aborted = false;
    const fontPreload = preloadTentSceneSubtitleFonts({ label, messages });

    const runSubtitleSequence = () => {
      window.dispatchEvent(
        new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
          detail: { messages, label, variant: "tent" },
        }),
      );
      return [setTimeout(() => onCardOpenRef.current?.(), totalMs)];
    };

    /** @type {number[]} */
    let timers = [];
    let subtitleDelayId = 0;

    const beginSubtitleSequence = async () => {
      await fontPreload;
      if (aborted) return;
      await new Promise((resolve) => {
        subtitleDelayId = window.setTimeout(() => {
          subtitleDelayId = 0;
          resolve();
        }, startDelayMs);
      });
      if (aborted) return;
      timers.push(...runSubtitleSequence());
    };

    const rootEl = rootRef.current;
    if (!rootEl) {
      void beginSubtitleSequence();
      return () => {
        aborted = true;
        if (subtitleDelayId) window.clearTimeout(subtitleDelayId);
        dispatchTentSubtitleHide();
        timers.forEach((id) => window.clearTimeout(id));
      };
    }

    let started = false;
    const startAfterFadeIn = () => {
      if (started) return;
      started = true;
      void beginSubtitleSequence();
    };

    const onFadeInEnd = (event) => {
      if (event.target !== rootEl) return;
      if (event.propertyName !== "opacity") return;
      startAfterFadeIn();
    };
    rootEl.addEventListener("transitionend", onFadeInEnd);

    const fallbackId = setTimeout(startAfterFadeIn, FADE_IN_MS + 100);

    return () => {
      aborted = true;
      rootEl.removeEventListener("transitionend", onFadeInEnd);
      clearTimeout(fallbackId);
      if (subtitleDelayId) window.clearTimeout(subtitleDelayId);
      dispatchTentSubtitleHide();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [FADE_IN_MS, skipBubbleSequence]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    const isElectronLike = isElectronLikeUserAgent();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    const pixelRatio = isElectronLike
      ? Math.min(1.25, window.devicePixelRatio || 1)
      : Math.min(1.5, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.33;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0c1c);
    scene.environmentIntensity = 0.85;
    let unmounted = false;
    void getTentSceneEnvironmentTexture()
      .then((tex) => {
        if (unmounted) return;
        scene.environment = tex;
      })
      .catch((err) => console.warn("[TentScene] HDRI 로드 실패:", err));

    const cfg = getCamCfg();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200);
    camera.position.fromArray(cfg.position);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.fromArray(cfg.target);
    controls.enabled = false;
    controls.update();

    const addModelToScene = (model) => {
      if (unmounted) {
        model.traverse((obj) => {
          const mesh = /** @type {any} */ (obj);
          if (mesh.geometry) mesh.geometry.dispose();
          const mats = mesh.material
            ? Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material]
            : [];
          mats.forEach((m) => m.dispose());
        });
        return;
      }
      scene.add(model);
    };

    const prepared = takePreparedTentModel();
    if (prepared) {
      addModelToScene(prepared);
    } else {
      const tentUrl = resolvePublicAssetUrl(TENT_SCENE_GLB_PATH);
      void warmTentSceneVisualAssets()
        .then(() => takePreparedTentModel())
        .then((model) => {
          if (model) {
            addModelToScene(model);
            return;
          }
          return loadGltfTemplateCached(tentUrl).then((gltf) => {
            if (unmounted) return;
            const model = gltf.scene.clone(true);
            model.traverse((obj) => {
              if (obj.isLight) obj.intensity *= 0.0005;
            });
            addModelToScene(model);
          });
        })
        .catch((err) => console.error("[TentScene] GLB 로드 실패:", err));
    }

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      if (!isVisibleRef.current) return;
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
    <div className="tent-scene-viewer">
      <div
        ref={rootRef}
        className={`tent-scene-viewer__content${isVisible ? " is-visible" : ""}`}
      >
        <canvas ref={canvasRef} className="tent-scene-canvas" />
      </div>
    </div>
  );
}
