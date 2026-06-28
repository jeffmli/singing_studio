# Singing Practice App PRD

## Purpose
Create a single-screen practice-session app for self-guided singing practice. The app should guide the singer from warmups into song practice, keep the right YouTube videos and lyrics in one place, and let the singer record and review their own takes.

## Target User
A solo singer practicing independently who wants fewer context switches between YouTube, lyrics, instrumental tracks, and voice recordings.

## Core Workflow
1. The user configures a practice session with warmup YouTube links, a song title, the original song video, the instrumental video, an optional lyric video, and pasted lyrics.
2. The user presses Start Session.
3. The app opens the warmup section and embeds the selected warmup video.
4. The user marks warmups complete and moves to song practice.
5. The song-practice view shows embedded YouTube playback tabs and lyrics in the same UI.
6. The user starts recording their microphone while practicing with a selected video.
7. The user stops recording, reviews the take, adds a note, and can download the audio file.

## MVP Requirements
- Embed YouTube warmup videos inside the app.
- Support multiple warmup videos and step through them.
- Embed three song video modes: original, instrumental, and lyric video.
- Show editable lyrics next to the song video.
- Record microphone audio using the browser MediaRecorder API.
- Store recent takes locally in the browser using IndexedDB.
- Allow downloading each take as a WebM audio file.
- Persist session setup locally so the user can return later.
- Provide a responsive layout for desktop and mobile.

## Non-Goals For MVP
- Automatic pitch detection.
- AI vocal feedback.
- Cloud accounts or sync.
- Background recording while the browser tab is closed.
- Silent file-system writes without user action.

## Key Constraints
- YouTube embedding depends on the video owner allowing embeds.
- Microphone recording requires a secure browser context: localhost or HTTPS.
- Browser security requires the user to choose when to download a recording.

## Success Criteria
- A singer can complete a full practice session without leaving the UI.
- The configured session survives a refresh.
- A recorded take can be played back and downloaded.
- Playwright verifies the page loads, session setup works, tabs switch, and recording controls are present.
