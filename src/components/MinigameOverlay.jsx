/**
 * 미니게임 오버레이: EVENT_OPEN 수신 시 WeedGameUI 모달 표시
 * [X] / [닫기] 클릭 시 dispatchMinigameClose() 호출
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { WeedGameUI } from "../minigame";
import {
  dispatchMinigameClose,
  EVENT_OPEN,
  EVENT_CLOSE,
} from "../utils/stages/stage3/minigameLauncher.js";

export function MinigameOverlay() {
  const [visible, setVisible] = useState(false);
  const overlayRootRef = useRef(null);

  // #region agent log
  useLayoutEffect(() => {
    if (!visible) return;
    const overlay = overlayRootRef.current;
    if (!overlay) return;

    let sendCount = 0;
    const MAX_SENDS = 5;
    /** @type {ResizeObserver | null} */
    let roInst = null;
    const sendLayout = () => {
      if (sendCount >= MAX_SENDS) return;
      sendCount += 1;
      const modalEl = overlay.querySelector("[data-minigame-modal-card]");
      const cs = window.getComputedStyle(overlay);
      const pl = Number.parseFloat(cs.paddingLeft) || 0;
      const pr = Number.parseFloat(cs.paddingRight) || 0;
      const pt = Number.parseFloat(cs.paddingTop) || 0;
      const pb = Number.parseFloat(cs.paddingBottom) || 0;
      const overlayR = overlay.getBoundingClientRect();
      const availW = overlayR.width - pl - pr;
      const availH = overlayR.height - pt - pb;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let modalR = null;
      let modalComputedHeight = "";
      let modalComputedWidth = "";
      if (modalEl) {
        modalR = modalEl.getBoundingClientRect();
        const mcs = window.getComputedStyle(modalEl);
        modalComputedHeight = mcs.height;
        modalComputedWidth = mcs.width;
      }

      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "ce2614",
          },
          body: JSON.stringify({
            sessionId: "ce2614",
            runId: "minigame-modal-fill",
            hypothesisId: "H1-H4",
            location: "MinigameOverlay.jsx:layout",
            message: "overlay and modal rects vs viewport",
            data: {
              vw,
              vh,
              overlayW: overlayR.width,
              overlayH: overlayR.height,
              padding: { pl, pr, pt, pb },
              availW,
              availH,
              modalClientRect: modalR
                ? {
                    width: modalR.width,
                    height: modalR.height,
                    top: modalR.top,
                    left: modalR.left,
                  }
                : null,
              modalComputedWidth,
              modalComputedHeight,
              modalW_pct_vw:
                modalR && vw
                  ? Number(((modalR.width / vw) * 100).toFixed(2))
                  : null,
              modalH_pct_vh:
                modalR && vh
                  ? Number(((modalR.height / vh) * 100).toFixed(2))
                  : null,
              modalVsAvailH_pct:
                modalR && availH
                  ? Number(((modalR.height / availH) * 100).toFixed(2))
                  : null,
              modalVsAvailW_pct:
                modalR && availW
                  ? Number(((modalR.width / availW) * 100).toFixed(2))
                  : null,
              sendIndex: sendCount,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      if (sendCount >= MAX_SENDS && roInst) {
        roInst.disconnect();
        roInst = null;
      }
    };

    sendLayout();
    const ResizeObserverCtor = window.ResizeObserver;
    if (typeof ResizeObserverCtor === "function") {
      roInst = new ResizeObserverCtor(() => sendLayout());
      roInst.observe(overlay);
    }
    requestAnimationFrame(() => sendLayout());
    return () => {
      roInst?.disconnect?.();
      roInst = null;
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    setVisible(false);
    dispatchMinigameClose();
  }, []);

  useEffect(() => {
    const onOpen = () => {
      // #region agent log
      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "ce2614",
          },
          body: JSON.stringify({
            sessionId: "ce2614",
            runId: "minigame-modal-fill",
            hypothesisId: "H5",
            location: "MinigameOverlay.jsx:onOpen",
            message: "minigame open event received",
            data: { event: EVENT_OPEN },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      setVisible(true);
    };
    window.addEventListener(EVENT_OPEN, onOpen);
    return () => window.removeEventListener(EVENT_OPEN, onOpen);
  }, []);

  useEffect(() => {
    const onClose = () => setVisible(false);
    window.addEventListener(EVENT_CLOSE, onClose);
    return () => window.removeEventListener(EVENT_CLOSE, onClose);
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={overlayRootRef}
      className="minigame-theme"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(10px, 1.5vw, 20px)",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <WeedGameUI onClose={handleClose} />
    </div>
  );
}
