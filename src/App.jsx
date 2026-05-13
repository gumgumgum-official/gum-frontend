import { useState, useEffect, useCallback, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ThreeCanvas } from "./components/ThreeCanvas.jsx";
import { BeamPage } from "./pages/BeamPage.jsx";
import { KioskPage } from "./pages/KioskPage.jsx";
import { AirportPage } from "./pages/AirportPage.jsx";
import { DevPage } from "./pages/DevPage.jsx";
import { MemoryTestPage } from "./pages/MemoryTestPage.jsx";
import { StartPage } from "./pages/StartPage.jsx";
import { NoticeModalBoard } from "./components/NoticeModalBoard.jsx";
import { GumCardsModalOverlay } from "./components/GumCardsModalOverlay.jsx";
import { Stage6PosterModal } from "./components/Stage6PosterModal.jsx";
import { Stage6BoardingOverlay } from "./components/Stage6BoardingOverlay.jsx";
import { GameMachineModalShell } from "./components/GameMachineModalShell.jsx";
import { GgumRunnerMinigame } from "./components/GgumRunnerMinigame.jsx";
import { dispatchMinigameClose } from "./utils/stages/stage3/minigameLauncher.js";
import { playUiClickSound } from "./utils/common/playUiClickSound.js";
import { requestStage3Reveal } from "./utils/stages/stage3/stage3RevealGate.js";
import {
  AIRPORT_CHIME_HIDE_EVENT,
  AIRPORT_CHIME_SHOW_EVENT,
  STAGE6_POSTER_MODAL_HIDE_EVENT,
  STAGE6_POSTER_MODAL_SHOW_EVENT,
} from "./events/stage6Events.js";

const KIOSK_ALLOWED_STAGES = Object.freeze([3]);

const kioskCanvasStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
};

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const prevPathnameRef = useRef("");

  const isStartRoute = location.pathname === "/start";
  const isKioskRoute = location.pathname === "/kiosk";
  const showKioskCanvas = isStartRoute || isKioskRoute;

  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showGameMachineModalShell, setShowGameMachineModalShell] =
    useState(false);
  const [showStage6PosterModal, setShowStage6PosterModal] = useState(false);
  const [stage6PosterImageSrc, setStage6PosterImageSrc] = useState(
    "/assets/poster/stamp_poster.png",
  );
  const [showAirportChime, setShowAirportChime] = useState(false);

  const closeGameMachineModalShell = useCallback(() => {
    setShowGameMachineModalShell(false);
    dispatchMinigameClose();
  }, []);
  const handleNoticeModalClose = useCallback(() => {
    setShowNoticeModal(false);
    window.dispatchEvent(new CustomEvent("gum:noticeModalClosed"));
  }, []);

  const closeGameMachineModalShellWithSound = useCallback(() => {
    playUiClickSound();
    closeGameMachineModalShell();
  }, [closeGameMachineModalShell]);

  // /kiosk 진입 시 Stage3 reveal 게이트 열기
  useEffect(() => {
    if (isKioskRoute && prevPathnameRef.current !== "/kiosk") {
      requestStage3Reveal();
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, isKioskRoute]);

  // Stage3 → Stage6 전환 이벤트 (/kiosk에서만)
  useEffect(() => {
    if (!isKioskRoute) return;
    const onStageSwitch = (e) => {
      const { targetStage } = e.detail ?? {};
      if (targetStage === 6) {
        const params = new URLSearchParams(location.search);
        navigate(`/airport?${params.toString()}`);
      }
    };
    window.addEventListener("stage:switch", onStageSwitch);
    return () => window.removeEventListener("stage:switch", onStageSwitch);
  }, [isKioskRoute, location.search, navigate]);

  useEffect(() => {
    const showHandler = () => setShowNoticeModal(true);
    const closeHandler = () => setShowNoticeModal(false);
    window.addEventListener("gum:showNoticeModal", showHandler);
    window.addEventListener("gum:closeNoticeModal", closeHandler);
    return () => {
      window.removeEventListener("gum:showNoticeModal", showHandler);
      window.removeEventListener("gum:closeNoticeModal", closeHandler);
    };
  }, []);

  useEffect(() => {
    const showHandler = () => setShowGameMachineModalShell(true);
    const closeHandler = () => closeGameMachineModalShell();
    window.addEventListener("gum:showGameMachineModal", showHandler);
    window.addEventListener("gum:closeGameMachineModal", closeHandler);
    return () => {
      window.removeEventListener("gum:showGameMachineModal", showHandler);
      window.removeEventListener("gum:closeGameMachineModal", closeHandler);
    };
  }, [closeGameMachineModalShell]);

  useEffect(() => {
    const showStage6Poster = (event) => {
      const imageSrc =
        typeof event?.detail?.imageSrc === "string" && event.detail.imageSrc
          ? event.detail.imageSrc
          : "/assets/poster/stamp_poster.png";
      setStage6PosterImageSrc(imageSrc);
      setShowStage6PosterModal(true);
    };
    const hideStage6Poster = () => setShowStage6PosterModal(false);
    window.addEventListener(STAGE6_POSTER_MODAL_SHOW_EVENT, showStage6Poster);
    window.addEventListener(STAGE6_POSTER_MODAL_HIDE_EVENT, hideStage6Poster);
    return () => {
      window.removeEventListener(
        STAGE6_POSTER_MODAL_SHOW_EVENT,
        showStage6Poster,
      );
      window.removeEventListener(
        STAGE6_POSTER_MODAL_HIDE_EVENT,
        hideStage6Poster,
      );
    };
  }, []);

  useEffect(() => {
    const showChime = () => setShowAirportChime(true);
    const hideChime = () => setShowAirportChime(false);
    window.addEventListener(AIRPORT_CHIME_SHOW_EVENT, showChime);
    window.addEventListener(AIRPORT_CHIME_HIDE_EVENT, hideChime);
    return () => {
      window.removeEventListener(AIRPORT_CHIME_SHOW_EVENT, showChime);
      window.removeEventListener(AIRPORT_CHIME_HIDE_EVENT, hideChime);
    };
  }, []);

  return (
    <>
      <NoticeModalBoard
        isOpen={showNoticeModal}
        onClose={handleNoticeModalClose}
      />
      <GameMachineModalShell
        isOpen={showGameMachineModalShell}
        onClose={closeGameMachineModalShellWithSound}
        ariaLabel="게임기 모달"
        hideCloseButton
        contentStyle={{
          width: "min(860px, 100%)",
          minHeight: "clamp(360px, 62vh, 620px)",
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        }}
        bodyStyle={{ marginTop: 0 }}
      >
        <GgumRunnerMinigame onClose={closeGameMachineModalShellWithSound} />
      </GameMachineModalShell>
      <Stage6PosterModal
        isOpen={showStage6PosterModal}
        imageSrc={stage6PosterImageSrc}
        onClose={() => setShowStage6PosterModal(false)}
      />
      <Stage6BoardingOverlay />
      <GumCardsModalOverlay />
      <div
        className={`airport-chime-indicator ${showAirportChime ? "visible" : ""}`}
      >
        🔔 띵-동
      </div>
      {showKioskCanvas && (
        <div
          style={{
            ...kioskCanvasStyle,
            visibility: isKioskRoute ? "visible" : "hidden",
            pointerEvents: isKioskRoute ? "auto" : "none",
          }}
        >
          <ThreeCanvas allowedStages={KIOSK_ALLOWED_STAGES} initialStage={3} />
        </div>
      )}
      <Routes>
        <Route path="/start" element={<StartPage />} />
        <Route path="/beam" element={<BeamPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/airport" element={<AirportPage />} />
        <Route path="/dev" element={<DevPage />} />
        <Route path="/memory-test" element={<MemoryTestPage />} />
        <Route path="/" element={<Navigate to="/start" replace />} />
        <Route path="*" element={<Navigate to="/dev" replace />} />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
