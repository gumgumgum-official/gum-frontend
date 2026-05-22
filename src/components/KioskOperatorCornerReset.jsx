/**
 * 키오스크 운영자 숨김 제스처: 우측 상단을 짧은 시간에 연속 탭하면 소프트 리셋.
 */
import { useCallback, useRef } from "react";
import {
  KIOSK_SOFT_RESTART_CORNER_TAP_COUNT,
  KIOSK_SOFT_RESTART_CORNER_TAP_WINDOW_MS,
} from "../utils/common/kioskSoftRestart.js";
import styles from "./KioskOperatorCornerReset.module.css";

/**
 * @param {{ onTrigger: () => void, disabled?: boolean }} props
 */
export function KioskOperatorCornerReset({ onTrigger, disabled = false }) {
  const tapTimesRef = useRef(/** @type {number[]} */ ([]));

  const handlePointerDown = useCallback(
    (event) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      tapTimesRef.current = tapTimesRef.current.filter(
        (t) => now - t < KIOSK_SOFT_RESTART_CORNER_TAP_WINDOW_MS,
      );
      tapTimesRef.current.push(now);
      if (tapTimesRef.current.length >= KIOSK_SOFT_RESTART_CORNER_TAP_COUNT) {
        tapTimesRef.current = [];
        onTrigger();
      }
    },
    [disabled, onTrigger],
  );

  return (
    <div
      className={styles.cornerHit}
      aria-hidden="true"
      onPointerDown={handlePointerDown}
    />
  );
}
