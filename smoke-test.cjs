/**
 * Smoke test for Singing Practice Studio.
 *
 * Drives the real app in a headless browser and asserts every button works:
 * search auto-fill, save setup, start session, warmup nav, stepper, source
 * tabs, record/stop (with a fake microphone), takes drawer, finish & reflect,
 * and the history panel.
 *
 * Run the server first:  python3 server.py
 * Then:                  npm test   (or: node smoke-test.cjs)
 */

const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:4173/";

let pass = 0;
let fail = 0;
const failed = [];

function check(name, cond) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    failed.push(name);
    console.log("  ✗ " + name);
  }
}

const MOCK_SEARCH = {
  query: "test song",
  title: "Test Artist – Test Song",
  original: { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "orig" },
  instrumental: { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "inst" },
  lyricVideo: { url: "https://www.youtube.com/watch?v=ccccccccccc", title: "lyr" },
  lyrics: "la la la\nsecond line\nthird line",
};

const MOCK_ANALYSIS = {
  score: 82,
  inTunePct: 82.1,
  inTuneCents: 35,
  medianCents: 18,
  meanSignedCents: -9.4,
  tendency: "your pitch centering is solid",
  frames: 64,
  times: [0, 0.5, 1, 1.5, 2, 2.5],
  refMidi: [60, 62, 64, 65, 67, 69],
  userMidi: [60.1, 61.8, 64.6, 64.7, 67.2, 68.4],
  centsErr: [10, -20, 60, -30, 20, -60],
};

const MOCK_REFERENCE = {
  videoId: "aaaaaaaaaaa",
  times: Array.from({ length: 40 }, (_, i) => i * 0.25),
  midi: Array.from({ length: 40 }, (_, i) => 60 + (i % 8) * 0.35),
};

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({ permissions: ["microphone"] });

  // Mock the search backend so the test is fast and offline.
  await context.route("**/api/search**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_SEARCH) })
  );
  // Mock the embed-fallback endpoint with a known replacement video.
  await context.route("**/api/alt**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ result: { id: "zzzzzzzzzzz", url: "https://www.youtube.com/watch?v=zzzzzzzzzzz", title: "fallback take" } }),
    })
  );
  await context.route(/\/api\/analyze(?:\?|$)/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_ANALYSIS) })
  );
  await context.route(/\/api\/reference(?:\?|$)/, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(MOCK_REFERENCE) })
  );
  // Don't actually load YouTube (iframes or the player API).
  await context.route(/^https:\/\/([^/]+\.)?youtube\.com\//, (route) => route.abort());

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // Wait until a predicate is true (handles async UI handlers); returns bool.
  const waitTrue = async (fn, timeout = 10000) => {
    try {
      await page.waitForFunction(fn, { timeout });
      return true;
    } catch {
      return false;
    }
  };

  console.log("\nSinging Studio smoke test — " + BASE + "\n");

  // Fresh state.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((res) => {
      const req = indexedDB.deleteDatabase("singing-practice-recordings");
      req.onsuccess = req.onerror = req.onblocked = () => res();
    });
  });
  await page.goto(BASE, { waitUntil: "networkidle" });

  // --- Load & Setup ---
  console.log("Load & Setup");
  check("page title is correct", (await page.title()) === "Singing Practice Studio");
  check("setup stage is active on load", await page.isVisible("#stageSetup.active"));
  check("search bar present", await page.isVisible("#songSearch"));
  check("manual fields collapsed by default", !(await page.evaluate(() => document.getElementById("manualSetup").classList.contains("open"))));

  // --- Search auto-fill ---
  console.log("Search auto-fill");
  await page.fill("#songSearch", "test song");
  await page.click("#searchBtn");
  await page.waitForFunction(() => document.getElementById("searchStatus").classList.contains("ok"), { timeout: 15000 });
  check("song title filled from search", (await page.inputValue("#songTitle")).includes("Test Song"));
  check("original url filled", (await page.inputValue("#originalUrl")).includes("aaaaaaaaaaa"));
  check("instrumental url filled", (await page.inputValue("#instrumentalUrl")).includes("bbbbbbbbbbb"));
  check("lyric video url filled", (await page.inputValue("#lyricVideoUrl")).includes("ccccccccccc"));
  check("lyrics filled", (await page.inputValue("#lyricsInput")).includes("la la la"));
  check("manual fields auto-expand after search", await page.evaluate(() => document.getElementById("manualSetup").classList.contains("open")));

  // --- Manual section toggle ---
  console.log("Manual section toggle");
  await page.click("#manualToggle");
  check("manual section collapses on toggle", await waitTrue(() => !document.getElementById("manualSetup").classList.contains("open")));
  await page.click("#manualToggle");
  check("manual section expands on toggle", await waitTrue(() => document.getElementById("manualSetup").classList.contains("open")));

  // --- Save setup ---
  console.log("Save Setup");
  await page.click("#saveSetup");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("singing-practice-setup-v1") || "{}"));
  check("setup persisted to localStorage", persisted.songTitle && persisted.songTitle.includes("Test Song"));

  // --- Start session -> warmups ---
  console.log("Start Session → Warmups");
  await page.fill("#warmupLinks", "https://www.youtube.com/watch?v=ddddddddddd\nhttps://www.youtube.com/watch?v=eeeeeeeeeee");
  await page.click("#startSession");
  check("warmups stage active after start", await page.isVisible("#stageWarmups.active"));
  check("warmup dots match link count", (await page.locator("#warmupDots .wd").count()) === 2);
  check("prev disabled at first warmup", await page.isDisabled("#prevWarmup"));
  await page.click("#nextWarmup");
  check("prev enabled after next", !(await page.isDisabled("#prevWarmup")));

  // --- Finish warmups -> sing ---
  console.log("Warmups → Sing");
  await page.click("#finishWarmups");
  check("sing stage active", await page.isVisible("#stageSong.active"));
  check("transport bar visible on sing", await page.isVisible("#transportBar"));
  check("finish & reflect button visible on sing", await page.isVisible("#endSessionBtn"));
  check("practice drill controls visible", await page.isVisible("#phraseFocus"));
  check("live pitch guide is collapsed by default", await page.isVisible(".live-guide summary") && !(await page.isVisible("#prepareGuide")));
  check("playback pace controls visible", await page.isVisible("#pacePills"));
  check("lyric overlay visible", await page.isVisible("#lyricOverlay"));
  check("lyric overlay shows full lyrics", (await page.textContent("#overlayBody")).includes("la la la") && (await page.textContent("#overlayBody")).includes("second line"));
  await page.click('[data-rate="0.75"]');
  check("75 percent pace selected", await page.evaluate(() => document.querySelector('[data-rate="0.75"]').classList.contains("active")));
  await page.click("#lyricToggle");
  check("lyric overlay collapses", await page.evaluate(() => document.getElementById("lyricOverlay").classList.contains("off")));
  await page.click("#lyricToggle");
  check("lyric overlay shows again", await page.isVisible("#lyricOverlay"));

  // --- Source tabs ---
  console.log("Source tabs");
  await page.click('[data-tab="lyrics"]');
  check("lyrics pane shows on Lyrics tab", await page.isVisible("#lyricsPane"));
  check("video pane hidden on Lyrics tab", !(await page.isVisible("#videoPane")));
  await page.click('[data-tab="original"]');
  check("video pane shows on Original tab", await page.isVisible("#videoPane"));

  // --- Live pitch guide ---
  console.log("Live pitch guide");
  await page.click(".live-guide summary");
  check("live guide controls reveal on open", await page.isVisible("#prepareGuide"));
  await page.click("#prepareGuide");
  check("live guide prepares reference", await waitTrue(() => !document.getElementById("startGuide").disabled));
  await page.click("#refreshGuide");
  check("live guide can resync", await waitTrue(() => document.getElementById("guideStatus").textContent.includes("resynced")));
  await page.click("#startGuide");
  check("live guide starts microphone loop", await waitTrue(() => document.getElementById("stopGuide").disabled === false));
  check("live guide chart visible", await page.isVisible("#livePitchChart"));
  await page.click("#stopGuide");
  check("live guide stops", await waitTrue(() => document.getElementById("stopGuide").disabled === true));

  // --- Video embed fallback ---
  console.log("Video embed fallback");
  await page.click('[data-tab="instrumental"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__studioTest.forceSongError());
  check("instrumental swaps to a working video after embed error",
    await waitTrue(() => document.getElementById("instrumentalUrl").value.includes("zzzzzzzzzzz")));
  await page.click('[data-tab="original"]');

  // --- Stepper navigation ---
  console.log("Stepper navigation");
  await page.click('.step[data-step="setup"]');
  check("stepper jumps to setup", await page.isVisible("#stageSetup.active"));
  await page.click('.step[data-step="song"]');
  check("stepper jumps to sing", await page.isVisible("#stageSong.active"));

  // --- Record / Stop ---
  console.log("Record / Stop (fake mic)");
  await page.fill("#phraseFocus", "verse 1 line 2");
  await page.click('[data-tempo="Medium"]');
  await page.click("#recordBtn");
  check("recording state active", await waitTrue(() => document.getElementById("transportBar").classList.contains("recording")));
  await page.waitForTimeout(1200);
  await page.click("#stopBtn");
  await page.waitForFunction(() => document.getElementById("takesCount").textContent !== "0", { timeout: 15000 });
  check("a take was recorded (badge > 0)", (await page.textContent("#takesCount")) !== "0");

  // --- Takes drawer ---
  console.log("Takes drawer");
  await page.click("#takesToggle");
  check("takes drawer opens", await page.evaluate(() => document.body.classList.contains("takes-open")));
  check("recorded take listed in drawer", (await page.locator("#takesList .take").count()) >= 1);
  const takeText = await page.textContent("#takesList .take");
  check("take shows phrase and tempo", takeText.includes("verse 1 line 2") && takeText.includes("Medium"));
  await page.click("#takesList .analyze-btn");
  check("pitch analysis modal opens", await waitTrue(() => document.body.classList.contains("analyze-open")));
  check("pitch analysis score renders", await waitTrue(() => document.querySelector("#analyzeBody").textContent.includes("82")));
  check("pitch analysis chart renders", await page.isVisible("#analyzeChart"));
  await page.click("#analyzeClose");
  check("pitch analysis modal closes", await waitTrue(() => !document.body.classList.contains("analyze-open")));
  check("takes drawer closes behind analysis", await page.evaluate(() => !document.body.classList.contains("takes-open")));

  // --- Finish & reflect ---
  console.log("Finish & reflect");
  await page.click("#endSessionBtn");
  check("reflection modal opens", await waitTrue(() => document.body.classList.contains("reflect-open")));
  await page.click('#reflectStars .star[data-rating="4"]');
  check("4 stars lit", (await page.locator("#reflectStars .star.lit").count()) === 4);
  await page.fill("#reflectWins", "breath control felt steady");
  await page.fill("#reflectFocus", "the high note in the chorus");
  await page.click("#reflectSave");
  check("reflection modal closes after save", await waitTrue(() => !document.body.classList.contains("reflect-open")));
  check("takes badge resets for new session", await waitTrue(() => document.getElementById("takesCount").textContent === "0"));

  // --- History ---
  console.log("History panel");
  await page.click("#historyBtn");
  check("history panel opens", await waitTrue(() => document.body.classList.contains("history-open")));
  await page.waitForSelector("#historyList .session-card", { timeout: 10000 }).catch(() => {});
  check("saved session appears in history", (await page.locator("#historyList .session-card").count()) >= 1);
  const cardText = await page.textContent("#historyList .session-card");
  check("session shows reflection note", cardText.includes("breath control felt steady"));
  await page.click("#closeHistory");
  check("history panel closes", await page.evaluate(() => !document.body.classList.contains("history-open")));

  // --- Edit setup gear ---
  console.log("Edit Setup gear");
  await page.click("#editSetup");
  check("gear returns to setup", await page.isVisible("#stageSetup.active"));

  // --- No JS errors ---
  console.log("Runtime");
  check("no uncaught JS errors", pageErrors.length === 0);
  if (pageErrors.length) console.log("    errors: " + pageErrors.join(" ; "));

  await browser.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("FAILED: " + failed.join(", "));
    process.exit(1);
  }
  console.log("All checks passed ✓");
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(1);
});
