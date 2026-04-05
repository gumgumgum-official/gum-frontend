import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BeamPage } from "./pages/BeamPage.jsx";
import { KioskPage } from "./pages/KioskPage.jsx";
import { DevPage } from "./pages/DevPage.jsx";
import { MemoryTestPage } from "./pages/MemoryTestPage.jsx";
import { StartPage } from "./pages/StartPage.jsx";
import { NoticeModalBoard } from "./components/NoticeModalBoard.jsx";

export function App() {
  const [showNoticeModal, setShowNoticeModal] = useState(false);

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

  return (
    <BrowserRouter>
      <NoticeModalBoard
        isOpen={showNoticeModal}
        onClose={() => setShowNoticeModal(false)}
      />
      <Routes>
        <Route path="/start" element={<StartPage />} />
        <Route path="/beam" element={<BeamPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/dev" element={<DevPage />} />
        <Route path="/memory-test" element={<MemoryTestPage />} />
        <Route path="/" element={<Navigate to="/start" replace />} />
        <Route path="*" element={<Navigate to="/dev" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
