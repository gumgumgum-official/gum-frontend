import { useRef, useEffect, useState } from "react";
import { initThreeApp } from "../three/initThreeApp.js";

/**
 * Three.js 캔버스를 렌더링하고 기존 로직을 마운트합니다.
 * allowedStages는 상위에서 useMemo 등으로 안정된 참조를 전달하는 것을 권장합니다.
 * @param {Object} props
 * @param {number[]} props.allowedStages - 허용 Stage 목록 (예: [2], [3,4,5,6])
 * @param {number} props.initialStage - 시작 Stage
 * @param {boolean} [props.enableKeyboardSwitch] - 키보드 2~6 전환 (개발용)
 * @param {function(string, Error?): void} [props.onError] - 에러 시 호출 (미전달 시 화면에 메시지 표시)
 * @returns {JSX.Element}
 */
export function ThreeCanvas({
  allowedStages,
  initialStage,
  enableKeyboardSwitch = false,
  onError: onErrorProp,
}) {
  const canvasRef = useRef(null);
  const disposeRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleError = onErrorProp ?? setErrorMessage;
  const onErrorRef = useRef(handleError);
  onErrorRef.current = handleError;

  useEffect(() => {
    setErrorMessage(null);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stages = Array.isArray(allowedStages) ? allowedStages : [];
    const app = initThreeApp(canvas, {
      allowedStages: stages,
      initialStage,
      enableKeyboardSwitch,
      onError: (msg, err) => onErrorRef.current(msg, err),
    });
    disposeRef.current = app.dispose;

    return () => {
      if (disposeRef.current) {
        disposeRef.current();
        disposeRef.current = null;
      }
    };
  }, [allowedStages, initialStage, enableKeyboardSwitch]);

  if (errorMessage) {
    return (
      <div className="three-canvas-error" role="alert">
        <p>{errorMessage}</p>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="three-canvas" />;
}
