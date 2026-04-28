import { useEffect, useRef } from "react";

const W = 700;
const H = 200;
const GROUND_Y = H - 44;
const FRAME_W = 32;
const FRAME_H = 32;
const DISPLAY_W = 48;
const DISPLAY_H = 48;
const TOTAL_RUN_FRAMES = 4;
const SPRITE_PATH = "/assets/minigame/TOTAL_GGUM.png";
const BASE_SPEED = 3;
const MAX_SPEED = 8;
const SPEED_GAIN_PER_SCORE = 0.0025;

export function GgumRunnerMinigame({ onClose }) {
  const canvasRef = useRef(null);
  const scoreRef = useRef(null);
  const msgRef = useRef(null);
  const startOverlayRef = useRef(null);
  const gameOverOverlayRef = useRef(null);
  const gameOverScoreRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scoreEl = scoreRef.current;
    const msgEl = msgRef.current;
    const startOverlayEl = startOverlayRef.current;
    const gameOverOverlayEl = gameOverOverlayRef.current;
    const gameOverScoreEl = gameOverScoreRef.current;
    if (
      !canvas ||
      !scoreEl ||
      !msgEl ||
      !startOverlayEl ||
      !gameOverOverlayEl ||
      !gameOverScoreEl
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
    let hiScore = 0;
    let frame = 0;
    let speed = BASE_SPEED;
    let bgX = 0;
    let groundX = 0;
    let obstacleTimer = 0;
    let nextObstacleIn = 90;
    let obstacles = [];

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
      ctx.fillStyle = "#1b5e20";
      ctx.fillRect(x - 12, y, 24, 50);
      ctx.fillRect(x - 18, y + 10, 36, 12);
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(x - 8, y - 14, 16, 18);
    };

    const drawStar = (x, y, s) => {
      ctx.fillRect(x, y + 2, s, 2);
      ctx.fillRect(x + Math.floor(s / 2) - 1, y, 2, s);
      ctx.fillRect(x + 1, y + 1, 2, 2);
      ctx.fillRect(x + s - 3, y + 1, 2, 2);
    };

    const drawBg = () => {
      ctx.fillStyle = "#5bbcd4";
      ctx.fillRect(0, 0, W, H * 0.65);

      ctx.fillStyle = "rgba(240,248,255,0.85)";
      drawCloud(
        ((((150 - bgX * 0.2) % (W + 80)) + W + 80) % (W + 80)) - 40,
        18,
        70,
      );
      drawCloud(
        ((((380 - bgX * 0.2) % (W + 80)) + W + 80) % (W + 80)) - 40,
        28,
        90,
      );
      drawCloud(
        ((((600 - bgX * 0.2) % (W + 80)) + W + 80) % (W + 80)) - 40,
        14,
        60,
      );

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

    const drawPlayer = () => {
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

    const drawCactus = (x, y) => {
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(x + 9, y, 6, 32);
      ctx.fillRect(x, y + 10, 10, 5);
      ctx.fillRect(x, y + 5, 5, 12);
      ctx.fillRect(x + 14, y + 14, 10, 5);
      ctx.fillRect(x + 19, y + 9, 5, 12);
      ctx.fillStyle = "#1b5e20";
      ctx.fillRect(x + 12, y, 3, 32);
    };

    const drawRock = (x, y) => {
      const shape = [
        [0, 0, 1, 1, 1, 0, 0],
        [0, 1, 1, 1, 1, 1, 0],
        [1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 0],
      ];
      shape.forEach((row, r) => {
        row.forEach((c, ci) => {
          if (!c) return;
          ctx.fillStyle = r < 2 ? "#a8a29e" : "#78716c";
          ctx.fillRect(x + ci * 4, y + r * 4, 4, 4);
        });
      });
    };

    const drawMushroom = (x, y) => {
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
          ctx.fillRect(x + ci * 4, y + r * 4, 4, 4);
        });
      });
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 8, y + 4, 5, 5);
      ctx.fillRect(x + 20, y + 6, 4, 4);
      ctx.fillStyle = "#f5f5f5";
      ctx.fillRect(x + 10, y + 16, 12, 16);
    };

    const drawObstacle = (obs) => {
      if (obs.type === 0) drawCactus(obs.x, obs.y);
      else if (obs.type === 1) drawRock(obs.x, obs.y);
      else drawMushroom(obs.x, obs.y);
    };

    const getRect = (obs) => {
      if (obs.type === 0) return { x: obs.x + 5, y: obs.y + 2, w: 14, h: 30 };
      if (obs.type === 1) return { x: obs.x + 2, y: obs.y + 4, w: 24, h: 16 };
      return { x: obs.x + 8, y: obs.y + 2, w: 16, h: 30 };
    };

    const updateScoreText = () => {
      scoreEl.textContent = `점수: ${score}  최고: ${hiScore}`;
    };

    const updateOverlayVisibility = () => {
      startOverlayEl.style.display = state === "idle" ? "flex" : "none";
      gameOverOverlayEl.style.display = state === "dead" ? "flex" : "none";
      gameOverScoreEl.textContent = `점수: ${score}  최고: ${hiScore}`;
    };

    const jump = () => {
      if (state === "idle" || state === "dead") {
        state = "running";
        score = 0;
        frame = 0;
        speed = BASE_SPEED;
        bgX = 0;
        groundX = 0;
        obstacles = [];
        obstacleTimer = 0;
        nextObstacleIn = 90;
        player.y = GROUND_Y - DISPLAY_H;
        player.vy = 0;
        player.onGround = true;
        player.animFrame = 0;
        player.animTimer = 0;
        msgEl.textContent = "스페이스바 또는 클릭으로 점프!";
        updateScoreText();
        updateOverlayVisibility();
      }
      if (state === "running" && player.onGround) {
        player.vy = -11;
        player.onGround = false;
      }
    };

    const onKeyDown = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      jump();
    };
    const onCanvasClick = () => jump();
    const onTouchStart = (e) => {
      e.preventDefault();
      jump();
    };

    const update = () => {
      if (state !== "running") return;

      frame += 1;
      score += 1;
      speed = Math.min(MAX_SPEED, BASE_SPEED + score * SPEED_GAIN_PER_SCORE);
      bgX += speed * 0.4;
      groundX += speed;

      player.vy += 0.6;
      player.y += player.vy;
      if (player.y >= GROUND_Y - DISPLAY_H) {
        player.y = GROUND_Y - DISPLAY_H;
        player.vy = 0;
        player.onGround = true;
      }

      if (player.onGround) {
        player.animTimer += 1;
        if (player.animTimer >= 8) {
          player.animFrame = (player.animFrame + 1) % TOTAL_RUN_FRAMES;
          player.animTimer = 0;
        }
      }

      obstacleTimer += 1;
      if (obstacleTimer >= nextObstacleIn) {
        obstacles.push({
          x: W + 10,
          y: GROUND_Y - 34,
          type: Math.floor(Math.random() * 3),
        });
        obstacleTimer = 0;
        nextObstacleIn = Math.max(
          42,
          Math.floor(96 - speed * 6 + Math.random() * 42),
        );
      }
      obstacles.forEach((obs) => {
        obs.x -= speed;
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
          if (score > hiScore) hiScore = score;
          msgEl.textContent = `게임 오버! 최고: ${hiScore} | 클릭/스페이스로 재시작`;
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

    const loop = () => {
      update();
      render();
      rafId = requestAnimationFrame(loop);
    };

    updateScoreText();
    updateOverlayVisibility();
    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    sprite.onload = () => {
      if (!rafId) loop();
    };
    if (sprite.complete) loop();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("click", onCanvasClick);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "min(92vw, 760px)",
        fontFamily: "monospace",
        userSelect: "none",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        background: "#f4f0e6",
      }}
    >
      <button
        type="button"
        onClick={() => onClose?.()}
        aria-label="모달 닫기"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "none",
          background: "rgba(0,0,0,0.25)",
          color: "#fff",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          color: "#3f2d1b",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
        }}
      >
        <span ref={scoreRef}>점수: 0</span>
        <span ref={msgRef}>스페이스바 또는 클릭으로 점프!</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          imageRendering: "pixelated",
          cursor: "pointer",
          touchAction: "none",
        }}
      />
      <div
        ref={startOverlayRef}
        style={{
          position: "absolute",
          inset: "39px 0 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.9)",
            color: "#333",
            borderRadius: 8,
            padding: "10px 16px",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          클릭 또는 스페이스로 시작!
        </div>
      </div>
      <div
        ref={gameOverOverlayRef}
        style={{
          position: "absolute",
          inset: "39px 0 0 0",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          background: "rgba(0,0,0,0.32)",
        }}
      >
        <div
          style={{
            background: "rgba(32,32,32,0.82)",
            color: "#fff",
            borderRadius: 12,
            padding: "14px 20px",
            textAlign: "center",
            boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
            GAME OVER
          </div>
          <div ref={gameOverScoreRef} style={{ fontSize: 14, marginBottom: 4 }}>
            점수: 0 최고: 0
          </div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            클릭 또는 스페이스로 재시작
          </div>
        </div>
      </div>
    </div>
  );
}
