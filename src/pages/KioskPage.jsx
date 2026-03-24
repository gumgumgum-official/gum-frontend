import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import { MinigameOverlay } from "../components/MinigameOverlay.jsx";
import styles from "./Page.module.css";

const KIOSK_STAGES = [3, 4, 5, 6];
const STAGE6_FINISH_EVENT = "gum:kiosk-finish";

/** Phase 3~6: 키오스크 - 체험 존 (Stage 3→4→5→6 순차) */
export function KioskPage() {
  const allowedStages = useMemo(() => KIOSK_STAGES, []);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onFinish = () => {
      const params = new URLSearchParams(location.search);
      params.set("complete", "1");
      navigate(`/start?${params.toString()}`);
    };
    window.addEventListener(STAGE6_FINISH_EVENT, onFinish);
    return () => {
      window.removeEventListener(STAGE6_FINISH_EVENT, onFinish);
    };
  }, [location.search, navigate]);

  return (
    <div className={styles.page}>
      <ThreeCanvas allowedStages={allowedStages} initialStage={3} />
      <MinigameOverlay />
    </div>
  );
}
