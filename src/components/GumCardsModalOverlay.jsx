/**
 * 껌 카드 모달 오버레이: gum-cards-modal:open 수신 시
 * 1) TentSceneViewer 를 먼저 표시
 * 2) TentSceneViewer 에서 클릭하면 GumCardsModal 표시
 */
import { useState, useEffect, useCallback } from "react";
import { GumCardsModal } from "./GumCardsModal.jsx";
import { TentSceneViewer } from "./TentSceneViewer.jsx";
import { playUiClickSound } from "../utils/common/playUiClickSound.js";
import {
  dispatchGumCardsModalClose,
  EVENT_OPEN,
  EVENT_CLOSE,
} from "../utils/stages/stage3/gumCardsModalLauncher.js";
import { dispatchGumCardsStick } from "../events/gumCardsEvents.js";

export function GumCardsModalOverlay() {
  // "closed" | "tent" | "cards"
  const [phase, setPhase] = useState("closed");

  const closeAll = useCallback(() => {
    playUiClickSound();
    setPhase("closed");
    dispatchGumCardsModalClose();
  }, []);

  const openCards = useCallback(() => {
    setPhase("cards");
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setPhase("tent");
    };
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, []);

  useEffect(() => {
    const onClose = () => setPhase("closed");
    window.addEventListener(EVENT_CLOSE, onClose);
    return () => window.removeEventListener(EVENT_CLOSE, onClose);
  }, []);

  const handleGumCardStick = useCallback(
    (card) => {
      dispatchGumCardsStick(card.num);
      closeAll();
    },
    [closeAll],
  );

  return (
    <>
      {(phase === "tent" || phase === "cards") && (
        <TentSceneViewer onClose={closeAll} onCardOpen={openCards} />
      )}
      <GumCardsModal
        open={phase === "cards"}
        onClose={closeAll}
        onStick={handleGumCardStick}
      />
    </>
  );
}
