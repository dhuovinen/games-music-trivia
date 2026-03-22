# Music Trivia Game Requirements and Working Notes

## Revision notes after V1 feedback

The next iteration expands the original V1 requirements with these decisions:

- Join-key enforcement becomes an admin toggle and defaults to off.
- Players should see a cleaner, player-specific lobby/game interface after joining.
- Players may leave and rejoin the lobby, but not rename in-place.
- Admin can set a max-question count; if the selected pack is larger, the server should choose a unique random subset at game start while preserving original pack order.
- Pack JSON should document that the playlist name comes from the root `title` field.
- The pack editor should support pasted JSON and uploaded `.json` files, immediately validate imports, and include an AI prompt template that generates the final playable pack format directly.
- A Quick Pack Editor should allow question-by-question editing of `youtubeUrl` and answer choices, persist changes back to the same selected pack file, and mark edited questions with optional boolean `manualReview: true`.
- Audio-only masked playback becomes the default, and video hiding should support both question-level defaults and a host/session override.

## Why embedded YouTube is the V1 choice

The earlier option analysis compared three ways to handle YouTube-sourced content:

1. Embed and play the actual YouTube video in-browser.
2. Store YouTube URLs as source references with clip metadata.
3. Automatically extract and locally store 10-second clips.

For V1, embedded YouTube is the practical choice because automatic extraction and local storage of clips is more operationally heavy. It would require a separate ingestion/downloading pipeline, transcoding/storage, cache management, and a decision about the legal/operational model for storing copied media. By contrast, embedded playback only requires a link plus clip timing metadata.

## Confirmed requirements captured from the dialogue

### Core gameplay

- The game is Kahoot-style, designed for a local intranet.
- One host/admin controls the experience.
- Up to 8 players can join.
- Players use session-only nicknames.
- There is only one live game session at a time.
- Players join with a shared session key.
- No late joiners are allowed after the game starts.
- A lobby appears before the game starts.
- The host starts the game manually.
- The host can choose the quiz pack theme.
- The host can skip a question.
- The host can end the session early.

### Question and answer rules

- Every question is always four-option multiple choice.
- Question types are: `song`, `artist`, and `artist_song`.
- The combined format uses a single answer option such as `Queen — Bohemian Rhapsody`.
- A player only gets one answer attempt per question.
- Answers after the timer expires are rejected.
- Incorrect answers earn zero points.
- No bonus systems are needed in V1.

### Timing and scoring

- Each question runs for up to 10 seconds.
- The system should resynchronize all players at each question boundary.
- Tenths-of-a-second scoring is preferred.
- Example given in the dialogue: answering after 0.5 seconds should yield 950 points.
- V1 therefore uses a linear scoring model of `1000 - (tenths elapsed × 10)`, with the window locked after 10 seconds.

### Media behavior

- V1 should start with media on the host/shared screen while players answer on their own devices.
- A future-capable configuration option should also support media on each player's own device.
- Embedded YouTube should be used first.
- Clips should autoplay and play only once.
- Captions/subtitles should be off.
- Audio-only and video-style prompts should both be supported.
- The YouTube link plus metadata determines the clip mode.

### Quiz repository and content

- JSON files in the repo are the source of truth.
- Human-authored and AI-assisted generation should both be supported.
- Metadata should support theme, artist, decade, era, and genre.
- A question may include YouTube URL, start time, end time, prompt type, correct answer options, and mode metadata.
- Exactly three wrong answers should be explicitly stored.
- A validation tool/editor should help ensure generated JSON is appropriate.

### Display and leaderboard rules

- The leaderboard should be configurable so it can appear after every question or only at the end.
- The end of the game should show a podium for first, second, and third place.

### Deployment and platform

- HTTP on the intranet is acceptable for V1.
- The app should be usable from phones, especially iPhones, but also desktop browsers.

## Captured dialogue transcript

### Turn 1 — User

> Create a Kahoot style game which uses media (audio and video) to provide music trivia. It is designed to be played on a local intranet and support up to 8 players. It should be like name that tune where we source clips of audio or video from Youtube. Okay, so we want to create a Kahoot-like game that will be used by local players on an intranet. They will use their phones, typically iPhones, to play it, but they may use computers. And it's going to be a music trivia game. What we want is we want a repository of questions that can be sourced. The repository of questions will be links to a variety of YouTube videos on different themes or based upon different artists or eras. And effectively, within that, this list should be, or these questions and trivia should be able to be automatically generated and ingested as JSON, so we need to define format. And then the other audio or video clip will be played to the user. It will have up to 10 seconds of audio or video. And then, once the clip starts playing, the user will be able to have options to either name the artist, name the song, or name the artist and song. And what we want to do is we want to have one right answer and three other answers that are incorrect. So the user will be provided kind of a multi-select interface. It's going to have a timer. You can get up to 1,000 points for each question. The point value for each question diminishes by 100 for each second. So obviously, the max is 10 seconds, and so at 10 seconds, it will then kind of close the voting, and the scores will be tabulated, and it will present back whether the user got the answer correct or not. So that's kind of the general flow. Now, all users will have the same set of questions presented to them from a login standpoint. A user will need to uniquely identify, so effectively, they log in, they put in their name, and then they're going to get, or they'll put in kind of a key for each session. So the admin sends out a key, the user puts in a key, and then they connect to the server, and then they put in their name. You have to determine how the audio is going to be streamed, perhaps something like WebSockets, I don't know. And then there'll also be a leaderboard at the end to show kind of accumulated points. There should be an option. to show point scores like after every question, so your current points and totals, as well as everyone on the team. And then at the end, there's going to be a podium for first, second, and third, where the user's name will be displayed. So let me know what additional questions you have to begin to plan this game out.

### Turn 1 — Assistant

The assistant responded with a planning-oriented reply that:

- summarized the requested Kahoot-style multiplayer music trivia flow,
- recommended a host-controlled real-time web app,
- proposed WebSockets for synchronization,
- outlined the three YouTube handling options,
- asked a broad set of design questions covering host control, answers, scoring, media, repository design, session behavior, deployment, synchronization, and UX,
- recommended a V1 scope and a React/TypeScript plus Node/WebSocket technical direction,
- proposed an initial JSON pack shape.

### Turn 2 — User

> Okay, for the YouTube clipping, if we select option 3, how easy is that? Can I still kind of put in the link to the YouTube videos and then you're able to simply extract 10-second clips from them automatically and store that? Or is that going to be a heavy effort? I suggest we probably document all of these requirements as well as considerations in a markdown file. So do that, including kind of all these requirements and all of this feedback. Put this complete dialogue in a markdown file so that I can refer to it later. We will then look at, based upon your feedback and options for YouTube, we'll either go with option 3 or option 1. For the additional questions on game flow and host control, one, yes, there's always going to be a single host or admin. The host would choose the quiz pack theme as well as have the ability to skip a question or end the session early. The questions going into three of the questions should advance automatically, so there should be a timer and we need to re-sync kind of all of the players between questions. So I want them to, because there may be some slight differences in kind of how devices are configured, you know, when things start, there may be slight differences in playback and duration, but it should be really small. But we want to kind of have everybody start each question at the same time. For yes, let's show a lobby and then have the admin click start the game. We are not going to have late joiners. And for the answer format, six, for artists and song, yes, a combined answer would be like Queen, Bohemian Rhapsody, or Queen, Bicycle. Every question should always be multiple choice. I don't need true-false, type in, etc. Incorrect answers give zero points. And again, going back to six, There's questions that have three types of formats. One is song name. The second type of format is artist. And the third type of format is artist and song name. And let's see, 9. If a player answers after the timer expires, right, that should be rejected. If two players answer at the same second, let's go with kind of millisecond scoring that, yes, in going to 3, the scoring model, that looks correct, but rather than millisecond, let's go with like tenths of a second. So if a user answered when half a second had elapsed, then they would have had 950 points. Should faster wrong answers have any effect? Only correct answers earn points, and you only get to answer once. There will be, we're not going to have any bonus systems. And we don't need the host to configure max question time starting points again. It should be a loaded list of questions. And I think what we'd like is we'd like, here's a list of media and kind of the question type and right answer, and then through the ingestion process, generate three incorrect answers, and then put that into kind of the final format that gets served up to everyone. Let's see, media playback behavior, audio is fine for this, so 15. And 16, yes, every player should hear and see the clip on their own device. That should be a configuration option. The other option that I think would be interesting is the players hear the media or clips via shared host screen while they answer on their phone. So that should be a configuration option. And 17, I'm OK with the limitations. 18, the clip should start automatically and play only once. And the host can decide if the question is a video clip or audio clip. Actually, it would be... Effectively, the YouTube link would determine if it's a video clip or audio clip, or even if we're sampling the YouTube. And yes, there should not be sub-captions or there should not be sub-captions or subtitles or captions. For the question repository, you should be able to support human and AI-assisted generation. The source of truth would be kind of JSON files in a repo. I think the quiz content should have theme, artist, decade, era, and genre. We don't need difficulty. And the question may have the, yes, going to 24, YouTube URL, start time, end time, prompt type, correct answer. I don't know what distractors, explanation, fine fact, difficulty, or tags are. Oh, do we want the app to generate distractors automatically? No, we do. Okay, so we want three wrong answers to be explicitly stored. And 26, probably not applicable. And 27, yes, the tool should only generate appropriate JSON. So that gives you questions 1 through 5. Now I'm going to continue answering the next so please wait

### Turn 3 — User continuation

> Okay, coming back to the seven questions I would prioritize. First, let's play the clips from embedded YouTube. Let's make sure on question two, I want options for media on their own device or media via host or shared screen. I think what we'll do to start is just do media on the host shared screen with just the question options on the individual devices. So pause on media on their own device and we'll treat that as a future requirement. And I want kind of JSON files kind of only, but some type of mechanism to, well, display them, right, in, I guess, yeah, in a content editor. Yes, so we do want that. For the question, there should only be one session at a time, so only one game could be playing on five, HTTP is acceptable. Six, go to configuration and settings on whether the leaderboard should be shown after every question or simply at the end of the game. And seven, we don't need persistent player accounts, session-only nicknames is fine. So now that you have the seven prioritized questions, please build a version 1 based upon those requirements.

## Implementation notes for this repository

This repository's V1 implementation follows the confirmed requirements above and ships:

- a Node-based local server,
- a single-session in-memory host/player state model,
- a browser UI for host, players, and a JSON pack editor,
- repo-backed sample quiz content,
- validation rules for V1 pack structure.
