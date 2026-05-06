import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import styles from "./Page.module.css";
import {
  MONITOR_POLL_MS,
  fetchGumServerStatus,
  fetchMonitorCurrent,
  getMonitorArrivalMessage,
  getMonitorDeviceId,
  postMonitorComplete,
} from "../lib/monitorCurrentApi.js";
import { resetClientForNextKioskVisitor } from "../utils/common/resetClientForNextKioskVisitor.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import {
  warmStage3GltfTemplateUrls,
  waitForStage3GltfTemplatesReady,
} from "../utils/stages/stage3/stage3GltfWarmup.js";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";
import { clearGgumddiMyVotesFromLocalStorage } from "../lib/voteApi.js";
import { IntroStoryOverlay } from "../components/IntroStoryOverlay.jsx";

const START_BG_URL = resolvePublicAssetUrl(
  "/static/images/background_start.png",
);
const START_BTN_URL = resolvePublicAssetUrl(
  "/static/images/start_button_pink.png",
);
const START_CLICK_SFX_URL = resolvePublicAssetUrl(
  "/static/sounds/minigame/start_click_sfx.mp3",
);
const INTRO_BGM_URL = resolvePublicAssetUrl(
  "/static/sounds/intro_story/intro_bgm.mp3",
);
const INTRO_ENTER_SFX_URL = resolvePublicAssetUrl("/static/sounds/click.mp3");
const INTRO_BGM_START_OFFSET_SEC = 2;
const INTRO_BGM_START_DELAY_SEC = 0.07;

export function StartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toastMessage, setToastMessage] = useState(null);
  const prevToast = useRef(null);
  const toastRef = useRef(null);
  const startNavigationLockedRef = useRef(false);
  const [isPreparingKiosk, setIsPreparingKiosk] = useState(false);
  const [isIntroOpen, setIsIntroOpen] = useState(false);
  const [isStartFadingOut, setIsStartFadingOut] = useState(false);
  const audioCtxRef = useRef(null);
  const audioBuffersRef = useRef({
    startSfx: null,
    enterSfx: null,
    introBgm: null,
  });
  const introBgmNodesRef = useRef({ source: null, gain: null });
  const introBgmStopTimerRef = useRef(null);
  const htmlAudioRef = useRef({
    startSfx: null,
    enterSfx: null,
    introBgm: null,
    introBgmFadeTimer: null,
  });
  /** Stage6 완주 후: reset + Stage3 GLB 웜업이 끝날 때까지(다음 `/start`로 replace 전) */
  const [isCompletingKioskSession, setIsCompletingKioskSession] =
    useState(false);
  const stage3WarmupPromiseRef = useRef(null);

  const stopIntroBgm = useCallback(() => {
    if (introBgmStopTimerRef.current) {
      window.clearTimeout(introBgmStopTimerRef.current);
      introBgmStopTimerRef.current = null;
    }
    const { source, gain } = introBgmNodesRef.current;
    if (!source || !gain) return;
    try {
      source.stop();
    } catch {
      // ignore
    }
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      // ignore
    }
    introBgmNodesRef.current = { source: null, gain: null };

    const html = htmlAudioRef.current;
    if (html.introBgmFadeTimer) {
      cancelAnimationFrame(html.introBgmFadeTimer);
      html.introBgmFadeTimer = null;
    }
    if (html.introBgm) {
      try {
        html.introBgm.pause();
        html.introBgm.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }, []);

  const ensureAudioCtx = useCallback(async () => {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    }

    const Ctor =
      window.AudioContext ||
      /** @type {typeof AudioContext | undefined} */ (
        window["webkitAudioContext"]
      );
    if (!Ctor) return null;
    try {
      audioCtxRef.current = new Ctor();
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const decodeToBuffer = useCallback(async (ctx, url) => {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arr, resolve, reject);
    });
  }, []);

  useEffect(() => {
    // HTMLAudio fallback은 즉시 로드해 두기 (WebAudio decode 전/실패 시에도 소리 보장)
    try {
      const html = htmlAudioRef.current;
      if (!html.startSfx) {
        html.startSfx = new window.Audio(START_CLICK_SFX_URL);
        html.startSfx.preload = "auto";
        html.startSfx.load();
      }
      if (!html.enterSfx) {
        html.enterSfx = new window.Audio(INTRO_ENTER_SFX_URL);
        html.enterSfx.preload = "auto";
        html.enterSfx.load();
      }
      if (!html.introBgm) {
        html.introBgm = new window.Audio(INTRO_BGM_URL);
        html.introBgm.preload = "auto";
        html.introBgm.loop = true;
        html.introBgm.volume = 0;
        html.introBgm.load();
      }
    } catch {
      // ignore
    }

    // 디코딩은 미리 (재생은 사용자 클릭 때 resume)
    const Ctor =
      window.AudioContext ||
      /** @type {typeof AudioContext | undefined} */ (
        window["webkitAudioContext"]
      );
    if (!Ctor) return;

    let cancelled = false;
    const ctx = new Ctor();
    audioCtxRef.current = ctx;

    void (async () => {
      try {
        const [startSfx, enterSfx, introBgm] = await Promise.all([
          decodeToBuffer(ctx, START_CLICK_SFX_URL),
          decodeToBuffer(ctx, INTRO_ENTER_SFX_URL),
          decodeToBuffer(ctx, INTRO_BGM_URL),
        ]);
        if (cancelled) return;
        audioBuffersRef.current = { startSfx, enterSfx, introBgm };
      } catch (e) {
        console.warn("[StartPage] audio decode 실패:", e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        ctx.close();
      } catch {
        // ignore
      }
    };
  }, [decodeToBuffer]);

  const playOneShot = useCallback(
    async (buffer) => {
      const ctx = await ensureAudioCtx();
      if (!ctx || !buffer) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
      return src;
    },
    [ensureAudioCtx],
  );

  const startIntroBgmAt = useCallback(
    async (whenSeconds) => {
      stopIntroBgm();
      const ctx = await ensureAudioCtx();
      const buffer = audioBuffersRef.current.introBgm;
      if (!ctx || !buffer) return;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, whenSeconds);
      gain.gain.linearRampToValueAtTime(1, whenSeconds + 1.2);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      if (buffer.duration > INTRO_BGM_START_OFFSET_SEC) {
        src.loopStart = INTRO_BGM_START_OFFSET_SEC;
        src.loopEnd = buffer.duration;
      }
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(
        whenSeconds,
        buffer.duration > INTRO_BGM_START_OFFSET_SEC
          ? INTRO_BGM_START_OFFSET_SEC
          : 0,
      );

      introBgmNodesRef.current = { source: src, gain };
    },
    [ensureAudioCtx, stopIntroBgm],
  );

  const startIntroBgmHtmlWithFadeIn = useCallback(() => {
    const html = htmlAudioRef.current;
    const audio = html.introBgm;
    if (!audio) return;

    if (html.introBgmFadeTimer) {
      cancelAnimationFrame(html.introBgmFadeTimer);
      html.introBgmFadeTimer = null;
    }

    try {
      audio.currentTime = INTRO_BGM_START_OFFSET_SEC;
    } catch {
      // ignore
    }

    audio.volume = 0;
    audio.play().catch(() => {});

    const FADE_MS = 1200;
    const startAt = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - startAt) / FADE_MS);
      audio.volume = t;
      if (t >= 1) {
        html.introBgmFadeTimer = null;
        return;
      }
      html.introBgmFadeTimer = requestAnimationFrame(tick);
    };
    html.introBgmFadeTimer = requestAnimationFrame(tick);
  }, []);

  const fadeOutIntroBgmHtml = useCallback(
    (durationMs) => {
      const html = htmlAudioRef.current;
      const audio = html.introBgm;
      if (!audio) return Promise.resolve();

      if (html.introBgmFadeTimer) {
        cancelAnimationFrame(html.introBgmFadeTimer);
        html.introBgmFadeTimer = null;
      }

      return new Promise((resolve) => {
        const startVol = audio.volume ?? 1;
        const startAt = Date.now();
        const tick = () => {
          const t = Math.min(1, (Date.now() - startAt) / durationMs);
          audio.volume = startVol * (1 - t);
          if (t >= 1) {
            html.introBgmFadeTimer = null;
            stopIntroBgm();
            resolve();
            return;
          }
          html.introBgmFadeTimer = requestAnimationFrame(tick);
        };
        html.introBgmFadeTimer = requestAnimationFrame(tick);
      });
    },
    [stopIntroBgm],
  );

  const fadeOutIntroBgm = useCallback(
    async (durationMs) => {
      const ctx = await ensureAudioCtx();
      const { source, gain } = introBgmNodesRef.current;
      if (!ctx || !source || !gain) return;

      const now = ctx.currentTime;
      const end = now + durationMs / 1000;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, end);

      await new Promise((resolve) => {
        introBgmStopTimerRef.current = window.setTimeout(() => {
          introBgmStopTimerRef.current = null;
          stopIntroBgm();
          resolve();
        }, durationMs);
      });
    },
    [ensureAudioCtx, stopIntroBgm],
  );

  useEffect(() => {
    return () => {
      stopIntroBgm();
    };
  }, [stopIntroBgm]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("complete") === "1") return;
    clearGgumddiMyVotesFromLocalStorage();
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("complete") === "1") return;
    getGLBLoader().preloadDecoders();
    warmStage3GltfTemplateUrls();
  }, [location.search]);

  useEffect(() => {
    if (toastMessage && !prevToast.current) {
      requestAnimationFrame(() => {
        const el = toastRef.current;
        const rect = el?.getBoundingClientRect();
        const w = window.innerWidth;
        const h = window.innerHeight;
        const yRatio = rect ? rect.bottom / h : 0.6;
        const xLeft = rect ? rect.left / w : 0.3;
        const xRight = rect ? rect.right / w : 0.7;

        const common = {
          particleCount: 250,
          spread: 160,
          startVelocity: 70,
          ticks: 300,
          gravity: 0.5,
          scalar: 2.5,
          drift: 0,
          shapes: /** @type {import("canvas-confetti").Shape[]} */ ([
            "square",
            "circle",
          ]),
          colors: [
            "#ff6b6b",
            "#ffd93d",
            "#6bcb77",
            "#4d96ff",
            "#ff9ff3",
            "#f0932b",
          ],
        };
        confetti({
          ...common,
          angle: 70,
          origin: { x: xLeft - 0.05, y: yRatio },
        });
        confetti({
          ...common,
          angle: 110,
          origin: { x: xRight + 0.05, y: yRatio },
        });
      });
    }
    prevToast.current = toastMessage;
  }, [toastMessage]);

  useEffect(() => {
    const poll = async () => {
      try {
        // 요구사항: 예약(reservedWorry) 단계에서는 /current가 idle만 줄 수 있음.
        // 시작 화면 토스트는 /status의 reservedWorry(있으면) 또는 /current busy(worry)를 기준으로 표시.
        const statusData = await fetchGumServerStatus();
        const effectiveMonitorId = getMonitorDeviceId();
        const statusMonitor =
          statusData?.monitors?.[effectiveMonitorId ?? "monitor-1"] ?? null;
        const reservedWorry = statusMonitor?.reservedWorry;
        if (reservedWorry) {
          const msg = getMonitorArrivalMessage(reservedWorry);
          setToastMessage(msg);
          return;
        }

        const data = await fetchMonitorCurrent();
        if (data == null) return;

        if (data.status === "idle") {
          setToastMessage(null);
          return;
        }

        if (data.status === "busy" && data.worry) {
          const msg = getMonitorArrivalMessage(data.worry);
          setToastMessage(msg);
          return;
        }
      } catch (e) {
        console.warn("[StartPage] monitor current 폴링 실패:", e);
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, MONITOR_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const ensureStage3Warmup = useCallback(() => {
    if (!stage3WarmupPromiseRef.current) {
      stage3WarmupPromiseRef.current = waitForStage3GltfTemplatesReady();
    }
    return stage3WarmupPromiseRef.current;
  }, []);

  const navigateToKioskAfterWarmup = useCallback(async () => {
    if (isCompletingKioskSession) {
      return;
    }
    if (startNavigationLockedRef.current) {
      return;
    }
    startNavigationLockedRef.current = true;
    setIsPreparingKiosk(true);
    try {
      await ensureStage3Warmup();
      navigate(`/kiosk${location.search}`);
    } catch (e) {
      console.warn("[StartPage] Stage3 GLB 프리로드 실패 — 그대로 진행:", e);
      stage3WarmupPromiseRef.current = waitForStage3GltfTemplatesReady();
      try {
        await stage3WarmupPromiseRef.current;
      } catch {
        // fallback: 웜업 실패가 이어져도 진입은 막지 않는다.
      }
      navigate(`/kiosk${location.search}`);
    } finally {
      setIsPreparingKiosk(false);
      startNavigationLockedRef.current = false;
    }
  }, [ensureStage3Warmup, isCompletingKioskSession, location.search, navigate]);

  const handleIntroEnter = useCallback(async () => {
    const enterBuf = audioBuffersRef.current.enterSfx;
    if (enterBuf) {
      void playOneShot(enterBuf);
    } else {
      try {
        const a = htmlAudioRef.current.enterSfx;
        if (a) {
          a.currentTime = 0;
          a.play().catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    if (introBgmNodesRef.current.source != null) {
      await fadeOutIntroBgm(700);
    } else {
      await fadeOutIntroBgmHtml(700);
    }
    await navigateToKioskAfterWarmup();
  }, [
    fadeOutIntroBgm,
    fadeOutIntroBgmHtml,
    navigateToKioskAfterWarmup,
    playOneShot,
  ]);

  const handleStart = useCallback(() => {
    if (
      isCompletingKioskSession ||
      isPreparingKiosk ||
      isIntroOpen ||
      isStartFadingOut
    ) {
      return;
    }
    const startSfx = audioBuffersRef.current.startSfx;
    void (async () => {
      const ctx = await ensureAudioCtx();
      if (ctx && startSfx) {
        void playOneShot(startSfx);
        // 효과음이 끝날 때까지 기다리지 않고, 살짝 텀을 두고 바로 BGM 페이드인
        void startIntroBgmAt(ctx.currentTime + INTRO_BGM_START_DELAY_SEC);
        return;
      }

      // WebAudio가 준비 안 됐으면 HTMLAudio로 즉시 재생 + onended로 BGM 시작
      try {
        const a = htmlAudioRef.current.startSfx;
        if (!a) return;
        a.currentTime = 0;
        a.play().catch(() => {
          // ignore
        });
        window.setTimeout(() => {
          startIntroBgmHtmlWithFadeIn();
        }, INTRO_BGM_START_DELAY_SEC * 1000);
      } catch {
        // ignore
      }
    })();
    void ensureStage3Warmup();
    setIsStartFadingOut(true);
    setIsIntroOpen(true);
  }, [
    ensureStage3Warmup,
    ensureAudioCtx,
    isCompletingKioskSession,
    isIntroOpen,
    isPreparingKiosk,
    isStartFadingOut,
    playOneShot,
    startIntroBgmAt,
    startIntroBgmHtmlWithFadeIn,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldComplete = params.get("complete") === "1";
    if (!shouldComplete) return;

    setIsCompletingKioskSession(true);
    postMonitorComplete()
      .catch((e) => {
        console.warn("[StartPage] monitor complete 요청 실패:", e);
      })
      .finally(() => {
        void (async () => {
          try {
            await resetClientForNextKioskVisitor();
            getGLBLoader().preloadDecoders();
            await waitForStage3GltfTemplatesReady();
            setToastMessage(null);
            params.delete("complete");
            const nextQuery = params.toString();
            navigate(nextQuery ? `/start?${nextQuery}` : "/start", {
              replace: true,
            });
          } catch (e) {
            console.warn(
              "[StartPage] complete 후 웜업 실패 — 다음 화면만 열기:",
              e,
            );
            setToastMessage(null);
            params.delete("complete");
            const nextQuery = params.toString();
            navigate(nextQuery ? `/start?${nextQuery}` : "/start", {
              replace: true,
            });
          } finally {
            setIsCompletingKioskSession(false);
          }
        })();
      });
  }, [location.search, navigate]);

  const isStartInteractiveBlocked =
    isPreparingKiosk || isCompletingKioskSession;
  const startPageClassName = [
    styles.page,
    styles.startBackground,
    isStartInteractiveBlocked && styles.startEnterLoading,
    isCompletingKioskSession && styles.startBlockClick,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={startPageClassName}
      style={{ backgroundImage: `url("${START_BG_URL}")` }}
      onPointerDown={handleStart}
    >
      <div
        className={`${styles.startOverlay}${isStartFadingOut ? ` ${styles.startOverlayFadeOut}` : ""}`}
      >
        <div className={styles.startButtonHit}>
          <img
            className={styles.startButtonImg}
            src={START_BTN_URL}
            alt="START"
            width={1024}
            height={388}
            decoding="async"
          />
        </div>
        {toastMessage ? (
          <div
            ref={toastRef}
            className={styles.startToast}
            role="status"
            aria-live="polite"
          >
            {toastMessage}
          </div>
        ) : null}
      </div>
      {isIntroOpen ? (
        <IntroStoryOverlay
          onComplete={() => {
            void handleIntroEnter();
          }}
        />
      ) : null}
    </div>
  );
}
