import { useState, useEffect, useCallback } from "react";
import { getGumServerBaseUrl } from "../lib/monitorCurrentApi.js";
import { fetchWithRetry } from "../lib/fetchWithRetry.js";
import {
  pauseStage3BackgroundAmbientForOverlay,
  resumeStage3BackgroundAmbientFromOverlay,
} from "../utils/common/stage3IntroAudio.js";

// ── Design tokens ─────────────────────────────────────────────────────────────
const PINK = "#ff5fa2";
const PINK_MID = "#ffb3d1";
const PINK_SOFT = "#ffd9e8";
const FG = "oklch(0.32 0.13 350)";
const MUTED = "oklch(0.55 0.1 340)";
/** 피그마 DOS Gothic 계열 — CDN: fonts-archive/DOSGothic (MIT), 미지원 글리프는 Galmuri 폴백 */
const FONT = '"DOSGothic","Galmuri11","Galmuri9",monospace';
/** ♡ 전용 — 로컬 `public/fonts/DungGeunMo.woff2` */
const FONT_HEART = '"DungGeunMo",monospace';
/** Figma 480:143 — TODAY is ... (DOSIyagiBoldface) */
const FONT_TODAY_TITLE = '"DOSIyagiBoldface","DOSGothic","Galmuri11",monospace';

const GRAD_CARD = "linear-gradient(180deg,#ffffff 0%,#fff0f6 100%)";
const GRAD_PINK = "linear-gradient(180deg,#ffb3d1 0%,#ff7eb6 100%)";
const SHADOW = "4px 4px 0 #ff5fa2";
const SHADOW_SM = "2px 2px 0 #ff5fa2";

// Figma 프로필 카드 (node 484:200 — 꿈딱지 디자인)
const PROFILE_BORDER = "#f4a0bc";
const PROFILE_ACCENT = "#eb477e";
const PROFILE_STATUS_FG = "#422442";
const PROFILE_CARD_BG =
  "linear-gradient(180deg, rgb(255, 255, 222) 12.987%, rgb(255, 255, 255) 60.173%)";
const PROFILE_HEADER_BG =
  "linear-gradient(180deg, #ffffff 0%, #ffffff 16.667%, #fff7a2 100%)";
const PROFILE_DROP_SHADOW = "0 12px 18.8px rgba(0, 0, 0, 0.25)";
const PROFILE_INSET_SHADOW = "inset 0 -16px 11.4px 1px rgba(0, 0, 0, 0.13)";
const PROFILE_OUTER_SHADOW = `${PROFILE_DROP_SHADOW}, ${PROFILE_INSET_SHADOW}`;

// Figma 투데이 카드 (node 480:140)
const TODAY_OUTER_SHADOW =
  "0 12px 18.8px rgba(0, 0, 0, 0.25), inset 0 -15px 13px 0 rgba(0, 0, 0, 0.1)";

// Figma 방명록 (480:135) — 배경 480:136, 헤더 486:6, 작성 480:149, 게시글 480:158
/** 게시글 스크롤 영역 높이 */
const GUESTBOOK_LIST_HEIGHT = 360;
/** 그림자 노출용 — 하단만 여백 (좌우 정렬 유지) */
const GUESTBOOK_CARD_SHADOW_MARGIN = "0 0 32px 0";
const GUESTBOOK_EMBED_PAD = "16px 20px 32px";
const GUESTBOOK_WRITE_BG = "#ffecf2";
const GUESTBOOK_WRITE_BORDER = "#f9cfda";
const GUESTBOOK_NAMEBAR_BG = "#ffecf2";
const GUESTBOOK_DATE_COLOR = "#9f9f9f";
const GUESTBOOK_PLACEHOLDER = "#f4a0bc";
const GUESTBOOK_PHOTO_SIZE = 150;
const GUESTBOOK_PROFILE_AVATARS = [
  "/assets/guestbook/profile/random1.svg",
  "/assets/guestbook/profile/random2.svg",
  "/assets/guestbook/profile/random3.svg",
  "/assets/guestbook/profile/random4.svg",
];

function pickRandomAvatarIndex(excludeIndex = -1) {
  const candidates = GUESTBOOK_PROFILE_AVATARS.map((_, i) => i).filter(
    (i) => i !== excludeIndex,
  );
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function avatarIndexFromKey(key) {
  const s = String(key);
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % GUESTBOOK_PROFILE_AVATARS.length;
}

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

/** Figma 480:165 — (2026.05.22 10:00) */
function formatGuestbookDate(iso) {
  const d = new Date(iso);
  const date = formatDate(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `(${date} ${time})`;
}

function sortPostsNewestFirst(posts) {
  return [...posts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** 프로필 카드 TOTAL — Figma 스타일 (221,020) */
function formatPostCount(count, loading) {
  if (loading) return "...";
  return count.toLocaleString("en-US");
}

// DOS Gothic (피그마 DOSGothic) + DungGeunMo(♡, 로컬 woff2) + Galmuri 폴백 — CDN 외 폰트는 public
const DOS_GOTHIC_WOFF2 =
  "https://cdn.jsdelivr.net/gh/fonts-archive/DOSGothic@master/DOSGothic.woff2";
const DOS_IYAGI_BOLDFACE_TTF =
  "https://cdn.jsdelivr.net/gh/hurss/fonts@master/ttf/DOSIyagiBoldface.ttf";
const FONT_CSS = `
@font-face{font-family:"DOSGothic";src:url("${DOS_GOTHIC_WOFF2}") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"DOSGothic";src:url("${DOS_GOTHIC_WOFF2}") format("woff2");font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:"DOSIyagiBoldface";src:url("${DOS_IYAGI_BOLDFACE_TTF}") format("truetype");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"DungGeunMo";src:url("/fonts/DungGeunMo.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Galmuri11";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri11-Bold.woff2") format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"Galmuri9";src:url("https://cdn.jsdelivr.net/gh/quiple/galmuri/dist/Galmuri9.woff2") format("woff2");font-weight:400;font-display:swap}
`;

const GUESTBOOK_HIDE_SCROLLBAR_CSS = `
.guestbookEmbed-hideScrollbar,
.guestbookEmbed-input{
  scrollbar-width:none;
  -ms-overflow-style:none;
}
.guestbookEmbed-hideScrollbar::-webkit-scrollbar,
.guestbookEmbed-input::-webkit-scrollbar{
  display:none;
  width:0;
  height:0;
  background:transparent;
}
.guestbookEmbed-hideScrollbar::-webkit-scrollbar-thumb,
.guestbookEmbed-hideScrollbar::-webkit-scrollbar-track,
.guestbookEmbed-input::-webkit-scrollbar-thumb,
.guestbookEmbed-input::-webkit-scrollbar-track{
  display:none;
  background:transparent;
}
`;

const GUESTBOOK_INPUT_CSS = `
.guestbookEmbed-input::placeholder{
  color:${GUESTBOOK_PLACEHOLDER};
  opacity:1;
}
`;

const GUESTBOOK_SUBMIT_BTN_CSS = `
.guestbookEmbed-submitBtn{
  box-sizing:border-box;

  font-family:"DOSGothic","Galmuri11","Galmuri9",monospace;
  font-size:1rem;
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

// ── GuestbookTitle (Figma 486:5) ─────────────────────────────────────────────
function GuestbookTitle() {
  return (
    <img
      alt="껌's 미니홈피"
      src="/assets/guestbook/title.png"
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        flexShrink: 0,
      }}
    />
  );
}

// ── ProfileCard (Figma 484:200) ───────────────────────────────────────────────
/** Figma 480:148 — 구름 아이콘 */
function ProfileCardIconCloud() {
  return (
    <div
      style={{
        position: "relative",
        width: 31,
        height: 30,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/profile_card_icons.webp"
        style={{
          position: "absolute",
          height: "342.47%",
          width: "326.27%",
          left: "-187.56%",
          top: "-54.79%",
          maxWidth: "none",
        }}
      />
    </div>
  );
}

/** Figma 480:178 — 클로버 아이콘 (31×31, 2x WebP) */
function ProfileCardIconClover() {
  return (
    <img
      alt=""
      src="/assets/guestbook/clover.webp"
      width={31}
      height={31}
      draggable={false}
      style={{
        display: "block",
        width: 31,
        height: 31,
        flexShrink: 0,
        objectFit: "contain",
      }}
    />
  );
}

/** Figma 498:2 — 프로필 사진 (480:174 배경 + 480:175 캐릭터 + 480:177 테두리) */
function ProfileCardPhoto() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "307 / 170",
        boxSizing: "border-box",
        border: `2px solid ${PROFILE_BORDER}`,
        borderRadius: 15,
        overflow: "hidden",
        marginBottom: 21,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/profile_photo_bg.webp"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "16.61%",
          top: "8.24%",
          width: "67.1%",
          height: "90.59%",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <img
          alt="삐삐 프로필"
          src="/assets/guestbook/profile_character.webp"
          style={{
            position: "absolute",
            height: "200.81%",
            width: "100.04%",
            left: "-0.02%",
            top: "-33.2%",
            maxWidth: "none",
            imageRendering: "pixelated",
          }}
        />
      </div>
    </div>
  );
}

/** Figma 480:146 + 480:147 + 480:148 */
function ProfileCardHeader() {
  return (
    <div
      style={{
        position: "relative",
        marginBottom: 15,
        border: `2px solid ${PROFILE_BORDER}`,
        borderRadius: 15,
        overflow: "hidden",
        minHeight: 63,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: PROFILE_HEADER_BG,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          minHeight: 63,
          boxSizing: "border-box",
        }}
      >
        <ProfileCardIconCloud />
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: "1.25rem",
            color: PROFILE_ACCENT,
            lineHeight: 1.2,
          }}
        >
          프로필
        </div>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {number} props.totalCount
 * @param {boolean} props.countLoading
 */
function ProfileCard({ totalCount, countLoading }) {
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
      <ProfileCardHeader />
      <ProfileCardPhoto />

      {/* Figma 480:176 + 480:178 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FONT,
            fontSize: "0.875rem",
            lineHeight: 1.35,
            color: PROFILE_STATUS_FG,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          모두에게 행복이 가득하길..~
        </p>
        <ProfileCardIconClover />
      </div>

      {/* Figma 480:179 + 480:180 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          fontFamily: FONT,
          fontSize: "1rem",
          fontWeight: 700,
          color: PROFILE_ACCENT,
          whiteSpace: "nowrap",
        }}
      >
        <span>TODAY 202</span>
        <span>TOTAL {formatPostCount(totalCount, countLoading)}</span>
      </div>
    </div>
  );
}

// ── TodayCard (Figma 480:140) ─────────────────────────────────────────────────
function TodayCardIconNote() {
  return (
    <svg
      aria-hidden
      width={24}
      height={24}
      viewBox="0 0 8 8"
      style={{ display: "block", flexShrink: 0, imageRendering: "pixelated" }}
    >
      {/* stem */}
      <rect x="4" y="0" width="1" height="5" fill={PROFILE_ACCENT} />
      {/* flag */}
      <rect x="5" y="0" width="2" height="1" fill={PROFILE_ACCENT} />
      <rect x="6" y="1" width="1" height="1" fill={PROFILE_ACCENT} />
      {/* note head */}
      <rect x="2" y="4" width="3" height="2" fill={PROFILE_ACCENT} />
      <rect x="1" y="5" width="1" height="1" fill={PROFILE_ACCENT} />
    </svg>
  );
}

/** Figma 500:2 — 투데이 헤더 (480:142 + 480:143 + 480:144) */
function TodayCardHeader() {
  return (
    <div
      style={{
        position: "relative",
        marginBottom: 10,
        width: "100%",
        aspectRatio: "309.753 / 52.16",
        border: `2px solid ${PROFILE_BORDER}`,
        borderRadius: 15,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: PROFILE_HEADER_BG,
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: "100%",
          padding: "0 11px",
          boxSizing: "border-box",
        }}
      >
        <TodayCardIconNote />
        <div
          style={{
            fontFamily: FONT_TODAY_TITLE,
            fontWeight: 400,
            fontSize: "1.25rem",
            color: PROFILE_ACCENT,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          TODAY's music is ..
        </div>
      </div>
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
        background: PROFILE_CARD_BG,
        padding: "12px 14px 14px",
      }}
    >
      <TodayCardHeader />

      {/* Figma 480:145 */}
      <p
        style={{
          margin: 0,
          padding: "6px",
          fontFamily: FONT,
          fontSize: "1rem",
          lineHeight: 1.35,
          color: PROFILE_STATUS_FG,
        }}
      >
        프리스타일 - y
      </p>
    </div>
  );
}

const GUESTBOOK_MSG_MAX_LEN = 200;

/** @type {import("react").CSSProperties} */
const GUESTBOOK_INPUT_STYLE = {
  fontFamily: FONT,
  background: "#fff",
  border: `1px solid ${PROFILE_BORDER}`,
  borderRadius: 3,
  padding: "0.5rem 0.75rem",
  fontSize: "1rem",
  color: PROFILE_STATUS_FG,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  display: "block",
};

// ── Guestbook panel (Figma 480:135) ─────────────────────────────────────────────
function GuestbookRibbonIcon() {
  return (
    <div
      style={{
        position: "relative",
        width: 34,
        height: 32,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        alt=""
        src="/assets/guestbook/guestbook_ribbon.webp"
        style={{
          position: "absolute",
          height: "308.64%",
          width: "290.7%",
          left: 0,
          top: "-149.38%",
          maxWidth: "none",
        }}
      />
    </div>
  );
}

/**
 * @param {Object} props
 * @param {number} props.totalCount
 * @param {boolean} props.countLoading
 */
function GuestbookHeader({ totalCount, countLoading }) {
  const countLabel = countLoading
    ? "..."
    : `총 ${totalCount.toLocaleString("ko-KR")}개`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 10px",
        border: `2px solid ${PROFILE_BORDER}`,
        borderRadius: 15,
        background: PROFILE_HEADER_BG,
        marginBottom: 12,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
      >
        <GuestbookRibbonIcon />
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: "1.25rem",
            color: PROFILE_ACCENT,
            lineHeight: 1.2,
          }}
        >
          방명록
        </div>
      </div>
      <span
        style={{
          fontFamily: FONT,
          fontSize: "0.875rem",
          fontWeight: 700,
          color: PROFILE_STATUS_FG,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {countLabel}
      </span>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string | number} [props.avatarKey] - 게시글별 고정 아바타 (목록)
 * @param {boolean} [props.interactive] - 클릭 시 다른 랜덤 아바타 (작성 폼)
 */
function GuestbookPhotoBox({ avatarKey, interactive = false }) {
  const [randomIndex, setRandomIndex] = useState(() => pickRandomAvatarIndex());
  const index = avatarKey != null ? avatarIndexFromKey(avatarKey) : randomIndex;

  function cycleAvatar() {
    setRandomIndex((prev) => pickRandomAvatarIndex(prev));
  }

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? cycleAvatar : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                cycleAvatar();
              }
            }
          : undefined
      }
      style={{
        width: GUESTBOOK_PHOTO_SIZE,
        height: GUESTBOOK_PHOTO_SIZE,
        flexShrink: 0,
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: interactive ? "pointer" : undefined,
      }}
    >
      <img
        alt=""
        src={GUESTBOOK_PROFILE_AVATARS[index]}
        draggable={false}
        style={{
          width: "86%",
          height: "86%",
          objectFit: "contain",
        }}
      />
    </div>
  );
}

/** Figma 453:58 — ♡는 DungGeunMo(로컬), 「등록하기」는 DOS Gothic */
function GuestbookSubmitLabel() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25em",
        lineHeight: 1,
        color: "inherit",
      }}
    >
      <span style={{ fontFamily: FONT_HEART }} aria-hidden="true">
        ♡
      </span>
      <span style={{ fontFamily: FONT }}>등록하기</span>
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
      const res = await fetchWithRetry(`${base}/api/posts`, {
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
        background: GUESTBOOK_WRITE_BG,
        borderTop: `2px solid ${GUESTBOOK_WRITE_BORDER}`,
        borderBottom: `2px solid ${GUESTBOOK_WRITE_BORDER}`,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "14px 12px 12px",
          alignItems: "flex-start",
        }}
      >
        <GuestbookPhotoBox interactive />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <input
            className="guestbookEmbed-input"
            style={{ ...GUESTBOOK_INPUT_STYLE, height: 43 }}
            placeholder="닉네임"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="guestbookEmbed-input"
            style={{
              ...GUESTBOOK_INPUT_STYLE,
              minHeight: 99,
              resize: "vertical",
            }}
            placeholder="자유롭게 하고싶은 말을 남겨주세요~"
            value={msg}
            maxLength={GUESTBOOK_MSG_MAX_LEN}
            onChange={(e) => setMsg(e.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              className="guestbookEmbed-submitBtn"
              disabled={submitting}
            >
              {submitting ? "저장 중…" : <GuestbookSubmitLabel />}
            </button>
          </div>
        </div>
      </div>
      {toast && (
        <div
          style={{
            margin: "0 12px 12px",
            borderRadius: 10,
            border: `1px solid ${PROFILE_BORDER}`,
            background: "#fff",
            padding: "0.5rem 0.75rem",
            fontSize: "0.75rem",
            color: PROFILE_STATUS_FG,
          }}
        >
          {toast}
        </div>
      )}
    </form>
  );
}

// ── GuestbookEntry (Figma 480:158) ────────────────────────────────────────────
const GUESTBOOK_ENTRY_GRID = `${GUESTBOOK_PHOTO_SIZE}px minmax(0, 1fr)`;
const GUESTBOOK_ENTRY_GAP = 12;

function GuestbookEntry({ index, name, date, message, postId }) {
  return (
    <article>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GUESTBOOK_ENTRY_GRID,
          columnGap: GUESTBOOK_ENTRY_GAP,
          alignItems: "center",
          height: 37,
          padding: "0 12px",
          background: GUESTBOOK_NAMEBAR_BG,
          borderTop: `1px solid ${PROFILE_BORDER}`,
          fontFamily: FONT,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{ fontSize: "1rem", color: "#000", whiteSpace: "nowrap" }}
            >
              NO.
            </span>
            <span
              style={{
                fontSize: "1rem",
                color: "#000",
                whiteSpace: "nowrap",
              }}
            >
              {index}
            </span>
          </div>
          <span
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: PROFILE_ACCENT,
              whiteSpace: "nowrap",
              textAlign: "right",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
        </div>
        <span
          style={{
            justifySelf: "end",
            fontSize: "0.8125rem",
            color: GUESTBOOK_DATE_COLOR,
            whiteSpace: "nowrap",
          }}
        >
          {date}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GUESTBOOK_ENTRY_GRID,
          columnGap: GUESTBOOK_ENTRY_GAP,
          padding: "12px",
          background: "#fff",
          alignItems: "flex-start",
        }}
      >
        <GuestbookPhotoBox avatarKey={postId} />
        <p
          style={{
            margin: 0,
            minWidth: 0,
            fontFamily: FONT,
            fontSize: "1rem",
            lineHeight: 1.35,
            color: PROFILE_STATUS_FG,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message}
        </p>
      </div>
    </article>
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
  const [postsError, setPostsError] = useState(false);
  /** 「다시 시도」 클릭 횟수 — 3회까지 허용, 그 후엔 작가 문의 안내 */
  const [retryCount, setRetryCount] = useState(0);
  const RETRY_LIMIT = 3;

  useEffect(() => {
    pauseStage3BackgroundAmbientForOverlay();
    const audio = new window.Audio("/static/sounds/guestbook/guestbook.mp3");
    audio.loop = true;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.src = "";
      resumeStage3BackgroundAmbientFromOverlay();
    };
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(false);
    try {
      const base = getGumServerBaseUrl();
      const res = await fetchWithRetry(`${base}/api/posts`, {
        idempotent: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const raw = Array.isArray(d) ? d : (d.posts ?? []);
      setPosts(sortPostsNewestFirst(raw));
    } catch {
      setPostsError(true);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  function handlePostAdded(post) {
    setPosts((prev) => sortPostsNewestFirst([post, ...prev]));
  }

  const isFullscreen = variant === "fullscreen";

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <style>{`${FONT_CSS}\n${GUESTBOOK_HIDE_SCROLLBAR_CSS}\n${GUESTBOOK_INPUT_CSS}\n${GUESTBOOK_SUBMIT_BTN_CSS}`}</style>
      <div
        className="guestbookEmbed-hideScrollbar"
        style={{
          fontFamily: FONT,
          color: FG,
          WebkitFontSmoothing: "none",
          MozOsxFontSmoothing: "grayscale",
          imageRendering: "pixelated",
          width: "100%",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            ...(isFullscreen && { padding: GUESTBOOK_EMBED_PAD }),
          }}
        >
          {onClose && (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                minHeight: 40,
                marginBottom: 12,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                style={{
                  width: 40,
                  height: 40,
                  margin: 0,
                  padding: 0,
                  border: `2px solid ${PROFILE_BORDER}`,
                  borderRadius: "50%",
                  background: "#fff",
                  cursor: "pointer",
                  flexShrink: 0,
                  boxShadow: SHADOW_SM,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  aria-hidden
                  width={14}
                  height={14}
                  viewBox="0 0 14 14"
                  style={{ display: "block", flexShrink: 0 }}
                >
                  <path
                    d="M1 1 L13 13 M13 1 L1 13"
                    stroke={PROFILE_ACCENT}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "280px minmax(0, 1fr)",
              gap: "4em",
              alignItems: "start",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              <GuestbookTitle />
              <ProfileCard
                totalCount={posts.length}
                countLoading={postsLoading}
              />
              <TodayCard />
            </div>

            <div style={{ minWidth: 0, overflow: "visible" }}>
              <div
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  borderRadius: 23,
                  boxShadow: PROFILE_OUTER_SHADOW,
                  margin: GUESTBOOK_CARD_SHADOW_MARGIN,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `3px solid ${PROFILE_BORDER}`,
                    borderRadius: 23,
                    background: PROFILE_CARD_BG,
                    padding: "12px 14px 14px",
                    overflow: "hidden",
                  }}
                >
                  <GuestbookHeader
                    totalCount={posts.length}
                    countLoading={postsLoading}
                  />
                  <GuestbookForm onSuccess={handlePostAdded} />

                  <div
                    className="guestbookEmbed-hideScrollbar"
                    style={{
                      height: GUESTBOOK_LIST_HEIGHT,
                      overflowY: "auto",
                      background: PROFILE_CARD_BG,
                      borderTop: `1px solid ${PROFILE_BORDER}`,
                    }}
                  >
                    {postsLoading ? (
                      <div
                        style={{
                          fontFamily: FONT,
                          fontSize: "0.875rem",
                          color: GUESTBOOK_DATE_COLOR,
                          textAlign: "center",
                          padding: "1.5rem 0",
                        }}
                      >
                        불러오는 중…
                      </div>
                    ) : postsError ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 10,
                          fontFamily: FONT,
                          fontSize: "0.875rem",
                          color: PROFILE_STATUS_FG,
                          textAlign: "center",
                          padding: "1.5rem 0",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {retryCount >= RETRY_LIMIT ? (
                          <span>
                            {
                              "방명록을 계속 불러오지 못하고 있어요.\n현장에 있는 작가에게 문의해주세요."
                            }
                          </span>
                        ) : (
                          <>
                            <span>
                              방명록을 불러오지 못했어요. 다시 시도해주세요.
                            </span>
                            <button
                              type="button"
                              className="guestbookEmbed-submitBtn"
                              onClick={() => {
                                setRetryCount((c) => c + 1);
                                loadPosts();
                              }}
                            >
                              다시 시도
                            </button>
                          </>
                        )}
                      </div>
                    ) : posts.length === 0 ? (
                      <div
                        style={{
                          fontFamily: FONT,
                          fontSize: "0.875rem",
                          color: GUESTBOOK_DATE_COLOR,
                          textAlign: "center",
                          padding: "1.5rem 0",
                          borderTop: `1px solid ${PROFILE_BORDER}`,
                        }}
                      >
                        첫 방명록을 남겨주세요 ♥
                      </div>
                    ) : (
                      posts.map((p, i) => (
                        <GuestbookEntry
                          key={p.id}
                          postId={p.id}
                          index={posts.length - i}
                          name={p.nickname ?? "익명"}
                          date={formatGuestbookDate(p.created_at)}
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
