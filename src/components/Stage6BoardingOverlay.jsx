import { useEffect, useRef, useState } from "react";
import {
  cancelStage6LoadingTransition,
  startStage6LoadingTransition,
} from "../utils/stages/stage6/stage6LoadingTransition.js";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";

const AIRPORT_SUBTITLE_SHOW_EVENT = "gum:airportAnnouncementSubtitle:show";
const AIRPORT_SUBTITLE_UPDATE_EVENT = "gum:airportAnnouncementSubtitle:update";
const AIRPORT_SUBTITLE_HIDE_EVENT = "gum:airportAnnouncementSubtitle:hide";
const STAGE6_SUBTITLE_SHOW_EVENT = "gum:stage6-subtitle:show";
const STAGE6_SUBTITLE_HIDE_EVENT = "gum:stage6-subtitle:hide";
const STAGE6_SUBTITLE_SEQUENCE_EVENT = "gum:stage6-subtitle:sequence";
const STAGE6_NAME_MODAL_SHOW_EVENT = "gum:stage6-name-modal:show";
const STAGE6_NAME_MODAL_HIDE_EVENT = "gum:stage6-name-modal:hide";
const STAGE6_BOARDING_RESET_EVENT = "gum:stage6-boarding:reset";
const STAGE6_FINISH_EVENT = "gum:kiosk-finish";
const STAGE6_INTERACTION_LOCK_EVENT = "gum:stage6-interaction-lock";
const STAGE6_INTERACTION_UNLOCK_EVENT = "gum:stage6-interaction-unlock";
const DEFAULT_PASSENGER_NAME = "소중한 손님";
const STAGE6_TICKET_IMAGE_SRC = "/assets/ticket/ticket.svg";
/** '탑승권 발급받기' 클릭 시 재생 (랜덤 1종) */
const TICKET_ISSUE_SOUND_PATHS = [
  "/static/sounds/airport/ticket_sound1.mp3",
  "/static/sounds/airport/ticket_sound2.mp3",
];
const TICKET_ISSUE_SOUND_VOLUME = 0.55;

function playRandomTicketIssueSound() {
  if (TICKET_ISSUE_SOUND_PATHS.length === 0) return;
  const path =
    TICKET_ISSUE_SOUND_PATHS[
      Math.floor(Math.random() * TICKET_ISSUE_SOUND_PATHS.length)
    ];
  const audio = new window.Audio();
  audio.preload = "auto";
  audio.volume = TICKET_ISSUE_SOUND_VOLUME;
  audio.src = resolvePublicAssetUrl(path);
  try {
    audio.load();
  } catch {
    // ignore
  }
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {});
  }
}

export function Stage6BoardingOverlay() {
  const [subtitleText, setSubtitleText] = useState("");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [fadeOutSubtitle, setFadeOutSubtitle] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [nameInputValue, setNameInputValue] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const nameInputRef = useRef(null);
  const timersRef = useRef([]);
  const sequenceTokenRef = useRef(0);
  const latestPassengerNameRef = useRef("");
  const showSubtitleRef = useRef(false);
  const subtitleTextRef = useRef("");

  useEffect(() => {
    latestPassengerNameRef.current = passengerName;
  }, [passengerName]);

  useEffect(() => {
    showSubtitleRef.current = showSubtitle;
  }, [showSubtitle]);

  useEffect(() => {
    subtitleTextRef.current = subtitleText;
  }, [subtitleText]);

  useEffect(() => {
    if (!isNameModalOpen) return;
    const timerId = window.setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select?.();
    }, 400);
    return () => window.clearTimeout(timerId);
  }, [isNameModalOpen]);

  useEffect(() => {
    const clearTimers = () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = [];
    };

    const schedule = (callback, delay) => {
      const timerId = window.setTimeout(() => {
        timersRef.current = timersRef.current.filter((id) => id !== timerId);
        callback();
      }, delay);
      timersRef.current.push(timerId);
      return timerId;
    };

    const delay = (ms, token) =>
      new Promise((resolve) => {
        schedule(() => resolve(token === sequenceTokenRef.current), ms);
      });

    const cancelSequence = () => {
      sequenceTokenRef.current += 1;
      clearTimers();
    };

    const showSubtitleNow = (text) => {
      setSubtitleText(text);
      setFadeOutSubtitle(false);
      setShowSubtitle(true);
    };

    const hideSubtitleNow = () => {
      if (!showSubtitleRef.current && !subtitleTextRef.current) {
        return Promise.resolve(true);
      }
      const token = sequenceTokenRef.current;
      setFadeOutSubtitle(true);
      return new Promise((resolve) => {
        schedule(() => {
          if (token !== sequenceTokenRef.current) {
            resolve(false);
            return;
          }
          setShowSubtitle(false);
          setFadeOutSubtitle(false);
          setSubtitleText("");
          resolve(true);
        }, 600);
      });
    };

    const runSubtitleSequence = async (messages) => {
      cancelSequence();
      const token = sequenceTokenRef.current;
      for (let i = 0; i < messages.length; i += 1) {
        const entry = messages[i];
        if (!entry?.text) continue;
        if (token !== sequenceTokenRef.current) return;
        showSubtitleNow(entry.text);
        if (!(await delay(Number(entry.holdMs ?? 2000), token))) return;
        if (!(await hideSubtitleNow())) return;
        if (i < messages.length - 1) {
          if (!(await delay(200, token))) return;
        }
      }
    };

    const onAirportSubtitleShow = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      cancelSequence();
      showSubtitleNow(text);
    };

    const onAirportSubtitleUpdate = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      cancelSequence();
      showSubtitleNow(text);
    };

    const onAirportSubtitleHide = () => {
      cancelSequence();
      void hideSubtitleNow();
    };

    const onStage6SubtitleShow = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      cancelSequence();
      showSubtitleNow(text);
    };

    const onStage6SubtitleHide = () => {
      cancelSequence();
      void hideSubtitleNow();
    };

    const onStage6SubtitleSequence = (event) => {
      const messages = Array.isArray(event?.detail?.messages)
        ? event.detail.messages
        : [];
      if (messages.length === 0) return;
      void runSubtitleSequence(messages);
    };

    const onStage6NameModalShow = () => {
      setIsOverlayOpen(false);
      setNameInputValue(latestPassengerNameRef.current);
      setIsNameModalOpen(true);
    };

    const onStage6NameModalHide = () => {
      setIsNameModalOpen(false);
    };

    const onBoardingReset = () => {
      cancelStage6LoadingTransition();
      cancelSequence();
      setShowSubtitle(false);
      setFadeOutSubtitle(false);
      setSubtitleText("");
      setIsNameModalOpen(false);
      setIsOverlayOpen(false);
      setNameInputValue("");
      window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
    };

    window.addEventListener(AIRPORT_SUBTITLE_SHOW_EVENT, onAirportSubtitleShow);
    window.addEventListener(
      AIRPORT_SUBTITLE_UPDATE_EVENT,
      onAirportSubtitleUpdate,
    );
    window.addEventListener(AIRPORT_SUBTITLE_HIDE_EVENT, onAirportSubtitleHide);
    window.addEventListener(STAGE6_SUBTITLE_SHOW_EVENT, onStage6SubtitleShow);
    window.addEventListener(STAGE6_SUBTITLE_HIDE_EVENT, onStage6SubtitleHide);
    window.addEventListener(
      STAGE6_SUBTITLE_SEQUENCE_EVENT,
      onStage6SubtitleSequence,
    );
    window.addEventListener(
      STAGE6_NAME_MODAL_SHOW_EVENT,
      onStage6NameModalShow,
    );
    window.addEventListener(
      STAGE6_NAME_MODAL_HIDE_EVENT,
      onStage6NameModalHide,
    );
    window.addEventListener(STAGE6_BOARDING_RESET_EVENT, onBoardingReset);

    return () => {
      clearTimers();
      window.removeEventListener(
        AIRPORT_SUBTITLE_SHOW_EVENT,
        onAirportSubtitleShow,
      );
      window.removeEventListener(
        AIRPORT_SUBTITLE_UPDATE_EVENT,
        onAirportSubtitleUpdate,
      );
      window.removeEventListener(
        AIRPORT_SUBTITLE_HIDE_EVENT,
        onAirportSubtitleHide,
      );
      window.removeEventListener(
        STAGE6_SUBTITLE_SHOW_EVENT,
        onStage6SubtitleShow,
      );
      window.removeEventListener(
        STAGE6_SUBTITLE_HIDE_EVENT,
        onStage6SubtitleHide,
      );
      window.removeEventListener(
        STAGE6_SUBTITLE_SEQUENCE_EVENT,
        onStage6SubtitleSequence,
      );
      window.removeEventListener(
        STAGE6_NAME_MODAL_SHOW_EVENT,
        onStage6NameModalShow,
      );
      window.removeEventListener(
        STAGE6_NAME_MODAL_HIDE_EVENT,
        onStage6NameModalHide,
      );
      window.removeEventListener(STAGE6_BOARDING_RESET_EVENT, onBoardingReset);
    };
  }, []);

  useEffect(() => {
    if (!isNameModalOpen && !isOverlayOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsNameModalOpen(false);
        setIsOverlayOpen(false);
      }
      if (event.key === "Enter" && isNameModalOpen) {
        event.preventDefault();
        const submitButton = document.getElementById("stage6-name-submit");
        submitButton?.click();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNameModalOpen, isOverlayOpen]);

  const submitName = () => {
    playRandomTicketIssueSound();
    const nextPassengerName = nameInputValue.trim() || DEFAULT_PASSENGER_NAME;
    setPassengerName(nextPassengerName);
    setNameInputValue(nextPassengerName);
    setIsNameModalOpen(false);
    window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_LOCK_EVENT));

    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SHOW_EVENT, {
        detail: {
          text: `${nextPassengerName}님, 탑승권이 발급되었습니다.\n일상으로 출발합니다 ✈`,
        },
      }),
    );

    window.setTimeout(() => {
      setIsOverlayOpen(true);
      window.dispatchEvent(new CustomEvent(STAGE6_SUBTITLE_HIDE_EVENT));
    }, 2500);
  };

  const boardFlight = () => {
    setIsOverlayOpen(false);
    window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
    startStage6LoadingTransition(() => {
      window.dispatchEvent(new CustomEvent(STAGE6_FINISH_EVENT));
    });
  };

  return (
    <>
      <div id="loading-overlay" aria-hidden="true">
        <div id="loading-bg" />
        <canvas id="airplane-canvas" />
        <div id="loading-text">
          일상으로 복귀하는 중
          <br />
          <span>GGUM Airlines GUM 2026</span>
        </div>
      </div>

      <div className="subtitle-container" aria-live="polite">
        <div
          className={`subtitle-box ${showSubtitle ? "visible" : ""} ${
            fadeOutSubtitle ? "fade-out" : ""
          }`}
        >
          <div className="subtitle-label">ANNOUNCEMENT</div>
          <div className="subtitle-text">
            {subtitleText.split("\n").map((line, idx, lines) => (
              <span key={`${line}-${idx}`}>
                {line}
                {idx < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`name-modal ${isNameModalOpen ? "visible" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Passenger name input"
        onClick={() => setIsNameModalOpen(false)}
      >
        <div className="name-card" onClick={(event) => event.stopPropagation()}>
          <h3>PASSENGER NAME</h3>
          <p>
            탑승권에 들어갈 이름을 입력해주세요.
            <br />
            실명이 아니어도 괜찮아요 🙂
          </p>
          <input
            ref={nameInputRef}
            className="name-input"
            id="nameInput"
            type="text"
            placeholder="이름을 입력하세요"
            maxLength={16}
            value={nameInputValue}
            onChange={(event) => setNameInputValue(event.target.value)}
          />
          <button
            id="stage6-name-submit"
            type="button"
            className="name-submit"
            onClick={submitName}
          >
            탑승권 발급받기 ✈
          </button>
        </div>
      </div>

      <div className={`overlay ${isOverlayOpen ? "visible" : ""}`}>
        <div style={{ position: "relative" }}>
          <div className="boarding-pass">
            <img
              src={STAGE6_TICKET_IMAGE_SRC}
              alt="GGUM boarding pass"
              className="boarding-pass-image"
              draggable={false}
            />
            <div className="boarding-pass-passenger-name">
              {passengerName || DEFAULT_PASSENGER_NAME}
            </div>
          </div>

          <div className="bp-actions">
            <button
              type="button"
              className="bp-btn bp-btn-save"
              onClick={boardFlight}
            >
              탑승하기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
