import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import { playRandomNoticePaperSound } from "../utils/common/playNoticePaperSound.js";
import { playUiClickSound } from "../utils/common/playUiClickSound.js";
import { GgumddiVoteSection } from "./GgumddiVoteSection";
import { GuestbookEmbed } from "./GuestbookEmbed";

const NOTICE = STAGE3_OBJECTS_CONFIG.notice;
const NOTICE_POSTER = NOTICE.posterImages;
const THIRD_POSTER_SRC =
  NOTICE_POSTER.icecream ?? "/assets/poster/icecream_poster.png";

const wood = "oklch(0.62 0.09 60)";
const woodDark = "oklch(0.45 0.08 55)";
const card = "oklch(0.99 0.012 85)";
const amber50 = "#fffbeb";
const posterBorderColor = "oklch(0.85 0.02 60)";

/** 한 줄 가로 배치: 모달 너비의 1/3씩 균등 분배, 화면이 클수록 포스터만 함께 커짐 */
/** @type {import('framer-motion').MotionStyle} */
const POSTER_BASE = {
  flex: "1 1 0",
  minWidth: 0,
  aspectRatio: "11 / 16",
  borderRadius: 12,
  overflow: "visible",
  position: "relative",
  alignSelf: "center",
};

/** @param {Object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 */
export function NoticeModalBoard({ isOpen, onClose }) {
  const [zoomedPoster, setZoomedPoster] = useState(null); // "feast" | "vote" | "guestbook" | null
  const [gbScale, setGbScale] = useState(1);

  useEffect(() => {
    if (zoomedPoster !== "guestbook") return;
    const compute = () => {
      const s =
        Math.min(window.innerWidth / 960, window.innerHeight / 800) * 0.93;
      setGbScale(Math.max(s, 0.4));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [zoomedPoster]);

  const closeWithSound = useCallback(() => {
    playUiClickSound();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (zoomedPoster) setZoomedPoster(null);
        else closeWithSound();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeWithSound, zoomedPoster]);

  useEffect(() => {
    if (!isOpen) setZoomedPoster(null);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWithSound();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(10px, 1.5vw, 20px)",
            pointerEvents: isOpen ? "auto" : "none",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: card,
              borderRadius: "24px",
              width: "min(96vw, 1680px)",
              maxHeight: "min(94vh, 1200px)",
              height: "auto",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
              border: `3px solid ${wood}`,
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px 28px",
                background: wood,
                borderBottom: `3px solid ${woodDark}`,
                borderRadius: "24px 24px 0 0",
                margin: "-3px -3px 0 -3px",
                width: "calc(100% + 6px)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.4rem",
                  fontWeight: 600,
                  letterSpacing: "0.025em",
                  color: amber50,
                }}
              >
                껌딱지 월드 소식통
              </h2>
            </div>
            <button
              type="button"
              onClick={() => closeWithSound()}
              aria-label="닫기"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "32px",
                height: "32px",
                padding: 0,
                border: "none",
                borderRadius: "50%",
                background: "transparent",
                fontSize: "24px",
                lineHeight: 1,
                cursor: "pointer",
                color: "rgba(255, 251, 235, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.2s, background 0.2s",
                zIndex: 5,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = amber50;
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255, 251, 235, 0.8)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                aria-hidden="true"
                style={{ transform: "translateY(-1px)" }}
              >
                ×
              </span>
            </button>
            <div
              style={{
                padding: "clamp(32px, 4vh, 56px) clamp(16px, 2.5vw, 40px)",
                background: card,
                color: "oklch(0.28 0.04 60)",
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                gap: "clamp(16px, 2vw, 32px)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {/* 포스터 1: 마을 잔치 */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => {
                  playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                  setZoomedPoster("feast");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                    setZoomedPoster("feast");
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  ...POSTER_BASE,
                  border: `2px solid ${posterBorderColor}`,
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 35% 35%, #f87171, #dc2626 40%, #991b1b)",
                    boxShadow:
                      "inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 2,
                  }}
                />
                <div
                  style={{
                    overflow: "hidden",
                    borderRadius: 10,
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <img
                    src={NOTICE_POSTER.party}
                    alt="껌딱지 마을 잔치"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              </motion.div>

              {/* 포스터 2: notice.posterImages.bestGum */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => {
                  playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                  setZoomedPoster("vote");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                    setZoomedPoster("vote");
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  ...POSTER_BASE,
                  cursor: "pointer",
                  border: `2px solid ${posterBorderColor}`,
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 35% 35%, #f87171, #dc2626 40%, #991b1b)",
                    boxShadow:
                      "inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 2,
                  }}
                />
                <div
                  style={{
                    overflow: "hidden",
                    borderRadius: 10,
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <img
                    src={NOTICE_POSTER.bestGum}
                    alt="투표 포스터"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              </motion.div>

              {/* 포스터 3: 방명록 */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => {
                  playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                  setZoomedPoster("guestbook");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    playRandomNoticePaperSound(NOTICE.paperSoundPaths);
                    setZoomedPoster("guestbook");
                  }
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  ...POSTER_BASE,
                  border: `2px solid ${posterBorderColor}`,
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle at 35% 35%, #f87171, #dc2626 40%, #991b1b)",
                    boxShadow:
                      "inset 0 1px 2px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)",
                    zIndex: 2,
                  }}
                />
                <div
                  style={{
                    overflow: "hidden",
                    borderRadius: 10,
                    width: "100%",
                    height: "100%",
                    background: "rgba(255,255,255,0.08)",
                  }}
                >
                  <img
                    src={THIRD_POSTER_SRC}
                    alt="아이스크림 포스터"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* 줌인 오버레이 */}
          <AnimatePresence>
            {zoomedPoster && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setZoomedPoster(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.6)",
                  zIndex: 10001,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: zoomedPoster === "guestbook" ? 0 : "16px 24px 12vh",
                  pointerEvents: zoomedPoster ? "auto" : "none",
                }}
              >
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{
                    type: "spring",
                    damping: 25,
                    stiffness: 300,
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "relative",
                    ...(zoomedPoster !== "guestbook" && {
                      maxWidth: "90vw",
                      maxHeight: "85vh",
                    }),
                  }}
                >
                  {zoomedPoster === "feast" && (
                    <div
                      style={{
                        borderRadius: 16,
                        overflow: "hidden",
                        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                      }}
                    >
                      <img
                        src={NOTICE_POSTER.party}
                        alt="껌딱지 마을 잔치"
                        draggable={false}
                        style={{
                          width: "100%",
                          maxHeight: "80vh",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </div>
                  )}

                  {zoomedPoster === "vote" && <GgumddiVoteSection />}

                  {zoomedPoster === "guestbook" && (
                    <div
                      style={{
                        width: 960,
                        transform: `scale(${gbScale})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <GuestbookEmbed onClose={() => setZoomedPoster(null)} />
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
