/**
 * 껌 카드 모달 오버레이: gum-cards-modal:open 수신 시 GumCardsModal 표시
 * 텐트 효과음은 이 컴포넌트가 아니라 openGumCardsModal() 호출 시 재생됨
 */
import { useState, useEffect, useCallback } from "react";
import { GumCardsModal } from "./GumCardsModal.jsx";
import { playUiClickSound } from "../utils/common/playUiClickSound.js";
import {
  dispatchGumCardsModalClose,
  EVENT_OPEN,
  EVENT_CLOSE,
} from "../utils/stages/stage3/gumCardsModalLauncher.js";

export function GumCardsModalOverlay() {
  const [visible, setVisible] = useState(false);

  const handleClose = useCallback(() => {
    playUiClickSound();
    setVisible(false);
    dispatchGumCardsModalClose();
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

  return <GumCardsModal open={visible} onClose={handleClose} />;
}
