const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PACKS_DIR = path.join(ROOT, 'data', 'packs');
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

function makeSessionKey() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function validatePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') {
    return { valid: false, errors: ['Pack must be a JSON object.'] };
  }
  const requiredRoot = ['packId', 'title', 'description', 'theme', 'artistFocus', 'decade', 'era', 'genre', 'questions'];
  requiredRoot.forEach((key) => {
    if (!(key in pack)) {
      errors.push(`Missing root field: ${key}`);
    }
  });
  if (!Array.isArray(pack.questions) || pack.questions.length === 0) {
    errors.push('questions must be a non-empty array.');
  }
  const seenIds = new Set();
  (pack.questions || []).forEach((question, index) => {
    const prefix = `Question ${index + 1}`;
    const required = ['id', 'type', 'prompt', 'youtubeUrl', 'startSeconds', 'endSeconds', 'options', 'correctIndex'];
    required.forEach((key) => {
      if (!(key in question)) {
        errors.push(`${prefix}: missing ${key}`);
      }
    });
    if (seenIds.has(question.id)) {
      errors.push(`${prefix}: duplicate id ${question.id}`);
    }
    seenIds.add(question.id);
    if (!['artist', 'song', 'artist_song'].includes(question.type)) {
      errors.push(`${prefix}: type must be artist, song, or artist_song`);
    }
    if (question.displayMode && !['audio_only', 'video_visible'].includes(question.displayMode)) {
      errors.push(`${prefix}: displayMode must be audio_only or video_visible when provided.`);
    }
    if (question.mediaMode && !['audio', 'video'].includes(question.mediaMode)) {
      errors.push(`${prefix}: mediaMode must be audio or video when provided.`);
    }
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${prefix}: options must contain exactly four answers.`);
    }
    if (typeof question.correctIndex !== 'number' || question.correctIndex < 0 || question.correctIndex > 3) {
      errors.push(`${prefix}: correctIndex must be between 0 and 3.`);
    }
    if (typeof question.startSeconds !== 'number' || typeof question.endSeconds !== 'number' || question.endSeconds <= question.startSeconds) {
      errors.push(`${prefix}: startSeconds and endSeconds must define a valid positive clip.`);
    }
    if ((question.endSeconds - question.startSeconds) > 10) {
      errors.push(`${prefix}: clip duration cannot exceed 10 seconds.`);
    }
  });
  return { valid: errors.length === 0, errors };
}

function loadPacks() {
  const packs = [];
  if (!fs.existsSync(PACKS_DIR)) {
    return packs;
  }
  for (const file of fs.readdirSync(PACKS_DIR)) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(PACKS_DIR, file);
    const parsed = safeJsonParse(fs.readFileSync(fullPath, 'utf8'));
    if (!parsed.ok) continue;
    const validation = validatePack(parsed.value);
    if (!validation.valid) continue;
    packs.push(parsed.value);
  }
  return packs;
}

let packs = loadPacks();

function getPackSummary(pack) {
  return {
    packId: pack.packId,
    title: pack.title,
    description: pack.description,
    theme: pack.theme,
    artistFocus: pack.artistFocus,
    decade: pack.decade,
    era: pack.era,
    genre: pack.genre,
    questionCount: pack.questions.length
  };
}

const session = {
  key: makeSessionKey(),
  hostClientId: null,
  hostName: 'Host',
  selectedPackId: packs[0] ? packs[0].packId : null,
  settings: {
    playbackMode: 'host_shared',
    showLeaderboardAfterEach: true,
    requireJoinKey: false,
    maxQuestions: null,
    videoDisplayOverride: 'default'
  },
  players: [],
  status: 'lobby',
  currentQuestionIndex: -1,
  questionSet: null,
  round: null,
  reveal: null,
  timers: {
    question: null,
    reveal: null
  }
};

const clients = new Map();

function getSelectedPack() {
  return packs.find((pack) => pack.packId === session.selectedPackId) || null;
}

function getPlannedQuestionCount() {
  if (session.questionSet) return session.questionSet.length;
  const pack = getSelectedPack();
  if (!pack) return 0;
  const maxQuestions = Number(session.settings.maxQuestions);
  if (Number.isFinite(maxQuestions) && maxQuestions > 0) {
    return Math.min(maxQuestions, pack.questions.length);
  }
  return pack.questions.length;
}

function getQuestionSet() {
  return session.questionSet || [];
}

function publicPlayer(player) {
  return { id: player.id, name: player.name, score: player.score, answered: !!player.answeredAt };
}

function buildStateFor(clientId) {
  const selectedPack = getSelectedPack();
  const isHost = !!clientId && session.hostClientId === clientId;
  const me = session.players.find((player) => player.clientId === clientId) || null;
  return {
    sessionKey: session.key,
    role: isHost ? 'host' : (me ? 'player' : 'viewer'),
    hostName: session.hostName,
    status: session.status,
    selectedPack: selectedPack ? getPackSummary(selectedPack) : null,
    settings: session.settings,
    players: session.players.map(publicPlayer),
    currentQuestionIndex: session.currentQuestionIndex,
    totalQuestions: getPlannedQuestionCount(),
    question: getClientQuestionState(clientId),
    reveal: session.reveal,
    packs: packs.map(getPackSummary),
    me: me ? { id: me.id, name: me.name, score: me.score } : null
  };
}

function resolveQuestionDisplayMode(question) {
  const questionMode = question.displayMode === 'video_visible' ? 'video_visible' : 'audio_only';
  if (session.settings.videoDisplayOverride === 'hide_video') return 'audio_only';
  if (session.settings.videoDisplayOverride === 'show_video' && (question.mediaMode || 'video') === 'video') {
    return 'video_visible';
  }
  if ((question.mediaMode || 'video') !== 'video') {
    return 'audio_only';
  }
  return questionMode;
}

function getClientQuestionState(clientId) {
  if (!session.round) return null;
  const question = session.round.question;
  const player = session.players.find((entry) => entry.clientId === clientId);
  const includeMedia = session.hostClientId === clientId || session.settings.playbackMode === 'player_device';
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    media: includeMedia ? {
      youtubeUrl: question.youtubeUrl,
      startSeconds: question.startSeconds,
      endSeconds: question.endSeconds,
      mediaMode: question.mediaMode || 'video',
      displayMode: resolveQuestionDisplayMode(question)
    } : null,
    startedAt: session.round.startedAt,
    durationMs: session.round.durationMs,
    locked: !session.round.acceptingAnswers,
    answeredIndex: player ? player.currentAnswer : null
  };
}

function broadcastState() {
  for (const [clientId, client] of clients.entries()) {
    sendMessage(client.socket, { type: 'state', payload: buildStateFor(clientId) });
  }
}

function resetTimers() {
  if (session.timers.question) clearTimeout(session.timers.question);
  if (session.timers.reveal) clearTimeout(session.timers.reveal);
  session.timers.question = null;
  session.timers.reveal = null;
}

function resetSession(keepPlayers = true) {
  resetTimers();
  session.status = 'lobby';
  session.currentQuestionIndex = -1;
  session.questionSet = null;
  session.round = null;
  session.reveal = null;
  if (!keepPlayers) {
    session.players = [];
  } else {
    session.players.forEach((player) => {
      player.score = 0;
      player.currentAnswer = null;
      player.answeredAt = null;
    });
  }
}

function chooseQuestionSet(pack) {
  const maxQuestions = Number(session.settings.maxQuestions);
  if (!Number.isFinite(maxQuestions) || maxQuestions <= 0 || maxQuestions >= pack.questions.length) {
    return [...pack.questions];
  }
  const picked = new Set();
  while (picked.size < maxQuestions) {
    picked.add(Math.floor(Math.random() * pack.questions.length));
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((index) => pack.questions[index]);
}

function startQuestion(index) {
  const questions = getQuestionSet();
  if (!questions[index]) {
    endSession();
    return;
  }
  resetTimers();
  session.status = 'question';
  session.currentQuestionIndex = index;
  session.reveal = null;
  const question = questions[index];
  const startedAt = Date.now();
  session.players.forEach((player) => {
    player.currentAnswer = null;
    player.answeredAt = null;
  });
  session.round = {
    question,
    startedAt,
    durationMs: 10000,
    acceptingAnswers: true
  };
  broadcastState();
  session.timers.question = setTimeout(() => closeQuestion(false), 10000);
}

function scoreAnswer(answeredAt) {
  const elapsedMs = Math.max(0, Math.min(10000, answeredAt - session.round.startedAt));
  const tenths = Math.floor(elapsedMs / 100);
  return Math.max(0, 1000 - tenths * 10);
}

function closeQuestion(skipped) {
  if (!session.round) return;
  session.round.acceptingAnswers = false;
  const question = session.round.question;
  const correctAnswer = question.options[question.correctIndex];
  const results = session.players.map((player) => {
    const isCorrect = !skipped && player.currentAnswer === question.correctIndex;
    const earned = isCorrect && player.answeredAt ? scoreAnswer(player.answeredAt) : 0;
    if (earned) player.score += earned;
    return {
      id: player.id,
      name: player.name,
      answerIndex: player.currentAnswer,
      correct: isCorrect,
      earned,
      totalScore: player.score
    };
  }).sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name));

  session.status = 'reveal';
  session.reveal = {
    questionId: question.id,
    correctIndex: question.correctIndex,
    correctAnswer,
    skipped,
    showLeaderboardAfterEach: session.settings.showLeaderboardAfterEach,
    rankings: results
  };
  broadcastState();
  session.timers.reveal = setTimeout(() => {
    const nextIndex = session.currentQuestionIndex + 1;
    const questions = getQuestionSet();
    if (nextIndex < questions.length) {
      startQuestion(nextIndex);
    } else {
      endSession();
    }
  }, 4500);
}

function endSession() {
  resetTimers();
  session.status = 'finished';
  session.round = null;
  session.reveal = {
    final: true,
    rankings: [...session.players]
      .map((player) => ({ id: player.id, name: player.name, totalScore: player.score }))
      .sort((a, b) => b.totalScore - a.totalScore || a.name.localeCompare(b.name))
  };
  broadcastState();
}

function handleAction(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;
  switch (message.type) {
    case 'join_host': {
      session.hostClientId = clientId;
      session.hostName = String(message.name || 'Host').trim() || 'Host';
      client.role = 'host';
      break;
    }
    case 'join_player': {
      const name = String(message.name || '').trim().slice(0, 24);
      const providedKey = String(message.sessionKey || '').trim();
      if (!name) {
        sendMessage(client.socket, { type: 'error', payload: { message: 'Name is required.' } });
        return;
      }
      if (session.settings.requireJoinKey && providedKey !== session.key) {
        sendMessage(client.socket, { type: 'error', payload: { message: 'Invalid session key.' } });
        return;
      }
      if (session.status !== 'lobby') {
        sendMessage(client.socket, { type: 'error', payload: { message: 'Game already started. Late joiners are disabled.' } });
        return;
      }
      if (session.players.length >= 8) {
        sendMessage(client.socket, { type: 'error', payload: { message: 'Session is full.' } });
        return;
      }
      const existing = session.players.find((player) => player.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        sendMessage(client.socket, { type: 'error', payload: { message: 'Player name must be unique for this session.' } });
        return;
      }
      const player = { id: crypto.randomUUID(), clientId, name, score: 0, currentAnswer: null, answeredAt: null };
      session.players.push(player);
      client.role = 'player';
      break;
    }
    case 'set_pack': {
      if (session.hostClientId !== clientId || session.status !== 'lobby') return;
      if (packs.some((pack) => pack.packId === message.packId)) {
        session.selectedPackId = message.packId;
      }
      break;
    }
    case 'update_settings': {
      if (session.hostClientId !== clientId || session.status !== 'lobby') return;
      const requestedMax = Number(message.maxQuestions);
      session.settings = {
        playbackMode: message.playbackMode === 'player_device' ? 'player_device' : 'host_shared',
        showLeaderboardAfterEach: !!message.showLeaderboardAfterEach,
        requireJoinKey: !!message.requireJoinKey,
        maxQuestions: Number.isFinite(requestedMax) && requestedMax > 0 ? Math.floor(requestedMax) : null,
        videoDisplayOverride: ['default', 'hide_video', 'show_video'].includes(message.videoDisplayOverride) ? message.videoDisplayOverride : 'default'
      };
      break;
    }
    case 'start_game': {
      if (session.hostClientId !== clientId || session.status !== 'lobby') return;
      const pack = getSelectedPack();
      if (!pack || session.players.length === 0) return;
      session.players.forEach((player) => { player.score = 0; });
      session.questionSet = chooseQuestionSet(pack);
      startQuestion(0);
      return;
    }
    case 'submit_answer': {
      if (!session.round || !session.round.acceptingAnswers || session.status !== 'question') return;
      const player = session.players.find((entry) => entry.clientId === clientId);
      if (!player || player.answeredAt) return;
      const now = Date.now();
      if (now > session.round.startedAt + session.round.durationMs) return;
      player.currentAnswer = Number(message.optionIndex);
      player.answeredAt = now;
      break;
    }
    case 'skip_question': {
      if (session.hostClientId !== clientId || session.status !== 'question') return;
      closeQuestion(true);
      return;
    }
    case 'end_session': {
      if (session.hostClientId !== clientId) return;
      endSession();
      return;
    }
    case 'leave_lobby': {
      if (session.status !== 'lobby') return;
      session.players = session.players.filter((player) => player.clientId !== clientId);
      client.role = 'viewer';
      break;
    }
    case 'reset_lobby': {
      if (session.hostClientId !== clientId) return;
      session.key = makeSessionKey();
      resetSession(true);
      break;
    }
    default:
      return;
  }
  broadcastState();
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'GET' && requestUrl.pathname === '/api/state') {
    return sendJson(res, 200, buildStateFor(null));
  }
  if (req.method === 'GET' && requestUrl.pathname === '/api/packs') {
    packs = loadPacks();
    return sendJson(res, 200, { packs: packs.map(getPackSummary) });
  }
  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/packs/')) {
    const packId = decodeURIComponent(requestUrl.pathname.split('/').pop());
    const pack = packs.find((entry) => entry.packId === packId);
    return pack ? sendJson(res, 200, { pack }) : sendJson(res, 404, { error: 'Pack not found' });
  }
  if (req.method === 'POST' && requestUrl.pathname === '/api/validate-pack') {
    try {
      const body = await readBody(req);
      const parsed = safeJsonParse(body);
      if (!parsed.ok) {
        return sendJson(res, 400, { valid: false, errors: [parsed.error] });
      }
      return sendJson(res, 200, validatePack(parsed.value));
    } catch (error) {
      return sendJson(res, 400, { valid: false, errors: [error.message] });
    }
  }
  serveStatic(req, res, requestUrl.pathname);
});

function encodeFrame(data) {
  const payload = Buffer.from(data);
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + length;
    if (offset + frameLength > buffer.length) break;
    if (opcode === 0x8) {
      messages.push({ close: true });
      offset += frameLength;
      continue;
    }
    let payload = buffer.subarray(offset + headerLength + maskLength, offset + frameLength);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      const unmasked = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }
    messages.push({ text: payload.toString('utf8') });
    offset += frameLength;
  }
  return { messages, remaining: buffer.subarray(offset) };
}

function sendMessage(socket, payload) {
  if (socket.destroyed) return;
  socket.write(encodeFrame(JSON.stringify(payload)));
}

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));

  const clientId = crypto.randomUUID();
  clients.set(clientId, { socket, role: 'viewer' });
  sendMessage(socket, { type: 'state', payload: buildStateFor(clientId) });

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeFrames(buffer);
    buffer = decoded.remaining;
    decoded.messages.forEach((message) => {
      if (message.close) {
        socket.end();
        return;
      }
      const parsed = safeJsonParse(message.text);
      if (parsed.ok) {
        handleAction(clientId, parsed.value);
      }
    });
  });

  socket.on('close', () => {
    const leavingPlayer = session.players.find((player) => player.clientId === clientId);
    if (leavingPlayer) {
      session.players = session.players.filter((player) => player.clientId !== clientId);
      if (session.status !== 'lobby' && session.players.length === 0) {
        endSession();
      }
    }
    if (session.hostClientId === clientId) {
      session.hostClientId = null;
      session.hostName = 'Host';
      if (session.status !== 'lobby') {
        endSession();
      }
    }
    clients.delete(clientId);
    broadcastState();
  });

  socket.on('error', () => {
    socket.destroy();
  });
});

server.listen(PORT, () => {
  console.log(`Music trivia server running on http://localhost:${PORT}`);
});
