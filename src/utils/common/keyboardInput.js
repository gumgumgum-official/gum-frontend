/**
 * 키보드 입력 상태를 관리하는 유틸리티
 * 지정한 키 목록의 눌림 상태를 추적하고, 이벤트 리스너의 등록/해제를 담당합니다.
 */

/**
 * @param {string[]} keyList - 추적할 키 이름 목록 (예: ["ArrowUp", "ArrowDown", ...])
 * @returns {{ keys: Record<string, boolean>, mount: () => void, unmount: () => void }}
 */
export function createKeyboardInput(keyList) {
  /** @type {Record<string, boolean>} */
  const keys = Object.fromEntries(keyList.map((k) => [k, false]));

  const handleKeyDown = (event) => {
    if (event.key in keys) {
      keys[event.key] = true;
      event.preventDefault();
    }
  };

  const handleKeyUp = (event) => {
    if (event.key in keys) {
      keys[event.key] = false;
      event.preventDefault();
    }
  };

  return {
    keys,
    mount() {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
    },
    unmount() {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },
  };
}
