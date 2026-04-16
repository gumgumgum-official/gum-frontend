import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./Page.module.css";
import {
  MONITOR_POLL_MS,
  fetchGumServerStatus,
  fetchMonitorCurrent,
  getMonitorArrivalMessage,
  getMonitorDeviceId,
  postMonitorComplete,
} from "../lib/monitorCurrentApi.js";

export function StartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toastMessage, setToastMessage] = useState(null);

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

  const handleStart = useCallback(() => {
    navigate(`/kiosk${location.search}`);
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
        setToastMessage(null);
        params.delete("complete");
        const nextQuery = params.toString();
        navigate(nextQuery ? `/start?${nextQuery}` : "/start", {
          replace: true,
        });
      });
  }, [location.search, navigate]);

  return (
    <div
      className={`${styles.page} ${styles.startBackground}`}
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
      </div>
      {toastMessage ? (
        <div className={styles.startToast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
