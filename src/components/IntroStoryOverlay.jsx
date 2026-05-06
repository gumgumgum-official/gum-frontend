import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../pages/Page.module.css";

const FIRST_LINE_DELAY_MS = 500;
const REST_LINES_DELAY_MS = 1700;
const LAST_LINE_DELAY_MS = 2600;
const ADVANCE_HINT_DELAY_MS = 1200;
const INTRO_OVERLAY_ENTER_MS = 750;

const INTRO_SCENES = [
  {
    background: "radial-gradient(ellipse at 40% 50%, #1c1530 0%, #12101e 70%)",
    imageSrc: "/assets/intro_story/1.svg",
    lines: [
      "옛날 옛적에,",
      "걱정이 너무너무 많은 다인이가 있었어요.",
      "잠들기 전에도, 밥을 먹을 때도,",
      "걱정이 졸졸졸 따라다녔거든요.",
    ],
  },
  {
    background: "radial-gradient(ellipse at 50% 60%, #1a1028 0%, #0f0d1c 70%)",
    imageSrc: "/assets/intro_story/2.svg",
    lines: [
      "그러던 어느 날,",
      "작고 동그란 무언가가 나타났어요.",
      "이름도 모르는 그 껌딱지는",
      "조용히 다인이의 손을 잡았어요.",
      '"나랑 같이 가볼래?"',
    ],
    accentIndexes: [4],
    splitLastLine: true,
  },
  {
    background: "radial-gradient(ellipse at 55% 45%, #0d1f14 0%, #0a1510 70%)",
    imageSrc: "/assets/intro_story/3.svg",
    lines: [
      "이 섬에는",
      "누군가가 기댈 수 있는 곳을 지키는",
      "껌딱지들이 살고 있어요.",
      "오늘도, 누군가를 기다리면서.",
    ],
  },
  {
    background: "radial-gradient(ellipse at 45% 50%, #121030 0%, #0e0c22 70%)",
    imageSrc: "/assets/intro_story/4.svg",
    lines: [
      "껌딱지들은 저마다 달라요.",
      "조용히 옆에 앉아주는 껌딱지,",
      "같이 웃겨주려는 껌딱지,",
      "말없이 졸졸 따라다니는 껌딱지까지.",
    ],
  },
  {
    background: "radial-gradient(ellipse at 50% 55%, #0a1a0d 0%, #080f0b 70%)",
    imageSrc: "/assets/intro_story/5.svg",
    lines: [
      "다인이는 껌딱지 월드에서",
      "걱정을 망치로 부수고,",
      "아이스크림도 먹고,",
      "껌딱지한테 둥가둥가도 받았어요.",
    ],
  },
  {
    background: "radial-gradient(ellipse at 40% 40%, #1a0e08 0%, #100a06 70%)",
    imageSrc: "/assets/intro_story/6.svg",
    lines: [
      "껌딱지들은 졸졸 따라다니며",
      "응원도 해주고, 사진도 같이 찍고,",
      "떠날 때가 되자",
      "손을 흔들며 배웅해줬어요.",
    ],
  },
  {
    background: "radial-gradient(ellipse at 50% 40%, #0f1820 0%, #080d12 70%)",
    imageSrc: "/assets/intro_story/7.svg",
    lines: [
      "다인이는 걱정을 훌훌 털어버리고",
      "다시 일상으로 돌아갈 수 있었답니다.",
    ],
    heroIndexes: [],
    sequentialAll: true,
    sequentialLineDelays: [FIRST_LINE_DELAY_MS, REST_LINES_DELAY_MS],
  },
  {
    background:
      "radial-gradient(ellipse at 48% 42%, #17182b 0%, #0e1020 68%, #090b16 100%)",
    imageSrc: "/assets/intro_story/1.svg",
    lines: ["껌딱지들이 오늘도 기다리고 있어.", "잘 왔어."],
    dark: true,
  },
];

export function IntroStoryOverlay({ onComplete }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [showFirstLine, setShowFirstLine] = useState(false);
  const [showRestLines, setShowRestLines] = useState(false);
  const [showLastLine, setShowLastLine] = useState(false);
  const [visibleLineCount, setVisibleLineCount] = useState(0);
  const [showFrame, setShowFrame] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
  const [showAdvanceHint, setShowAdvanceHint] = useState(false);

  const scene = INTRO_SCENES[sceneIndex];
  const isFinalScene = sceneIndex === INTRO_SCENES.length - 1;
  const isFirstScene = sceneIndex === 0;
  const showStars = !scene.dark;
  const starCount = useMemo(() => 25 + sceneIndex * 3, [sceneIndex]);
  const stars = useMemo(
    () =>
      Array.from({ length: starCount }, (_, idx) => ({
        id: `${sceneIndex}-${idx}`,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2.2 + 1,
        delay: Math.random() * 2,
      })),
    [sceneIndex, starCount],
  );

  useEffect(() => {
    setShowFirstLine(false);
    setShowRestLines(false);
    setShowLastLine(false);
    setVisibleLineCount(0);
    setShowFrame(false);
    setCanAdvance(false);
    setShowAdvanceHint(false);

    const timers = [];
    const firstSceneStartDelay = isFirstScene ? INTRO_OVERLAY_ENTER_MS : 0;
    const frameTimer = window.setTimeout(() => {
      setShowFrame(true);
    }, FIRST_LINE_DELAY_MS + firstSceneStartDelay);
    timers.push(frameTimer);

    if (scene.sequentialAll) {
      scene.lines.forEach((_, idx) => {
        const delayMs = Array.isArray(scene.sequentialLineDelays)
          ? (scene.sequentialLineDelays[idx] ?? FIRST_LINE_DELAY_MS)
          : FIRST_LINE_DELAY_MS + 430 * idx;
        const timer = window.setTimeout(() => {
          setVisibleLineCount(idx + 1);
          if (idx === scene.lines.length - 1) {
            setCanAdvance(true);
          }
        }, delayMs + firstSceneStartDelay);
        timers.push(timer);
      });
    } else {
      const firstTimer = window.setTimeout(() => {
        setShowFirstLine(true);
      }, FIRST_LINE_DELAY_MS + firstSceneStartDelay);
      if (scene.splitLastLine) {
        const midTimer = window.setTimeout(() => {
          setShowRestLines(true);
        }, REST_LINES_DELAY_MS + firstSceneStartDelay);
        const lastTimer = window.setTimeout(() => {
          setShowLastLine(true);
          setCanAdvance(true);
        }, LAST_LINE_DELAY_MS + firstSceneStartDelay);
        timers.push(firstTimer, midTimer, lastTimer);
      } else {
        const restTimer = window.setTimeout(() => {
          setShowRestLines(true);
          setCanAdvance(true);
        }, REST_LINES_DELAY_MS + firstSceneStartDelay);
        timers.push(firstTimer, restTimer);
      }
    }

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isFirstScene, scene, sceneIndex]);

  useEffect(() => {
    if (!canAdvance) {
      setShowAdvanceHint(false);
      return;
    }
    const hintTimer = window.setTimeout(() => {
      setShowAdvanceHint(true);
    }, ADVANCE_HINT_DELAY_MS);
    return () => {
      window.clearTimeout(hintTimer);
    };
  }, [canAdvance]);

  const lineClassNames = useMemo(
    () =>
      scene.lines.map((_, idx) => {
        const classNames = [styles.introNarrLine];
        if (scene.dark) {
          classNames.push(styles.introNarrLineDark);
        }
        if (scene.accentIndexes?.includes(idx)) {
          classNames.push(styles.introNarrLineAccent);
        }
        if (scene.heroIndexes?.includes(idx)) {
          classNames.push(styles.introNarrLineHero);
        }
        if (scene.dark && idx === scene.lines.length - 1) {
          classNames.push(styles.introNarrLineDarkHero);
        }
        const isVisible = scene.sequentialAll
          ? idx < visibleLineCount
          : scene.splitLastLine
            ? idx === 0
              ? showFirstLine
              : idx === scene.lines.length - 1
                ? showLastLine
                : showRestLines
            : idx === 0
              ? showFirstLine
              : showRestLines;
        if (isVisible) {
          classNames.push(styles.introNarrLineShow);
        }
        return classNames.join(" ");
      }),
    [scene, showFirstLine, showRestLines, showLastLine, visibleLineCount],
  );

  const handleAdvance = useCallback(() => {
    if (!canAdvance || isFinalScene) {
      return;
    }
    setCanAdvance(false);
    setShowFrame(false);
    setShowFirstLine(false);
    setShowRestLines(false);
    setSceneIndex((prev) => Math.min(prev + 1, INTRO_SCENES.length - 1));
  }, [canAdvance, isFinalScene]);

  const handleBack = useCallback(() => {
    if (isFirstScene) {
      return;
    }
    setCanAdvance(false);
    setShowFrame(false);
    setShowFirstLine(false);
    setShowRestLines(false);
    setSceneIndex((prev) => Math.max(prev - 1, 0));
  }, [isFirstScene]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        handleBack();
        return;
      }
      if (event.code !== "Enter" && event.code !== "ArrowRight") {
        return;
      }
      if (
        event.code === "Enter" &&
        typeof globalThis.HTMLElement !== "undefined" &&
        event.target instanceof globalThis.HTMLElement &&
        event.target.closest(
          "button, a[href], input, textarea, select, [role='button']",
        )
      ) {
        return;
      }
      event.preventDefault();
      handleAdvance();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleAdvance, handleBack]);

  return (
    <div
      className={`${styles.introOverlay} ${styles.introOverlayEnter}`}
      style={{ background: scene.background }}
      onClick={handleAdvance}
    >
      {showStars ? (
        <div className={styles.introStars} aria-hidden="true">
          {stars.map((star) => (
            <span
              key={star.id}
              className={styles.introStar}
              style={{
                top: `${star.top}%`,
                left: `${star.left}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.introStory}>
        <div
          className={`${styles.introFrame}${showFrame ? ` ${styles.introFrameShow}` : ""}${isFinalScene ? ` ${styles.introFrameFinal}` : ""}`}
        >
          <img
            className={styles.introFrameImage}
            src={scene.imageSrc}
            alt=""
            draggable="false"
            decoding="async"
          />
        </div>
        <div className={styles.introNarr}>
          {scene.lines.map((line, idx) => (
            <span key={`${sceneIndex}-${idx}`} className={lineClassNames[idx]}>
              {line}
            </span>
          ))}
        </div>
        <div className={styles.introActionSlot}>
          {isFinalScene ? (
            showAdvanceHint ? (
              <button
                type="button"
                className={`${styles.introEnterButton} ${styles.introEnterButtonShow}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onComplete?.();
                }}
              >
                <span
                  className={styles.introEnterButtonEmoji}
                  aria-hidden="true"
                >
                  <img
                    src="/assets/island.svg"
                    alt=""
                    className={styles.introEnterButtonIsland}
                    draggable={false}
                    decoding="async"
                  />
                </span>
                <span className={styles.introEnterButtonLabel}>
                  껌딱지 월드로 들어가기
                </span>
                <span
                  className={styles.introEnterButtonArrow}
                  aria-hidden="true"
                >
                  →
                </span>
              </button>
            ) : null
          ) : null}
        </div>
      </div>
      <div className={styles.introNav}>
        {INTRO_SCENES.map((_, idx) => (
          <span
            key={`intro-dot-${idx}`}
            className={`${styles.introDot}${idx === sceneIndex ? ` ${styles.introDotOn}` : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
