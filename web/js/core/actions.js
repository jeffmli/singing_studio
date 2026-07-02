// web/js/core/actions.js
// Initial state (serializable UI/domain only) + pure reducers. DOM nodes,
// MediaRecorder, streams, timers, and RAF handles are module-local, NOT here.
export const initialState = {
  step: "setup",
  activeTab: "original",
  warmupIndex: 0,
  micDeviceId: "",
  takeTempo: "Slow",
  playbackRate: 1,
  currentSongKind: "original",
  reflectRating: 0,
  lyricsHidden: false,
  sessionId: null,
  sessionStartedAt: 0,
  takesCount: 0,
  liveGuideReady: false,
  liveGuideRunning: false,
};

const set = (key) => (s, v) => ({ ...s, [key]: v });

export const reducers = {
  setStep: set("step"),
  setActiveTab: set("activeTab"),
  setWarmupIndex: set("warmupIndex"),
  setMicDeviceId: set("micDeviceId"),
  setTakeTempo: set("takeTempo"),
  setPlaybackRate: set("playbackRate"),
  setCurrentSongKind: set("currentSongKind"),
  setReflectRating: set("reflectRating"),
  setLyricsHidden: set("lyricsHidden"),
  setTakesCount: set("takesCount"),
  setLiveGuideReady: set("liveGuideReady"),
  setLiveGuideRunning: set("liveGuideRunning"),
  setSession: (s, { id, startedAt }) => ({ ...s, sessionId: id, sessionStartedAt: startedAt }),
};
