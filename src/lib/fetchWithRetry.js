/**
 * 타임아웃 + 재시도/백오프가 포함된 fetch 래퍼.
 *
 * 전시장 네트워크는 간헐적으로 끊기고, gum-server(Render 무료 플랜)는
 * 미사용 시 잠들어 콜드스타트(30~60초) 동안 첫 요청이 실패한다.
 * fetch는 기본 타임아웃이 없어 잠든 서버에 요청하면 무한정 멈추므로
 * AbortController로 시도당 타임아웃을 건다.
 *
 * - idempotent(GET): 네트워크 에러·타임아웃·5xx 에 백오프 재시도
 * - 쓰기(idempotent:false): TypeError("failed to fetch", 연결 자체 실패 →
 *   요청이 서버에 도달 안 했을 가능성 높음)에만 1회 재시도.
 *   타임아웃(AbortError)·5xx 는 서버가 이미 요청을 받아 처리했을 수 있어
 *   재시도 시 중복 등록 위험이 있으므로 재시도하지 않는다.
 */

const DEFAULT_TIMEOUT_MS = 9000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 0.5s, 1s, 2s ... + 지터 */
function backoffDelay(attempt) {
  return 500 * 2 ** attempt + Math.random() * 300;
}

function isRetriableStatus(status) {
  return status >= 500;
}

/**
 * @param {string} url
 * @param {RequestInit & { retries?: number, timeoutMs?: number, idempotent?: boolean }} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    retries,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    idempotent = false,
    ...fetchOptions
  } = options;

  const maxAttempts = (retries ?? (idempotent ? 3 : 1)) + 1;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isLastAttempt = attempt === maxAttempts - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);
      // 5xx 는 idempotent 요청만 재시도 (쓰기는 중복 위험으로 그대로 반환)
      if (idempotent && isRetriableStatus(res.status) && !isLastAttempt) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      // TypeError = "failed to fetch"(연결 실패), AbortError = 타임아웃.
      // 타임아웃은 idempotent 요청만 재시도(쓰기는 중복 위험).
      const isNetworkError = err?.name === "TypeError";
      const isTimeout = err?.name === "AbortError";
      const shouldRetry = isNetworkError || (idempotent && isTimeout);
      if (shouldRetry && !isLastAttempt) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
