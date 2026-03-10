/**
 * WeedGameUI - tmp-v0 return JSX 복사본 (토씨 하나 틀리지 않음)
 * 로직만 ScoreState, TimerComponent, WeedSpawner에서 import
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, Medal, Star, Trophy, RefreshCw, X } from "lucide-react";
import { useGameTimer, GAME_DURATION } from "./lib/TimerComponent.js";
import { loadRecords, saveRecord, isNewRecord } from "./lib/ScoreState.js";
import { spawn, spawnInitial } from "./lib/WeedSpawner.js";
import "./minigame.css";

const MEDAL_ICONS = [
  { icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-100" },
  { icon: Medal, color: "text-slate-400", bg: "bg-slate-100" },
  { icon: Medal, color: "text-amber-600", bg: "bg-amber-100" },
];

export default function WeedGameUI({ onClose: onCloseProp }) {
  const [gameState, setGameState] = useState("idle");
  const [score, setScore] = useState(0);
  const [weeds, setWeeds] = useState([]);
  const [floatTexts, setFloatTexts] = useState([]);
  const [records, setRecords] = useState([]);
  const [nickname, setNickname] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [totalPulled, setTotalPulled] = useState(0);

  const canvasRef = useRef(null);
  const weedIdRef = useRef(0);
  const floatIdRef = useRef(0);
  const spawnTimerRef = useRef(null);
  const despawnTimeoutsRef = useRef(new Map());

  const timer = useGameTimer(() => setGameState("result"));
  const timeLeft = timer.timeLeft;

  useEffect(() => setRecords(loadRecords()), []);

  const clearSpawnTimer = useCallback(() => {
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
  }, []);

  const clearDespawnTimeouts = useCallback(() => {
    despawnTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
    despawnTimeoutsRef.current.clear();
  }, []);

  const scheduleDespawn = useCallback((weedId) => {
    const delay = 3000 + Math.random() * 5000;
    const tid = setTimeout(() => {
      setWeeds((prev) => prev.filter((w) => w.id !== weedId));
      despawnTimeoutsRef.current.delete(weedId);
    }, delay);
    despawnTimeoutsRef.current.set(weedId, tid);
  }, []);

  const spawnWeed = useCallback(() => {
    setWeeds((prev) => {
      const nextId = weedIdRef.current + 1;
      const w = spawn(prev, nextId);
      if (w) {
        weedIdRef.current = nextId;
        scheduleDespawn(w.id);
        return [...prev, w];
      }
      return prev;
    });
  }, [scheduleDespawn]);

  const scheduleNextSpawn = useCallback(() => {
    const delay = 300 + Math.random() * 400;
    spawnTimerRef.current = setTimeout(() => {
      spawnWeed();
      if (spawnTimerRef.current !== null) scheduleNextSpawn();
    }, delay);
  }, [spawnWeed]);

  useEffect(
    () => () => {
      timer.stop();
      clearSpawnTimer();
      clearDespawnTimeouts();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
    [],
  );

  const startGame = useCallback(() => {
    timer.stop();
    clearSpawnTimer();
    clearDespawnTimeouts();
    setScore(0);
    timer.reset();
    setWeeds([]);
    setFloatTexts([]);
    setTotalPulled(0);
    setGameState("playing");
    weedIdRef.current = 4;
    const initial = spawnInitial(4, 1);
    setWeeds(initial);
    initial.forEach((w) => scheduleDespawn(w.id));
    scheduleNextSpawn();
    timer.start();
  }, [
    timer,
    clearSpawnTimer,
    clearDespawnTimeouts,
    scheduleDespawn,
    scheduleNextSpawn,
  ]);

  const handleWeedClick = useCallback((e, weed) => {
    e.stopPropagation();
    const points = weed.golden ? 3 : 1;
    setScore((s) => s + points);
    setTotalPulled((t) => t + 1);
    setWeeds((prev) => prev.filter((w) => w.id !== weed.id));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const fx = ((e.clientX - rect.left) / rect.width) * 100;
      const fy = ((e.clientY - rect.top) / rect.height) * 100;
      const fid = ++floatIdRef.current;
      setFloatTexts((prev) => [
        ...prev,
        { id: fid, x: fx, y: fy, value: `+${points}` },
      ]);
      setTimeout(
        () => setFloatTexts((prev) => prev.filter((ft) => ft.id !== fid)),
        900,
      );
    }
  }, []);

  const handleClose = useCallback(
    (closeOverlay = true) => {
      timer.stop();
      clearSpawnTimer();
      clearDespawnTimeouts();
      setGameState("idle");
      setScore(0);
      timer.reset();
      setWeeds([]);
      setFloatTexts([]);
      setTotalPulled(0);
      setNickname("");
      setShowConfetti(false);
      setRecords(loadRecords());
      if (closeOverlay) onCloseProp?.();
    },
    [timer, clearSpawnTimer, clearDespawnTimeouts, onCloseProp],
  );

  const handleRegister = useCallback(() => {
    const name = nickname.trim() || "익명 껌딱지";
    saveRecord({ name, score, date: new Date().toLocaleDateString("ko-KR") });
    setRecords(loadRecords());
    if (isNewRecord(score)) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    setNickname("");
    handleClose(false);
  }, [nickname, score, handleClose]);

  const handleRetry = useCallback(() => {
    setRecords(loadRecords());
    startGame();
  }, [startGame]);

  const allRecords = records;

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-4 font-sans">
      {/* Outer modal card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: "var(--card)",
          border: "3px solid var(--wood)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Title banner – wood sign style */}
        <div
          className="relative flex items-center justify-center py-3 px-6"
          style={{
            background: "var(--wood)",
            borderBottom: "3px solid var(--wood-dark)",
          }}
        >
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-wide text-amber-50">
              껌딱지 월드 환경 미화단
            </h1>
          </div>
          {/* X button to return to idle screen - matches 게시판 style, wood theme */}
          <button
            onClick={() => handleClose()}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full border-none bg-transparent cursor-pointer text-amber-50/80 hover:text-amber-50 hover:bg-white/10 transition-colors"
            aria-label="초기 화면으로 돌아가기"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Body: flex 2:1 - fixed height to keep modal size consistent */}
        <div className="flex flex-col md:flex-row h-[380px]">
          {/* ── LEFT: Game Canvas ───────────────────────────────────── */}
          <div
            className="flex-[2] relative overflow-hidden border-b md:border-b-0 md:border-r border-border"
            style={{
              minHeight: 380,
              background:
                "linear-gradient(to bottom, oklch(0.82 0.12 145), oklch(0.68 0.14 130))",
            }}
          >
            {/* Fever glow overlay — removed */}

            {/* HUD */}
            <div className="absolute top-3 left-3 right-3 z-20 flex gap-3 justify-between">
              {/* Timer sign */}
              <WoodSign>
                <span className="text-xs font-medium text-amber-50 opacity-80">
                  남은 시간
                </span>
                <span className="text-lg font-semibold text-amber-50 leading-none">
                  {gameState === "playing" ? timeLeft : GAME_DURATION}
                  <span className="text-xs">초</span>
                </span>
              </WoodSign>
              {/* Score sign */}
              <WoodSign>
                <span className="text-xs font-medium text-amber-50 opacity-80">
                  점수
                </span>
                <span className="text-lg font-semibold text-amber-50 leading-none">
                  {score}
                </span>
              </WoodSign>
            </div>

            {/* Grass canvas */}
            <div ref={canvasRef} className="absolute inset-0">
              {/* Decorative ground pattern */}
              <div
                className="absolute bottom-0 left-0 right-0 h-8 opacity-20"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, oklch(0.45 0.14 130) 0px, oklch(0.45 0.14 130) 4px, transparent 4px, transparent 20px)",
                }}
              />

              {/* Weeds */}
              <AnimatePresence>
                {weeds.map((weed) => (
                  <WeedButton
                    key={weed.id}
                    weed={weed}
                    onClick={(e) =>
                      gameState === "playing" && handleWeedClick(e, weed)
                    }
                  />
                ))}
              </AnimatePresence>

              {/* Float texts */}
              <AnimatePresence>
                {floatTexts.map((ft) => (
                  <motion.div
                    key={ft.id}
                    initial={{ y: 0, opacity: 1, scale: 1 }}
                    animate={{ y: -60, opacity: 0, scale: 1.4 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.85, ease: "easeOut" }}
                    className="absolute pointer-events-none z-30 font-black text-2xl select-none"
                    style={{
                      left: `${ft.x}%`,
                      top: `${ft.y}%`,
                      transform: "translate(-50%,-50%)",
                      color: ft.value === "+3" ? "var(--gold)" : "#fff",
                      textShadow:
                        ft.value === "+3"
                          ? "0 0 12px var(--gold-glow), 0 2px 4px rgba(0,0,0,0.5)"
                          : "0 2px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {ft.value}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Start overlay */}
            {gameState === "idle" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/20 backdrop-blur-[2px] z-20">
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-5xl select-none"
                >
                  🌿
                </motion.div>
                <p className="text-white font-bold text-sm drop-shadow text-center px-6">
                  잡초를 클릭해서 뽑으세요!
                  <br />
                  <span className="text-amber-300">황금 잡초</span>는 +3점!
                </p>
                <BouncyButton onClick={startGame} color="green">
                  시작하기
                </BouncyButton>
              </div>
            )}
          </div>

          {/* ── RIGHT: Ranking Board ──────────────────────────────── */}
          <div
            className="flex-1 flex flex-col min-h-0 p-5 gap-4"
            style={{ background: "var(--secondary)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-px rounded-full"
                style={{ background: "var(--wood)" }}
              />
              <h2
                className="font-black text-base"
                style={{ color: "var(--wood-dark)" }}
              >
                명예의 전당
              </h2>
              <div
                className="flex-1 h-px rounded-full"
                style={{ background: "var(--wood)" }}
              />
            </div>

            {allRecords.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-50">
                <Sprout
                  className="w-10 h-10"
                  style={{ color: "var(--wood)" }}
                />
                <p
                  className="text-sm font-bold"
                  style={{ color: "var(--wood-dark)" }}
                >
                  아직 기록이 없어요!
                </p>
              </div>
            ) : (
              <ul className="ranking-list-scroll flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
                {allRecords.map((rec, i) => {
                  const Medal_ = MEDAL_ICONS[i] ?? MEDAL_ICONS[1];
                  return (
                    <motion.li
                      key={i}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-3 rounded-2xl p-3"
                      style={{
                        background: "var(--card)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        border: "2px solid var(--border)",
                      }}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${Medal_.bg}`}
                      >
                        <Medal_.icon className={`w-4 h-4 ${Medal_.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-black text-sm truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {rec.name}
                        </p>
                        <p
                          className="text-xs opacity-60"
                          style={{ color: "var(--foreground)" }}
                        >
                          {rec.date}
                        </p>
                      </div>
                      <span
                        className="font-black text-lg shrink-0"
                        style={{ color: "var(--primary)" }}
                      >
                        {rec.score}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            )}

            {/* Separator + flavor text */}
            <div className="mt-auto pt-3 border-t border-border">
              <p
                className="text-xs text-center opacity-50 font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                잡초를 많이 뽑을수록
                <br />
                껌딱지 나라가 깨끗해져요 🌱
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Result Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameState === "result" && (
          <motion.div
            key="result-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            {/* Confetti */}
            <AnimatePresence>
              {showConfetti && <ConfettiBurst />}
            </AnimatePresence>

            <div
              className="relative w-full max-w-sm rounded-3xl p-7 flex flex-col gap-5 text-center"
              style={{
                background: "var(--card)",
                border: "3px solid var(--wood)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              }}
            >
              {/* Close - matches 게시판 style, result modal theme */}
              <button
                onClick={() => handleClose()}
                className="minigame-result-close-btn absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full border-none bg-transparent cursor-pointer transition-colors"
                aria-label="닫기"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>

              {/* Trophy icon */}
              <div className="flex justify-center">
                <div
                  className="rounded-full p-3"
                  style={{ background: "oklch(0.88 0.12 78)", color: "white" }}
                >
                  <Trophy className="w-10 h-10" />
                </div>
              </div>

              {/* Title */}
              <div>
                <p
                  className="text-xs font-bold opacity-60 mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  제 {records.length + 1}회
                </p>
                <h2
                  className="text-xl font-black leading-tight text-balance"
                  style={{ color: "var(--wood-dark)" }}
                >
                  최우수 환경 미화 껌딱지
                </h2>
              </div>

              {/* Score */}
              <div
                className="rounded-2xl py-4 px-6"
                style={{
                  background: "var(--secondary)",
                  border: "2px solid var(--border)",
                }}
              >
                <p
                  className="text-xs font-bold opacity-60 mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  최종 점수
                </p>
                <motion.p
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="text-5xl font-black"
                  style={{ color: "var(--primary)" }}
                >
                  {score}
                </motion.p>
                <p
                  className="text-xs opacity-50 mt-1"
                  style={{ color: "var(--foreground)" }}
                >
                  잡초 {totalPulled}개 뽑음
                </p>
              </div>

              {/* New record badge */}
              {isNewRecord(score) && (
                <div
                  className="flex items-center justify-center gap-2 rounded-full py-2 px-4 font-semibold text-sm"
                  style={{ background: "var(--gold)", color: "white" }}
                >
                  <Star className="w-4 h-4" fill="white" />
                  신기록 달성!
                  <Star className="w-4 h-4" fill="white" />
                </div>
              )}

              {/* Nickname input */}
              <div className="flex flex-col gap-2">
                <label
                  className="text-xs font-bold opacity-70 text-left"
                  style={{ color: "var(--foreground)" }}
                >
                  닉네임
                </label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ex. 풀뽑기 왕"
                  maxLength={12}
                  className="nickname-input rounded-2xl px-4 py-3 text-sm font-semibold"
                  style={{
                    background: "var(--input)",
                    border: "2px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <BouncyButton
                  onClick={handleRegister}
                  color="green"
                  className="flex-1 text-sm"
                >
                  📋 등록
                </BouncyButton>
                <BouncyButton
                  onClick={handleRetry}
                  color="tan"
                  className="flex-1 text-sm"
                >
                  <RefreshCw className="w-4 h-4 inline mr-1" />
                  재도전
                </BouncyButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components (v0 그대로) ─────────────────────────────────────────────────────────

function WoodSign({ children }) {
  return (
    <div
      className="flex flex-col items-center px-4 py-2 rounded-2xl min-w-[80px]"
      style={{
        background: "var(--wood)",
        border: "2px solid rgba(139, 119, 101, 0.4)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      {children}
    </div>
  );
}

function BouncyButton({ onClick, color, children, className = "" }) {
  const isGreen = color === "green";
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.93, y: 3 }}
      whileHover={{ scale: 1.04 }}
      transition={{ type: "spring", stiffness: 400, damping: 14 }}
      className={`rounded-2xl py-3 px-6 font-black text-white cursor-pointer select-none ${className}`}
      style={{
        background: isGreen ? "oklch(0.42 0.17 145)" : "var(--wood)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        border: "none",
      }}
    >
      {children}
    </motion.button>
  );
}

function WeedButton({ weed, onClick }) {
  return (
    <motion.button
      key={weed.id}
      initial={{ scale: 0, rotate: -20 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0, opacity: 0, rotate: 20 }}
      transition={{ type: "spring", stiffness: 300, damping: 14 }}
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none rounded-full flex flex-col items-center gap-0.5"
      style={{
        left: `${weed.x}%`,
        top: `${weed.y}%`,
        zIndex: 5,
        background: "transparent",
        border: "none",
      }}
      aria-label={weed.golden ? "황금 잡초" : "잡초"}
    >
      {weed.golden ? <GoldenWeed /> : <NormalWeed />}
    </motion.button>
  );
}

function NormalWeed() {
  return (
    <div className="flex flex-col items-center">
      <Sprout className="w-9 h-9 drop-shadow-md" style={{ color: "#22c55e" }} />
      <div className="w-1 h-3 rounded-full" style={{ background: "#15803d" }} />
    </div>
  );
}

function GoldenWeed() {
  return (
    <motion.div
      className="flex flex-col items-center"
      animate={{
        filter: [
          "drop-shadow(0 0 4px #fbbf24)",
          "drop-shadow(0 0 10px #f59e0b)",
          "drop-shadow(0 0 4px #fbbf24)",
        ],
      }}
      transition={{ repeat: Infinity, duration: 1.2 }}
    >
      <Sprout className="w-10 h-10" style={{ color: "#f59e0b" }} />
      {/* sparkle dots */}
      <motion.div
        className="absolute -top-2 -right-1 w-2 h-2 rounded-full bg-yellow-300"
        animate={{ scale: [1, 1.5, 1], opacity: [0.9, 0.4, 0.9] }}
        transition={{ repeat: Infinity, duration: 0.9, delay: 0.2 }}
      />
      <motion.div
        className="absolute -top-1 -left-2 w-1.5 h-1.5 rounded-full bg-amber-400"
        animate={{ scale: [1, 1.6, 1], opacity: [0.8, 0.3, 0.8] }}
        transition={{ repeat: Infinity, duration: 0.9 }}
      />
      <div className="w-1 h-3 rounded-full" style={{ background: "#d97706" }} />
    </motion.div>
  );
}

function ConfettiBurst() {
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  const colors = [
    "#22c55e",
    "#f59e0b",
    "#f97316",
    "#a3e635",
    "#34d399",
    "#fde68a",
  ];
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {pieces.map((i) => {
        const x = 20 + Math.random() * 60;
        const y = 10 + Math.random() * 30;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 10;
        return (
          <motion.div
            key={i}
            initial={{
              x: `${x}vw`,
              y: `${y}vh`,
              opacity: 1,
              rotate: 0,
              scale: 1,
            }}
            animate={{
              y: `${y + 50 + Math.random() * 30}vh`,
              x: `${x + (Math.random() - 0.5) * 20}vw`,
              opacity: 0,
              rotate: Math.random() * 360,
              scale: 0.3,
            }}
            transition={{ duration: 2 + Math.random(), ease: "easeIn" }}
            className="absolute rounded-sm"
            style={{ width: size, height: size, background: color }}
          />
        );
      })}
    </div>
  );
}
