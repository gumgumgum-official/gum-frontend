import { useEffect, useRef, useState } from "react";
import { resolvePublicAssetUrl } from "../utils/common/gltfTemplateCache.js";
import {
  AIRPORT_SUBTITLE_HIDE_EVENT,
  AIRPORT_SUBTITLE_SHOW_EVENT,
  AIRPORT_SUBTITLE_UPDATE_EVENT,
  STAGE6_BOARDING_PASS_ISSUED_EVENT,
  STAGE6_BOARDING_RESET_EVENT,
  STAGE6_WALK_TO_ESCALATOR_EVENT,
  STAGE6_INTERACTION_LOCK_EVENT,
  STAGE6_INTERACTION_UNLOCK_EVENT,
  STAGE6_NAME_MODAL_HIDE_EVENT,
  STAGE6_NAME_MODAL_SHOW_EVENT,
  STAGE6_SCREEN_FADE_EVENT,
  STAGE6_SUBTITLE_HIDE_EVENT,
  STAGE6_SUBTITLE_SEQUENCE_EVENT,
  STAGE6_SUBTITLE_SHOW_EVENT,
} from "../events/stage6Events.js";
import {
  KIOSK_NEW_VISITOR_EVENT,
  KIOSK_SOFT_RESTART_EVENT,
} from "../events/kioskEvents.js";
import {
  resetStage6NotificationGate,
  unblockStage6Notifications,
} from "../utils/stages/stage6/stage6NotificationGate.js";
const DEFAULT_PASSENGER_NAME = "소중한 손님";
const DEFAULT_SUBTITLE_LABEL = "ANNOUNCEMENT";
const STAGE6_TICKET_IMAGE_SRC = "/assets/ticket/ticket.svg";
/** 이름 입력 모달 닫힌 뒤 탑승권(티켓) 오버레이 표시까지 대기 (ms) */
const TICKET_OVERLAY_OPEN_DELAY_MS = 1000;
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
  const [hideSubtitleLabel, setHideSubtitleLabel] = useState(false);
  const [subtitleLabelText, setSubtitleLabelText] = useState(
    DEFAULT_SUBTITLE_LABEL,
  );
  const [subtitleVariant, setSubtitleVariant] = useState(null);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [nameInputValue, setNameInputValue] = useState("");
  const [passengerName, setPassengerName] = useState("");
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isScreenFading, setIsScreenFading] = useState(false);
  const nameInputRef = useRef(null);
  const timersRef = useRef([]);
  /** subtitle effect의 `schedule` — 언마운트/reset 시 timersRef와 함께 정리 */
  const scheduleRef = useRef(null);
  const sequenceTokenRef = useRef(0);
  const ticketOverlayTimerRef = useRef(0);
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

    scheduleRef.current = schedule;

    const delay = (ms, token) =>
      new Promise((resolve) => {
        schedule(() => resolve(token === sequenceTokenRef.current), ms);
      });

    const cancelSequence = () => {
      sequenceTokenRef.current += 1;
      clearTimers();
    };

    const clearTicketOverlayTimer = () => {
      if (ticketOverlayTimerRef.current) {
        window.clearTimeout(ticketOverlayTimerRef.current);
        ticketOverlayTimerRef.current = 0;
      }
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

    const applySubtitleVariant = (event) => {
      setSubtitleVariant(event?.detail?.variant === "tent" ? "tent" : null);
    };

    const applySubtitleLabel = (event) => {
      if (event?.detail?.hideLabel === true) {
        setHideSubtitleLabel(true);
        return;
      }
      setHideSubtitleLabel(false);
      const label =
        typeof event?.detail?.label === "string"
          ? event.detail.label.trim()
          : "";
      setSubtitleLabelText(label || DEFAULT_SUBTITLE_LABEL);
    };

    const handleSubtitleShowEvent = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      cancelSequence();
      applySubtitleVariant(event);
      applySubtitleLabel(event);
      showSubtitleNow(text);
    };

    const onAirportSubtitleShow = (event) => {
      handleSubtitleShowEvent(event);
    };

    const onAirportSubtitleUpdate = (event) => {
      const text =
        typeof event?.detail?.text === "string" ? event.detail.text : "";
      if (!text) return;
      cancelSequence();
      setSubtitleVariant(null);
      showSubtitleNow(text);
    };

    const onAirportSubtitleHide = () => {
      cancelSequence();
      setSubtitleVariant(null);
      void hideSubtitleNow();
    };

    const onStage6SubtitleShow = (event) => {
      handleSubtitleShowEvent(event);
    };

    const onStage6SubtitleHide = () => {
      cancelSequence();
      setSubtitleVariant(null);
      void hideSubtitleNow();
    };

    const onStage6SubtitleSequence = (event) => {
      const messages = Array.isArray(event?.detail?.messages)
        ? event.detail.messages
        : [];
      if (messages.length === 0) return;
      applySubtitleVariant(event);
      applySubtitleLabel(event);
      void runSubtitleSequence(messages);
    };

    const onStage6NameModalShow = () => {
      setIsOverlayOpen(false);
      setNameInputValue(latestPassengerNameRef.current);
      setIsNameModalOpen(true);
      window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_LOCK_EVENT));
    };

    const onStage6NameModalHide = () => {
      setIsNameModalOpen(false);
      unblockStage6Notifications("name-modal");
      window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
    };

    const resetBoardingUiForNextVisitor = () => {
      clearTicketOverlayTimer();
      resetStage6NotificationGate();
      cancelSequence();
      setShowSubtitle(false);
      setFadeOutSubtitle(false);
      setSubtitleText("");
      setHideSubtitleLabel(false);
      setSubtitleLabelText(DEFAULT_SUBTITLE_LABEL);
      setSubtitleVariant(null);
      setIsNameModalOpen(false);
      setIsOverlayOpen(false);
      setIsScreenFading(false);
      setPassengerName("");
      setNameInputValue("");
      latestPassengerNameRef.current = "";
      unblockStage6Notifications("name-modal");
      window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
    };

    const onBoardingReset = () => {
      resetBoardingUiForNextVisitor();
    };

    const onKioskVisitorReset = () => {
      resetBoardingUiForNextVisitor();
    };

    const onScreenFade = () => setIsScreenFading(true);

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
    window.addEventListener(KIOSK_NEW_VISITOR_EVENT, onKioskVisitorReset);
    window.addEventListener(KIOSK_SOFT_RESTART_EVENT, onKioskVisitorReset);
    window.addEventListener(STAGE6_SCREEN_FADE_EVENT, onScreenFade);

    return () => {
      clearTicketOverlayTimer();
      clearTimers();
      scheduleRef.current = null;
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
      window.removeEventListener(KIOSK_NEW_VISITOR_EVENT, onKioskVisitorReset);
      window.removeEventListener(KIOSK_SOFT_RESTART_EVENT, onKioskVisitorReset);
      window.removeEventListener(STAGE6_SCREEN_FADE_EVENT, onScreenFade);
    };
  }, []);

  useEffect(() => {
    if (!isNameModalOpen && !isOverlayOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (ticketOverlayTimerRef.current) {
          window.clearTimeout(ticketOverlayTimerRef.current);
          ticketOverlayTimerRef.current = 0;
        }
        setIsNameModalOpen(false);
        setIsOverlayOpen(false);
        unblockStage6Notifications("name-modal");
        window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
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
    unblockStage6Notifications("name-modal");
    window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_LOCK_EVENT));
    window.dispatchEvent(new CustomEvent(STAGE6_SUBTITLE_HIDE_EVENT));
    if (ticketOverlayTimerRef.current) {
      window.clearTimeout(ticketOverlayTimerRef.current);
    }
    ticketOverlayTimerRef.current = window.setTimeout(() => {
      ticketOverlayTimerRef.current = 0;
      setIsOverlayOpen(true);
      window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_PASS_ISSUED_EVENT));
    }, TICKET_OVERLAY_OPEN_DELAY_MS);
  };

  const boardFlight = () => {
    setIsOverlayOpen(false);
    window.dispatchEvent(new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT));
    window.dispatchEvent(new CustomEvent(STAGE6_WALK_TO_ESCALATOR_EVENT));
    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
        detail: {
          messages: [
            {
              text: "이제 에스컬레이터를 타고\n탑승하러 가세요 ✈",
              holdMs: 3000,
            },
          ],
        },
      }),
    );
  };

  return (
    <>
      <div
        className={`esc-screen-fade${isScreenFading ? " active" : ""}`}
        aria-hidden="true"
      />
      <div
        className={`subtitle-container${
          subtitleVariant === "tent" ? " subtitle-container--tent" : ""
        }`}
        aria-live="polite"
      >
        <div
          className={`subtitle-box ${showSubtitle ? "visible" : ""} ${
            fadeOutSubtitle ? "fade-out" : ""
          }`}
        >
          {!hideSubtitleLabel ? (
            <div className="subtitle-label">{subtitleLabelText}</div>
          ) : null}
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
        onClick={() => {
          setIsNameModalOpen(false);
          unblockStage6Notifications("name-modal");
          window.dispatchEvent(
            new CustomEvent(STAGE6_INTERACTION_UNLOCK_EVENT),
          );
        }}
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
