import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import { MinigameOverlay } from "../components/MinigameOverlay.jsx";
import styles from "./Page.module.css";

const KIOSK_STAGES = [3];

/** Phase 3: 키오스크 - 체험 존 (Stage 3, 포탈 통과 시 /airport로 이동) */
export function KioskPage() {
  const allowedStages = useMemo(() => KIOSK_STAGES, []);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onStageSwitch = (e) => {
      const { targetStage } = e.detail ?? {};
      if (targetStage === 6) {
        const params = new URLSearchParams(location.search);
        navigate(`/airport?${params.toString()}`);
      }
    };
    window.addEventListener("stage:switch", onStageSwitch);
    return () => {
      window.removeEventListener("stage:switch", onStageSwitch);
    };
  }, [location.search, navigate]);

  return (
    <div className={styles.page}>
      <ThreeCanvas allowedStages={allowedStages} initialStage={3} />
      <MinigameOverlay />
    </div>
  );
}
