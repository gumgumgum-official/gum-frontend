import { useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import { MinigameOverlay } from "../components/MinigameOverlay.jsx";
import { APP_CONFIG } from "../config/appConfig.js";
import styles from "./Page.module.css";

const DEV_STAGES = [2, 3, 4, 5, 6];

/** 개발용: Stage 2~6, 키보드 2~6 전환 */
export function DevPage() {
  const allowedStages = useMemo(() => DEV_STAGES, []);

  return (
    <div className={styles.page}>
      <ThreeCanvas
        allowedStages={allowedStages}
        initialStage={APP_CONFIG.initialStage}
        enableKeyboardSwitch
      />
      <MinigameOverlay />
    </div>
  );
}
