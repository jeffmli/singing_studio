// Pure helpers for microphone selection — no DOM, no getUserMedia.

// Audio capture constraints tuned for SINGING, not phone calls. Chrome enables
// echoCancellation / noiseSuppression / autoGainControl by default; those are
// tuned for speech and badly mangle sustained musical tones (AGC pumping the
// level, the noise gate swallowing soft/held notes). We turn them all off and
// pin a single channel. deviceId, when given, selects a specific mic.
export function micAudioConstraints(deviceId) {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return { audio, video: false };
}

// Build the option list for the mic <select> from enumerateDevices() output.
// Always leads with a "Default" entry (value ""). Unlabeled inputs (labels are
// blank until permission is granted) get a stable "Microphone N" fallback. The
// entry matching selectedId is marked selected; if none match, Default is.
export function micOptions(devices, selectedId) {
  const inputs = (devices || []).filter((d) => d.kind === "audioinput");
  const options = [{ value: "", label: "Default mic", selected: false }];
  inputs.forEach((d, i) => {
    options.push({
      value: d.deviceId,
      label: d.label && d.label.trim() ? d.label : `Microphone ${i + 1}`,
      selected: false,
    });
  });
  const match = options.find((o) => o.value && o.value === selectedId);
  (match || options[0]).selected = true;
  return options;
}
