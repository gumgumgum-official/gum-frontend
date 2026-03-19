import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Page.module.css";

export function StartPage() {
  const navigate = useNavigate();

  const handleStart = useCallback(() => {
    navigate("/kiosk");
  }, [navigate]);

  return (
    <div
      className={`${styles.page} ${styles.startBackground}`}
      onClick={handleStart}
    >
      <div className={styles.startOverlay}>
        <div className={styles.pressStart}>PRESS START !</div>
      </div>
    </div>
  );
}
