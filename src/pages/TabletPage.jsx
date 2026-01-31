import { useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import { EntryForm } from "../components/EntryForm.jsx";
import styles from "./Page.module.css";

const TABLET_STAGES = [1];

/** Phase 1: 태블릿 - 입국 신고서 (Stage 1) */
export function TabletPage() {
  const allowedStages = useMemo(() => TABLET_STAGES, []);

  function handleSubmit(data) {
    // TODO: POST /api/worry, 비행기 착륙 애니메이션
    console.log("[TabletPage] 입국 신고서 제출:", data);
  }

  return (
    <div className={styles.page}>
      <div className={styles.uiOverlay}>
        <EntryForm onSubmit={handleSubmit} />
      </div>
      <ThreeCanvas allowedStages={allowedStages} initialStage={1} />
    </div>
  );
}
