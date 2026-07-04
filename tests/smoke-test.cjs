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

  // --- Load & Home ---
  console.log("Load & Home");
  check("page title is correct", (await page.title()) === "Singing Practice Studio");
  check("home stage is active on load", await page.isVisible("#stageHome.active"));
  check("empty home invites first session", (await page.textContent("#homeSessionList")).includes("No sessions yet"));
  await page.click("#homeStartBottom");
  check("start new session opens setup", await page.isVisible("#stageSetup.active"));
  check("setup page is pick-a-song copy", (await page.textContent("#stageSetup .stage-title")).includes("Pick your song"));
  check("session timer visible", await page.isVisible("#sessionTimer"));
  check("session timer starts at zero", (await page.textContent("#sessionTimer")).includes("Session 0:00"));
  check("recent songs hidden when library empty", !(await page.isVisible("#recentSongs")));
  check("search bar present", await page.isVisible("#songSearch"));
  check("manual fields collapsed by default", !(await page.evaluate(() => document.getElementById("manualSetup").classList.contains("open"))));
  check("warmup picker visible in start flow", await page.isVisible("#warmupPicker"));
  check("default warmups visible before manual details", (await page.locator("#warmupQueue [data-warmup-url]").count()) === 2);
  check("custom warmup paste visible in start flow", await page.isVisible("#warmupCustomUrl"));

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
  check("warmup picker dropdown visible", await page.isVisible("#warmupLibrarySelect"));
  check("warmup picker dropdown has library options", (await page.locator("#warmupLibrarySelect option[value]").count()) >= 6);
  check("fallback warmup queue visible", (await page.locator("#warmupQueue [data-warmup-url]").count()) === 2);
  const dropdownWarmupUrl = await page.locator("#warmupLibrarySelect option:not([disabled])").nth(1).getAttribute("value");
  await page.selectOption("#warmupLibrarySelect", dropdownWarmupUrl);
  check("warmup dropdown appends selected item", (await page.locator("#warmupQueue [data-warmup-url]").count()) === 3);

  // --- Manual section toggle ---
  console.log("Manual section toggle");
  await page.click("#manualToggle");
  check("manual section collapses on toggle", await waitTrue(() => !document.getElementById("manualSetup").classList.contains("open")));
  await page.click("#manualToggle");
  check("manual section expands on toggle", await waitTrue(() => document.getElementById("manualSetup").classList.contains("open")));

  // --- Start session (save + warmups) ---
  console.log("Start session (save + warmups)");
  await page.fill("#practiceGoal", "Record a clean chorus take");
  await page.fill("#warmupCustomUrl", "https://www.youtube.com/watch?v=ddddddddddd");
  await page.click("#warmupCustomAdd");
  check("custom warmup appears in queue", (await page.locator('#warmupQueue [data-warmup-url="https://www.youtube.com/watch?v=ddddddddddd"]').count()) === 1);
  await page.click("#startSession");
  check("warmups stage active after start", await page.isVisible("#stageWarmups.active"));
  check("session timer remains visible during session", await page.isVisible("#sessionTimer"));
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("singing-practice-setup-v1") || "{}"));
  check("setup persisted on start", Boolean(persisted.songTitle && persisted.songTitle.includes("Test Song")));
  check("practice goal persisted on start", persisted.practiceGoal === "Record a clean chorus take");
  check("warmup picker persisted queue", persisted.warmups.length === 4 && persisted.warmups.includes("https://www.youtube.com/watch?v=ddddddddddd"));
  const library = await page.evaluate(() => JSON.parse(localStorage.getItem("singing-song-library-v1") || "[]"));
  check("song saved to library on start", library.length === 1 && library[0].songTitle.includes("Test Song"));
  check("song library saves practice goal", library[0].practiceGoal === "Record a clean chorus take");
  check("warmup dots match link count", (await page.locator("#warmupDots .wd").count()) === 4);
  check("piano practice is available during warmups", await page.isVisible("#stageWarmups .piano-practice summary"));
  await page.click("#stageWarmups .piano-practice summary");
  check("piano keys render during warmups", (await page.locator("#pianoKeys [data-midi]").count()) === 49);
  await page.click('#pianoKeys [data-midi="60"]');
  check("piano note click updates active note during warmups", (await page.textContent("#pianoActiveNote")) === "C4");
  await page.click("#pianoStartMatch");
  check("piano match starts during warmups", await waitTrue(() => document.getElementById("pianoStopMatch").disabled === false));
  await page.click("#pianoStopMatch");
  check("piano match stops during warmups", await waitTrue(() => document.getElementById("pianoStopMatch").disabled === true));
  check("prev disabled at first warmup", await page.isDisabled("#prevWarmup"));
  await page.click("#nextWarmup");
  check("prev enabled after next", !(await page.isDisabled("#prevWarmup")));

  // --- Finish warmups -> sing ---
  console.log("Warmups → Sing");
  await page.click("#finishWarmups");
  check("sing stage active", await page.isVisible("#stageSong.active"));
  check("transport bar visible on sing", await page.isVisible("#transportBar"));
  check("finish & reflect button visible on sing", await page.isVisible("#endSessionBtn"));
  check("phrase focus removed", (await page.locator("#phraseFocus").count()) === 0);
  check("playback pace controls removed", (await page.locator("#pacePills").count()) === 0);
  check("take label controls removed", (await page.locator("#tempoPills").count()) === 0);
  check("lyric overlay removed from video pane", (await page.locator("#lyricOverlay").count()) === 0);
  check("source tabs remain", (await page.locator('[data-tab="original"], [data-tab="instrumental"], [data-tab="lyricVideo"], [data-tab="lyrics"]').count()) === 4);
  check("piano practice moved out of sing", (await page.locator("#stageSong .piano-practice").count()) === 0);
  check("live pitch guide is collapsed by default", await page.isVisible(".live-guide summary") && !(await page.isVisible("#prepareGuide")));

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
  check("new take omits removed metadata", !takeText.includes("verse 1 line 2") && !takeText.includes("Medium"));
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
  check("finish and reflect returns home", await waitTrue(() => document.getElementById("stageHome").classList.contains("active")));
  check("takes badge resets for new session", await waitTrue(() => document.getElementById("takesCount").textContent === "0"));

  // --- Home history ---
  console.log("Home history");
  await page.waitForSelector("#homeSessionList .session-card", { timeout: 10000 });
  check("saved session appears on home", (await page.locator("#homeSessionList .session-card").count()) >= 1);
  const homeCardText = await page.textContent("#homeSessionList .session-card");
  check("home session shows reflection note", homeCardText.includes("breath control felt steady"));
  check("home session shows practice goal", homeCardText.includes("Record a clean chorus take"));
  check("home session shows logged duration", /\d+:\d{2}/.test(homeCardText));
  await page.click("#homeSessionList .session-card summary");
  check("home expanded session shows recording", await waitTrue(() => document.querySelectorAll("#homeSessionList .take").length >= 1));
  check("bottom start is available", await page.isVisible("#homeStartBottom"));

  // --- Recent songs on setup ---
  console.log("Recent songs");
  await page.click('.step[data-step="setup"]');
  check("recent songs visible after a session", await page.isVisible("#recentSongs"));
  await page.evaluate(() => { document.getElementById("songTitle").value = ""; });
  await page.click("#recentSongList .recent-song");
  check("recent song click refills setup", (await page.inputValue("#songTitle")).includes("Test Song"));
  check("recent song click refills original url", (await page.inputValue("#originalUrl")).length > 0);
  check("recent song click refills custom goal", (await page.inputValue("#practiceGoal")) === "Record a clean chorus take");
  check("recent song stays highlighted", await page.locator("#recentSongList .recent-song.active").count() === 1);

  // --- History ---
  console.log("History panel");
  await page.click("#historyBtn");
  check("history panel opens", await waitTrue(() => document.body.classList.contains("history-open")));
  await page.waitForSelector("#historyList .session-card", { timeout: 10000 }).catch(() => {});
  check("saved session appears in history", (await page.locator("#historyList .session-card").count()) >= 1);
  const cardText = await page.textContent("#historyList .session-card");
  check("session shows reflection note", cardText.includes("breath control felt steady"));
  check("session shows practice goal", cardText.includes("Record a clean chorus take"));
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
