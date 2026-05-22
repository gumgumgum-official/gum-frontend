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
import { Stage6PhotoboothModal } from "./components/Stage6PhotoboothModal.jsx";
import { Stage6BoardingOverlay } from "./components/Stage6BoardingOverlay.jsx";
import { GameMachineModalShell } from "./components/GameMachineModalShell.jsx";
import { GgumRunnerMinigame } from "./components/GgumRunnerMinigame.jsx";
import { dispatchMinigameClose } from "./utils/stages/stage3/minigameLauncher.js";
import { playUiClickSound } from "./utils/stages/stage3/playUiClickSound.js";
import { waitForStage3GpuReady } from "./utils/stages/stage3/stage3RevealGate.js";
import { KioskOperatorCornerReset } from "./components/KioskOperatorCornerReset.jsx";
import { performKioskSoftRestart } from "./utils/common/kioskSoftRestart.js";
import { beginStage3KioskVisitorSession } from "./utils/stages/stage3/stage3KioskSession.js";
import { requestStage3Reveal } from "./utils/stages/stage3/stage3RevealGate.js";
import {
  getGumServerBaseUrl,
  getMonitorDeviceId,
} from "./lib/monitorCurrentApi.js";
import {
  AIRPORT_CHIME_HIDE_EVENT,
  AIRPORT_CHIME_SHOW_EVENT,
  STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT,
  STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT,
  STAGE6_PHONE_INDICATOR_HIDE_EVENT,
  STAGE6_PHONE_INDICATOR_MODE_IN_CALL,
  STAGE6_PHONE_INDICATOR_MODE_RINGING,
  STAGE6_PHONE_INDICATOR_SHOW_EVENT,
  STAGE6_POSTER_MODAL_HIDE_EVENT,
  STAGE6_POSTER_MODAL_SHOW_EVENT,
  STAGE6_INPUT_BLOCKED_EVENT,
  STAGE6_INTRO_CLICK_HINT_EVENT,
  STAGE6_INTRO_CLICK_HINT_MESSAGE,
} from "./events/stage6Events.js";
import {
  STAGE3_GAME_MACHINE_MODAL_CLOSE_EVENT,
  STAGE3_GAME_MACHINE_MODAL_SHOW_EVENT,
  STAGE3_INTRO_INPUT_BLOCKED_EVENT,
  STAGE3_INTRO_MOVEMENT_HINT_EVENT,
  STAGE3_ISLAND_EXIT_BLOCKED_EVENT,
  STAGE3_NOTICE_MODAL_CLOSE_EVENT,
  STAGE3_NOTICE_MODAL_SHOW_EVENT,
} from "./events/stage3Events.js";
import {
  runStage6NotificationNowOrEnqueue,
  unblockStage6Notifications,
} from "./utils/stages/stage6/stage6NotificationGate.js";

async function callEmergencyAssign(worryId, monitorId) {
  const base = getGumServerBaseUrl();
  const secret = import.meta.env.VITE_EMERGENCY_SECRET;
  if (!base || !secret) return;
  const params = new URLSearchParams({ worryId, secret, monitorId });
  const url = `${base}/api/emergency-assign?${params.toString()}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.ok) {
      console.info(
        `[emergency] worryId=${worryId} → ${json.monitorId} 배정 완료`,
      );
    } else {
      console.warn("[emergency] 배정 실패:", json);
    }
  } catch (e) {
    console.warn("[emergency] 요청 오류:", e);
  }
}

const KIOSK_ALLOWED_STAGES = Object.freeze([3]);

/** @type {import("react").CSSProperties} */
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
  const isAirportRoute = location.pathname === "/airport";
  const isKioskExhibitionRoute = isStartRoute || isKioskRoute || isAirportRoute;
  const showKioskCanvas = isStartRoute || isKioskRoute;
  const [stage3GpuReady, setStage3GpuReady] = useState(false);
  const kioskRenderPaused = isStartRoute && !isKioskRoute && stage3GpuReady;

  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showGameMachineModalShell, setShowGameMachineModalShell] =
    useState(false);
  const [showStage6PosterModal, setShowStage6PosterModal] = useState(false);
  const [stage6PosterImageSrc, setStage6PosterImageSrc] = useState(
    "/assets/poster/stamp_poster.png",
  );
  const [showStage6PhotoboothModal, setShowStage6PhotoboothModal] =
    useState(false);
  const [stage6PhotoboothVideoSrc, setStage6PhotoboothVideoSrc] = useState(
    "/assets/photo_booth/photobooth.mp4",
  );
  const [stage6PhotoboothPhotoSrcs, setStage6PhotoboothPhotoSrcs] = useState([
    "/assets/photo_booth/photo1.png",
    "/assets/photo_booth/photo2.png",
    "/assets/photo_booth/photo3.png",
  ]);
  const [stage6PhotoboothPhotoRatios, setStage6PhotoboothPhotoRatios] =
    useState([0.25, 0.75, 0.82]);
  const [showAirportChime, setShowAirportChime] = useState(false);
  const [phoneIndicatorMode, setPhoneIndicatorMode] = useState(null);
  const [topHudToastMessage, setTopHudToastMessage] = useState(null);
  const topHudToastTimerRef = useRef(null);
  const [introClickHintMessage, setIntroClickHintMessage] = useState(null);
  const introClickHintTimerRef = useRef(null);

  const showTopHudToast = useCallback((message) => {
    setTopHudToastMessage(message);
    if (topHudToastTimerRef.current) {
      clearTimeout(topHudToastTimerRef.current);
    }
    topHudToastTimerRef.current = window.setTimeout(() => {
      setTopHudToastMessage(null);
      topHudToastTimerRef.current = null;
    }, 2000);
  }, []);

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

  const runKioskSoftRestart = useCallback(async () => {
    await performKioskSoftRestart();
    navigate({ pathname: "/start", search: "" }, { replace: true });
  }, [navigate]);

  // 긴급 배정: ?worryId=223 감지 → 서버 emergency-assign 호출 후 파라미터 제거
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const worryId = params.get("worryId");
    if (!worryId) return;

    const monitorId = getMonitorDeviceId();
    void callEmergencyAssign(worryId, monitorId);

    // URL에서 worryId 파라미터 제거 (재실행 방지)
    params.delete("worryId");
    const newSearch = params.toString();
    navigate(
      { pathname: location.pathname, search: newSearch ? `?${newSearch}` : "" },
      { replace: true },
    );
  }, [location.search, location.pathname, navigate]);

  // /kiosk 진입 시 Stage3 reveal 게이트 열기
  useEffect(() => {
    if (isKioskRoute && prevPathnameRef.current !== "/kiosk") {
      requestStage3Reveal();
      beginStage3KioskVisitorSession();
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, isKioskRoute]);

  // /start 대기 중(hidden 캔버스): GPU 워밍업 완료 후에만 렌더 정지
  useEffect(() => {
    if (!showKioskCanvas) {
      setStage3GpuReady(false);
      return;
    }
    let cancelled = false;
    setStage3GpuReady(false);
    void waitForStage3GpuReady().then(() => {
      if (!cancelled) setStage3GpuReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [showKioskCanvas, location.pathname]);

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
    window.addEventListener(STAGE3_NOTICE_MODAL_SHOW_EVENT, showHandler);
    window.addEventListener(STAGE3_NOTICE_MODAL_CLOSE_EVENT, closeHandler);
    return () => {
      window.removeEventListener(STAGE3_NOTICE_MODAL_SHOW_EVENT, showHandler);
      window.removeEventListener(STAGE3_NOTICE_MODAL_CLOSE_EVENT, closeHandler);
    };
  }, []);

  useEffect(() => {
    const showHandler = () => setShowGameMachineModalShell(true);
    const closeHandler = () => closeGameMachineModalShell();
    window.addEventListener(STAGE3_GAME_MACHINE_MODAL_SHOW_EVENT, showHandler);
    window.addEventListener(
      STAGE3_GAME_MACHINE_MODAL_CLOSE_EVENT,
      closeHandler,
    );
    return () => {
      window.removeEventListener(
        STAGE3_GAME_MACHINE_MODAL_SHOW_EVENT,
        showHandler,
      );
      window.removeEventListener(
        STAGE3_GAME_MACHINE_MODAL_CLOSE_EVENT,
        closeHandler,
      );
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
    const hideStage6Poster = () => {
      setShowStage6PosterModal(false);
      unblockStage6Notifications("poster-modal");
    };
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
    const showStage6Photobooth = (event) => {
      const videoSrc =
        typeof event?.detail?.videoSrc === "string" && event.detail.videoSrc
          ? event.detail.videoSrc
          : "/assets/photo_booth/photobooth.mp4";
      const photoSrcs = Array.isArray(event?.detail?.photoSrcs)
        ? event.detail.photoSrcs.filter((src) => typeof src === "string" && src)
        : [];
      const photoRatios = Array.isArray(event?.detail?.photoRatios)
        ? event.detail.photoRatios.filter((r) => typeof r === "number")
        : [0.25, 0.55, 0.82];
      setStage6PhotoboothVideoSrc(videoSrc);
      setStage6PhotoboothPhotoSrcs(photoSrcs);
      setStage6PhotoboothPhotoRatios(photoRatios);
      setShowStage6PhotoboothModal(true);
    };
    const hideStage6Photobooth = () => {
      setShowStage6PhotoboothModal(false);
      unblockStage6Notifications("photobooth-modal");
    };
    window.addEventListener(
      STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT,
      showStage6Photobooth,
    );
    window.addEventListener(
      STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT,
      hideStage6Photobooth,
    );
    return () => {
      window.removeEventListener(
        STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT,
        showStage6Photobooth,
      );
      window.removeEventListener(
        STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT,
        hideStage6Photobooth,
      );
    };
  }, []);

  useEffect(() => {
    const showChime = () =>
      runStage6NotificationNowOrEnqueue(() => setShowAirportChime(true));
    const hideChime = () =>
      runStage6NotificationNowOrEnqueue(() => setShowAirportChime(false));
    window.addEventListener(AIRPORT_CHIME_SHOW_EVENT, showChime);
    window.addEventListener(AIRPORT_CHIME_HIDE_EVENT, hideChime);
    return () => {
      window.removeEventListener(AIRPORT_CHIME_SHOW_EVENT, showChime);
      window.removeEventListener(AIRPORT_CHIME_HIDE_EVENT, hideChime);
    };
  }, []);

  useEffect(() => {
    const INTRO_CLICK_HINT_VISIBLE_MS = 2500;

    const showIntroClickHint = (/** @type {CustomEvent} */ event) => {
      const message =
        typeof event?.detail?.message === "string" && event.detail.message
          ? event.detail.message
          : STAGE6_INTRO_CLICK_HINT_MESSAGE;
      runStage6NotificationNowOrEnqueue(() => {
        setIntroClickHintMessage(message);
        if (introClickHintTimerRef.current) {
          clearTimeout(introClickHintTimerRef.current);
        }
        introClickHintTimerRef.current = window.setTimeout(() => {
          setIntroClickHintMessage(null);
          introClickHintTimerRef.current = null;
        }, INTRO_CLICK_HINT_VISIBLE_MS);
      });
    };

    window.addEventListener(STAGE6_INTRO_CLICK_HINT_EVENT, showIntroClickHint);
    return () => {
      window.removeEventListener(
        STAGE6_INTRO_CLICK_HINT_EVENT,
        showIntroClickHint,
      );
      if (introClickHintTimerRef.current) {
        clearTimeout(introClickHintTimerRef.current);
        introClickHintTimerRef.current = null;
      }
      setIntroClickHintMessage(null);
    };
  }, []);

  useEffect(() => {
    const onIslandExitBlocked = () => {
      showTopHudToast("하핳.. 거기로는 못 가요😅");
    };
    const onStage3TopToastMessage = (/** @type {CustomEvent} */ event) => {
      const message = event.detail?.message;
      if (typeof message === "string" && message.length > 0) {
        showTopHudToast(message);
      }
    };
    const showStage6InputBlockedToast = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (text) showTopHudToast(text);
    };
    window.addEventListener(
      STAGE3_ISLAND_EXIT_BLOCKED_EVENT,
      onIslandExitBlocked,
    );
    window.addEventListener(
      STAGE3_INTRO_INPUT_BLOCKED_EVENT,
      onStage3TopToastMessage,
    );
    window.addEventListener(
      STAGE3_INTRO_MOVEMENT_HINT_EVENT,
      onStage3TopToastMessage,
    );
    window.addEventListener(
      STAGE6_INPUT_BLOCKED_EVENT,
      showStage6InputBlockedToast,
    );
    return () => {
      window.removeEventListener(
        STAGE3_ISLAND_EXIT_BLOCKED_EVENT,
        onIslandExitBlocked,
      );
      window.removeEventListener(
        STAGE3_INTRO_INPUT_BLOCKED_EVENT,
        onStage3TopToastMessage,
      );
      window.removeEventListener(
        STAGE3_INTRO_MOVEMENT_HINT_EVENT,
        onStage3TopToastMessage,
      );
      window.removeEventListener(
        STAGE6_INPUT_BLOCKED_EVENT,
        showStage6InputBlockedToast,
      );
      if (topHudToastTimerRef.current) {
        clearTimeout(topHudToastTimerRef.current);
        topHudToastTimerRef.current = null;
      }
    };
  }, [showTopHudToast]);

  useEffect(() => {
    const showPhone = (e) => {
      const mode = e.detail?.mode;
      runStage6NotificationNowOrEnqueue(() => {
        setPhoneIndicatorMode(
          mode === STAGE6_PHONE_INDICATOR_MODE_IN_CALL
            ? STAGE6_PHONE_INDICATOR_MODE_IN_CALL
            : STAGE6_PHONE_INDICATOR_MODE_RINGING,
        );
      });
    };
    const hidePhone = () => {
      runStage6NotificationNowOrEnqueue(() => setPhoneIndicatorMode(null));
    };
    window.addEventListener(STAGE6_PHONE_INDICATOR_SHOW_EVENT, showPhone);
    window.addEventListener(STAGE6_PHONE_INDICATOR_HIDE_EVENT, hidePhone);
    return () => {
      window.removeEventListener(STAGE6_PHONE_INDICATOR_SHOW_EVENT, showPhone);
      window.removeEventListener(STAGE6_PHONE_INDICATOR_HIDE_EVENT, hidePhone);
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
      <Stage6PhotoboothModal
        isOpen={showStage6PhotoboothModal}
        videoSrc={stage6PhotoboothVideoSrc}
        photoSrcs={stage6PhotoboothPhotoSrcs}
        photoRatios={stage6PhotoboothPhotoRatios}
        onClose={() => setShowStage6PhotoboothModal(false)}
      />
      <Stage6BoardingOverlay />
      <GumCardsModalOverlay />
      {isKioskExhibitionRoute ? (
        <KioskOperatorCornerReset
          onTrigger={() => {
            void runKioskSoftRestart();
          }}
        />
      ) : null}
      <div className="airport-hud-indicator-stack" aria-live="polite">
        <div
          className={`airport-chime-indicator ${showAirportChime ? "visible" : ""}`}
        >
          🔔 띵-동
        </div>
        {introClickHintMessage ? (
          <div className="airport-chime-indicator visible">
            {introClickHintMessage}
          </div>
        ) : null}
        <div
          className={`airport-chime-indicator ${phoneIndicatorMode ? "visible" : ""}`}
        >
          {phoneIndicatorMode === STAGE6_PHONE_INDICATOR_MODE_IN_CALL
            ? "전화 중 📞"
            : "☎️ 전화 왔어요"}
        </div>
        <div
          className={`airport-chime-indicator stage3-island-exit-toast ${topHudToastMessage ? "visible" : ""}`}
        >
          {topHudToastMessage ?? ""}
        </div>
      </div>
      {showKioskCanvas && (
        <div
          style={{
            ...kioskCanvasStyle,
            visibility: isKioskRoute ? "visible" : "hidden",
            pointerEvents: isKioskRoute ? "auto" : "none",
          }}
        >
          <ThreeCanvas
            allowedStages={KIOSK_ALLOWED_STAGES}
            initialStage={3}
            renderPaused={kioskRenderPaused}
          />
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
