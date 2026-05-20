import { useState, useEffect } from "react";
import { getGumServerBaseUrl } from "../lib/monitorCurrentApi.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PINK = "#ff5fa2";
const PINK_MID = "#ffb3d1";
const PINK_SOFT = "#ffd9e8";
const FG = "oklch(0.32 0.13 350)";
const MUTED = "oklch(0.55 0.1 340)";
/** 피그마 DOS Gothic 계열 — CDN: fonts-archive/DOSGothic (MIT), 미지원 글리프는 Galmuri 폴백 */
const FONT = '"DOSGothic","Galmuri11","Galmuri9",monospace';
/** ♡ 전용 — 로컬 `public/fonts/DungGeunMo.woff` */
const FONT_HEART = '"DungGeunMo",monospace';

const GRAD_CARD = "linear-gradient(180deg,#ffffff 0%,#fff0f6 100%)";
const GRAD_PINK = "linear-gradient(180deg,#ffb3d1 0%,#ff7eb6 100%)";
const SHADOW = "4px 4px 0 #ff5fa2";
const SHADOW_SM = "2px 2px 0 #ff5fa2";

// Figma 프로필 카드 (node 451:47 — 꿈딱지 디자인)
const PROFILE_BORDER = "#f4a0bc";
const PROFILE_ACCENT = "#eb477e";
const PROFILE_STATUS_FG = "#422442";
const PROFILE_CARD_BG =
  "linear-gradient(180deg, rgb(255, 255, 222) 12.987%, rgb(255, 255, 255) 60.173%)";
const PROFILE_HEADER_BG =
  "linear-gradient(180deg, #ffffff 0%, #ffffff 16.667%, #fff7a2 100%)";
const PROFILE_OUTER_SHADOW =
  "0 12px 18.8px rgba(0, 0, 0, 0.25), inset 0 -16px 11.4px 1px rgba(0, 0, 0, 0.13)";

// Figma 투데이 카드 (node 451:48)
const TODAY_CARD_BG =
  "linear-gradient(180deg, rgb(255, 255, 222) 12.987%, rgb(255, 255, 255) 100%)";
const TODAY_OUTER_SHADOW =
  "0 12px 18.8px rgba(0, 0, 0, 0.25), inset 0 -15px 13px 0 rgba(0, 0, 0, 0.1)";

// Figma 방명록 제출 버튼 — 기본 452:56, 호버 453:59
const GUESTBOOK_SUBMIT_BG = "#fcf3c5";
const GUESTBOOK_SUBMIT_BORDER = "#fbe36a";

// ── Shared style objects ──────────────────────────────────────────────────────
/** @type {{
 *   pixelCard: import("react").CSSProperties;
 *   pixelCardSm: import("react").CSSProperties;
 *   pixelInput: import("react").CSSProperties;
 *   pixelBtn: import("react").CSSProperties;
 *   notePaper: import("react").CSSProperties;
 * }} */
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

// DOS Gothic (피그마 DOSGothic) + DungGeunMo(♡, 로컬 woff) + Galmuri 폴백 — CDN 외 폰트는 public
const DOS_GOTHIC_WOFF2 =
  "https://cdn.jsdelivr.net/gh/fonts-archive/DOSGothic@master/DOSGothic.woff2";
const FONT_CSS = `
@font-face{font-family:"DOSGothic";src:url("${DOS_GOTHIC_WOFF2}")format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"DOSGothic";src:url("${DOS_GOTHIC_WOFF2}")format("woff2");font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:"DungGeunMo";src:url("/fonts/DungGeunMo.woff")format("woff");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11.woff2")format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11-Bold.woff2")format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Galmuri9";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri9.woff2")format("woff2");font-weight:400;font-display:swap}
`;

const GUESTBOOK_HIDE_SCROLLBAR_CSS = `
.guestbookEmbed-hideScrollbar{
  scrollbar-width:none;
  -ms-overflow-style:none;
}
.guestbookEmbed-hideScrollbar::-webkit-scrollbar{
  display:none;
  width:0;
  height:0;
}
`;

const GUESTBOOK_SUBMIT_BTN_CSS = `
.guestbookEmbed-submitBtn{
  box-sizing:border-box;
  font-family:"DOSGothic","Galmuri11","Galmuri9",monospace;
  font-size:1.125rem;
  font-weight:700;
  padding:0.5rem 1.25rem;
  border-radius:10px;
  border:1px solid ${GUESTBOOK_SUBMIT_BORDER};
  background:${GUESTBOOK_SUBMIT_BG};
  color:${PROFILE_STATUS_FG};
  cursor:pointer;
  box-shadow:none;
  outline:none;
  transition:background 0.12s ease,border-color 0.12s ease,color 0.12s ease;
}
.guestbookEmbed-submitBtn:hover:not(:disabled){
  background:${PROFILE_ACCENT};
  border-color:${PROFILE_ACCENT};
  color:#fff;
}
.guestbookEmbed-submitBtn:disabled{
  opacity:0.6;
  cursor:not-allowed;
}
`;

// ── ProfileCard (Figma 451:47) ────────────────────────────────────────────────
function ProfileCardIconCloud() {
  return (
    <div
      style={{
        position: "relative",
        width: 44,
        height: 25,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/profile_card_icons.png"
        style={{
          position: "absolute",
          height: "342.47%",
          width: "190.84%",
          left: "-90.84%",
          top: "-54.79%",
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function ProfileCardIconClover() {
  return (
    <div
      style={{
        position: "relative",
        width: 32,
        height: 33,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/profile_card_icons.png"
        style={{
          position: "absolute",
          height: "294.12%",
          width: "297.62%",
          left: "-171.43%",
          top: "-143.53%",
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function ProfileCard() {
  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `3px solid ${PROFILE_BORDER}`,
        borderRadius: 23,
        boxShadow: PROFILE_OUTER_SHADOW,
        background: PROFILE_CARD_BG,
        padding: "12px 14px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          border: `2px solid ${PROFILE_BORDER}`,
          borderRadius: 15,
          background: PROFILE_HEADER_BG,
          marginBottom: 12,
        }}
      >
        <ProfileCardIconCloud />
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: "1.125rem",
            color: PROFILE_ACCENT,
            lineHeight: 1.2,
          }}
        >
          프로필
        </div>
      </div>

      <div
        style={{
          border: `2px solid ${PROFILE_BORDER}`,
          borderRadius: 15,
          overflow: "hidden",
          marginBottom: 12,
          background: "#fff",
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
          }}
          width={512}
          height={512}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FONT,
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            color: PROFILE_STATUS_FG,
            flex: 1,
            minWidth: 0,
          }}
        >
          모두에게 행복이 가득하길..~
        </p>
        <ProfileCardIconClover />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          fontFamily: FONT,
          fontSize: "0.75rem",
          fontWeight: 700,
          color: PROFILE_ACCENT,
          whiteSpace: "nowrap",
        }}
      >
        <span>TODAY 202</span>
        <span>TOTAL 221,020</span>
      </div>
    </div>
  );
}

// ── TodayCard (Figma 451:48) ───────────────────────────────────────────────────
function TodayCardIconCherry() {
  return (
    <div
      style={{
        position: "relative",
        width: 34,
        height: 33,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/today_card_cherry.png"
        style={{
          position: "absolute",
          height: "316.46%",
          width: "304.88%",
          left: "-13.41%",
          top: "-53.16%",
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function TodayCard() {
  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `3px solid ${PROFILE_BORDER}`,
        borderRadius: 23,
        boxShadow: TODAY_OUTER_SHADOW,
        background: TODAY_CARD_BG,
        padding: "12px 14px 14px",
      }}
    >
      <div
        style={{
          position: "relative",
          marginBottom: 12,
          borderRadius: 15,
          overflow: "hidden",
          border: `2px solid ${PROFILE_BORDER}`,
          aspectRatio: "386 / 65",
        }}
      >
        <img
          alt=""
          src="/assets/guestbook/today_card_top.png"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
          }}
        >
          <TodayCardIconCherry />
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: "1.125rem",
              color: PROFILE_ACCENT,
              lineHeight: 1.2,
            }}
          >
            TODAY is ...
          </div>
        </div>
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: FONT,
          fontSize: "0.8125rem",
          lineHeight: 1.5,
          color: PROFILE_STATUS_FG,
        }}
      >
        모두에게 행복이 가득하길..~
      </p>
    </div>
  );
}

const GUESTBOOK_MSG_MAX_LEN = 200;

/** Figma 453:58 — ♡는 DungGeunMo(로컬), 「등록하기」는 DOS Gothic */
function GuestbookSubmitLabel() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.05em",
        lineHeight: 1,
        color: "inherit",
      }}
    >
      <span style={{ fontFamily: FONT_HEART }} aria-hidden="true">
        ♡
      </span>
      <span style={{ fontFamily: FONT }}> 등록하기 </span>
      <span style={{ fontFamily: FONT_HEART }} aria-hidden="true">
        ♡
      </span>
    </span>
  );
}

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
          className="guestbookEmbed-submitBtn"
          disabled={submitting}
        >
          {submitting ? "저장 중…" : <GuestbookSubmitLabel />}
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
/**
 * @param {Object} props
 * @param {() => void} props.onClose
 * @param {"default" | "fullscreen"} [props.variant] - `NoticeModalBoard` 전체 화면 배경 모드
 */
export function GuestbookEmbed({ onClose, variant = "default" }) {
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

  const isFullscreen = variant === "fullscreen";

  return (
    <>
      <style>{`${FONT_CSS}\n${GUESTBOOK_HIDE_SCROLLBAR_CSS}\n${GUESTBOOK_SUBMIT_BTN_CSS}`}</style>
      <div
        style={{
          fontFamily: FONT,
          color: FG,
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
          imageRendering: "pixelated",
          ...(isFullscreen && { width: "100%" }),
        }}
      >
        {/* pixel-card overflow-hidden (BrowserFrame) */}
        <div
          className={isFullscreen ? "guestbookEmbed-hideScrollbar" : undefined}
          style={{
            ...S.pixelCard,
            ...(isFullscreen && {
              width: "100%",
              maxHeight: "min(880px, calc(100dvh - 64px))",
              overflowY: "auto",
              boxSizing: "border-box",
            }),
          }}
        >
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
                    className="guestbookEmbed-hideScrollbar"
                    style={{
                      marginTop: "1.25rem",
                      maxHeight: isFullscreen
                        ? "min(430px, calc(100dvh - 400px))"
                        : "430px",
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
