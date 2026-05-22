/**
 * Stage3 gum_server 모니터 REST 폴링 → worry(svgUrl) 할당 및 Supabase fallback
 */
import {
  MONITOR_POLL_MS,
  fetchMonitorCurrent,
  postMonitorStart,
} from "../../../../lib/monitorCurrentApi.js";
import { STAGE3_MONITOR_FALLBACK_TIMEOUT_MS } from "../../../../config/stages/stage3/stage3Monitor.js";

/**
 * @param {{
 *   getIsStageActive: () => boolean,
 *   canLoadLetter: () => boolean,
 *   getHoldFallUntilIntroTopView: () => boolean,
 *   onLoadFromSvgUrl: (svgUrl: string, worryId: string, options: { holdFallUntilIntroTopView?: boolean }) => void,
 *   onLoadLatestFromSupabase: (options: { holdFallUntilIntroTopView?: boolean }) => void,
 * }} params
 */
export function createStage3MonitorController({
  getIsStageActive,
  canLoadLetter,
  getHoldFallUntilIntroTopView,
  onLoadFromSvgUrl,
  onLoadLatestFromSupabase,
}) {
  /** @type {string | null} */
  let assignedWorryId = null;
  /** @type {string | null} */
  let assignedSvgUrl = null;
  /** REST로 busy(worry)를 한 번이라도 받으면 true → Supabase fallback 타이머 미실행 */
  let monitorRestAssignmentReceived = false;
  /** @type {number | null} */
  let monitorPollIntervalId = null;
  let monitorPollInFlight = false;
  /** @type {number | null} */
  let monitorFallbackTimeoutId = null;
  /** 배경 ready당 1회만 fallback·편지 로드 (island ready + kiosk begin 이중 호출 방지) */
  let backgroundReadyHandled = false;

  function applyMonitorIdleState() {
    if (monitorRestAssignmentReceived || assignedWorryId || assignedSvgUrl) {
      return;
    }
    assignedWorryId = null;
    assignedSvgUrl = null;
  }

  /**
   * @param {object} worry
   */
  function applyMonitorBusyWorry(worry) {
    const worryId = worry?.worryId ?? worry?.id ?? worry?.seq;
    const svgUrl = worry?.svgUrl;
    if (worryId == null || worryId === "" || !svgUrl) {
      console.warn("[Stage3] monitor busy 응답에 worryId/svgUrl 누락:", worry);
      return;
    }
    const wid = String(worryId);
    const surl = String(svgUrl);
    if (assignedWorryId === wid && assignedSvgUrl === surl) {
      return;
    }

    if (!monitorRestAssignmentReceived) {
      monitorRestAssignmentReceived = true;
      if (monitorFallbackTimeoutId != null) {
        window.clearTimeout(monitorFallbackTimeoutId);
        monitorFallbackTimeoutId = null;
      }
    }

    assignedWorryId = wid;
    assignedSvgUrl = surl;

    if (canLoadLetter()) {
      onLoadFromSvgUrl(surl, wid, {
        holdFallUntilIntroTopView: getHoldFallUntilIntroTopView(),
      });
    }
  }

  async function pollMonitorCurrent() {
    if (monitorPollInFlight) return;
    monitorPollInFlight = true;
    try {
      const data = await fetchMonitorCurrent();
      if (data == null) return;
      const status = data?.status;

      if (status === "idle") {
        applyMonitorIdleState();
        return;
      }

      if (status === "busy" && data.worry) {
        applyMonitorBusyWorry(data.worry);
        return;
      }

      if (status === "busy") {
        console.warn("[Stage3] monitor busy인데 worry 없음:", data);
      }
    } catch (e) {
      console.warn("[Stage3] monitor current 폴링 실패:", e);
    } finally {
      monitorPollInFlight = false;
    }
  }

  function startMonitorPolling() {
    if (monitorPollIntervalId != null) return;
    void pollMonitorCurrent();
    monitorPollIntervalId = window.setInterval(() => {
      void pollMonitorCurrent();
    }, MONITOR_POLL_MS);
  }

  function stopMonitorPolling() {
    if (monitorPollIntervalId != null) {
      window.clearInterval(monitorPollIntervalId);
      monitorPollIntervalId = null;
    }
  }

  function clearFallbackTimeout() {
    if (monitorFallbackTimeoutId != null) {
      window.clearTimeout(monitorFallbackTimeoutId);
      monitorFallbackTimeoutId = null;
    }
  }

  /** POST .../start 후 current 폴링 시작 */
  function startSession() {
    void (async () => {
      try {
        const ok = await postMonitorStart();
        if (!ok) {
          console.warn(
            "[Stage3] monitor start 실패 — 폴링은 계속 (fallback 가능)",
          );
        }
      } catch (e) {
        console.warn("[Stage3] monitor start 예외:", e);
      }
      startMonitorPolling();
    })();
  }

  /**
   * 배경 로드 완료 시: REST 할당이 있으면 즉시 낙하, 없으면 fallback 타이머
   */
  function onBackgroundReady() {
    if (backgroundReadyHandled) return;
    backgroundReadyHandled = true;

    if (assignedSvgUrl) {
      onLoadFromSvgUrl(assignedSvgUrl, assignedWorryId ?? "", {
        holdFallUntilIntroTopView: true,
      });
      return;
    }
    clearFallbackTimeout();
    monitorFallbackTimeoutId = window.setTimeout(() => {
      monitorFallbackTimeoutId = null;
      if (monitorRestAssignmentReceived || assignedSvgUrl) return;
      if (!getIsStageActive()) return;
      onLoadLatestFromSupabase({ holdFallUntilIntroTopView: false });
    }, STAGE3_MONITOR_FALLBACK_TIMEOUT_MS);
  }

  function resetForSetup() {
    assignedWorryId = null;
    assignedSvgUrl = null;
    monitorRestAssignmentReceived = false;
    backgroundReadyHandled = false;
    clearFallbackTimeout();
    stopMonitorPolling();
  }

  function cleanup() {
    clearFallbackTimeout();
    stopMonitorPolling();
    resetForSetup();
  }

  return {
    startSession,
    onBackgroundReady,
    resetForSetup,
    cleanup,
    getAssignedWorry: () => ({
      svgUrl: assignedSvgUrl,
      worryId: assignedWorryId,
    }),
    hasRestAssignmentReceived: () => monitorRestAssignmentReceived,
  };
}
