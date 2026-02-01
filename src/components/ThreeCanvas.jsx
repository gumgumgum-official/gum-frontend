import { useRef, useEffect, useMemo } from "react";
import { initThreeApp } from "../three/initThreeApp.js";

/**
 * Three.js 캔버스를 렌더링하고 기존 로직을 마운트합니다.
 * @param {Object} props
 * @param {number[]} props.allowedStages - 허용 Stage 목록 (예: [2], [3,4,5,6])
 * @param {number} props.initialStage - 시작 Stage
 * @param {boolean} [props.enableKeyboardSwitch] - 키보드 2~6 전환 (개발용)
 * @returns {JSX.Element}
 */
export function ThreeCanvas({
  allowedStages,
  initialStage,
  enableKeyboardSwitch = false,
}) {
  const canvasRef = useRef(null);
  const disposeRef = useRef(null);

  // 배열 참조가 매번 바뀌어도 내용이 같으면 재초기화 방지
  const stagesKey = useMemo(
    () => JSON.stringify(allowedStages ?? []),
    [allowedStages],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stages = JSON.parse(stagesKey);
    const app = initThreeApp(canvas, {
      allowedStages: stages,
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
  }, [stagesKey, initialStage, enableKeyboardSwitch]);

  return <canvas ref={canvasRef} className="three-canvas" />;
}
