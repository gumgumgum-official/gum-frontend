import { useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import styles from "./Page.module.css";

const DEV_STAGES = [1, 2, 3, 4, 5, 6];

/** 개발용: 모든 Stage, 키보드 1~6 전환 */
export function DevPage() {
  const allowedStages = useMemo(() => DEV_STAGES, []);

  return (
    <div className={styles.page}>
      <ThreeCanvas
        allowedStages={allowedStages}
        initialStage={2}
        enableKeyboardSwitch
      />
    </div>
  );
}
