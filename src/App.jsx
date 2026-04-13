import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BeamPage } from "./pages/BeamPage.jsx";
import { KioskPage } from "./pages/KioskPage.jsx";
import { DevPage } from "./pages/DevPage.jsx";
import { MemoryTestPage } from "./pages/MemoryTestPage.jsx";
import { NoticeModalBoard } from "./components/NoticeModalBoard.jsx";
import { GumCardsModalOverlay } from "./components/GumCardsModalOverlay.jsx";

export function App() {
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [airportSubtitleText, setAirportSubtitleText] = useState("");
  const [showAirportSubtitle, setShowAirportSubtitle] = useState(false);
  const [fadeOutAirportSubtitle, setFadeOutAirportSubtitle] = useState(false);
  const [showAirportChime, setShowAirportChime] = useState(false);

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
    let hideTimerId = 0;

    const showSubtitle = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      if (hideTimerId) {
        window.clearTimeout(hideTimerId);
        hideTimerId = 0;
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
      if (!showAirportSubtitle) return;
      setFadeOutAirportSubtitle(true);
      hideTimerId = window.setTimeout(() => {
        setShowAirportSubtitle(false);
        setFadeOutAirportSubtitle(false);
        setAirportSubtitleText("");
        hideTimerId = 0;
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
      if (hideTimerId) {
        window.clearTimeout(hideTimerId);
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
  }, [showAirportSubtitle]);

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
        <Route path="/beam" element={<BeamPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/dev" element={<DevPage />} />
        <Route path="/memory-test" element={<MemoryTestPage />} />
        <Route path="/" element={<Navigate to="/dev" replace />} />
        <Route path="*" element={<Navigate to="/dev" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
