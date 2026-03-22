/**
 * 미니게임 오버레이: EVENT_OPEN 수신 시 WeedGameUI 모달 표시
 * [X] / [닫기] 클릭 시 dispatchMinigameClose() 호출
 */
import { useState, useEffect, useCallback } from "react";
import { WeedGameUI } from "../minigame";
import {
  dispatchMinigameClose,
  EVENT_OPEN,
  EVENT_CLOSE,
} from "../utils/stages/stage3/minigameLauncher.js";

export function MinigameOverlay() {
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => {
    setVisible(false);
    dispatchMinigameClose();
  }, []);

  useEffect(() => {
    const onOpen = () => setVisible(true);
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, []);

  useEffect(() => {
    const onClose = () => setVisible(false);
    window.addEventListener(EVENT_CLOSE, onClose);
    return () => window.removeEventListener(EVENT_CLOSE, onClose);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="minigame-theme"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <WeedGameUI onClose={handleClose} />
    </div>
  );
}
