/** @type {(() => void) | null} */
let stopIntroBgmHandler = null;

/**
 * StartPage가 마운트될 때 intro BGM 정지 함수를 등록한다.
 * @param {(() => void) | null} handler
 */
export function registerStartPageIntroBgmStop(handler) {
  stopIntroBgmHandler = handler;
}

/** 소프트 리셋·운영 복구 시 /start 인트로 BGM 정지 */
export function stopStartPageIntroBgm() {
  stopIntroBgmHandler?.();
}
