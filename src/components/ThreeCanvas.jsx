import { useRef, useEffect } from "react";
import { initThreeApp } from "../three/initThreeApp.js";

/**
 * Three.js 캔버스를 렌더링하고 기존 로직을 마운트합니다.
 * @param {Object} props
 * @param {number[]} props.allowedStages - 허용 Stage 목록
 * @param {number} props.initialStage - 시작 Stage
 * @param {boolean} [props.enableKeyboardSwitch] - 키보드 1~6 전환 (개발용)
 */
export function ThreeCanvas({
  allowedStages,
  initialStage,
  enableKeyboardSwitch = false,
}) {
  const canvasRef = useRef(null);
  const disposeRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = initThreeApp(canvas, {
      allowedStages,
      initialStage,
      enableKeyboardSwitch,
    });
    disposeRef.current = app.dispose;

    return () => {
      if (disposeRef.current) {
        disposeRef.current();
        disposeRef.current = null;
      }
    };
  }, [allowedStages, initialStage, enableKeyboardSwitch]);

  return <canvas ref={canvasRef} className="three-canvas" />;
}
