# Changelog

# 3.1.1 (2026-08-01)

- Fix: mobile settings page cannot scroll vertically on Android WebView
- Chore: add Android client source code and ChatGPT Win branding
- Chore: update Windows installer branding to ChatGPT Win

# 3.1.0 (2026-07-31)

- Feat: Android native app (WebView + QR scan + background status polling + notifications)
- Feat: Windows single-file portable build mode
- Feat: Workspace settings page (mobile-accessible UI for project/environment/config)
- Feat: keep-awake API to prevent Windows sleep from mobile
- Feat: CDP-controlled Codex launcher (Chrome DevTools Protocol integration)
- Feat: mobile pull request list view
- Feat: plugin marketplace browsing from mobile
- Feat: scheduled tasks management UI
- Feat: context compression controls from mobile
- Feat: thread rename, archive, and compact actions from mobile
- Fix: cross-thread send now switches Codex thread before dispatching
- Fix: Windows service manager health check and auto-restart logic
- Fix: attachment paste settling timing on Windows (520ms)
- Fix: token validation via cookie, header, and query parameter
- Chore: rename project from "Codex Max" to "ChatGPT Win"
- Chore: migrate to Inno Setup 6 for Windows installer
- Chore: add mobile QA acceptance baseline doc
- Chore: update README with branded screenshots

# 3.0.6 (2026-06-06)

- Feat: CDP-controlled Codex launcher (initial implementation)
- Feat: cross-thread send support
- Feat: Windows MVP adaptation layer (src/platform/win32.js)
- Fix: highlight open-source vs packaged build distinction in README
- Chore: macOS support notice and community contribution guide

# 3.0.5 (2026-06-05)

- Feat: initial open-source local edition fork from Codex Mini
- Feat: core phone-to-Codex bridge (HTTP service + token auth)
- Feat: mobile thread list, send, status polling
- Feat: model switch and reasoning mode selection from mobile
- Feat: macOS wrapper app (upstream)
- Feat: QR code connection via Windows client
- Feat: session history view, file attachment support
- Chore: remove hosted access, payment, activation, and test-build distribution code
- Chore: keep core local bridge, thread list, send, status, model menu, and macOS wrapper
- Chore: initial open-source README and preview assets

## Android APK versions (dist/android/)

| Version | Notes |
|---------|-------|
| v1.0.0  | Debug build, Codex Max branding |
| v1.1.0  | ChatGPT Win branding, release build |
| v1.1.1  | Bug fixes |
| v1.2.0  | QR scan, manual connect, notification permission |
| v1.2.1  | Background polling improvements |
| v1.2.2  | Task notification channels |
| v1.2.3  | UI adjustments |
| v1.2.4  | Screen fit options |
| v1.2.5  | Monitor service refinements |
| v1.2.6  | Latest - stable release |

## Windows installer versions

| Version   | Notes |
|-----------|-------|
| v3.0.5-win | Codex Max branding, .NET 6 runtime |
| v3.1.0-win | ChatGPT Win branding, .NET 8 self-contained |
| v3.1.1-win | Current - latest installer |

## Known issues

- Android unit tests fail on some machines due to Gradle worker classpath issue (workaround: assembleDebug succeeds independently)
- macOS resource bundle in this repo tracks Windows; build on macOS requires Xcode + .NET 8 SDK
- No automatic update mechanism; upgrade by rebuilding or downloading from GitHub Releases
