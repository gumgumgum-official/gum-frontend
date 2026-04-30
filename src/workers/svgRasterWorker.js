/* global self, OffscreenCanvas, createImageBitmap */
// SVG → OffscreenCanvas 래스터 워커

self.onmessage = async (event) => {
  const { id, svgText, width, height } = event.data || {};
  if (!id || !svgText) return;
  try {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    // 워커에서는 DOM `Image`가 없을 수 있으므로, createImageBitmap을 우선 사용한다.
    const imgBitmap = await createImageBitmap(blob);

    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imgBitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(imgBitmap, -1, -1, width + 2, height + 2);
    ctx.globalCompositeOperation = "source-over";

    const bitmap = await offscreen.transferToImageBitmap();
    imgBitmap?.close?.();
    self.postMessage({ id, bitmap }, [bitmap]);
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
