const app = document.getElementById('app');
const state = {
  view: 'welcome',
  socket: null,
  server: null,
  error: '',
  toast: '',
  hostName: 'Host',
  playerName: '',
  sessionKeyInput: '',
  editorText: '',
  validation: null,
  selectedUploadName: ''
};

const AI_PROMPT_TEMPLATE = `Generate a valid music-trivia quiz pack as strict JSON only. Do not include markdown fences or commentary.

Requirements:
- Root fields required: packId, title, description, theme, artistFocus, decade, era, genre, questions.
- The root title is the playlist/pack display name shown in the app.
- questions must be an array.
- Every question must include: id, type, prompt, youtubeUrl, startSeconds, endSeconds, options, correctIndex.
- type must be one of: artist, song, artist_song.
- options must contain exactly 4 answer strings.
- correctIndex must be 0, 1, 2, or 3.
- Clip duration must not exceed 10 seconds.
- displayMode can be audio_only or video_visible. Default preferred value is audio_only.
- mediaMode can be audio or video.
- Include three incorrect answers and one correct answer for each question.

Create a pack for: {{REQUEST}}
Use a fun but concise description and ensure all ids are unique.`;

function connectSocket() {
  if (state.socket) return;
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'state') {
      state.server = message.payload;
      if (!state.editorText && message.payload.packs[0]) {
        await loadPackIntoEditor(message.payload.packs[0].packId);
      }
      render();
    }
    if (message.type === 'error') {
      state.error = message.payload.message;
      render();
    }
  });
  socket.addEventListener('close', () => {
    state.socket = null;
    state.error = 'Connection closed. Refresh to reconnect.';
    render();
  });
  state.socket = socket;
}

function send(type, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify({ type, ...payload }));
}

async function loadPackIntoEditor(packId) {
  const response = await fetch(`/api/packs/${encodeURIComponent(packId)}`);
  const data = await response.json();
  state.editorText = JSON.stringify(data.pack, null, 2);
  state.selectedUploadName = `${data.pack.title || packId}.json`;
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatScore(score) {
  return `${Math.round(score)} pts`;
}

function currentTimerText(question) {
  if (!question) return '10.0';
  const elapsed = Math.max(0, Date.now() - question.startedAt);
  const remaining = Math.max(0, question.durationMs - elapsed);
  return (remaining / 1000).toFixed(1);
}

function youtubeEmbedUrl(media) {
  if (!media) return '';
  const url = new URL(media.youtubeUrl);
  const videoId = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    start: String(media.startSeconds),
    end: String(media.endSeconds),
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    cc_load_policy: '0'
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

function maskedMediaFrame(questionNumber, media) {
  return `
    <div class="masked-media-frame">
      <div class="masked-media-label">Question ${questionNumber}</div>
      <div class="masked-media-subtitle">Audio-only masked playback</div>
      <div class="hidden-media-player" aria-hidden="true">
        <iframe
          src="${youtubeEmbedUrl(media)}"
          title="Hidden trivia audio"
          allow="autoplay; encrypted-media"
          referrerpolicy="strict-origin-when-cross-origin"
          tabindex="-1">
        </iframe>
      </div>
    </div>
  `;
}

function visibleMediaFrame(media) {
  return `
    <div class="media-frame ${media.mediaMode === 'audio' ? 'audio-mode' : ''}">
      <iframe
        src="${youtubeEmbedUrl(media)}"
        title="Music trivia media"
        allow="autoplay; encrypted-media"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen>
      </iframe>
    </div>
  `;
}

function questionMedia(server, question) {
  if (!question.media) {
    return '<div class="host-note">Media is currently playing on the shared host screen.</div>';
  }
  if (question.media.displayMode === 'audio_only') {
    return maskedMediaFrame(server.currentQuestionIndex + 1, question.media);
  }
  return visibleMediaFrame(question.media);
}

function questionCard(server, isHost) {
  const question = server.question;
  if (!question) return '<p class="muted">Waiting for the host to start.</p>';
  const timer = currentTimerText(question);
  const options = question.options.map((option, index) => {
    const disabled = question.answeredIndex !== null || question.locked || isHost;
    const selected = question.answeredIndex === index ? ' selected' : '';
    const onClick = disabled ? '' : `onclick="answerQuestion(${index})"`;
    return `<button class="answer-button${selected}" ${onClick}>${index + 1}. ${escapeHtml(option)}</button>`;
  }).join('');
  return `
    <section class="panel question-panel">
      <div class="question-head">
        <div>
          <span class="badge">Question ${server.currentQuestionIndex + 1} / ${server.totalQuestions}</span>
          <h2>${escapeHtml(question.prompt)}</h2>
          <p class="muted">Type: ${escapeHtml(question.type.replace('_', ' + '))}</p>
        </div>
        <div class="timer">${timer}s</div>
      </div>
      ${questionMedia(server, question)}
      <div class="answers-grid">${options}</div>
    </section>
  `;
}

function revealCard(server) {
  const reveal = server.reveal;
  if (!reveal) return '';
  const topThree = (reveal.rankings || []).slice(0, 3);
  return `
    <section class="panel">
      <h2>${reveal.final ? 'Final podium' : 'Round results'}</h2>
      ${reveal.final ? '<p class="muted">Top players for this session.</p>' : `<p class="muted">Correct answer: <strong>${escapeHtml(reveal.correctAnswer)}</strong>${reveal.skipped ? ' (question skipped)' : ''}</p>`}
      <div class="podium-row">
        ${topThree.map((entry, index) => `<div class="podium podium-${index + 1}"><span>#${index + 1}</span><strong>${escapeHtml(entry.name)}</strong><em>${formatScore(entry.totalScore)}</em></div>`).join('') || '<p class="muted">No rankings yet.</p>'}
      </div>
      <ol class="ranking-list">
        ${(reveal.rankings || []).map((entry) => `<li><span>${escapeHtml(entry.name)}</span><strong>${formatScore(entry.totalScore)}</strong></li>`).join('')}
      </ol>
    </section>
  `;
}

function lobbyPlayers(server) {
  return `
    <ul class="player-list">
      ${server.players.map((player) => `<li><span>${escapeHtml(player.name)}</span><strong>${formatScore(player.score)}</strong></li>`).join('') || '<li class="muted">No players joined yet.</li>'}
    </ul>
  `;
}

function hostView() {
  const server = state.server;
  if (!server) return loading();
  const selectedPack = server.selectedPack;
  const effectiveQuestionCount = server.totalQuestions || (selectedPack ? selectedPack.questionCount : 0);
  return `
    <div class="layout">
      <section class="sidebar panel">
        <h1>Host console</h1>
        <p class="muted">${server.settings.requireJoinKey ? `Share session key <strong>${server.sessionKey}</strong> with up to 8 players.` : 'Join key is disabled. Players can enter the lobby with only a unique nickname.'}</p>
        <label>Host name<input value="${escapeHtml(state.hostName)}" oninput="state.hostName=this.value"></label>
        <button onclick="joinHost()">Become host</button>
        <label>Quiz pack
          <select onchange="setPack(this.value)">
            ${server.packs.map((pack) => `<option value="${pack.packId}" ${selectedPack && selectedPack.packId === pack.packId ? 'selected' : ''}>${escapeHtml(pack.title)}</option>`).join('')}
          </select>
        </label>
        <div class="toggle-group">
          <label><input type="radio" name="playback" ${server.settings.playbackMode === 'host_shared' ? 'checked' : ''} onchange="updateSetting('playbackMode', 'host_shared')"> Shared host media</label>
          <label><input type="radio" name="playback" ${server.settings.playbackMode === 'player_device' ? 'checked' : ''} onchange="updateSetting('playbackMode', 'player_device')"> Player device media</label>
          <label><input type="checkbox" ${server.settings.showLeaderboardAfterEach ? 'checked' : ''} onchange="updateSetting('showLeaderboardAfterEach', this.checked)"> Show leaderboard after every question</label>
          <label><input type="checkbox" ${server.settings.requireJoinKey ? 'checked' : ''} onchange="updateSetting('requireJoinKey', this.checked)"> Require join key</label>
          <label>Max questions
            <input type="number" min="1" max="99" value="${server.settings.maxQuestions || ''}" placeholder="Use full pack" oninput="updateSetting('maxQuestions', this.value)">
          </label>
          <label>Video display override
            <select onchange="updateSetting('videoDisplayOverride', this.value)">
              <option value="default" ${server.settings.videoDisplayOverride === 'default' ? 'selected' : ''}>Use question defaults</option>
              <option value="hide_video" ${server.settings.videoDisplayOverride === 'hide_video' ? 'selected' : ''}>Force masked audio-only</option>
              <option value="show_video" ${server.settings.videoDisplayOverride === 'show_video' ? 'selected' : ''}>Force visible video when possible</option>
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="primary" onclick="startGame()" ${server.role !== 'host' || server.status !== 'lobby' || !server.players.length ? 'disabled' : ''}>Start game</button>
          <button onclick="skipQuestion()" ${server.role !== 'host' || server.status !== 'question' ? 'disabled' : ''}>Skip question</button>
          <button onclick="endSession()" ${server.role !== 'host' ? 'disabled' : ''}>End session</button>
          <button onclick="resetLobby()" ${server.role !== 'host' ? 'disabled' : ''}>Reset lobby</button>
        </div>
        <hr>
        <h3>Lobby</h3>
        ${lobbyPlayers(server)}
      </section>
      <main class="main-stage">
        <section class="panel intro-panel">
          <span class="badge">${escapeHtml(server.status)}</span>
          <h2>${selectedPack ? escapeHtml(selectedPack.title) : 'No pack selected'}</h2>
          <p>${selectedPack ? escapeHtml(selectedPack.description) : 'Load a pack from the repository to begin.'}</p>
          ${selectedPack ? `<p class="muted">Theme: ${escapeHtml(selectedPack.theme)} · Artist: ${escapeHtml(selectedPack.artistFocus)} · ${escapeHtml(selectedPack.decade)} · ${escapeHtml(selectedPack.genre)}</p>` : ''}
          ${selectedPack ? `<p class="muted">Pack questions: ${selectedPack.questionCount} · Planned session questions: ${effectiveQuestionCount}</p>` : ''}
        </section>
        ${server.status === 'question' ? questionCard(server, true) : ''}
        ${(server.status === 'reveal' || server.status === 'finished') ? revealCard(server) : ''}
        ${server.status === 'lobby' ? '<section class="panel"><h2>Ready check</h2><p class="muted">The host controls the only active session. Players join from their phones and will be cleaned into a dedicated lobby/player view once they join.</p></section>' : ''}
      </main>
    </div>
  `;
}

function playerJoinPanel(server) {
  return `
    <section class="panel">
      <h1>Join game</h1>
      <p class="muted">${server.settings.requireJoinKey ? 'Enter the session key and your nickname.' : 'Enter a unique nickname to join the lobby.'}</p>
      ${server.settings.requireJoinKey ? `<label>Session key<input value="${escapeHtml(state.sessionKeyInput)}" oninput="state.sessionKeyInput=this.value"></label>` : ''}
      <label>Nickname<input value="${escapeHtml(state.playerName)}" oninput="state.playerName=this.value"></label>
      <button class="primary" onclick="joinPlayer()">Join as player</button>
    </section>
  `;
}

function joinedPlayerPanel(server) {
  return `
    <section class="panel">
      <div class="joined-player-head">
        <div>
          <h1>${escapeHtml(server.me.name)}</h1>
          <p class="muted">Current score</p>
        </div>
        <div class="hero-score">${formatScore(server.me.score)}</div>
      </div>
      ${server.status === 'lobby' ? '<p class="muted">You are in the lobby. You can leave and rejoin before the host starts the game.</p>' : ''}
      ${server.status === 'lobby' ? '<button onclick="leaveLobby()">Leave lobby</button>' : ''}
    </section>
  `;
}

function playerView() {
  const server = state.server;
  if (!server) return loading();
  const hasJoined = !!server.me;
  return `
    <div class="phone-shell">
      ${hasJoined ? joinedPlayerPanel(server) : playerJoinPanel(server)}
      ${hasJoined && server.status === 'lobby' ? `<section class="panel"><h2>Lobby</h2><p class="muted">Waiting for ${escapeHtml(server.hostName)} to start the game.</p>${lobbyPlayers(server)}</section>` : ''}
      ${hasJoined && server.status === 'question' ? questionCard(server, false) : ''}
      ${hasJoined && (server.status === 'reveal' || server.status === 'finished') ? revealCard(server) : ''}
    </div>
  `;
}

function editorDocsPanel() {
  return `
    <section class="panel docs-panel">
      <h2>Pack format guide</h2>
      <p class="muted">The playlist name shown in the app comes from the root <code>title</code> field. The root <code>packId</code> is the stable internal identifier.</p>
      <ul class="doc-list">
        <li><strong>Required root fields:</strong> <code>packId</code>, <code>title</code>, <code>description</code>, <code>theme</code>, <code>artistFocus</code>, <code>decade</code>, <code>era</code>, <code>genre</code>, <code>questions</code></li>
        <li><strong>Required question fields:</strong> <code>id</code>, <code>type</code>, <code>prompt</code>, <code>youtubeUrl</code>, <code>startSeconds</code>, <code>endSeconds</code>, <code>options</code>, <code>correctIndex</code></li>
        <li><strong>Optional question fields:</strong> <code>mediaMode</code> (<code>audio</code> or <code>video</code>) and <code>displayMode</code> (<code>audio_only</code> or <code>video_visible</code>)</li>
        <li><strong>Question rules:</strong> 4 options exactly, 1 correct answer, clip duration max 10 seconds, type must be <code>artist</code>, <code>song</code>, or <code>artist_song</code>.</li>
      </ul>
      <h3>AI prompt template</h3>
      <p class="muted">Replace <code>{{REQUEST}}</code> with something like <em>2010s pop songs for casual players</em>.</p>
      <textarea class="editor prompt-template" readonly>${escapeHtml(AI_PROMPT_TEMPLATE)}</textarea>
    </section>
  `;
}

function editorView() {
  const server = state.server;
  const packOptions = server ? server.packs.map((pack) => `<option value="${pack.packId}">${escapeHtml(pack.title)}</option>`).join('') : '';
  return `
    <div class="editor-layout">
      <section class="panel">
        <h1>Pack editor</h1>
        <p class="muted">Repository-backed JSON remains the source of truth. This editor validates, uploads, and previews final playable packs before you save them into <code>data/packs</code>.</p>
        <div class="editor-toolbar">
          <label>Load sample pack<select onchange="loadPackIntoEditor(this.value)">${packOptions}</select></label>
          <label class="upload-field">Import JSON file<input type="file" accept="application/json,.json" onchange="handlePackUpload(event)"></label>
          <button onclick="validatePackJson()">Validate JSON</button>
          <button onclick="downloadPackJson()">Download JSON</button>
        </div>
        ${state.selectedUploadName ? `<p class="muted">Current editor source: ${escapeHtml(state.selectedUploadName)}</p>` : ''}
        <textarea class="editor" oninput="state.editorText=this.value">${escapeHtml(state.editorText)}</textarea>
      </section>
      <section class="editor-side-stack">
        <section class="panel">
          <h2>Validation</h2>
          ${state.validation ? (state.validation.valid ? '<p class="success">Pack is valid and ready for ingestion.</p>' : `<ul class="error-list">${state.validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`) : '<p class="muted">Run validation or upload a JSON file to see schema feedback.</p>'}
        </section>
        ${editorDocsPanel()}
      </section>
    </div>
  `;
}

function loading() {
  return '<div class="panel"><p class="muted">Connecting to local game server…</p></div>';
}

function render() {
  app.innerHTML = `
    <nav class="topbar">
      <button class="nav-link ${state.view === 'welcome' ? 'active' : ''}" onclick="changeView('welcome')">Welcome</button>
      <button class="nav-link ${state.view === 'host' ? 'active' : ''}" onclick="changeView('host')">Host</button>
      <button class="nav-link ${state.view === 'player' ? 'active' : ''}" onclick="changeView('player')">Player</button>
      <button class="nav-link ${state.view === 'editor' ? 'active' : ''}" onclick="changeView('editor')">Pack editor</button>
    </nav>
    ${state.error ? `<div class="flash error">${escapeHtml(state.error)}</div>` : ''}
    ${state.toast ? `<div class="flash success">${escapeHtml(state.toast)}</div>` : ''}
    ${state.view === 'welcome' ? `
      <section class="hero panel">
        <span class="badge">Version 1+</span>
        <h1>Kahoot-style music trivia for a local intranet</h1>
        <p>Single-host, single-session gameplay for up to 8 players, with YouTube-sourced 10-second clips, masked audio-first playback, optional join-key validation, random session subsets, and JSON-backed quiz packs.</p>
        <div class="hero-actions">
          <button class="primary" onclick="changeView('host')">Open host console</button>
          <button onclick="changeView('player')">Join from a phone</button>
          <button onclick="changeView('editor')">Review pack JSON</button>
        </div>
      </section>
    ` : ''}
    ${state.view === 'host' ? hostView() : ''}
    ${state.view === 'player' ? playerView() : ''}
    ${state.view === 'editor' ? editorView() : ''}
  `;
}

function changeView(view) {
  state.view = view;
  render();
}

function joinHost() {
  send('join_host', { name: state.hostName });
}

function joinPlayer() {
  send('join_player', { name: state.playerName, sessionKey: state.sessionKeyInput });
}

function setPack(packId) {
  send('set_pack', { packId });
}

function updateSetting(name, value) {
  if (!state.server) return;
  const settings = { ...state.server.settings, [name]: value };
  send('update_settings', settings);
}

function startGame() {
  send('start_game');
}

function skipQuestion() {
  send('skip_question');
}

function endSession() {
  send('end_session');
}

function resetLobby() {
  send('reset_lobby');
}

function leaveLobby() {
  send('leave_lobby');
}

function answerQuestion(optionIndex) {
  send('submit_answer', { optionIndex });
}

async function validatePackJson() {
  const response = await fetch('/api/validate-pack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: state.editorText
  });
  state.validation = await response.json();
  state.toast = state.validation.valid ? 'Validation passed.' : '';
  render();
}

async function handlePackUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  state.selectedUploadName = file.name;
  state.editorText = await file.text();
  await validatePackJson();
}

function downloadPackJson() {
  const blob = new Blob([state.editorText], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = state.selectedUploadName || 'music-pack.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

connectSocket();
changeView('welcome');
window.state = state;
window.changeView = changeView;
window.joinHost = joinHost;
window.joinPlayer = joinPlayer;
window.setPack = setPack;
window.updateSetting = updateSetting;
window.startGame = startGame;
window.skipQuestion = skipQuestion;
window.endSession = endSession;
window.resetLobby = resetLobby;
window.leaveLobby = leaveLobby;
window.answerQuestion = answerQuestion;
window.validatePackJson = validatePackJson;
window.downloadPackJson = downloadPackJson;
window.loadPackIntoEditor = loadPackIntoEditor;
window.handlePackUpload = handlePackUpload;
