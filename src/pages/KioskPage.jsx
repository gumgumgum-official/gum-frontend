import { useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import { MinigameOverlay } from "../components/MinigameOverlay.jsx";
import styles from "./Page.module.css";

const KIOSK_STAGES = [3, 4, 5, 6];

/** Phase 3~6: 키오스크 - 체험 존 (Stage 3→4→5→6 순차) */
export function KioskPage() {
  const allowedStages = useMemo(() => KIOSK_STAGES, []);

  return (
    <div className={styles.page}>
      <ThreeCanvas allowedStages={allowedStages} initialStage={3} />
      <MinigameOverlay />
    </div>
  );
}
