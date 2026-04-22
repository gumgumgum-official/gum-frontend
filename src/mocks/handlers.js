/**
 * gum_server REST 모킹 (MSW)
 * 시나리오: URL ?mock=idle|reserved|busy|flow 또는 VITE_MSW_SCENARIO
 */
import { http, HttpResponse } from "msw";

/** MSW 전용: Stage3 Extrude + 래스터 검증용 (실제 Storage SVG 계약과 동일 마커) */
const MSW_MOCK_HANDWRITING_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120">
  <g id="strokes">
    <path d="M 24 60 Q 100 24 176 60" fill="none" stroke="#1a1a1a" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g id="extrude-outlines" data-handwriting-extrude="true" style="display:none" aria-hidden="true">
    <path d="M 20 55 L 180 55 L 180 65 L 20 65 Z" fill="#1a1a1a" stroke="none"/>
  </g>
</svg>`;

function mockHandwritingSvgFetchHandlers() {
  const respond = () =>
    HttpResponse.text(MSW_MOCK_HANDWRITING_SVG, {
      headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  return [
    http.get("https://example.com/mock-worry.svg", respond),
    http.get("https://example.com/reserved-mock.svg", respond),
  ];
}

const SAMPLE_WORRY = {
  worryId: "99",
  displaySeq: 99,
  svgUrl: "https://example.com/mock-worry.svg",
  sessionId: "msw-mock-session",
};

function monitorPathRe(suffix) {
  return new RegExp(`/api/monitors/[^/]+/${suffix}$`);
}

function emptyMonitor() {
  return {
    status: "idle",
    currentWorry: null,
    reservedWorry: null,
    clientId: null,
  };
}

function statusPayload(monitorsPartial) {
  return {
    monitors: {
      "monitor-1": { ...emptyMonitor(), ...monitorsPartial["monitor-1"] },
      "monitor-2": { ...emptyMonitor(), ...monitorsPartial["monitor-2"] },
    },
    queueLength: 0,
  };
}

/**
 * @param {string} scenario idle | reserved | busy | flow
 * @returns {import('msw').HttpHandler[]}
 */
export function createHandlers(scenario) {
  if (scenario === "flow") {
    const flow = { phase: "reserved" };
    return [
      http.get(
        ({ request }) => new URL(request.url).pathname.endsWith("/status"),
        () => {
          if (flow.phase === "reserved") {
            return HttpResponse.json(
              statusPayload({
                "monitor-1": {
                  reservedWorry: {
                    ...SAMPLE_WORRY,
                    worryId: "12",
                    displaySeq: 12,
                  },
                },
                "monitor-2": {},
              }),
            );
          }
          if (flow.phase === "busy") {
            return HttpResponse.json(
              statusPayload({
                "monitor-1": {
                  status: "busy",
                  currentWorry: {
                    ...SAMPLE_WORRY,
                    worryId: "12",
                    displaySeq: 12,
                  },
                  reservedWorry: null,
                },
                "monitor-2": {},
              }),
            );
          }
          return HttpResponse.json(
            statusPayload({ "monitor-1": {}, "monitor-2": {} }),
          );
        },
      ),

      http.get(
        ({ request }) =>
          monitorPathRe("current").test(new URL(request.url).pathname),
        () => {
          if (flow.phase === "busy") {
            return HttpResponse.json({
              status: "busy",
              worry: { ...SAMPLE_WORRY, worryId: "12", displaySeq: 12 },
            });
          }
          return HttpResponse.json({ status: "idle" });
        },
      ),

      http.post(
        ({ request }) =>
          monitorPathRe("start").test(new URL(request.url).pathname),
        () => {
          if (flow.phase === "reserved") {
            flow.phase = "busy";
            return HttpResponse.json({
              ok: true,
              status: "busy",
              worry: { ...SAMPLE_WORRY, worryId: "12", displaySeq: 12 },
            });
          }
          if (flow.phase === "busy") {
            return HttpResponse.json(
              { error: "monitor already busy" },
              { status: 409 },
            );
          }
          return HttpResponse.json(
            { error: "no reservation for this monitor" },
            { status: 409 },
          );
        },
      ),

      http.post(
        ({ request }) =>
          monitorPathRe("complete").test(new URL(request.url).pathname),
        () => {
          flow.phase = "done";
          return HttpResponse.json({ ok: true, assignedNext: false });
        },
      ),
      ...mockHandwritingSvgFetchHandlers(),
    ];
  }

  if (scenario === "idle") {
    return [
      http.get(
        ({ request }) => new URL(request.url).pathname.endsWith("/status"),
        () => {
          return HttpResponse.json(
            statusPayload({ "monitor-1": {}, "monitor-2": {} }),
          );
        },
      ),
      http.get(
        ({ request }) =>
          monitorPathRe("current").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ status: "idle" });
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("start").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json(
            { error: "no reservation for this monitor" },
            { status: 409 },
          );
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("complete").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ ok: true, assignedNext: false });
        },
      ),
      ...mockHandwritingSvgFetchHandlers(),
    ];
  }

  if (scenario === "reserved") {
    const reserved = {
      worryId: "42",
      displaySeq: 42,
      svgUrl: "https://example.com/reserved-mock.svg",
      sessionId: "msw-reserved",
    };
    return [
      http.get(
        ({ request }) => new URL(request.url).pathname.endsWith("/status"),
        () => {
          return HttpResponse.json(
            statusPayload({
              "monitor-1": { reservedWorry: reserved },
              "monitor-2": { reservedWorry: reserved },
            }),
          );
        },
      ),
      http.get(
        ({ request }) =>
          monitorPathRe("current").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ status: "idle" });
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("start").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({
            ok: true,
            status: "busy",
            worry: reserved,
          });
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("complete").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ ok: true, assignedNext: false });
        },
      ),
      ...mockHandwritingSvgFetchHandlers(),
    ];
  }

  if (scenario === "busy") {
    return [
      http.get(
        ({ request }) => new URL(request.url).pathname.endsWith("/status"),
        () => {
          return HttpResponse.json(
            statusPayload({
              "monitor-1": {
                status: "busy",
                currentWorry: SAMPLE_WORRY,
                reservedWorry: null,
              },
              "monitor-2": {
                status: "busy",
                currentWorry: SAMPLE_WORRY,
                reservedWorry: null,
              },
            }),
          );
        },
      ),
      http.get(
        ({ request }) =>
          monitorPathRe("current").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ status: "busy", worry: SAMPLE_WORRY });
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("start").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json(
            { error: "monitor already busy" },
            { status: 409 },
          );
        },
      ),
      http.post(
        ({ request }) =>
          monitorPathRe("complete").test(new URL(request.url).pathname),
        () => {
          return HttpResponse.json({ ok: true, assignedNext: false });
        },
      ),
      ...mockHandwritingSvgFetchHandlers(),
    ];
  }

  console.warn(
    `[MSW] 알 수 없는 mock 시나리오 "${scenario}" — idle 로 폴백합니다. (idle|reserved|busy|flow)`,
  );
  return createHandlers("idle");
}
