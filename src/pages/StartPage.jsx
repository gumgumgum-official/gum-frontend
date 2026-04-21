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

export function StartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toastMessage, setToastMessage] = useState(null);
  const prevToast = useRef(null);
  const toastRef = useRef(null);
  const startNavigationLockedRef = useRef(false);
  const [isPreparingKiosk, setIsPreparingKiosk] = useState(false);

  useEffect(() => {
    getGLBLoader().preloadDecoders();
    warmStage3GltfTemplateUrls();
  }, []);

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

  const handleStart = useCallback(async () => {
    if (startNavigationLockedRef.current) return;
    startNavigationLockedRef.current = true;
    setIsPreparingKiosk(true);
    try {
      await waitForStage3GltfTemplatesReady();
      navigate(`/kiosk${location.search}`);
    } catch (e) {
      console.warn("[StartPage] Stage3 GLB 프리로드 실패 — 그대로 진행:", e);
      navigate(`/kiosk${location.search}`);
    } finally {
      setIsPreparingKiosk(false);
      startNavigationLockedRef.current = false;
    }
  }, [location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shouldComplete = params.get("complete") === "1";
    if (!shouldComplete) return;

    postMonitorComplete()
      .catch((e) => {
        console.warn("[StartPage] monitor complete 요청 실패:", e);
      })
      .finally(() => {
        void (async () => {
          await resetClientForNextKioskVisitor();
          setToastMessage(null);
          params.delete("complete");
          const nextQuery = params.toString();
          navigate(nextQuery ? `/start?${nextQuery}` : "/start", {
            replace: true,
          });
        })();
      });
  }, [location.search, navigate]);

  return (
    <div
      className={`${styles.page} ${styles.startBackground}${
        isPreparingKiosk ? ` ${styles.startEnterLoading}` : ""
      }`}
      onClick={handleStart}
    >
      <div className={styles.startOverlay}>
        <div className={styles.startButtonHit}>
          <img
            className={styles.startButtonImg}
            src="/static/images/start_button.png"
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
    </div>
  );
}
