/**
 * 껌딱지 카드 모달 - docs/gum-cards-final.html 참고하여 React로 구현
 * 성능: CSS transition-delay로 카드 등장, React.memo로 불필요한 re-render 감소
 */
import { useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { CARDS } from "../config/gumCardsConfig.js";
import "./GumCardsModal.css";

/** @typedef {{ num: string, name: string, img: string, keywords: string[], accent: string, accentBg: string, accentBorder: string, theme: string, title: string, desc: string, comfort: string }} GumCardData */

/**
 * @param {{ card: GumCardData, isFlipped: boolean, onFlip: (card: GumCardData) => void }} props
 */
function GumCardComponent(props) {
  const { card, isFlipped, onFlip } = props;
  return (
    <div
      className={`gum-card-wrap ${isFlipped ? "flipped" : ""}`}
      onClick={() => onFlip(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onFlip(card)}
      aria-label={`${card.name} 카드 ${isFlipped ? "뒤집기" : ""}`}
    >
      <div className="gum-card-inner">
        <div className="gum-card-front">
          <img className="gum-card-img" src={card.img} alt={card.name} />
          <div className="gum-card-front-overlay" />
          <div
            className="gum-card-front-dot"
            style={{
              background: card.accent,
              boxShadow: `0 0 8px ${card.accent}`,
            }}
          />
          <div className="gum-card-front-text">
            <div className="num">{card.num}</div>
            <div className="gum-name">{card.name}</div>
            <div className="keywords">
              {card.keywords.map((k) => (
                <span key={k} className="kw">
                  {k}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          className="gum-card-back"
          style={{
            background: card.accentBg,
            border: `1px solid ${card.accentBorder}`,
          }}
        >
          <div className="back-header">
            <div className="back-num">
              {card.num} · {card.theme}
            </div>
            <div className="back-name">{card.name}</div>
            <div className="back-theme">{card.title}</div>
          </div>
          <div className="back-divider" />
          <div className="back-desc">
            {card.desc.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < card.desc.split("\n").length - 1 && <br />}
              </span>
            ))}
          </div>
          <div
            className="back-comfort"
            style={{ borderLeft: `2px solid ${card.accent}` }}
          >
            {card.comfort.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < card.comfort.split("\n").length - 1 && <br />}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
const GumCard = memo(GumCardComponent);

function spawnParticles(color) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const particles = [];
  const count = 65;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "gum-particle";
    const angle = Math.random() * 2 * Math.PI;
    const dist = 180 + Math.random() * 320;
    const size = 12 + Math.random() * 18;
    const duration = 1 + Math.random() * 0.8;
    el.style.cssText = `left:${cx}px;top:${cy}px;background:${color};width:${size}px;height:${size}px;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;animation-duration:${duration}s;box-shadow:0 0 20px ${color};`;
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    particles.push(el);
  }
  return particles;
}

export function GumCardsModal({ open, onClose }) {
  const [flippedCard, setFlippedCard] = useState(null);
  const [toast, setToast] = useState({ show: false, msg: "" });
  const toastTimerRef = useRef(null);
  const gridRef = useRef(null);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, msg });
    toastTimerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, show: false }));
    }, 2800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (open && gridRef.current) {
      const tid = requestAnimationFrame(() => {
        gridRef.current?.classList.add("ready");
      });
      return () => cancelAnimationFrame(tid);
    }
  }, [open]);

  const handleCardClick = useCallback((card) => {
    setFlippedCard((prev) => (prev?.num === card.num ? null : card));
  }, []);

  const handleStick = () => {
    if (!flippedCard) return;
    spawnParticles(flippedCard.accent);
    showToast(`${flippedCard.name}를 오늘 하루 붙였어요 🩹`);
  };

  if (!open) return null;

  const modalContent = (
    <div className="gum-cards-root">
      <div
        className={`gum-cards-overlay ${open ? "open" : ""}`}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="gum-cards-modal" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="gum-cards-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
          <div className="gum-cards-header">
            <h2>
              지금 나에게 필요한
              <br />
              <em>껌딱지</em>는 뭘까?
            </h2>
            <p>카드를 골라 오늘의 껌딱지를 만나봐</p>
          </div>
          <div ref={gridRef} className="gum-cards-grid">
            {CARDS.map((card) => (
              <GumCard
                key={card.num}
                card={card}
                isFlipped={flippedCard?.num === card.num}
                onFlip={handleCardClick}
              />
            ))}
          </div>
          <div className={`gum-stick-wrap ${flippedCard ? "visible" : ""}`}>
            <button
              type="button"
              className="gum-stick-btn"
              onClick={handleStick}
            >
              🩹 이 껌딱지 나한테 붙이기
            </button>
          </div>
        </div>
      </div>
      <div className={`gum-toast ${toast.show ? "show" : ""}`}>{toast.msg}</div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
