import { useEffect } from "react";

export function Stage6PosterModal({ isOpen, imageSrc, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="stage6-poster-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Stage6 poster"
      onClick={onClose}
    >
      <div
        className="stage6-poster-modal-content"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="stage6-poster-modal-close"
          onClick={onClose}
          aria-label="close poster modal"
        >
          ×
        </button>
        <img
          src={imageSrc}
          alt="GGUM stamp poster"
          className="stage6-poster-modal-image"
          draggable={false}
        />
      </div>
    </div>
  );
}
