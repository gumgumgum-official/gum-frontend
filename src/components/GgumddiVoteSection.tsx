const POSTER_W = 648;
const POSTER_H = 864;

/** 줌 등에서 `best_gum_poster.svg`만 표시(클릭/투표 없음). */
export function GgumddiVoteSection({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "min(90vw, 60vh)",
        margin: "0 auto",
        aspectRatio: `${POSTER_W} / ${POSTER_H}`,
        userSelect: "none",
      }}
    >
      <img
        src="/assets/poster/best_gum_poster.svg"
        alt="껌딱지 외모짱 선발 대회 포스터"
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}
