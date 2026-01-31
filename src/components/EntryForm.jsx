import { useState } from "react";

/**
 * Phase 1: 입국 신고서 폼 (React 컴포넌트)
 */
export function EntryForm({ onSubmit = () => {} }) {
  const [worry, setWorry] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ worry: worry.trim() });
  }

  return (
    <form
      className="entry-form"
      onSubmit={handleSubmit}
      aria-label="입국 신고서"
    >
      <h2 className="entry-form__title">입국 신고서</h2>
      <p className="entry-form__desc">
        껌딱지 나라 입국을 위해 걱정거리를 적어 주세요.
      </p>
      <label className="entry-form__label">
        걱정거리
        <textarea
          name="worry"
          className="entry-form__input"
          rows={3}
          placeholder="걱정되는 것을 자유롭게 적어 주세요."
          value={worry}
          onChange={(e) => setWorry(e.target.value)}
        />
      </label>
      <button type="submit" className="entry-form__submit">
        제출
      </button>
    </form>
  );
}
