import { useEffect } from "react";
import "./GameMachineModalShell.css";

export function GameMachineModalShell({
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
      className="game-machine-modal-shell-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? "게임기 모달"}
      onClick={onClose}
    >
      <div
        className="game-machine-modal-shell-content"
        style={contentStyle}
        onClick={(event) => event.stopPropagation()}
      >
        {!hideCloseButton && (
          <button
            type="button"
            className="game-machine-modal-shell-close"
            onClick={onClose}
            aria-label="모달 닫기"
          >
            ×
          </button>
        )}
        <div className="game-machine-modal-shell-body" style={bodyStyle}>
          {children}
        </div>
      </div>
    </div>
  );
}
