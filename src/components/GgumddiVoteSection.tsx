import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import { playRandomNoticePaperSound } from "../utils/common/playNoticePaperSound.js";

type VoteId = 1 | 2 | 3;

const STORAGE_KEY = "gum-ggumddi-vote-v2";

const NOTICE = STAGE3_OBJECTS_CONFIG.notice;
const [voteImg1, voteImg2, voteImg3] = NOTICE.voteCandidateImages;

const INITIAL_VOTES: Record<VoteId, number> = { 1: 0, 2: 0, 3: 0 };

const CANDIDATES: { id: VoteId; name: string; image: string; dot: string }[] = [
  {
    id: 1,
    name: "1. 껌뚝지",
    image: voteImg1,
    dot: "#FF8B33",
  },
  {
    id: 2,
    name: "2. 껌떡지",
    image: voteImg2,
    dot: "#c4a882",
  },
  {
    id: 3,
    name: "3. 껌뚱지",
    image: voteImg3,
    dot: "#FF4A89",
  },
];

/** 후보 점(dot)과 같은 단색 막대 (그라데이션 없음) */
const BAR_FILLS = [
  "bg-[#FF8B33]",
  "bg-[#c4a882]",
  "bg-[#FF4A89]",
] as const;

function loadPersisted(): {
  votes: Record<VoteId, number>;
  myVote: VoteId | null;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { votes: { ...INITIAL_VOTES }, myVote: null };
    const p = JSON.parse(raw) as {
      votes?: Partial<Record<string, number>>;
      myVote?: VoteId | null;
    };
    const v = p.votes;
    if (
      v &&
      typeof v["1"] === "number" &&
      typeof v["2"] === "number" &&
      typeof v["3"] === "number"
    ) {
      return {
        votes: { 1: v["1"], 2: v["2"], 3: v["3"] },
        myVote:
          p.myVote === 1 || p.myVote === 2 || p.myVote === 3 ? p.myVote : null,
      };
    }
  } catch {
    /* ignore */
  }
  return { votes: { ...INITIAL_VOTES }, myVote: null };
}

function persist(votes: Record<VoteId, number>, myVote: VoteId | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ votes, myVote }));
  } catch {
    /* ignore */
  }
}

type VoteBundle = {
  votes: Record<VoteId, number>;
  myVote: VoteId | null;
};

/** 껌딱지 외모짱 포스터: 클릭 시 후보 선택·투표·현황 */
export function GgumddiVoteSection({ className }: { className?: string }) {
  const [bundle, setBundle] = useState<VoteBundle>(loadPersisted);
  const { votes, myVote } = bundle;
  const [popupOpen, setPopupOpen] = useState(false);
  const [justVotedId, setJustVotedId] = useState<VoteId | null>(null);

  const posterWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    persist(votes, myVote);
  }, [votes, myVote]);

  useLayoutEffect(() => {
    if (justVotedId === null) return;
    const t = window.setTimeout(() => setJustVotedId(null), 450);
    return () => window.clearTimeout(t);
  }, [justVotedId]);

  const total = votes[1] + votes[2] + votes[3];

  const onVote = useCallback((id: VoteId) => {
    setBundle((s) => {
      const nextVotes = { ...s.votes };
      if (s.myVote !== null) {
        nextVotes[s.myVote] = Math.max(0, nextVotes[s.myVote] - 1);
      }
      nextVotes[id] = nextVotes[id] + 1;
      return { votes: nextVotes, myVote: id };
    });
    setJustVotedId(id);
  }, []);

  useEffect(() => {
    if (!popupOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const wrap = posterWrapRef.current;
      const target = e.target;
      if (wrap && target instanceof Node && !wrap.contains(target)) {
        setPopupOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [popupOpen]);

  const togglePopup = useCallback(() => {
    setPopupOpen((o) => !o);
  }, []);

  const onPosterWrapClick = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      playRandomNoticePaperSound(NOTICE.paperSoundPaths);
      togglePopup();
    },
    [togglePopup],
  );

  const onSubPosterClick = useCallback(
    (e: MouseEvent, id: VoteId) => {
      e.stopPropagation();
      playRandomNoticePaperSound(NOTICE.paperSoundPaths);
      onVote(id);
    },
    [onVote],
  );

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-20 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-center min-[900px]:gap-10">
        <div
          ref={posterWrapRef}
          className="group/poster relative mx-auto aspect-[3/4] w-[min(90vw,60vh)] shrink-0 cursor-pointer overflow-visible rounded-md min-[900px]:mx-0"
          role="button"
          tabIndex={0}
          onClick={onPosterWrapClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              playRandomNoticePaperSound(NOTICE.paperSoundPaths);
              togglePopup();
            }
          }}
        >
          <img
            src={NOTICE.posterImages.bestGum}
            alt="껌딱지 외모짱 선발 대회 포스터"
            draggable={false}
            className={`absolute inset-0 block h-full w-full rounded-md object-contain shadow-[0_12px_48px_rgba(0,0,0,0.18)] transition-[filter,transform] duration-300 ease-in-out select-none ${
              popupOpen ? "brightness-[0.55]" : ""
            }`}
          />
          <span
            className={`pointer-events-none absolute top-3 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[clamp(12px,2.8vw,14px)] font-semibold whitespace-nowrap text-white transition-opacity duration-300 font-['Noto_Sans_KR',system-ui,sans-serif] ${
              popupOpen
                ? "opacity-0"
                : "opacity-0 group-hover/poster:opacity-100"
            }`}
          >
            포스터를 클릭하여 투표하기
          </span>
          <div
            className={`absolute inset-0 z-10 flex box-border items-center justify-center gap-[clamp(10px,2.4vw,18px)] p-2 px-1.5 transition-opacity duration-[350ms] ${
              popupOpen
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            {CANDIDATES.map(({ id, name, image }, cardIdx) => {
              const tDelay = [50, 120, 190][cardIdx];
              const nameDelay = [100, 170, 240][cardIdx];
              const voted = myVote === id;
              return (
                <div
                  key={id}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2.5"
                >
                  <button
                    type="button"
                    data-vote-id={id}
                    className={`group/sub relative w-full max-w-full cursor-pointer overflow-hidden rounded-[10px] border-0 bg-transparent p-0 font-inherit shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:!z-20 hover:!-translate-y-1.5 hover:!scale-[1.08] hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] active:!translate-y-0 active:!scale-[0.97] active:duration-100 ${
                      popupOpen
                        ? "translate-y-0 scale-100"
                        : "translate-y-5 scale-[0.85]"
                    } ${voted ? "outline outline-[3px] outline-[#FFD700] outline-offset-2" : ""} ${
                      justVotedId === id ? "animate-ggumddi-vote-pop" : ""
                    }`}
                    style={{ transitionDelay: `${tDelay}ms` }}
                    onClick={(e) => onSubPosterClick(e, id)}
                  >
                    <img
                      src={image}
                      alt={name}
                      draggable={false}
                      className="block w-full"
                    />
                    <span
                      className={`absolute right-0 bottom-0 left-0 bg-black/75 py-2.5 px-2 text-center text-[clamp(12px,2.2vw,14px)] font-semibold text-white transition-transform duration-300 font-['Noto_Sans_KR',system-ui,sans-serif] ${
                        voted
                          ? "translate-y-0 bg-[rgba(255,215,0,0.9)] text-[#1a1a2e]"
                          : "translate-y-full group-hover/sub:translate-y-0"
                      }`}
                    >
                      {voted ? "투표 완료!" : "투표하기"}
                    </span>
                  </button>
                  <span
                    className={`text-center text-[clamp(12px,2.6vw,16px)] font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-[400ms] ease-in-out font-['Noto_Sans_KR',system-ui,sans-serif] px-0.5 ${
                      popupOpen
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-0"
                    }`}
                    style={{ transitionDelay: `${nameDelay}ms` }}
                  >
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="box-border w-full max-w-[min(360px,100%)] rounded-[22px] border border-slate-200/90 bg-white px-5 pt-6 pb-6 font-['Noto_Sans_KR',system-ui,sans-serif] text-slate-800 shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-[opacity,transform] duration-500 min-[900px]:translate-x-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/90 pb-5">
            <div>
              <h2 className="m-0 text-[15px] font-bold tracking-tight text-slate-900">
                투표 현황
              </h2>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                후보별 득표 비율
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200/90 bg-slate-50 px-3.5 py-2 text-[11px] font-medium tabular-nums text-slate-600">
              총{" "}
              <span className="text-sm font-bold text-slate-900">{total}</span>
              표
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3.5">
            {CANDIDATES.map(({ id, name, dot }, idx) => {
              const count = votes[id];
              const pct = total > 0 ? (count / total) * 100 : 0;
              const barFill = BAR_FILLS[idx];
              const hasVotes = count > 0;
              return (
                <div
                  key={id}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                >
                  <div className="mb-3.5 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-slate-200/90"
                        style={{
                          background: dot,
                          boxShadow: `0 0 10px ${dot}80`,
                        }}
                      />
                      <span className="truncate text-[13px] font-semibold text-slate-800">
                        {name}
                      </span>
                      {myVote === id ? (
                        <span className="shrink-0 rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-slate-900">
                          MY
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${hasVotes ? "text-slate-800" : "text-slate-400"}`}
                    >
                      {count}표
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/90 ring-1 ring-inset ring-slate-300/50">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${barFill} ${hasVotes ? "shadow-[0_1px_3px_rgba(15,23,42,0.12)]" : ""}`}
                      style={{
                        width: hasVotes ? `${pct}%` : "0%",
                      }}
                    />
                  </div>
                  <div className="mt-2 min-h-4 text-right text-[10px] font-semibold tabular-nums text-slate-500">
                    {hasVotes ? `${Math.round(pct)}%` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
