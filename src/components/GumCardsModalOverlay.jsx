/**
 * 껌 카드 모달 오버레이: gum-cards-modal:open 수신 시
 * 1) 최초: TentSceneViewer(자막) → GumCardsModal
 * 2) 재오픈: TentSceneViewer(자막 없음) + GumCardsModal 바로 표시
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { GumCardsModal } from "./GumCardsModal.jsx";
import { TentSceneViewer } from "./TentSceneViewer.jsx";
import { playUiClickSound } from "../utils/stages/stage3/playUiClickSound.js";
import {
  dispatchGumCardsModalClose,
  EVENT_OPEN,
  EVENT_CLOSE,
} from "../utils/stages/stage3/gumCardsModalLauncher.js";
import { dispatchGumCardsStick } from "../events/gumCardsEvents.js";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import { preloadTentSceneSubtitleFonts } from "../utils/common/preloadGangwonEduFont.js";

export function GumCardsModalOverlay() {
  // "closed" | "tent" | "cards"
  const [phase, setPhase] = useState("closed");
  /** 세션 내 텐트 자막 시퀀스를 이미 본 뒤 재오픈 시 자막만 생략 */
  const hasSeenTentIntroRef = useRef(false);
  const [skipTentBubbleSequence, setSkipTentBubbleSequence] = useState(false);

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
      if (hasSeenTentIntroRef.current) {
        setSkipTentBubbleSequence(true);
        setPhase("cards");
        return;
      }
      hasSeenTentIntroRef.current = true;
      setSkipTentBubbleSequence(false);
      void preloadTentSceneSubtitleFonts({
        label: STAGE3_OBJECTS_CONFIG.tent?.tentSceneSubtitleLabel,
        messages: STAGE3_OBJECTS_CONFIG.tent?.tentSceneSubtitles,
      });
      setPhase("tent");
    };
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, []);

  useEffect(() => {
    const onClose = () => {
      hasSeenTentIntroRef.current = false;
      setPhase("closed");
    };
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
        <TentSceneViewer
          onClose={closeAll}
          onCardOpen={openCards}
          skipBubbleSequence={skipTentBubbleSequence}
        />
      )}
      <GumCardsModal
        open={phase === "cards"}
        onClose={closeAll}
        onStick={handleGumCardStick}
      />
    </>
  );
}
