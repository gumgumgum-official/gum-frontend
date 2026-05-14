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

function sendTentDebugLog(
  location,
  message,
  data,
  hypothesisId,
  runId = "pre-fix",
) {
  // #region agent log
  fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "de1c43",
    },
    body: JSON.stringify({
      sessionId: "de1c43",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

export function GumCardsModalOverlay() {
  // "closed" | "tent" | "cards"
  const [phase, setPhase] = useState("closed");

  const closeAll = useCallback(() => {
    sendTentDebugLog(
      "GumCardsModalOverlay.jsx:closeAll",
      "closeAll invoked",
      { phaseBeforeClose: phase },
      "H4",
    );
    playUiClickSound();
    setPhase("closed");
    dispatchGumCardsModalClose();
  }, [phase]);

  const openCards = useCallback(() => {
    sendTentDebugLog(
      "GumCardsModalOverlay.jsx:openCards",
      "openCards invoked",
      { phaseBeforeOpenCards: phase },
      "H4",
    );
    setPhase("cards");
  }, [phase]);

  useEffect(() => {
    const onOpen = () => {
      sendTentDebugLog(
        "GumCardsModalOverlay.jsx:onOpen",
        "EVENT_OPEN received",
        { nextPhase: "tent" },
        "H4",
      );
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

  useEffect(() => {
    sendTentDebugLog(
      "GumCardsModalOverlay.jsx:phaseEffect",
      "phase changed",
      { phase },
      "H4",
    );
  }, [phase]);

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
