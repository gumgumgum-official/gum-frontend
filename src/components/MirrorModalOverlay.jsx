/**
 * 거울 모달 오버레이: mirror-modal:open 이벤트 수신 시 GumCardsModal 표시
 */
import { useState, useEffect, useCallback } from "react";
import { GumCardsModal } from "./GumCardsModal.jsx";
import {
  dispatchMirrorModalClose,
  EVENT_OPEN,
} from "../utils/stages/stage3/mirrorModalLauncher.js";

export function MirrorModalOverlay() {
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => {
    setVisible(false);
    dispatchMirrorModalClose();
  }, []);

  useEffect(() => {
    const onOpen = () => setVisible(true);
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, []);

  return <GumCardsModal open={visible} onClose={handleClose} />;
}
