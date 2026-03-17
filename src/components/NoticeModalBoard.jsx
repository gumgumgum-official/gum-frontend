import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const wood = "oklch(0.62 0.09 60)";
const woodDark = "oklch(0.45 0.08 55)";
const card = "oklch(0.99 0.012 85)";
const amber50 = "#fffbeb";

const GUM_CANDIDATES = [
  {
    id: "wink",
    src: "/models/stage3/poster/gum_wink.png",
    label: "윙크 껌딱지",
  },
  {
    id: "heart",
    src: "/models/stage3/poster/gum_heart.png",
    label: "하트 껌딱지",
  },
  { id: "rock", src: "/models/stage3/poster/gum_rock.png", label: "락 껌딱지" },
];

const STORAGE_KEY_VOTES = "gum_notice_votes";
const STORAGE_KEY_USER_VOTED = "gum_notice_user_voted";

function loadVotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOTES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.wink === "number" &&
        typeof parsed.heart === "number" &&
        typeof parsed.rock === "number"
      ) {
        return parsed;
      }
    }
  } catch {
    void 0; // ignore parse/storage errors
  }
  return { wink: 0, heart: 0, rock: 0 };
}

function loadUserVoted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_VOTED);
    if (raw === "wink" || raw === "heart" || raw === "rock") return raw;
  } catch {
    void 0; // ignore storage errors
  }
  return null;
}

/** @param {Object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 */
export function NoticeModalBoard({ isOpen, onClose }) {
  const [votes, setVotes] = useState(loadVotes);
  const [userVoted, setUserVoted] = useState(loadUserVoted);
  const [zoomedPoster, setZoomedPoster] = useState(null); // "feast" | "lost" | "vote" | null

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (zoomedPoster) setZoomedPoster(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, zoomedPoster]);

  useEffect(() => {
    if (!isOpen) setZoomedPoster(null);
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VOTES, JSON.stringify(votes));
    } catch {
      void 0; // ignore storage errors
    }
  }, [votes]);

  useEffect(() => {
    try {
      if (userVoted) {
        localStorage.setItem(STORAGE_KEY_USER_VOTED, userVoted);
      } else {
        localStorage.removeItem(STORAGE_KEY_USER_VOTED);
      }
    } catch {
      void 0; // ignore storage errors
    }
  }, [userVoted]);

  const totalVotes = votes.wink + votes.heart + votes.rock;

  const handleVote = (id) => {
    if (userVoted) return;
    setUserVoted(id);
    setVotes((prev) => ({ ...prev, [id]: prev[id] + 1 }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
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
            padding: "24px",
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
              width: "960px",
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
              onClick={() => onClose()}
              aria-label="닫기"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "32px",
                height: "32px",
                border: "none",
                borderRadius: "50%",
                background: "transparent",
                fontSize: "24px",
                lineHeight: 1,
                cursor: "pointer",
                color: "rgba(255, 251, 235, 0.8)",
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
              ×
            </button>
            <div
              style={{
                padding: "40px 32px 48px",
                background: card,
                color: "oklch(0.28 0.04 60)",
                display: "flex",
                flexDirection: "row",
                gap: 24,
                justifyContent: "center",
              }}
            >
              {/* 포스터 1: 마을 잔치 */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => setZoomedPoster("feast")}
                onKeyDown={(e) => e.key === "Enter" && setZoomedPoster("feast")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: 220,
                  height: 320,
                  flexShrink: 0,
                  borderRadius: 12,
                  overflow: "visible",
                  border: "2px solid oklch(0.85 0.02 60)",
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  position: "relative",
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
                    src="/models/stage3/poster/party_poster.png"
                    alt="껌딱지 마을 잔치"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              </motion.div>

              {/* 포스터 2: vote_poster.svg */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => setZoomedPoster("lost")}
                onKeyDown={(e) => e.key === "Enter" && setZoomedPoster("lost")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  cursor: "pointer",
                  width: 220,
                  height: 320,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "2px solid #fde047",
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                <img
                  src="/models/stage3/poster/vote_poster.svg"
                  alt="투표 포스터"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </motion.div>

              {/* 포스터 3: 이번 달 제일 멋진 껌딱지 (보기만, 투표는 줌인 시) */}
              <motion.div
                role="button"
                tabIndex={0}
                onClick={() => setZoomedPoster("vote")}
                onKeyDown={(e) => e.key === "Enter" && setZoomedPoster("vote")}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: 220,
                  height: 320,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: 14,
                  background:
                    "linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)",
                  borderRadius: 12,
                  border: "2px solid #f9a8d4",
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  position: "relative",
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
                <h3
                  style={{
                    margin: "0 0 2px",
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    color: "#831843",
                    textAlign: "center",
                  }}
                >
                  이번 달 제일 멋진 껌딱지
                </h3>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.7rem",
                    color: "#9d174d",
                    textAlign: "center",
                  }}
                >
                  당신의 껌딱지에게 투표하세요
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    marginTop: 8,
                  }}
                >
                  {GUM_CANDIDATES.map((gum) => (
                    <img
                      key={gum.id}
                      src={gum.src}
                      alt={gum.label}
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "contain",
                      }}
                    />
                  ))}
                </div>
                <p
                  style={{
                    margin: "auto 0 0",
                    fontSize: "0.65rem",
                    color: "#9d174d",
                    textAlign: "center",
                  }}
                >
                  클릭하여 투표하기
                </p>
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
                  padding: 24,
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
                    maxWidth: "90vw",
                    maxHeight: "85vh",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setZoomedPoster(null)}
                    aria-label="닫기"
                    style={{
                      position: "absolute",
                      top: -12,
                      right: -12,
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border: "2px solid #78350f",
                      background:
                        "linear-gradient(145deg, #a16207 0%, #713f12 100%)",
                      color: "#fef3c7",
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      zIndex: 10,
                    }}
                  >
                    ×
                  </button>

                  {zoomedPoster === "feast" && (
                    <div
                      style={{
                        borderRadius: 16,
                        overflow: "hidden",
                        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                      }}
                    >
                      <img
                        src="/models/stage3/poster/party_poster.png"
                        alt="껌딱지 마을 잔치"
                        style={{
                          width: "100%",
                          maxHeight: "80vh",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </div>
                  )}

                  {zoomedPoster === "lost" && (
                    <div
                      style={{
                        borderRadius: 16,
                        overflow: "hidden",
                        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                      }}
                    >
                      <img
                        src="/models/stage3/poster/vote_poster.svg"
                        alt="투표 포스터"
                        style={{
                          width: "100%",
                          maxHeight: "80vh",
                          objectFit: "contain",
                          display: "block",
                        }}
                      />
                    </div>
                  )}

                  {zoomedPoster === "vote" && (
                    <div
                      style={{
                        width: 360,
                        padding: 24,
                        background:
                          "linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)",
                        borderRadius: 16,
                        border: "3px solid #f9a8d4",
                        boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
                      }}
                    >
                      <h3
                        style={{
                          margin: "0 0 4px",
                          fontSize: "1.2rem",
                          fontWeight: 800,
                          color: "#831843",
                          textAlign: "center",
                        }}
                      >
                        이번 달 제일 멋진 껌딱지
                      </h3>
                      <p
                        style={{
                          margin: "0 0 20px",
                          fontSize: "0.9rem",
                          color: "#9d174d",
                          textAlign: "center",
                        }}
                      >
                        당신의 껌딱지에게 투표하세요
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: 16,
                          justifyContent: "center",
                          flexWrap: "wrap",
                          marginBottom: 20,
                        }}
                      >
                        {GUM_CANDIDATES.map((gum) => (
                          <motion.button
                            key={gum.id}
                            type="button"
                            onClick={() => handleVote(gum.id)}
                            disabled={!!userVoted}
                            whileHover={!userVoted ? { scale: 1.05 } : {}}
                            whileTap={!userVoted ? { scale: 0.98 } : {}}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 8,
                              padding: "16px 20px",
                              background:
                                userVoted === gum.id
                                  ? "#fce7f3"
                                  : userVoted
                                    ? "rgba(255,255,255,0.6)"
                                    : "#fff",
                              border:
                                userVoted === gum.id
                                  ? "2px solid #ec4899"
                                  : "2px solid #f9a8d4",
                              borderRadius: 12,
                              cursor: userVoted ? "default" : "pointer",
                              opacity:
                                userVoted && userVoted !== gum.id ? 0.7 : 1,
                            }}
                          >
                            <img
                              src={gum.src}
                              alt={gum.label}
                              style={{
                                width: 64,
                                height: 64,
                                objectFit: "contain",
                              }}
                            />
                            <span
                              style={{
                                fontSize: "0.85rem",
                                fontWeight: 600,
                                color: "#831843",
                              }}
                            >
                              {gum.label}
                            </span>
                            {userVoted === gum.id && (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#be185d",
                                  fontWeight: 600,
                                }}
                              >
                                투표 완료!
                              </span>
                            )}
                            {userVoted && (
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#9d174d",
                                  fontWeight: 700,
                                }}
                              >
                                {votes[gum.id]}표
                              </span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: "1rem",
                          fontWeight: 700,
                          color: "#831843",
                        }}
                      >
                        총 {totalVotes}명 투표
                      </div>
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
