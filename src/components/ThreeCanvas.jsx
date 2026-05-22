import { useRef, useEffect, useState } from "react";
import { initThreeApp } from "../three/initThreeApp.js";

/**
 * @typedef {Object} ThreeCanvasProps
 * @property {readonly number[]} allowedStages - 허용 Stage 목록 (예: [2], [3, 6])
 * @property {number} initialStage - 시작 Stage
 * @property {boolean} [enableKeyboardSwitch] - 키보드 2~6 전환 (개발용)
 * @property {boolean} [skipStage3Intro] - true면 `/dev` 등에서 Stage3 카메라·인트로 사운드 생략
 * @property {boolean} [renderPaused] - true면 Three.js update/render 일시 정지
 * @property {function(string, Error?): void} [onError] - 에러 시 호출 (미전달 시 화면에 메시지 표시)
 */

/**
 * Three.js 캔버스를 렌더링하고 기존 로직을 마운트합니다.
 * allowedStages는 상위에서 useMemo 등으로 안정된 참조를 전달하는 것을 권장합니다.
 * @param {ThreeCanvasProps} props
 */
export function ThreeCanvas({
  allowedStages,
  initialStage,
  enableKeyboardSwitch = false,
  skipStage3Intro = false,
  renderPaused = false,
  onError: onErrorProp,
}) {
  const canvasRef = useRef(null);
  const disposeRef = useRef(null);
  const renderPausedRef = useRef(renderPaused);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleError = onErrorProp ?? setErrorMessage;
  const onErrorRef = useRef(handleError);
  onErrorRef.current = handleError;
  renderPausedRef.current = renderPaused;

  useEffect(() => {
    setErrorMessage(null);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stages = Array.isArray(allowedStages) ? allowedStages : [];
    const app = initThreeApp(canvas, {
      allowedStages: stages,
      initialStage,
      enableKeyboardSwitch,
      skipStage3Intro,
      getRenderPaused: () => renderPausedRef.current,
      onError: (msg, err) => onErrorRef.current(msg, err),
    });
    disposeRef.current = app.dispose;

    return () => {
      if (disposeRef.current) {
        disposeRef.current();
        disposeRef.current = null;
      }
    };
  }, [allowedStages, initialStage, enableKeyboardSwitch, skipStage3Intro]);

  if (errorMessage) {
    return (
      <div className="three-canvas-error" role="alert">
        <p>{errorMessage}</p>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="three-canvas" />;
}
