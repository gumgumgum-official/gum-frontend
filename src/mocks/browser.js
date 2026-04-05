/**
 * 브라우저용 MSW worker.
 * 활성화: `npm run dev:mock` 또는 VITE_ENABLE_MSW=true + (선택) VITE_MSW_SCENARIO
 * 시나리오 전환: http://localhost:5173/start?mock=reserved 등
 */
import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers.js";

function resolveScenario() {
  if (typeof window === "undefined") return "idle";
  const qs = new URLSearchParams(window.location.search).get("mock");
  if (qs) return qs;
  const env = import.meta.env.VITE_MSW_SCENARIO;
  if (env) return env;
  return "reserved";
}

const scenario = resolveScenario();

export const worker = setupWorker(...createHandlers(scenario));
