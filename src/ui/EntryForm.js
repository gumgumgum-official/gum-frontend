/**
 * Phase 1: 입국 신고서 폼
 * - 기내 창가 뷰 배경 위에 표시되는 입력 화면
 * - 걱정거리 텍스트 입력 후 제출 시 onSubmit 콜백으로 데이터 전달
 */

const DEFAULT_SELECTORS = {
  container: "#ui-root",
};

/**
 * 입국 신고서 폼을 생성하고 컨테이너에 마운트합니다.
 * @param {Object} options
 * @param {string} [options.containerSelector] - 폼을 넣을 DOM 셀렉터 (기본: #ui-root)
 * @param {function(Object): void} [options.onSubmit] - 제출 시 호출 (formData 전달)
 * @returns {{ destroy: function }} destroy()로 폼 제거
 */
export function createEntryForm(options = {}) {
  const containerSelector =
    options.containerSelector ?? DEFAULT_SELECTORS.container;
  const onSubmit = options.onSubmit ?? (() => {});

  const container = document.querySelector(containerSelector);
  if (!container) {
    console.warn(
      `[EntryForm] 컨테이너를 찾을 수 없습니다: ${containerSelector}`,
    );
    return { destroy: () => {} };
  }

  const form = document.createElement("form");
  form.className = "entry-form";
  form.setAttribute("aria-label", "입국 신고서");

  form.innerHTML = `
    <h2 class="entry-form__title">입국 신고서</h2>
    <p class="entry-form__desc">껌딱지 나라 입국을 위해 걱정거리를 적어 주세요.</p>
    <label class="entry-form__label">
      걱정거리
      <textarea name="worry" class="entry-form__input" rows="3" placeholder="걱정되는 것을 자유롭게 적어 주세요."></textarea>
    </label>
    <button type="submit" class="entry-form__submit">제출</button>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = {
      worry: formData.get("worry")?.trim() ?? "",
    };
    onSubmit(data);
  });

  container.appendChild(form);

  return {
    destroy() {
      if (form.parentNode) {
        form.parentNode.removeChild(form);
      }
    },
  };
}
