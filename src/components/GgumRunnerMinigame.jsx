import { useEffect, useRef, useState } from "react";
import "./GgumRunnerMinigame.css";
import { appendLeaderboardEntry } from "../utils/ggumRunnerLeaderboard.js";

const W = 700;
const H = 340;
const GROUND_Y = H - 44;
const FRAME_W = 32;
const FRAME_H = 32;
const DISPLAY_W = 48;
const DISPLAY_H = 48;
const TOTAL_RUN_FRAMES = 4;
const SPRITE_PATH = "/assets/minigame/TOTAL_GGUM.png";
const BG_PATH = "/assets/minigame/pixel_bg.png";
const BASE_SPEED = 5;
const MAX_SPEED = 20;
const SPEED_STEP_SCORE = 200;
const SPEED_STEP_GAIN = 0.9;
const TALL_OBSTACLE_MIN_LEVEL = 2;
const DOUBLE_OBSTACLE_MIN_LEVEL = 3;
const NEW_HIGH_BLINK_INTERVAL = 8;
const NEW_HIGH_BLINK_PHASES = 6;
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

/** 왼쪽부터 save_modal.png 카드와 1:1 (비트맵에 그려진 그림만 보이고, 여기서는 PNG를 로드하지 않음) */
const SAVE_AVATAR_SLOTS = ["clover", "flower", "cake", "dog"];

function avatarSrc(key) {
  return `/assets/minigame/image_card/${key}.png`;
}

export function GgumRunnerMinigame({ onClose }) {
  const canvasRef = useRef(null);
  const lastTouchAtRef = useRef(0);
  const hiScoreValueRef = useRef(0);
  const currentScoreRef = useRef(null);
  const hiScoreRef = useRef(null);
  const msgRef = useRef(null);
  const startOverlayRef = useRef(null);
  const startButtonRef = useRef(null);
  const jumpActionRef = useRef(() => {});

  const [fatalScore, setFatalScore] = useState(null);
  const [postGameStep, setPostGameStep] = useState("gameover");
  const [saveName, setSaveName] = useState("");
  const [saveFormError, setSaveFormError] = useState("");
  /** `goal_list`에서만 `avatarSrc()`로 로드; 저장 화면은 슬롯 인덱스만 사용 */
  const [selectedSaveSlotIndex, setSelectedSaveSlotIndex] = useState(null);
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [myRank, setMyRank] = useState(null);

  const selectedAvatarKey =
    selectedSaveSlotIndex != null
      ? SAVE_AVATAR_SLOTS[selectedSaveSlotIndex]
      : null;

  const deathBridgeRef = useRef({
    onDead: (_score) => {},
    onRestartFromDeath: () => {},
  });
  deathBridgeRef.current = {
    onDead: (score) => {
      setFatalScore(score);
      setPostGameStep("gameover");
    },
    onRestartFromDeath: () => {
      setFatalScore(null);
      setPostGameStep("gameover");
      setSaveName("");
      setSaveFormError("");
      setSelectedSaveSlotIndex(null);
      setLeaderboardRows([]);
      setMyRank(null);
    },
  };

  const handleSaveEnter = () => {
    const name = saveName.trim();
    if (!name) {
      setSaveFormError("이름을 입력해 주세요.");
      return;
    }
    if (selectedAvatarKey == null) {
      setSaveFormError("이미지를 하나 선택해 주세요.");
      return;
    }
    setSaveFormError("");
    if (fatalScore == null) return;
    const rows = appendLeaderboardEntry({
      name,
      avatarKey: selectedAvatarKey,
      score: fatalScore,
    });
    setLeaderboardRows(rows);
    const latestMatchingRow = rows
      .filter(
        (row) =>
          row.name === name &&
          row.avatarKey === selectedAvatarKey &&
          row.score === fatalScore,
      )
      .sort((a, b) => b.at - a.at)[0];
    if (latestMatchingRow) {
      const rank = rows.findIndex((row) => row.at === latestMatchingRow.at) + 1;
      setMyRank(rank > 0 ? rank : null);
    } else {
      setMyRank(null);
    }
    setPostGameStep("leaderboard");
  };

  useEffect(() => {
    const readHiScore = () => {
      try {
        const raw = localStorage.getItem("ggumRunner_hiScore");
        const v = Number(raw);
        return Number.isFinite(v) && v >= 0 ? v : 0;
      } catch {
        return 0;
      }
    };

    const canvas = canvasRef.current;
    const currentScoreEl = currentScoreRef.current;
    const hiScoreEl = hiScoreRef.current;
    const msgEl = msgRef.current;
    const startOverlayEl = startOverlayRef.current;
    const startButtonEl = startButtonRef.current;
    if (
      !canvas ||
      !currentScoreEl ||
      !hiScoreEl ||
      !msgEl ||
      !startOverlayEl ||
      !startButtonEl
    ) {
      return undefined;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    canvas.width = W;
    canvas.height = H;

    let rafId = 0;
    let state = "idle";
    let score = 0;
    let hiScore = readHiScore();
    hiScoreValueRef.current = hiScore;
    let speed = BASE_SPEED;
    let bgX = 0;
    let groundX = 0;
    let obstacleTimer = 0;
    let nextObstacleIn = 90;
    let obstacles = [];
    let newHighBlinkPhase = NEW_HIGH_BLINK_PHASES;
    let hasTriggeredNewHighBlink = false;
    let blinkTimer = 0;
    let lastRenderedScore = -1;
    let lastRenderedHiScore = -1;
    let lastRenderedOpacity = "";
    let lastRenderedColor = "";
    let lastTimestamp = 0;
    let deathReported = false;

    const player = {
      x: 80,
      y: GROUND_Y - DISPLAY_H,
      vy: 0,
      onGround: true,
      animFrame: 0,
      animTimer: 0,
    };

    const sprite = new Image();
    sprite.src = SPRITE_PATH;
    let isSpriteLoadFailed = false;
    sprite.onerror = () => {
      isSpriteLoadFailed = true;
      console.warn(
        "[GgumRunner] Failed to load sprite, using fallback player.",
      );
    };
    const backgroundImage = new Image();
    backgroundImage.src = BG_PATH;

    const drawCloud = (x, y, w) => {
      const ps = 4;
      const pattern = [
        [0, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 0],
      ];
      const cols = Math.floor(w / ps);
      pattern.forEach((row, r) => {
        row.forEach((c, ci) => {
          if (c && ci < cols) ctx.fillRect(x + ci * ps, y + r * ps, ps, ps);
        });
      });
    };

    const drawPixelTree = (x, y) => {
      ctx.fillStyle = "#7b4f2e";
      ctx.fillRect(x - 4, y + 20, 8, 30);
      ctx.fillStyle = "#5f3a20";
      ctx.fillRect(x - 2, y + 20, 4, 30);

      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(x - 18, y + 14, 36, 10);
      ctx.fillRect(x - 22, y + 6, 44, 10);
      ctx.fillRect(x - 18, y - 2, 36, 10);
      ctx.fillRect(x - 12, y - 10, 24, 8);

      ctx.fillStyle = "#388e3c";
      ctx.fillRect(x - 14, y + 12, 28, 8);
      ctx.fillRect(x - 10, y + 2, 20, 8);
      ctx.fillRect(x - 6, y - 6, 12, 6);

      ctx.fillStyle = "#1b5e20";
      ctx.fillRect(x - 24, y + 10, 6, 8);
      ctx.fillRect(x + 18, y + 10, 6, 8);
      ctx.fillRect(x - 4, y - 12, 8, 4);
    };

    const drawStar = (x, y, s) => {
      ctx.fillRect(x, y + 2, s, 2);
      ctx.fillRect(x + Math.floor(s / 2) - 1, y, 2, s);
      ctx.fillRect(x + 1, y + 1, 2, 2);
      ctx.fillRect(x + s - 3, y + 1, 2, 2);
    };

    const wrapScroll = (offset, speed, range, shift) =>
      ((((offset - speed) % range) + range) % range) - shift;
    const wrapCloud = (offset, speed, range = W + 100) =>
      wrapScroll(offset, bgX * speed, range, Math.floor((range - W) / 2));

    const drawFallbackBg = () => {
      const skyBands = ["#5bbcd4", "#68c4dd", "#82d7ef", "#9ee8ff"];
      const bandHeight = Math.ceil(GROUND_Y / skyBands.length);
      skyBands.forEach((color, index) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, index * bandHeight, W, bandHeight);
      });

      ctx.fillStyle = "rgba(240,248,255,0.85)";
      drawCloud(wrapCloud(150, 0.2, W + 80), 18, 70);
      drawCloud(wrapCloud(380, 0.2, W + 80), 28, 90);
      drawCloud(wrapCloud(600, 0.2, W + 80), 14, 60);
      drawCloud(wrapCloud(90, 0.23), 52, 56);
      drawCloud(wrapCloud(240, 0.21), 68, 48);
      drawCloud(wrapCloud(470, 0.19, W + 120), 56, 64);
      drawCloud(wrapCloud(680, 0.18, W + 120), 72, 54);
      drawCloud(wrapCloud(760, 0.16, W + 140), 40, 58);

      ctx.fillStyle = "#2e7d32";
      for (let i = 0; i < 8; i += 1) {
        const tx =
          ((((i * 95 - bgX * 0.5) % (W + 60)) + W + 60) % (W + 60)) - 30;
        drawPixelTree(tx, GROUND_Y - 50);
      }

      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, GROUND_Y, W, 8);
      ctx.fillStyle = "#388e3c";
      ctx.fillRect(0, GROUND_Y + 8, W, 4);

      ctx.fillStyle = "#8B5E3C";
      ctx.fillRect(0, GROUND_Y + 12, W, H - GROUND_Y - 12);

      ctx.fillStyle = "#e8d5a3";
      for (let i = 0; i < 14; i += 1) {
        const sx =
          ((((i * 52 - groundX * 0.3) % (W + 40)) + W + 40) % (W + 40)) - 20;
        drawStar(sx, GROUND_Y + 20, 6);
      }
    };

    const drawBg = () => {
      drawFallbackBg();
    };

    const drawPlayer = () => {
      if (isSpriteLoadFailed) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(player.x + 4, GROUND_Y + 2, DISPLAY_W - 8, 5);
        ctx.fillStyle = "#2f241d";
        ctx.fillRect(player.x + 14, player.y + 8, 20, 28);
        ctx.fillStyle = "#f2dfca";
        ctx.fillRect(player.x + 18, player.y + 4, 12, 10);
        ctx.fillStyle = "#1f7a3b";
        ctx.fillRect(player.x + 16, player.y + 18, 16, 6);
        return;
      }
      if (!sprite.complete) return;

      let frameIndex;
      if (!player.onGround) frameIndex = 4;
      else frameIndex = Math.floor(player.animFrame) % TOTAL_RUN_FRAMES;

      const sx = frameIndex * FRAME_W;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(player.x + 4, GROUND_Y + 2, DISPLAY_W - 8, 5);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sprite,
        sx,
        0,
        FRAME_W,
        FRAME_H,
        player.x,
        player.y,
        DISPLAY_W,
        DISPLAY_H,
      );
    };

    const drawCactus = (x, y, tall = false) => {
      const extraHeight = tall ? 10 : 0;
      ctx.fillStyle = "#1f9aa8";
      ctx.fillRect(x + 9, y - extraHeight, 6, 32 + extraHeight);
      ctx.fillRect(x, y + 10 - extraHeight, 10, 5);
      ctx.fillRect(x, y + 5 - extraHeight, 5, 12);
      ctx.fillRect(x + 14, y + 14 - extraHeight, 10, 5);
      ctx.fillRect(x + 19, y + 9 - extraHeight, 5, 12);
      ctx.fillStyle = "#0f6f7a";
      ctx.fillRect(x + 12, y - extraHeight, 3, 32 + extraHeight);
    };

    const drawHammer = (x, y) => {
      ctx.save();
      ctx.translate(x + 14, y + 16);
      ctx.rotate(Math.PI / 4.2);
      ctx.translate(-14, -16);

      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(2, 2, 22, 8);
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(18, 0, 8, 12);
      ctx.fillRect(3, 8, 22, 2);

      ctx.fillStyle = "#b9773a";
      ctx.fillRect(10, 10, 6, 22);
      ctx.fillStyle = "#8b5a2b";
      ctx.fillRect(12, 10, 2, 22);

      ctx.restore();
    };

    const drawMushroom = (x, y, tall = false) => {
      const extraHeight = tall ? 10 : 0;
      const cap = [
        [0, 0, 1, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1],
      ];
      cap.forEach((row, r) => {
        row.forEach((c, ci) => {
          if (!c) return;
          ctx.fillStyle = r < 1 ? "#ef5350" : "#e53935";
          ctx.fillRect(x + ci * 4, y - extraHeight + r * 4, 4, 4);
        });
      });
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 8, y - extraHeight + 4, 5, 5);
      ctx.fillRect(x + 20, y - extraHeight + 6, 4, 4);
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x + 10, y - extraHeight + 16, 12, 16 + extraHeight);
    };

    const drawObstacle = (obs) => {
      if (obs.type === 0) drawCactus(obs.x, obs.y, obs.tall);
      else if (obs.type === 1) drawHammer(obs.x, obs.y);
      else drawMushroom(obs.x, obs.y, obs.tall);
    };

    const getRect = (obs) => {
      if (obs.type === 0) {
        return {
          x: obs.x + 5,
          y: obs.y + (obs.tall ? -8 : 2),
          w: 14,
          h: obs.tall ? 40 : 30,
        };
      }
      if (obs.type === 1) return { x: obs.x + 2, y: obs.y + 4, w: 24, h: 16 };
      return {
        x: obs.x + 8,
        y: obs.y + (obs.tall ? -8 : 2),
        w: 16,
        h: obs.tall ? 40 : 30,
      };
    };

    const createObstacle = (spawnX, difficultyLevel) => {
      const type = Math.floor(Math.random() * 3);
      const canBeTall =
        type !== 1 && difficultyLevel >= TALL_OBSTACLE_MIN_LEVEL;
      const tallChance = Math.min(0.22 + difficultyLevel * 0.06, 0.55);
      return {
        x: spawnX,
        y: GROUND_Y - 34,
        type,
        tall: canBeTall && Math.random() < tallChance,
      };
    };

    const updateScoreText = (force = false) => {
      const displayScore = Math.floor(score);
      const isBlinking = newHighBlinkPhase < NEW_HIGH_BLINK_PHASES;
      const blinkOpacity = isBlinking && newHighBlinkPhase % 2 === 1 ? 0.3 : 1;
      const opacityText = `${blinkOpacity}`;
      const scoreColor = isBlinking ? "#ffd54f" : "#fffbeb";
      const shouldRender =
        force ||
        displayScore !== lastRenderedScore ||
        hiScore !== lastRenderedHiScore ||
        opacityText !== lastRenderedOpacity ||
        scoreColor !== lastRenderedColor;
      if (!shouldRender) return;
      lastRenderedScore = displayScore;
      lastRenderedHiScore = hiScore;
      lastRenderedOpacity = opacityText;
      lastRenderedColor = scoreColor;
      currentScoreEl.textContent = `SCORE: ${displayScore}`;
      currentScoreEl.style.opacity = opacityText;
      currentScoreEl.style.color = scoreColor;
      hiScoreEl.textContent = `HIGH SCORE: ${hiScore}`;
    };

    const updateOverlayVisibility = () => {
      startOverlayEl.style.display = state === "idle" ? "flex" : "none";
    };

    const jump = () => {
      if (state === "idle" || state === "dead") {
        if (state === "dead") {
          deathBridgeRef.current.onRestartFromDeath();
          deathReported = false;
        }
        state = "running";
        score = 0;
        speed = BASE_SPEED;
        bgX = 0;
        groundX = 0;
        obstacles = [];
        obstacleTimer = 0;
        nextObstacleIn = 90;
        newHighBlinkPhase = NEW_HIGH_BLINK_PHASES;
        hasTriggeredNewHighBlink = false;
        blinkTimer = 0;
        player.y = GROUND_Y - DISPLAY_H;
        player.vy = 0;
        player.onGround = true;
        player.animFrame = 0;
        player.animTimer = 0;
        msgEl.textContent = "";
        updateScoreText();
        updateOverlayVisibility();
      }
      if (state === "running" && player.onGround) {
        player.vy = -11;
        player.onGround = false;
      }
    };
    jumpActionRef.current = jump;

    const onKeyDown = (e) => {
      if (e.code !== "Space") return;
      if (state === "dead") return;
      e.preventDefault();
      jump();
    };
    const onCanvasClick = () => {
      if (state === "dead") return;
      if (Date.now() - lastTouchAtRef.current < 450) return;
      jump();
    };
    const onStartButtonClick = () => jump();
    const onTouchStart = (e) => {
      if (state === "dead") return;
      e.preventDefault();
      lastTouchAtRef.current = Date.now();
      jump();
    };
    const onTouchEnd = (e) => e.preventDefault();

    const update = (scale = 1) => {
      if (state !== "running") return;

      score += scale;
      const displayScore = Math.floor(score);
      if (!hasTriggeredNewHighBlink && score > hiScore) {
        hasTriggeredNewHighBlink = true;
        newHighBlinkPhase = 0;
        blinkTimer = 0;
      }
      if (newHighBlinkPhase < NEW_HIGH_BLINK_PHASES) {
        blinkTimer += scale;
        while (
          newHighBlinkPhase < NEW_HIGH_BLINK_PHASES &&
          blinkTimer >= NEW_HIGH_BLINK_INTERVAL
        ) {
          newHighBlinkPhase += 1;
          blinkTimer -= NEW_HIGH_BLINK_INTERVAL;
        }
      }
      const speedStepLevel = Math.floor(score / SPEED_STEP_SCORE);
      speed = Math.min(
        MAX_SPEED,
        BASE_SPEED + speedStepLevel * SPEED_STEP_GAIN,
      );
      bgX += speed * 0.4 * scale;
      groundX += speed * scale;

      player.vy += 0.6 * scale;
      player.y += player.vy * scale;
      if (player.y >= GROUND_Y - DISPLAY_H) {
        player.y = GROUND_Y - DISPLAY_H;
        player.vy = 0;
        player.onGround = true;
      }

      if (player.onGround) {
        player.animTimer += scale;
        while (player.animTimer >= 8) {
          player.animFrame = (player.animFrame + 1) % TOTAL_RUN_FRAMES;
          player.animTimer -= 8;
        }
      }

      obstacleTimer += scale;
      while (obstacleTimer >= nextObstacleIn) {
        const difficultyLevel = Math.floor(score / SPEED_STEP_SCORE);
        const firstSpawnX = W + 10;
        obstacles.push(createObstacle(firstSpawnX, difficultyLevel));
        if (difficultyLevel >= DOUBLE_OBSTACLE_MIN_LEVEL) {
          const doubleChance = Math.min(0.18 + difficultyLevel * 0.05, 0.5);
          if (Math.random() < doubleChance) {
            const gap = 26 + Math.random() * 24;
            obstacles.push(createObstacle(firstSpawnX + gap, difficultyLevel));
          }
        }
        obstacleTimer -= nextObstacleIn;
        nextObstacleIn = Math.max(
          30,
          Math.floor(92 - speed * 6 - difficultyLevel * 2 + Math.random() * 34),
        );
      }
      obstacles.forEach((obs) => {
        obs.x -= speed * scale;
      });
      obstacles = obstacles.filter((obs) => obs.x > -60);

      const pr = {
        x: player.x + 8,
        y: player.y + 6,
        w: DISPLAY_W - 16,
        h: DISPLAY_H - 6,
      };
      for (const obs of obstacles) {
        const or = getRect(obs);
        if (
          pr.x < or.x + or.w &&
          pr.x + pr.w > or.x &&
          pr.y < or.y + or.h &&
          pr.y + pr.h > or.y
        ) {
          state = "dead";
          if (displayScore > hiScore) {
            hiScore = displayScore;
            hiScoreValueRef.current = displayScore;
            try {
              localStorage.setItem("ggumRunner_hiScore", String(displayScore));
            } catch {
              // If storage is blocked (private mode, quota, etc), game still works.
            }
          }
          msgEl.textContent = "";
          if (!deathReported) {
            deathReported = true;
            deathBridgeRef.current.onDead(displayScore);
          }
          updateOverlayVisibility();
          break;
        }
      }
      updateScoreText();
    };

    const render = () => {
      ctx.clearRect(0, 0, W, H);
      drawBg();
      obstacles.forEach(drawObstacle);
      drawPlayer();
    };

    const loop = (timestamp) => {
      if (lastTimestamp === 0) lastTimestamp = timestamp;
      const scale = Math.min((timestamp - lastTimestamp) / FRAME_MS, 3);
      lastTimestamp = timestamp;
      update(scale);
      render();
      rafId = requestAnimationFrame(loop);
    };

    updateScoreText();
    updateOverlayVisibility();
    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    startButtonEl.addEventListener("click", onStartButtonClick);
    loop(window.performance.now());

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchend", onTouchEnd);
      startButtonEl.removeEventListener("click", onStartButtonClick);
      jumpActionRef.current = () => {};
    };
  }, []);

  return (
    <div className="ggum-runner">
      <div className="ggum-runner-inner">
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="모달 닫기"
          className="ggum-runner-frame-close"
        />
        <div className="ggum-runner-viewport">
          <canvas ref={canvasRef} className="ggum-runner-canvas" />
          <div className="ggum-runner-score-hud">
            <span ref={hiScoreRef} className="ggum-runner-score-hud-item">
              HIGH SCORE: 0
            </span>
            <span ref={currentScoreRef} className="ggum-runner-score-hud-item">
              SCORE: 0
            </span>
          </div>
          <div className="ggum-runner-message-overlay">
            <span ref={msgRef} className="ggum-runner-message" />
          </div>
          <div ref={startOverlayRef} className="ggum-runner-start-overlay">
            <div className="ggum-runner-start-modal">
              <img
                src="/assets/minigame/start_modal_button.png"
                alt=""
                className="ggum-runner-start-modal-art"
              />
              <button
                type="button"
                className="ggum-runner-start-modal-close"
                aria-label="설명 창 닫기"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.();
                }}
              />
              <button
                ref={startButtonRef}
                type="button"
                className="ggum-runner-start-modal-yes"
                aria-label="게임 시작"
              />
            </div>
          </div>
          {fatalScore !== null &&
            (postGameStep === "gameover" || postGameStep === "save") && (
              <div className="ggum-runner-postgame-overlay">
                <div className="ggum-runner-postgame-stack">
                  {postGameStep === "gameover" ? (
                    <div className="ggum-runner-sheet ggum-runner-gameover-sheet">
                      <img
                        src="/assets/minigame/gameover_modal.png"
                        alt=""
                        className="ggum-runner-sheet-art"
                      />
                      <span className="ggum-runner-gameover-score-digits">
                        {fatalScore}
                      </span>
                      <button
                        type="button"
                        className="ggum-runner-gameover-hit ggum-runner-gameover-yes"
                        aria-label="다시 시작"
                        onClick={() => jumpActionRef.current()}
                      />
                      <button
                        type="button"
                        className="ggum-runner-gameover-hit ggum-runner-gameover-no"
                        aria-label="저장 화면으로"
                        onClick={() => setPostGameStep("save")}
                      />
                      <button
                        type="button"
                        className="ggum-runner-gameover-hit ggum-runner-gameover-header-x"
                        aria-label="닫기"
                        onClick={() => onClose?.()}
                      />
                    </div>
                  ) : (
                    <div className="ggum-runner-sheet ggum-runner-save-sheet">
                      <img
                        src="/assets/minigame/save_modal.png"
                        alt=""
                        className="ggum-runner-sheet-art"
                      />
                      <input
                        type="text"
                        className="ggum-runner-save-name-input"
                        value={saveName}
                        onChange={(e) => {
                          setSaveName(e.target.value);
                          if (saveFormError) setSaveFormError("");
                        }}
                        placeholder="닉네임"
                        maxLength={16}
                        autoComplete="off"
                      />
                      {saveFormError ? (
                        <p className="ggum-runner-save-error">
                          {saveFormError}
                        </p>
                      ) : null}
                      <div className="ggum-runner-save-slots">
                        {SAVE_AVATAR_SLOTS.map((key, index) => (
                          <button
                            key={`save-slot-${index}`}
                            type="button"
                            className={`ggum-runner-save-slot${selectedSaveSlotIndex === index ? " ggum-runner-save-slot--selected" : ""}`}
                            onClick={() => {
                              setSelectedSaveSlotIndex(index);
                              if (saveFormError) setSaveFormError("");
                            }}
                            aria-label={`캐릭터 슬롯 ${index + 1} 선택 (${key})`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="ggum-runner-save-hit ggum-runner-save-enter"
                        aria-label="기록 저장 및 순위 보기"
                        onClick={handleSaveEnter}
                      />
                      <button
                        type="button"
                        className="ggum-runner-save-hit ggum-runner-save-header-x"
                        aria-label="미니게임 닫기"
                        onClick={() => onClose?.()}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
      {fatalScore !== null && postGameStep === "leaderboard" && (
        <div className="ggum-runner-goal-modal-layer">
          <div className="ggum-runner-postgame-overlay ggum-runner-postgame-overlay--goal">
            <div className="ggum-runner-sheet ggum-runner-goal-sheet">
              <img
                src="/assets/minigame/goal_list.png"
                alt=""
                className="ggum-runner-goal-art"
              />
              {saveName.trim() ? (
                <span
                  className="ggum-runner-goal-name-above-trophy"
                  aria-label={`플레이어 이름 ${saveName.trim()}`}
                >
                  {saveName.trim()}
                </span>
              ) : null}
              <div className="ggum-runner-goal-profile-slot">
                {selectedAvatarKey ? (
                  <img src={avatarSrc(selectedAvatarKey)} alt="" />
                ) : null}
              </div>
              {myRank != null ? (
                <span className="ggum-runner-goal-my-rank">{myRank}위</span>
              ) : null}
              <span className="ggum-runner-goal-my-score">{fatalScore}</span>
              <button
                type="button"
                className="ggum-runner-goal-hit ggum-runner-goal-close"
                aria-label="뒤로"
                onClick={() => {
                  setPostGameStep("save");
                  setSaveName("");
                  setSaveFormError("");
                  setSelectedSaveSlotIndex(null);
                  setMyRank(null);
                }}
              />
              <div className="ggum-runner-goal-list-scroll">
                {leaderboardRows.map((row, i) => (
                  <div key={`${row.at}-${i}`} className="ggum-runner-goal-row">
                    <div className="ggum-runner-goal-row-thumb-wrap">
                      <img
                        src={avatarSrc(row.avatarKey)}
                        alt=""
                        className="ggum-runner-goal-row-thumb"
                      />
                    </div>
                    <span className="ggum-runner-goal-row-rank">{i + 1}</span>
                    <span className="ggum-runner-goal-row-name">
                      {row.name}
                    </span>
                    <span className="ggum-runner-goal-row-score">
                      {row.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
