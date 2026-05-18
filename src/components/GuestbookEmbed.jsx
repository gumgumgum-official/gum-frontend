import { useState, useEffect } from "react";
import { getGumServerBaseUrl } from "../lib/monitorCurrentApi.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PINK = "#ff5fa2";
const PINK_MID = "#ffb3d1";
const PINK_SOFT = "#ffd9e8";
const FG = "oklch(0.32 0.13 350)";
const MUTED = "oklch(0.55 0.1 340)";
const FONT = '"Galmuri11","Galmuri9",monospace';

const GRAD_CARD = "linear-gradient(180deg,#ffffff 0%,#fff0f6 100%)";
const GRAD_PINK = "linear-gradient(180deg,#ffb3d1 0%,#ff7eb6 100%)";
const SHADOW = "4px 4px 0 #ff5fa2";
const SHADOW_SM = "2px 2px 0 #ff5fa2";

// ── Shared style objects ──────────────────────────────────────────────────────
const S = {
  pixelCard: {
    background: GRAD_CARD,
    border: `2px solid ${PINK}`,
    borderRadius: "1rem",
    boxShadow: SHADOW,
    overflow: "hidden",
  },
  pixelCardSm: {
    background: GRAD_CARD,
    border: `2px solid ${PINK}`,
    borderRadius: "0.75rem",
    boxShadow: SHADOW_SM,
  },
  pixelInput: {
    fontFamily: FONT,
    background: "#fff",
    border: `2px solid ${PINK}`,
    borderRadius: "0.75rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    color: FG,
    outline: "none",
    resize: "none",
    width: "100%",
    boxSizing: "border-box",
    display: "block",
  },
  pixelBtn: {
    fontFamily: FONT,
    background: GRAD_PINK,
    color: "#fff",
    border: `2px solid ${PINK}`,
    borderRadius: "999px",
    padding: "0.5rem 1.25rem",
    fontSize: "0.875rem",
    boxShadow: SHADOW_SM,
    cursor: "pointer",
  },
  notePaper: {
    background: "linear-gradient(180deg,#fffdf5 0%,#fff5fa 100%)",
    border: `2px solid ${PINK}`,
    borderRadius: "0.75rem",
    boxShadow: SHADOW_SM,
    padding: "1rem",
    width: "100%",
    boxSizing: "border-box",
  },
};

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// Galmuri 픽셀 폰트 (CDN)
const FONT_CSS = `
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11.woff2")format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11-Bold.woff2")format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Galmuri9";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri9.woff2")format("woff2");font-weight:400;font-display:swap}
`;

// ── ProfileCard ───────────────────────────────────────────────────────────────
function ProfileCard() {
  return (
    <div style={{ ...S.pixelCard, padding: "1rem" }}>
      <div
        style={{
          overflow: "hidden",
          borderRadius: "0.5rem",
          border: `2px solid ${PINK}`,
          background: PINK_SOFT,
        }}
      >
        <img
          src="/assets/pixel-character.png"
          alt="삐삐 프로필"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            imageRendering: "pixelated",
            margin: "0 auto",
          }}
          width={512}
          height={512}
        />
      </div>
      <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
        <div style={{ fontSize: "1rem", fontWeight: 700, color: PINK }}>
          ♥ 삐삐 ♥
        </div>
        <p
          style={{
            marginTop: "0.25rem",
            fontSize: "0.75rem",
            lineHeight: 1.6,
            color: FG,
          }}
        >
          내 방에 온 걸 환영해~♥
          <br />
          픽셀 세상의 작은 기록장이에요.
        </p>
      </div>
    </div>
  );
}

// ── TodayCard ─────────────────────────────────────────────────────────────────
function TodayCard() {
  return (
    <div style={{ ...S.pixelCardSm, padding: "0.75rem" }}>
      <div
        style={{
          marginBottom: "0.25rem",
          fontSize: "0.6875rem",
          fontWeight: 700,
          color: PINK,
        }}
      >
        TODAY is..
      </div>
      <p style={{ fontSize: "0.75rem", color: FG, margin: 0 }}>
        오늘은 책 읽는 날 📚
      </p>
    </div>
  );
}

const GUESTBOOK_MSG_MAX_LEN = 200;

// ── GuestbookForm ─────────────────────────────────────────────────────────────
function GuestbookForm({ onSuccess }) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!msg.trim() || submitting) return;
    setSubmitting(true);
    try {
      const base = getGumServerBaseUrl();
      const res = await fetch(`${base}/api/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: name.trim() || null,
          content: msg.trim(),
        }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setToast("방명록에 메시지가 남겨졌어요 ♥");
      setName("");
      setMsg("");
      setTimeout(() => setToast(""), 2500);
      onSuccess?.(data.post);
    } catch {
      setToast("오류가 발생했어요. 다시 시도해주세요.");
      setTimeout(() => setToast(""), 2500);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        ...S.pixelCard,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: PINK }}>
        ✎ 방명록 남기기
      </div>
      <input
        style={S.pixelInput}
        placeholder="이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        style={S.pixelInput}
        rows={3}
        placeholder="삐삐에게 한마디~ ♥"
        value={msg}
        maxLength={GUESTBOOK_MSG_MAX_LEN}
        onChange={(e) => setMsg(e.target.value)}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: "0.6875rem", color: MUTED }}>
          {msg.length}/{GUESTBOOK_MSG_MAX_LEN}
        </span>
        <button
          type="submit"
          style={{ ...S.pixelBtn, opacity: submitting ? 0.6 : 1 }}
          disabled={submitting}
        >
          {submitting ? "저장 중…" : "남기기 ♥"}
        </button>
      </div>
      {toast && (
        <div
          style={{
            borderRadius: "0.375rem",
            border: `2px solid ${PINK}`,
            background: PINK_SOFT,
            padding: "0.5rem 0.75rem",
            fontSize: "0.75rem",
            color: PINK,
          }}
        >
          {toast}
        </div>
      )}
    </form>
  );
}

// ── GuestbookEntry ────────────────────────────────────────────────────────────
function GuestbookEntry({ name, date, message }) {
  return (
    <div style={S.notePaper}>
      <div
        style={{
          marginBottom: "0.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.6875rem",
          color: PINK,
        }}
      >
        <span style={{ fontWeight: 700 }}>♥ {name}</span>
        <span>{date}</span>
      </div>
      <p style={{ fontSize: "0.75rem", lineHeight: 1.6, margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function GuestbookEmbed({ onClose }) {
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    const base = getGumServerBaseUrl();
    fetch(`${base}/api/posts`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
  }, []);

  function handlePostAdded(post) {
    setPosts((prev) => [post, ...prev]);
  }

  return (
    <>
      <style>{FONT_CSS}</style>
      <div
        style={{
          fontFamily: FONT,
          color: FG,
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
          imageRendering: "pixelated",
        }}
      >
        {/* pixel-card overflow-hidden (BrowserFrame) */}
        <div style={S.pixelCard}>
          {/* 타이틀바 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `2px solid ${PINK}`,
              background: PINK_MID,
              padding: "0.5rem 0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#fff",
                fontSize: "0.875rem",
              }}
            >
              <span>♥</span>
              <span>ppippi&apos;s mini home</span>
            </div>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              {["_", "□"].map((label, i) => (
                <span
                  key={i}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: "1.25rem",
                    height: "1.25rem",
                    borderRadius: "50%",
                    border: `2px solid ${PINK}`,
                    background: "#fff",
                    fontSize: "0.625rem",
                    color: PINK,
                  }}
                >
                  {label}
                </span>
              ))}
              <span
                onClick={onClose}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "1.25rem",
                  height: "1.25rem",
                  borderRadius: "50%",
                  border: `2px solid ${PINK}`,
                  background: PINK,
                  fontSize: "0.625rem",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ✕
              </span>
            </div>
          </div>

          {/* URL바 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              borderBottom: `2px solid ${PINK}`,
              background: "#fff0f6",
              padding: "0.375rem 0.75rem",
              color: PINK,
              fontSize: "0.875rem",
            }}
          >
            <span>←</span>
            <span>→</span>
            <span>⟳</span>
            <div
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                borderRadius: "999px",
                border: `2px solid ${PINK}`,
                background: "#fff",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                color: PINK,
                marginLeft: "0.5rem",
              }}
            >
              🔒 https://ppippi.home/
            </div>
            <span>★</span>
          </div>

          {/* 컨텐츠 영역 */}
          <div
            style={{
              background: "rgba(255,245,250,0.6)",
              padding: "1rem 2rem 2rem",
            }}
          >
            {/* PixelNav */}
            <nav
              style={{
                marginBottom: "1.5rem",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: PINK,
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>♥</span>
                <span style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                  삐삐홈
                </span>
              </div>
            </nav>

            {/* 2컬럼 그리드 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "280px minmax(0,1fr)",
                gap: "1rem",
              }}
            >
              {/* 좌: 프로필 + 오늘 */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                <ProfileCard />
                <TodayCard />
              </div>

              {/* 우: 방명록 */}
              <div style={{ minWidth: 0 }}>
                <div style={{ ...S.pixelCard, padding: "1rem 1.5rem" }}>
                  <div
                    style={{
                      marginBottom: "1rem",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      borderBottom: `2px dashed ${PINK}`,
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: PINK,
                        margin: 0,
                      }}
                    >
                      ✎ 방명록
                    </h2>
                    <span style={{ fontSize: "0.6875rem", color: MUTED }}>
                      총 <b style={{ color: PINK }}>{posts.length}</b>개의
                      메시지
                    </span>
                  </div>

                  <GuestbookForm onSuccess={handlePostAdded} />

                  <div
                    style={{
                      marginTop: "1.25rem",
                      maxHeight: "430px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                      overflowY: "auto",
                      paddingRight: "0.5rem",
                    }}
                  >
                    {postsLoading ? (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: MUTED,
                          textAlign: "center",
                          padding: "1.5rem 0",
                        }}
                      >
                        불러오는 중…
                      </div>
                    ) : posts.length === 0 ? (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: MUTED,
                          textAlign: "center",
                          padding: "1.5rem 0",
                        }}
                      >
                        첫 방명록을 남겨주세요 ♥
                      </div>
                    ) : (
                      posts.map((p) => (
                        <GuestbookEntry
                          key={p.id}
                          name={p.nickname ?? "익명"}
                          date={formatDate(p.created_at)}
                          message={p.content}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
