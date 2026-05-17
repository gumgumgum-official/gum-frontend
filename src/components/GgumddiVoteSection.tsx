import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { STAGE3_OBJECTS_CONFIG } from "../config/stages/stage3/stage3ObjectsConfig.js";
import { getSessionId } from "../lib/session.js";
import {
  deleteMyVote,
  fetchMyVote,
  getOrCreateVoteClientId,
  postVote,
  saveVoteClientId,
  updateMyVote,
} from "../lib/voteApi.js";
import {
  fetchVoteBundle,
  getCachedVoteBundle,
  setCachedVoteFromAggregate,
} from "../lib/voteBundleCache.js";
import { playRandomNoticePaperSound } from "../utils/stages/stage3/playNoticePaperSound.js";

type VoteId = 1 | 2 | 3;

const NOTICE = STAGE3_OBJECTS_CONFIG.notice;
const [voteImg1, voteImg2, voteImg3] = NOTICE.voteCandidateImages;

const INITIAL_VOTES: Record<VoteId, number> = { 1: 0, 2: 0, 3: 0 };

const CANDIDATES: { id: VoteId; name: string; image: string; dot: string }[] = [
  {
    id: 1,
    name: "1. 껌샘물",
    image: voteImg1,
    dot: "#FF8B33",
  },
  {
    id: 2,
    name: "2. 껌태닝",
    image: voteImg2,
    dot: "#c4a882",
  },
  {
    id: 3,
    name: "3. 껌곤듀",
    image: voteImg3,
    dot: "#FF4A89",
  },
];

/** 후보 점(dot)과 같은 단색 막대 (그라데이션 없음) */
const BAR_FILLS = ["bg-[#FF8B33]", "bg-[#c4a882]", "bg-[#FF4A89]"] as const;

type VoteBundle = {
  votes: Record<VoteId, number>;
  myVote: VoteId | null;
  totalVotes: number;
};

/** 껌딱지 외모짱 포스터: 클릭 시 후보 선택·투표·현황 */
export function GgumddiVoteSection({ className }: { className?: string }) {
  const clientId = useMemo(() => getOrCreateVoteClientId(), []);
  const initialBundle = useMemo(
    () => getCachedVoteBundle(clientId),
    [clientId],
  );

  const [bundle, setBundle] = useState<VoteBundle>(() => ({
    votes: initialBundle?.votes ?? { ...INITIAL_VOTES },
    myVote: initialBundle?.myVote ?? null,
    totalVotes: initialBundle?.totalVotes ?? 0,
  }));
  const { votes, myVote, totalVotes } = bundle;
  const [popupOpen, setPopupOpen] = useState(false);
  const [justVotedId, setJustVotedId] = useState<VoteId | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(!initialBundle);
  const [isVoting, setIsVoting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const posterWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const hadCache = Boolean(initialBundle);
    if (!hadCache) setIsLoadingResults(true);

    void fetchVoteBundle(clientId, { force: hadCache })
      .then((next) => {
        if (!alive) return;
        setBundle(next);
        setErrorMessage("");
      })
      .catch((err) => {
        if (!alive) return;
        if (!hadCache) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "투표 집계를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!alive) return;
        setIsLoadingResults(false);
      });

    return () => {
      alive = false;
    };
  }, [clientId, initialBundle]);

  useLayoutEffect(() => {
    if (justVotedId === null) return;
    const t = window.setTimeout(() => setJustVotedId(null), 450);
    return () => window.clearTimeout(t);
  }, [justVotedId]);

  const onVote = useCallback(
    async (id: VoteId) => {
      if (isVoting) return;
      setIsVoting(true);
      setErrorMessage("");
      try {
        if (myVote === null) {
          // 첫 투표
          const response = await postVote(id, { clientId });
          if (response.clientId) saveVoteClientId(response.clientId);
          setCachedVoteFromAggregate(clientId, response, id);
          setBundle({
            votes: response.votes,
            myVote: id,
            totalVotes: response.totalVotes,
          });
          setJustVotedId(id);
        } else if (myVote === id) {
          // 같은 후보 재클릭 → 취소
          const response = await deleteMyVote({ clientId });
          setCachedVoteFromAggregate(clientId, response, null);
          setBundle({
            votes: response.votes,
            myVote: null,
            totalVotes: response.totalVotes,
          });
        } else {
          // 다른 후보 클릭 → 재투표
          const response = await updateMyVote(id, { clientId });
          setCachedVoteFromAggregate(clientId, response, id);
          setBundle({
            votes: response.votes,
            myVote: id,
            totalVotes: response.totalVotes,
          });
          setJustVotedId(id);
        }
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 409) {
          // 서버와 상태 불일치 → 서버 상태로 동기화 후 재시도 안내
          try {
            const serverVote = await fetchMyVote(clientId);
            setBundle((prev) => ({ ...prev, myVote: serverVote }));
          } catch {
            /* ignore */
          }
          setErrorMessage("투표 상태를 다시 확인했습니다. 다시 시도해주세요.");
        } else {
          setErrorMessage(
            err instanceof Error ? err.message : "투표 처리에 실패했습니다.",
          );
        }
      } finally {
        setIsVoting(false);
      }
    },
    [isVoting, myVote, clientId],
  );

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
      if (isVoting) return;
      playRandomNoticePaperSound(NOTICE.paperSoundPaths);
      void onVote(id);
    },
    [isVoting, onVote],
  );

  return (
    <div className={className}>
      <div className="mx-auto flex w-full max-w-[min(92vw,1080px)] items-start justify-center gap-6">
        <div
          ref={posterWrapRef}
          className="group/poster relative aspect-[3/4] w-[min(56vw,52vh)] max-w-[420px] min-w-[260px] shrink cursor-pointer overflow-visible rounded-md"
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
              const otherVoted = myVote !== null && myVote !== id;
              const hoverLabel = voted
                ? "취소하기"
                : otherVoted
                  ? "변경하기"
                  : "투표하기";
              return (
                <div
                  key={id}
                  className="flex min-w-0 flex-1 flex-col items-center gap-2.5"
                >
                  <button
                    type="button"
                    data-vote-id={id}
                    disabled={isVoting}
                    className={`group/sub relative w-full max-w-full cursor-pointer overflow-hidden rounded-[10px] border-0 bg-transparent p-0 font-inherit shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:!z-20 hover:!-translate-y-1.5 hover:!scale-[1.08] hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] active:!translate-y-0 active:!scale-[0.97] active:duration-100 ${
                      popupOpen
                        ? "translate-y-0 scale-100"
                        : "translate-y-5 scale-[0.85]"
                    } ${isVoting ? "cursor-wait opacity-80" : ""} ${voted ? "outline outline-[3px] outline-black outline-offset-2" : ""} ${
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
                      className={`absolute right-0 bottom-0 left-0 py-2.5 px-2 text-center text-[clamp(12px,2.2vw,14px)] font-semibold text-white transition-transform duration-300 font-['Noto_Sans_KR',system-ui,sans-serif] ${
                        voted
                          ? "translate-y-0 bg-[rgba(255,215,0,0.9)] text-[#1a1a2e] group-hover/sub:bg-[rgba(220,38,38,0.85)] group-hover/sub:text-white"
                          : "bg-black/75 translate-y-full group-hover/sub:translate-y-0"
                      }`}
                    >
                      {voted ? (
                        <>
                          <span className="group-hover/sub:hidden">
                            투표 완료!
                          </span>
                          <span className="hidden group-hover/sub:inline">
                            {hoverLabel}
                          </span>
                        </>
                      ) : (
                        hoverLabel
                      )}
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

        <div className="box-border w-[min(34vw,360px)] min-w-[260px] rounded-[22px] border border-slate-200/90 bg-white px-5 pt-6 pb-6 font-['Noto_Sans_KR',system-ui,sans-serif] text-slate-800 shadow-[0_16px_40px_rgba(15,23,42,0.08)] transition-[opacity,transform] duration-500">
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
              <span className="text-sm font-bold text-slate-900">
                {totalVotes}
              </span>
              표
            </div>
          </div>
          {isLoadingResults ? (
            <p className="mt-4 text-[12px] font-medium text-slate-500">
              투표 집계를 불러오는 중...
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900">
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col gap-3.5">
            {CANDIDATES.map(({ id, name, dot }, idx) => {
              const count = votes[id];
              const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
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
