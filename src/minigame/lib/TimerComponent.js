/**
 * TimerComponent.js - 15초 카운트다운 로직
 * PRD: 파일 분리 원칙
 */
import { useState, useRef, useCallback, useEffect } from "react";

const GAME_DURATION = 15;

/**
 * 15초 카운트다운 훅
 * @param {() => void} onComplete - 타이머 종료 시 콜백
 * @returns {{ timeLeft: number, start: () => void, stop: () => void, reset: () => void, isRunning: boolean }}
 */
export function useGameTimer(onComplete) {
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTimeLeft(GAME_DURATION);
  }, [stop]);

  const start = useCallback(() => {
    stop();
    setTimeLeft(GAME_DURATION);
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsRunning(false);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stop, onComplete]);

  useEffect(() => () => stop(), [stop]);

  return { timeLeft, start, stop, reset, isRunning };
}

export { GAME_DURATION };
