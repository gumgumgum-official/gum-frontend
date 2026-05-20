import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PHOTO_RATIOS = [0.25, 0.55, 0.82];

export function Stage6PhotoboothModal({
  isOpen,
  videoSrc,
  onClose,
  photoSrcs,
  photoRatios = DEFAULT_PHOTO_RATIOS,
}) {
  const videoRef = useRef(null);
  const triggeredRef = useRef([]);
  const rafRef = useRef(null);

  const photos = useMemo(
    () => (Array.isArray(photoSrcs) ? photoSrcs.filter(Boolean) : []),
    [photoSrcs],
  );
  const showPhotos = photos.length > 0;

  const [revealed, setRevealed] = useState(() => photos.map(() => false));

  useEffect(() => {
    setRevealed(photos.map(() => false));
    triggeredRef.current = photos.map(() => false);
  }, [photos]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isOpen || !video) return;

    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }

    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [isOpen, videoSrc]);

  useEffect(() => {
    if (!isOpen) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setRevealed(photos.map(() => false));
      triggeredRef.current = photos.map(() => false);
      return undefined;
    }

    triggeredRef.current = photos.map(() => false);
    setRevealed(photos.map(() => false));

    const ratios = photos.map(
      (_, i) => photoRatios[i] ?? DEFAULT_PHOTO_RATIOS[i] ?? 1,
    );

    function tick() {
      const video = videoRef.current;
      if (!video?.duration) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const ratio = video.currentTime / video.duration;

      ratios.forEach((threshold, i) => {
        if (!triggeredRef.current[i] && ratio >= threshold) {
          triggeredRef.current[i] = true;
          setRevealed((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isOpen, photos, photoRatios]);

  if (!isOpen) return null;

  return (
    <div
      className="stage6-photobooth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="포토부스"
      onClick={onClose}
    >
      <div
        className="stage6-photobooth-modal-content"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="stage6-photobooth-modal-header">
          <span className="stage6-photobooth-modal-title">
            ✦ GGUM WORLD PHOTO ✦
          </span>
          <button
            type="button"
            className="stage6-photobooth-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="stage6-photobooth-modal-body">
          <div className="stage6-photobooth-video-wrapper">
            <video
              ref={videoRef}
              className="stage6-photobooth-modal-video"
              src={videoSrc}
              playsInline
              autoPlay
              muted
              controls={false}
            />
          </div>

          {showPhotos && (
            <div className="stage6-photobooth-strip">
              {photos.map((src, i) => (
                <div className="stage6-photobooth-frame" key={i}>
                  <img
                    src={src}
                    alt={`포토 ${i + 1}`}
                    className={revealed[i] ? "revealed" : ""}
                    draggable={false}
                  />
                  <span className="stage6-photobooth-frame-num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
              <img
                src="/assets/photo_booth/photo_logo.png"
                alt="GGUM WORLD PHOTO"
                className="stage6-photobooth-strip-logo"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
