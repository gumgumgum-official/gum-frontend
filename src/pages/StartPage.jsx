import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./Page.module.css";
import {
  MONITOR_POLL_MS,
  fetchMonitorCurrent,
  getMonitorArrivalMessage,
  postMonitorComplete,
} from "../lib/monitorCurrentApi.js";

export function StartPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    const poll = async () => {
      try {
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
        <div className={styles.pressStart}>PRESS START !</div>
      </div>
      {toastMessage ? (
        <div className={styles.startToast} role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}
