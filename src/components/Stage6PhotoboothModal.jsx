import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playPhotoboothCameraSound } from "../utils/stages/stage6/playPhotoboothCameraSound.js";

const DEFAULT_PHOTO_RATIOS = [0.25, 0.75, 0.82];
/** 영상 종료 후 자동으로 모달을 닫기 전 대기 시간 (ms) */
const AUTO_CLOSE_AFTER_END_MS = 1500;
/** 닫힐 때 오버레이 페이드아웃 시간 — style.css의 transition과 맞출 것 */
const CLOSE_TRANSITION_MS = 320;

export function Stage6PhotoboothModal({
  isOpen,
  videoSrc,
  onClose,
  photoSrcs,
  photoRatios = DEFAULT_PHOTO_RATIOS,
}) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const triggeredRef = useRef([]);
  const rafRef = useRef(null);

  const photos = useMemo(
    () => (Array.isArray(photoSrcs) ? photoSrcs.filter(Boolean) : []),
    [photoSrcs],
  );
  const showPhotos = photos.length > 0;

  const [revealed, setRevealed] = useState(() => photos.map(() => false));
  const [isExiting, setIsExiting] = useState(false);

  const requestClose = useCallback(() => {
    setIsExiting((prev) => {
      if (prev) return prev;
      return true;
    });
  }, []);

  const finalizeClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const prevIsOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setIsExiting(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    setRevealed(photos.map(() => false));
    triggeredRef.current = photos.map(() => false);
  }, [photos]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, requestClose]);

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
    if (!isOpen) return;
    const video = videoRef.current;
    if (!video) return;

    let closeTimerId = null;
    const handleEnded = () => {
      closeTimerId = window.setTimeout(() => {
        closeTimerId = null;
        requestClose();
      }, AUTO_CLOSE_AFTER_END_MS);
    };

    video.addEventListener("ended", handleEnded);
    return () => {
      video.removeEventListener("ended", handleEnded);
      if (closeTimerId !== null) clearTimeout(closeTimerId);
    };
  }, [isOpen, videoSrc, requestClose]);

  useEffect(() => {
    if (!isExiting) return;
    const video = videoRef.current;
    if (video) video.pause();
  }, [isExiting]);

  useEffect(() => {
    if (!isExiting) return;

    const el = overlayRef.current;
    if (!el) {
      finalizeClose();
      return;
    }

    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      finalizeClose();
    };

    const onEnd = (event) => {
      if (event.target !== el || event.propertyName !== "opacity") return;
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallbackId);
      complete();
    };

    const fallbackId = window.setTimeout(() => {
      el.removeEventListener("transitionend", onEnd);
      complete();
    }, CLOSE_TRANSITION_MS + 150);

    el.addEventListener("transitionend", onEnd);

    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallbackId);
    };
  }, [isExiting, finalizeClose]);

  useEffect(() => {
    if (!isOpen || isExiting) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (!isOpen) {
        setRevealed(photos.map(() => false));
        triggeredRef.current = photos.map(() => false);
      }
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
          playPhotoboothCameraSound();
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
  }, [isOpen, isExiting, photos, photoRatios]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className={`stage6-photobooth-modal-overlay${isExiting ? " stage6-photobooth-modal-overlay--exiting" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="포토부스"
      onClick={requestClose}
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
            onClick={requestClose}
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
                <div className="stage6-photobooth-frame" key={src}>
                  <img
                    src={src}
                    alt={`포토 ${i + 1}`}
                    className={revealed[i] ? "revealed" : ""}
                    draggable={false}
                  />
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
