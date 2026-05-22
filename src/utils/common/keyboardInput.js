/**
 * 키보드 입력 상태를 관리하는 유틸리티
 * 지정한 키 목록의 눌림 상태를 추적하고, 이벤트 리스너의 등록/해제를 담당합니다.
 */

/**
 * @param {string[]} keyList - 추적할 키 이름 목록 (예: ["ArrowUp", "ArrowDown", ...])
 * @param {{
 *   guardKeyDown?: (event: KeyboardEvent, keyId: string) => boolean,
 * }} [options] - guardKeyDown이 false를 반환하면 키 상태를 갱신하지 않음
 * @returns {{ keys: Record<string, boolean>, mount: () => void, unmount: () => void }}
 */
export function createKeyboardInput(keyList, options = {}) {
  /** @type {Record<string, boolean>} */
  const keys = Object.fromEntries(keyList.map((k) => [k, false]));
  const resetKeys = () => {
    Object.keys(keys).forEach((k) => {
      keys[k] = false;
    });
  };

  const isInputFocused = () => {
    const el = /** @type {Element | null} */ (document.activeElement);
    const tagName = el?.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      Boolean(el?.isContentEditable)
    );
  };

  const handleKeyDown = (event) => {
    if (isInputFocused()) return;
    const keyId =
      event.key in keys ? event.key : event.code in keys ? event.code : null;
    if (!keyId) return;
    if (options.guardKeyDown?.(event, keyId) === false) {
      event.preventDefault();
      return;
    }
    keys[keyId] = true;
    event.preventDefault();
  };

  const handleKeyUp = (event) => {
    if (isInputFocused()) return;
    if (event.key in keys) {
      keys[event.key] = false;
      event.preventDefault();
      return;
    }
    if (event.code in keys) {
      keys[event.code] = false;
      event.preventDefault();
    }
  };
  const handleBlur = () => {
    // 포커스가 빠질 때 keyup 누락으로 입력이 고정되는 현상 방지
    resetKeys();
  };
  const handleVisibilityChange = () => {
    if (document.hidden) resetKeys();
  };

  return {
    keys,
    mount() {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("blur", handleBlur);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    },
    unmount() {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetKeys();
    },
  };
}
