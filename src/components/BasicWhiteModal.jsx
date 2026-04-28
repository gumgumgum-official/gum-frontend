import { useEffect } from "react";
import "./BasicWhiteModal.css";

export function BasicWhiteModal({
  isOpen,
  onClose,
  children,
  ariaLabel,
  contentStyle,
  bodyStyle,
  hideCloseButton = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="basic-white-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? "기본 모달"}
      onClick={onClose}
    >
      <div
        className="basic-white-modal-content"
        style={contentStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {!hideCloseButton && (
          <button
            type="button"
            className="basic-white-modal-close"
            onClick={onClose}
            aria-label="모달 닫기"
          >
            ×
          </button>
        )}
        <div className="basic-white-modal-body" style={bodyStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
