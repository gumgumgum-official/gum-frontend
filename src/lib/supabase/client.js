/**
 * Supabase 클라이언트 초기화
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasEnv = Boolean(supabaseUrl && supabaseAnonKey);
if (!hasEnv) {
  console.warn(
    "[Handwriting] Supabase 비활성: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 .env에 넣고, 반드시 VITE_ 접두사 사용. 저장 후 개발 서버 재시작.",
  );
} else {
  console.log("[Handwriting] Supabase 클라이언트 사용 중, Realtime 구독 가능.");
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        realtime: {
          params: {
            eventsPerSecond: 10, // Realtime 이벤트 제한
          },
        },
      })
    : null;
