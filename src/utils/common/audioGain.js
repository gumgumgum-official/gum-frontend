/** @type {AudioContext | null} */
let sharedAudioContext = null;
/** @type {WeakMap<HTMLMediaElement, { context: AudioContext, gainNode: GainNode }>} */
const mediaGainMap = new WeakMap();

function getAudioContextCtor() {
  return window.AudioContext || window.webkitAudioContext || null;
}

function getSharedAudioContext() {
  if (sharedAudioContext) return sharedAudioContext;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  sharedAudioContext = new Ctor();
  return sharedAudioContext;
}

/**
 * HTMLMediaElement 볼륨(0~1) 한계를 넘겨야 할 때 Web Audio GainNode를 붙여 증폭한다.
 * @param {HTMLAudioElement} audio
 * @param {number} requestedVolume
 */
export function applyExtendedAudioVolume(audio, requestedVolume) {
  const v = Number(requestedVolume);
  const normalized = Number.isFinite(v) ? Math.max(0, v) : 1;
  audio.volume = Math.min(1, normalized);

  if (normalized <= 1) {
    const existing = mediaGainMap.get(audio);
    if (existing) existing.gainNode.gain.value = 1;
    return;
  }

  const context = getSharedAudioContext();
  if (!context) return;

  let entry = mediaGainMap.get(audio);
  if (!entry || entry.context !== context) {
    const source = context.createMediaElementSource(audio);
    const gainNode = context.createGain();
    source.connect(gainNode);
    gainNode.connect(context.destination);
    entry = { context, gainNode };
    mediaGainMap.set(audio, entry);
  }

  entry.gainNode.gain.value = normalized;
  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }
}
