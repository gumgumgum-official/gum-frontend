import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AirportAudioUnlockOverlay } from "../components/AirportAudioUnlockOverlay.jsx";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import styles from "./Page.module.css";

const STAGE6_FINISH_EVENT = "gum:kiosk-finish";
const AIRPORT_STAGES = [6];

/** Phase 6: 공항 - 헤어짐 (Stage 6) */
export function AirportPage() {
  const allowedStages = useMemo(() => AIRPORT_STAGES, []);
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
      <AirportAudioUnlockOverlay />
      <ThreeCanvas allowedStages={allowedStages} initialStage={6} />
    </div>
  );
}
