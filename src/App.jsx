import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BeamPage } from "./pages/BeamPage.jsx";
import { KioskPage } from "./pages/KioskPage.jsx";
import { AirportPage } from "./pages/AirportPage.jsx";
import { DevPage } from "./pages/DevPage.jsx";
import { MemoryTestPage } from "./pages/MemoryTestPage.jsx";
import { StartPage } from "./pages/StartPage.jsx";
import { NoticeModalBoard } from "./components/NoticeModalBoard.jsx";
import { GumCardsModalOverlay } from "./components/GumCardsModalOverlay.jsx";
import { Stage6PosterModal } from "./components/Stage6PosterModal.jsx";

export function App() {
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showStage6PosterModal, setShowStage6PosterModal] = useState(false);
  const [stage6PosterImageSrc, setStage6PosterImageSrc] = useState(
    "/assets/poster/stamp_poster.png",
  );
  const [airportSubtitleText, setAirportSubtitleText] = useState("");
  const [showAirportSubtitle, setShowAirportSubtitle] = useState(false);
  const [fadeOutAirportSubtitle, setFadeOutAirportSubtitle] = useState(false);
  const [showAirportChime, setShowAirportChime] = useState(false);
  const hideTimerRef = useRef(0);
  const showAirportSubtitleRef = useRef(false);

  useEffect(() => {
    showAirportSubtitleRef.current = showAirportSubtitle;
  }, [showAirportSubtitle]);

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
    const showStage6Poster = (event) => {
      const imageSrc =
        typeof event?.detail?.imageSrc === "string" && event.detail.imageSrc
          ? event.detail.imageSrc
          : "/assets/poster/stamp_poster.png";
      setStage6PosterImageSrc(imageSrc);
      setShowStage6PosterModal(true);
    };
    const hideStage6Poster = () => setShowStage6PosterModal(false);
    window.addEventListener("gum:stage6PosterModal:show", showStage6Poster);
    window.addEventListener("gum:stage6PosterModal:hide", hideStage6Poster);
    return () => {
      window.removeEventListener(
        "gum:stage6PosterModal:show",
        showStage6Poster,
      );
      window.removeEventListener(
        "gum:stage6PosterModal:hide",
        hideStage6Poster,
      );
    };
  }, []);

  useEffect(() => {
    const showSubtitle = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = 0;
      }
      setAirportSubtitleText(text);
      setFadeOutAirportSubtitle(false);
      setShowAirportSubtitle(true);
    };

    const updateSubtitle = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      setAirportSubtitleText(text);
      setFadeOutAirportSubtitle(false);
      setShowAirportSubtitle(true);
    };

    const hideSubtitle = () => {
      if (!showAirportSubtitleRef.current) return;
      setFadeOutAirportSubtitle(true);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setShowAirportSubtitle(false);
        setFadeOutAirportSubtitle(false);
        setAirportSubtitleText("");
        hideTimerRef.current = 0;
      }, 600);
    };

    window.addEventListener(
      "gum:airportAnnouncementSubtitle:show",
      showSubtitle,
    );
    window.addEventListener(
      "gum:airportAnnouncementSubtitle:update",
      updateSubtitle,
    );
    window.addEventListener(
      "gum:airportAnnouncementSubtitle:hide",
      hideSubtitle,
    );

    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = 0;
      }
      window.removeEventListener(
        "gum:airportAnnouncementSubtitle:show",
        showSubtitle,
      );
      window.removeEventListener(
        "gum:airportAnnouncementSubtitle:update",
        updateSubtitle,
      );
      window.removeEventListener(
        "gum:airportAnnouncementSubtitle:hide",
        hideSubtitle,
      );
    };
  }, []);

  useEffect(() => {
    const showChime = () => setShowAirportChime(true);
    const hideChime = () => setShowAirportChime(false);

    window.addEventListener("gum:airportAnnouncementChime:show", showChime);
    window.addEventListener("gum:airportAnnouncementChime:hide", hideChime);

    return () => {
      window.removeEventListener(
        "gum:airportAnnouncementChime:show",
        showChime,
      );
      window.removeEventListener(
        "gum:airportAnnouncementChime:hide",
        hideChime,
      );
    };
  }, []);

  return (
    <BrowserRouter>
      <NoticeModalBoard
        isOpen={showNoticeModal}
        onClose={() => setShowNoticeModal(false)}
      />
      <Stage6PosterModal
        isOpen={showStage6PosterModal}
        imageSrc={stage6PosterImageSrc}
        onClose={() => setShowStage6PosterModal(false)}
      />
      <GumCardsModalOverlay />
      <div
        className={`airport-chime-indicator ${showAirportChime ? "visible" : ""}`}
      >
        🔔 띵-동
      </div>
      <div className="airport-subtitle-container" aria-live="polite">
        <div
          className={`airport-subtitle-box ${
            showAirportSubtitle ? "visible" : ""
          } ${fadeOutAirportSubtitle ? "fade-out" : ""}`}
        >
          <div className="airport-subtitle-label">ANNOUNCEMENT</div>
          <div className="airport-subtitle-text">
            {airportSubtitleText.split("\n").map((line, idx, lines) => (
              <span key={`${line}-${idx}`}>
                {line}
                {idx < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
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
    </BrowserRouter>
  );
}
