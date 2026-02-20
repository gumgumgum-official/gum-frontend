/**
 * Handwriting Realtime 구독 유틸리티
 * Supabase Realtime을 통해 필기 데이터를 실시간으로 수신
 */

import { supabase } from "../../lib/supabase/client.js";
import { getSessionId } from "../../lib/session.js";

/**
 * Handwriting 브로드캐스트 페이로드 타입
 * @typedef {Object} HandwritingBroadcast
 * @property {string} id - idempotencyKey
 * @property {string} storagePathSvg - Storage public URL
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} clientId - 태블릿 클라이언트 ID
 */

/**
 * Handwriting 메타데이터 타입
 * @typedef {Object} HandwritingMetadata
 * @property {string} id
 * @property {string} url
 * @property {Date} createdAt
 * @property {string} clientId
 */

/**
 * Realtime 구독 옵션
 * @typedef {Object} HandwritingRealtimeOptions
 * @property {string} [sessionId] - 세션 ID (기본값: getSessionId())
 * @property {(metadata: HandwritingMetadata) => void} [onNewHandwriting] - 새 필기 수신 시 콜백
 * @property {(error: Error) => void} [onError] - 에러 발생 시 콜백
 */

/**
 * Handwriting Realtime 구독 설정
 * @param {HandwritingRealtimeOptions} options
 * @returns {{ unsubscribe: () => void, isConnected: boolean }}
 */
export function subscribeHandwritingRealtime(options = {}) {
  const { sessionId = getSessionId(), onNewHandwriting, onError } = options;

  if (!supabase) {
    console.warn(
      "[HandwritingRealtime] Supabase client not initialized. Skipping subscription.",
    );
    return {
      unsubscribe: () => {},
      isConnected: false,
    };
  }

  const channelPrefix =
    import.meta.env.VITE_REALTIME_CHANNEL_PREFIX || "exhibition";
  const channelName = `${channelPrefix}:${sessionId}`;

  console.log(
    `[HandwritingRealtime] 구독 시도 channel="${channelName}", sessionId="${sessionId}". (태블릿/Edge Function이 같은 채널로 broadcast 해야 수신됨)`,
  );

  let isConnected = false;

  const channel = supabase
    .channel(channelName)
    .on("broadcast", { event: "new_handwriting" }, (payload) => {
      const data = payload.payload;
      console.log("[HandwritingRealtime] New handwriting received:", data);

      const metadata = {
        id: data.id,
        url: data.storagePathSvg,
        createdAt: new Date(data.createdAt),
        clientId: data.clientId,
      };

      onNewHandwriting?.(metadata);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isConnected = true;
        console.log(`[HandwritingRealtime] 연결됨: ${channelName}`);
      } else if (status === "CHANNEL_ERROR") {
        const err = new Error(`Failed to subscribe to channel: ${channelName}`);
        isConnected = false;
        console.error("[HandwritingRealtime] 구독 실패:", err);
        onError?.(err);
      } else {
        console.log(`[HandwritingRealtime] 상태: ${status}`);
      }
    });

  return {
    unsubscribe: () => {
      console.log(`[HandwritingRealtime] Unsubscribing from ${channelName}`);
      supabase.removeChannel(channel);
      isConnected = false;
    },
    get isConnected() {
      return isConnected;
    },
  };
}
