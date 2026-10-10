/**
 * Mutable audio levels (0 to 1) read every frame by the visuals.
 * Kept outside React state so 60 fps updates cause no re-renders.
 * The voice client writes real AnalyserNode levels here; the simulator fakes them.
 */
export const levelBus = { speaker: 0, mic: 0 }
