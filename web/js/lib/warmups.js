export const WARMUP_LIBRARY = [
  {
    id: "lip-trills",
    title: "Lip Trills",
    type: "Range",
    note: "Gentle airflow and resonance",
    url: "https://www.youtube.com/watch?v=3eT2NoTYwNA",
  },
  {
    id: "sirens",
    title: "Vocal Sirens",
    type: "Glide",
    note: "Smooth low-to-high connection",
    url: "https://www.youtube.com/watch?v=ck1pzgy07ZU",
  },
  {
    id: "humming",
    title: "Humming Warm-up",
    type: "Resonance",
    note: "Easy onset before singing",
    url: "https://www.youtube.com/watch?v=Q5hS7eukUbQ",
  },
  {
    id: "five-tone",
    title: "Five-Tone Scale",
    type: "Scale",
    note: "Pitch center and vowel consistency",
    url: "https://www.youtube.com/watch?v=ZAx0UF_k2hM",
  },
  {
    id: "arpeggios",
    title: "Arpeggios",
    type: "Agility",
    note: "Light movement through registers",
    url: "https://www.youtube.com/watch?v=YCLyAmXtpfY",
  },
  {
    id: "breath",
    title: "Breath Control",
    type: "Support",
    note: "Steady exhale and control",
    url: "https://www.youtube.com/watch?v=WR2772TGrgo",
  },
];

export function warmupForUrl(url) {
  return WARMUP_LIBRARY.find((item) => item.url === url) || null;
}

export function warmupLabelForUrl(url) {
  return warmupForUrl(url)?.title || "Custom warm-up";
}
