import { useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import styles from "./Page.module.css";

const BEAM_STAGES = [2];

/** Phase 2: 빔 프로젝터 - 고민 시각화 (Stage 2만) */
export function BeamPage() {
  const allowedStages = useMemo(() => BEAM_STAGES, []);

  return (
    <div className={styles.page}>
      <ThreeCanvas allowedStages={allowedStages} initialStage={2} />
    </div>
  );
}
