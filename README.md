# Games Music Trivia

A local-intranet, Kahoot-style music trivia game built for a single shared host and up to 8 players.

## Features

- Single host-controlled live session with optional join-key enforcement (off by default).
- Up to 8 players with session-only nicknames.
- Shared-screen or player-device YouTube playback modes with masked audio-first playback by default.
- Ten-second answer windows with authoritative server timing and tenths-of-a-second scoring.
- Optional leaderboard after every question and final podium at the end of the game.
- Repository-backed JSON quiz packs with browser-based validation, upload, and AI-prompt authoring guidance.

## Project structure

- `server.js` — Node HTTP server, WebSocket synchronization, scoring, and JSON pack validation.
- `public/` — Static host, player, and pack editor UI.
- `data/packs/` — Repository-backed quiz packs.
- `docs/requirements-dialogue.md` — Captured requirements, considerations, and the source dialogue.

## Where the files are right now

In this development environment, the repository currently exists as a local Git working copy at:

```text
/workspace/games-music-trivia
```

That means the files exist locally in the checked-out repository here first. They are committed in Git history in this working copy, but they are **not automatically pushed to GitHub** unless a Git remote is configured and you explicitly push.

You can check whether your clone is connected to GitHub with:

```bash
git remote -v
```

If that command shows no remote entries, you still need to connect this repo to GitHub and push it.

## How to push this repo to GitHub

### Exact steps if you already have a GitHub repo

This repository's current branch in this environment is `work`. If you already have a GitHub repo and want this code there, run these commands from inside the repo:

```bash
git remote -v
git branch --show-current
```

If `origin` is not set yet:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
```

If `origin` already exists but points to the wrong repo:

```bash
git remote set-url origin <YOUR_GITHUB_REPO_URL>
```

Then push this branch to GitHub. If you want to keep the branch name as `work` on GitHub:

```bash
git push -u origin work
```

If you want this branch to become `main` on GitHub instead:

```bash
git push -u origin work:main
```

### Short version

If the GitHub repo already exists and you want the code on `main`, the shortest command sequence is:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin work:main
```

### If you have already set the remote before

You only need one of these, depending on the target branch:

```bash
git push -u origin work
```

or:

```bash
git push -u origin work:main
```

### If the GitHub repo does not exist yet

1. Create an empty repository on GitHub.
2. Copy its Git URL.
3. Run:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin work
```

After that, future updates are usually just:

```bash
git push
```

## Prerequisites

Install these tools on the machine that will host the game:

- `git`
- `node` 18 or newer
- `npm` (usually included with Node.js)

You can verify them with:

```bash
git --version
node --version
npm --version
```

## macOS setup if `node` / `npm` are missing

If `node --version` or `npm --version` prints `command not found` on your Mac, install Node.js first.

### Option A: install with Homebrew

First check whether Homebrew is already installed:

```bash
brew --version
```

If that command works, install Node.js with:

```bash
brew install node
```

Then close and reopen Terminal, or reload your shell:

```bash
exec zsh
```

Verify the install:

```bash
node --version
npm --version
```

### Option B: if Homebrew is not installed

Install Homebrew first:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install Node.js:

```bash
brew install node
exec zsh
node --version
npm --version
```

### Option C: use the official Node.js installer

If you prefer not to use Homebrew, download and run the macOS installer from Node.js, then reopen Terminal and verify:

```bash
node --version
npm --version
```

After Node.js is installed successfully, continue with the repository clone and startup steps below.

## Exact setup steps

### 1. Clone the repository onto the computer that will host the game

Replace `<YOUR_REPO_URL>` with your actual Git remote URL.

```bash
git clone <YOUR_REPO_URL>
cd games-music-trivia
```

If the folder name created by Git is different, `cd` into that folder instead.

### 2. Install the application

This V1 app does not currently require any third-party npm packages, so there is no dependency download step beyond having Node.js installed. If you want npm to generate a lockfile locally, you can still run:

```bash
npm install
```

That command should complete without adding runtime dependencies.

### 3. Confirm the code is valid before you start it

```bash
npm run check
```

This checks the server and browser JavaScript files for syntax issues.

### 4. Start the server

```bash
npm start
```

When it starts successfully, the app serves on:

```text
http://localhost:3000
```

### 5. Open the host screen on the computer running the server

Open this URL in a browser on the host machine:

```text
http://localhost:3000
```

Then:

1. Click **Host**.
2. Click **Become host**.
3. Choose the quiz pack.
4. Share the 6-digit session key with players.

### 6. Let phones on your intranet join

Players must open the host machine's intranet IP address, not `localhost`.

#### On macOS or Linux, find your local IP with:

```bash
hostname -I
```

If that does not work on macOS, use:

```bash
ipconfig getifaddr en0
```

#### On Windows PowerShell, use:

```powershell
ipconfig
```

Look for the IPv4 address on your active Wi-Fi or Ethernet adapter.

If your host machine's IP address is, for example, `192.168.1.25`, players should open:

```text
http://192.168.1.25:3000
```

Then each player should:

1. Open the URL on their phone.
2. Tap **Player**.
3. Enter the session key.
4. Enter a unique nickname.
5. Tap **Join as player**.

## Everyday run commands

After the repo is already cloned, the normal startup flow is:

```bash
cd games-music-trivia
npm run check
npm start
```

## Quiz pack workflow

- Put committed pack JSON files into `data/packs/`.
- Use the in-app **Pack editor** screen to inspect, validate, and export JSON.
- Repo JSON files remain the source of truth for live sessions.

## Validation

```bash
npm run check
```

## Notes

- V1 uses embedded YouTube playback with `start` and `end` clip offsets instead of locally extracting media.
- Because the app is designed for local intranet use, it currently runs over HTTP.
- The pack editor validates JSON and helps author packs, but committed JSON files remain the source of truth.


## Latest gameplay enhancements

- Admin can now leave join-key enforcement disabled by default and only turn it on when needed.
- Admin can limit a session to a random subset of questions using a max-question setting.
- Player UI is intended to switch into a cleaner joined-player lobby/game view after login.
- Pack JSON uses the root `title` as the playlist name, and questions can define `displayMode` values such as `audio_only` or `video_visible`.
- The pack editor is intended to support both pasted JSON and uploaded `.json` files, plus an AI prompt template for generating the final pack format directly.
