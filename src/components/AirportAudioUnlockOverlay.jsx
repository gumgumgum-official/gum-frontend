import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { STAGE6_AUDIO_UNLOCKED_EVENT } from "../events/stage6Events.js";
import styles from "../pages/Page.module.css";
import {
  isStage6AudioUnlocked,
  unlockStage6AudioFromUserGesture,
} from "../utils/stages/stage6/stage6AudioUnlock.js";

/**
 * /airport 직접 진입 시 자동재생 정책 대응 — 첫 터치로 오디오 unlock 후 인트로 시작
 */
export function AirportAudioUnlockOverlay() {
  const [visible, setVisible] = useState(() => !isStage6AudioUnlocked());

  useEffect(() => {
    if (!visible) return undefined;
    const onUnlocked = () => setVisible(false);
    window.addEventListener(STAGE6_AUDIO_UNLOCKED_EVENT, onUnlocked);
    return () => {
      window.removeEventListener(STAGE6_AUDIO_UNLOCKED_EVENT, onUnlocked);
    };
  }, [visible]);

  const handlePointerDown = useCallback(() => {
    if (isStage6AudioUnlocked()) {
      setVisible(false);
      return;
    }
    void unlockStage6AudioFromUserGesture().then(() => {
      window.dispatchEvent(new CustomEvent(STAGE6_AUDIO_UNLOCKED_EVENT));
      setVisible(false);
    });
  }, []);

  if (!visible) return null;

  return createPortal(
    <button
      type="button"
      className={styles.airportAudioUnlockOverlay}
      aria-label="화면을 터치하면 안내 방송이 시작됩니다"
      onPointerDown={handlePointerDown}
    >
      <span className={styles.airportAudioUnlockText}>
        화면을 터치하면 안내 방송이 시작됩니다
      </span>
    </button>,
    document.body,
  );
}
