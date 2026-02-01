/**
 * 메모리 누수 테스트 페이지
 * ThreeCanvas 마운트/언마운트 반복 후 heap 변화 확인
 * Chrome에서 performance.memory 사용 시: --enable-precise-memory-info 필요
 */

import { useState, useMemo } from "react";
import { ThreeCanvas } from "../components/ThreeCanvas.jsx";
import styles from "./Page.module.css";

const TEST_STAGES = [2, 3, 4, 5, 6];
const CYCLE_COUNT = 10;
const MOUNT_DURATION_MS = 3000;
const UNMOUNT_DURATION_MS = 1500;

/** @returns {{ used: number; total: number } | null } */
function getMemoryInfo() {
  const perf = typeof window !== "undefined" ? window.performance : null;
  if (perf?.memory && typeof perf.memory.usedJSHeapSize === "number") {
    return {
      used: perf.memory.usedJSHeapSize,
      total: perf.memory.totalJSHeapSize,
      limit: perf.memory.jsHeapSizeLimit,
    };
  }
  return null;
}

function formatMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function forceGC() {
  if (typeof window !== "undefined" && window.gc) {
    window.gc();
  }
}

export function MemoryTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [log, setLog] = useState([]);
  const [cycle, setCycle] = useState(0);

  const allowedStages = useMemo(() => TEST_STAGES, []);

  async function runTest() {
    setIsRunning(true);
    setLog([]);

    const mem = getMemoryInfo();
    if (!mem) {
      setLog((prev) => [
        ...prev,
        "⚠️ Chrome에서 --enable-precise-memory-info 플래그로 실행해주세요.",
        "예: chrome.exe --enable-precise-memory-info",
      ]);
      setIsRunning(false);
      return;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const initialUsed = mem.used;
    setLog((prev) => [...prev, `[0] 초기 heap: ${formatMB(initialUsed)}`]);

    for (let i = 1; i <= CYCLE_COUNT; i++) {
      setCycle(i);
      setLog((prev) => [...prev, `[${i}] 마운트 중...`]);
      setIsMounted(true);
      await delay(MOUNT_DURATION_MS);

      setLog((prev) => [...prev, `[${i}] 언마운트 중...`]);
      setIsMounted(false);
      await delay(UNMOUNT_DURATION_MS);

      forceGC();
      await delay(500);

      const current = getMemoryInfo();
      if (current) {
        const delta = current.used - initialUsed;
        const sign = delta >= 0 ? "+" : "";
        setLog((prev) => [
          ...prev,
          `[${i}] heap: ${formatMB(current.used)} (초기 대비 ${sign}${formatMB(delta)})`,
        ]);
      }
    }

    const final = getMemoryInfo();
    if (final) {
      const totalDelta = final.used - initialUsed;
      const sign = totalDelta >= 0 ? "+" : "";
      setLog((prev) => [
        ...prev,
        "",
        `=== 결과: ${CYCLE_COUNT}회 반복 후 ${sign}${formatMB(totalDelta)}`,
      ]);
    }

    setCycle(0);
    setIsRunning(false);
  }

  return (
    <div className={styles.page}>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          zIndex: 10,
          background: "rgba(0,0,0,0.85)",
          color: "#eee",
          padding: 16,
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 12,
          maxHeight: 300,
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            onClick={runTest}
            disabled={isRunning}
            style={{
              padding: "8px 16px",
              cursor: isRunning ? "not-allowed" : "pointer",
              background: isRunning ? "#555" : "#0a0",
              color: "#fff",
              border: "none",
              borderRadius: 4,
            }}
          >
            {isRunning
              ? `테스트 중 (${cycle}/${CYCLE_COUNT})...`
              : "메모리 누수 테스트 시작"}
          </button>
        </div>
        <pre
          style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
        >
          {log.length ? log.join("\n") : "테스트 시작 버튼을 클릭하세요."}
        </pre>
      </div>

      {isMounted && (
        <div style={{ position: "absolute", inset: 0 }}>
          <ThreeCanvas
            allowedStages={allowedStages}
            initialStage={2}
            enableKeyboardSwitch={false}
          />
        </div>
      )}
    </div>
  );
}
