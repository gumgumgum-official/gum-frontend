import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TabletPage } from "./pages/TabletPage.jsx";
import { BeamPage } from "./pages/BeamPage.jsx";
import { KioskPage } from "./pages/KioskPage.jsx";
import { DevPage } from "./pages/DevPage.jsx";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/tablet" element={<TabletPage />} />
        <Route path="/beam" element={<BeamPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/dev" element={<DevPage />} />
        <Route path="/" element={<Navigate to="/dev" replace />} />
        <Route path="*" element={<Navigate to="/dev" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
