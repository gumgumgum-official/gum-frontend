/**
 * PNG/WebP 등 브라우저 이미지 디코드 선로드
 * @param {string[]} urls
 * @returns {Promise<PromiseSettledResult<undefined>[]>}
 */
export function preloadImageUrls(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  return Promise.allSettled(
    unique.map(
      (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () =>
            reject(new Error(`[preloadImages] failed: ${src}`));
          img.src = src;
        }),
    ),
  );
}
