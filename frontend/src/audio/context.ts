let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

/** Call from a click handler. Browsers keep an AudioContext suspended until the user has interacted. */
export function unlockAudio(): void {
  try {
    void getAudioContext().resume()
  } catch {
    /* no Web Audio: the player falls back to browser speech */
  }
}

// Chrome may start the context suspended; any click or key press later unlocks it.
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => unlockAudio(), { once: false, passive: true })
}

export function audioState(): AudioContextState | 'none' {
  try { return getAudioContext().state } catch { return 'none' }
}
