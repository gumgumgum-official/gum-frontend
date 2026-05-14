/**
 * 껌 카드 모달 관련 window CustomEvent — 이름 단일 정의
 */

/** 카드 「나한테 붙이기」 — `detail: { cardNum: string }` */
export const GUM_CARDS_STICK_EVENT = "gum:cardsStick";

/**
 * @param {string} cardNum — `gumCardsConfig` 의 `card.num` 과 동일
 */
export function dispatchGumCardsStick(cardNum) {
  if (import.meta.env.DEV) {
    console.debug(
      "[GumCardsStick] dispatch",
      cardNum,
      globalThis.performance?.now?.() ?? Date.now(),
    );
  }
  window.dispatchEvent(
    new CustomEvent(GUM_CARDS_STICK_EVENT, {
      detail: { cardNum },
    }),
  );
}
