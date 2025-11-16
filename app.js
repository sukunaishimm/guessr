/**
 * Fixed app.js — ensures DOM is ready before attaching listeners.
 */

// CONFIG: set your backend root URL here
const BACKEND_ROOT = '' // e.g. 'https://guessr-api.example.com'

// Import Farcaster miniapp SDK (optional; if you don't have it yet you can mock)
import * as MiniAppSDK from 'https://esm.sh/@farcaster/miniapp-sdk@1.0.0';

// STATE
const STATE = {
  fid: null,
  profile: null,
  seed: null,
  questions: [],
  idx: 0,
  answers: [],
  score: 0,
  startedAt: null,
  timer: null,
  rankPercentile: null,
  shareId: null
};

// Helper: escape HTML
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// UI rendering helpers (query DOM at runtime)
function getEls() {
  return {
    app: document.getElementById('app'),
    frame: document.getElementById('frame'),
    playBtn: document.getElementById('playBtn'),
    howBtn: document.getElementById('howBtn'),
    foot: document.getElementById('foot'),
    templates: {
      start: document.getElementById('start-template'),
      question: document.getElementById('question-template'),
      score: document.getElementById('score-template'),
      flash: document.getElementById('flash-template')
    }
  };
}

function clearFrame(frame) {
  frame.innerHTML = '';
}

function renderStart(frame, foot, templates) {
  clearFrame(frame);
  const tpl = templates.start.content.cloneNode(true);
  frame.appendChild(tpl);
  foot.textContent = 'Fast 5-question rounds — designed for Frames Feed';
}

function renderHow(frame, foot) {
  clearFrame(frame);
  const div = document.createElement('div');
  div.className = 'how';
  div.innerHTML = `
    <h3>How it works</h3>
    <ol>
      <li>We fetch recent casts from people you follow (read_following).</li>
      <li>We pick a cast and show a cropped/blurred preview + 3 avatars.</li>
      <li>Tap the avatar you think wrote it. 5 quick rounds, then share.</li>
    </ol>
  `;
  frame.appendChild(div);
  foot.textContent = '';
}

function renderQuestion(frame, templates, q) {
  clearFrame(frame);
  const tpl = templates.question.content.cloneNode(true);
  frame.appendChild(tpl);

  const castPreview = frame.querySelector('#castPreview');
  castPreview.innerHTML = `<div class="blur">${escapeHtml(q.castPreview)}</div>`;

  const optionsEl = frame.querySelector('#options');
  optionsEl.innerHTML = '';
  q.options.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'avatar-btn';
    b.type = 'button';
    b.dataset.fid = opt.fid;
    b.innerHTML = `
      <img src="${opt.avatar}" alt="${escapeHtml(opt.username)}" />
      <span class="label">${escapeHtml(opt.username)}</span>
    `;
    b.addEventListener('click', () => handleAnswer(q.questionId, opt.fid));
    optionsEl.appendChild(b);
  });

  // start timer
  startQuestionTimer(7, frame.querySelector('#timer'), () => handleAnswer(q.questionId, null));
}

function renderScore(frame, templates) {
  clearFrame(frame);
  const tpl = templates.score.content.cloneNode(true);
  frame.appendChild(tpl);
  frame.querySelector('#scoreText').textContent = `You got ${STATE.score}/5 right!`;
  frame.querySelector('#rankText').textContent = `Top ${STATE.rankPercentile || '—'} of FC players today`;
  document.getElementById('shareBtn').addEventListener('click', shareScore);
  document.getElementById('challengeBtn').addEventListener('click', challengeFriends);
  document.getElementById('againBtn').addEventListener('click', startGame);
}

// Flash
function flash(correct = true) {
  const f = document.createElement('div');
  f.className = 'flash ' + (correct ? 'correct' : 'incorrect');
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 200);
}

// Timer
function startQuestionTimer(seconds, el, onExpired) {
  clearInterval(STATE.timer);
  let t = seconds;
  if (!el) return;
  el.textContent = t;
  el.classList.add('visible');
  STATE.timer = setInterval(() => {
    t -= 1;
    if (t <= 0) {
      clearInterval(STATE.timer);
      el.classList.remove('visible');
      el.textContent = '';
      onExpired && onExpired();
    } else {
      el.textContent = t;
    }
  }, 1000);
}

// API mocks / calls
async function apiStart(fid) {
  if (!BACKEND_ROOT) {
    return { questionsSeed: Math.random().toString(36).slice(2), availableCount: 20 };
  }
  const res = await fetch(`${BACKEND_ROOT}/api/start?fid=${encodeURIComponent(fid)}`);
  return await res.json();
}

async function apiQuestion(seed, idx) {
  if (!BACKEND_ROOT) {
    const users = Array.from({length:3}).map((_,i)=>({
      fid: `fid_${Math.floor(Math.random()*10000)}${i}`,
      username: `user${Math.floor(Math.random()*1000)}${i}`,
      avatar: `https://api.dicebear.com/6.x/identicon/svg?seed=${Math.random().toString(36).slice(2)}`
    }));
    const correctIdx = Math.floor(Math.random()*3);
    const castPreview = ["Just saw the wildest thing", "Can't believe this drop", "Learning to build in public", "This made my day"][Math.floor(Math.random()*4)];
    return {
      questionId: `${seed}_${idx}`,
      castPreview,
      options: users,
      correctFid: users[correctIdx].fid,
      expiresAt: new Date(Date.now()+60000).toISOString()
    };
  }
  const res = await fetch(`${BACKEND_ROOT}/api/question?seed=${encodeURIComponent(seed)}&idx=${idx}`);
  return await res.json();
}

async function apiScore(payload) {
  if (!BACKEND_ROOT) {
    const correctCount = STATE.score; // we tracked it client-side in this mock
    return { score: correctCount, streak: 0, rankPercentile: Math.max(1, Math.floor(Math.random()*100)), shareId: 'mock_share_' + Date.now() };
  }
  const res = await fetch(`${BACKEND_ROOT}/api/score`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// Flow handlers
async function startGame() {
  const { frame, foot, templates } = getEls();
  try {
    foot.textContent = 'Signing in to Farcaster...';
    const sdk = await MiniAppSDK.init().catch(()=>null);
    let ok = false;
    if (sdk && sdk.requestPermissions) {
      ok = await sdk.requestPermissions({scopes: ['read_profile', 'read_following']}).catch(()=>false);
    } else {
      ok = true; // allow mock flow when SDK not available
    }
    if (!ok) {
      foot.textContent = 'Permissions required to fetch casts from people you follow.';
      return;
    }
    const profile = sdk && sdk.getProfile ? await sdk.getProfile().catch(()=>null) : null;
    STATE.fid = profile?.fid || `fid_local_${Math.random().toString(36).slice(2)}`;
    STATE.profile = profile || { username: 'You', pfp: '' };

    foot.textContent = 'Preparing game...';
    const start = await apiStart(STATE.fid);
    STATE.seed = start.questionsSeed;
    STATE.questions = [];
    STATE.idx = 0;
    STATE.answers = [];
    STATE.score = 0;
    STATE.startedAt = Date.now();

    for (let i=0;i<5;i++){
      const q = await apiQuestion(STATE.seed, i);
      STATE.questions.push(q);
    }
    playRound();
  } catch (err) {
    console.error(err);
    const { foot } = getEls();
    foot.textContent = 'Could not start the game. Try again.';
  }
}

function playRound() {
  const { frame, templates } = getEls();
  if (STATE.idx >= STATE.questions.length) {
    endGame();
    return;
  }
  const q = STATE.questions[STATE.idx];
  renderQuestion(frame, templates, q);
}

async function handleAnswer(questionId, selectedFid) {
  clearInterval(STATE.timer);
  const q = STATE.questions[STATE.idx];
  const correct = selectedFid && selectedFid === q.correctFid;
  flash(correct);
  if (correct) STATE.score += 1;
  STATE.answers.push({ questionId, selectedFid, ts: Date.now() });
  STATE.idx += 1;
  await new Promise(r => setTimeout(r, 220));
  playRound();
}

async function endGame() {
  const { foot, frame, templates } = getEls();
  foot.textContent = 'Submitting score...';
  const payload = {
    sessionId: STATE.seed,
    fid: STATE.fid,
    answers: STATE.answers,
    durationMs: Date.now() - STATE.startedAt
  };
  const res = await apiScore(payload);
  STATE.rankPercentile = res.rankPercentile;
  STATE.shareId = res.shareId;
  renderScore(frame, templates);
  foot.textContent = 'Share your result to Warpcast and challenge friends!';
}

async function shareScore() {
  try {
    const sdk = await MiniAppSDK.init().catch(()=>null);
    let gotPost = false;
    if (sdk && sdk.requestPermissions) {
      gotPost = await sdk.requestPermissions({scopes: ['post_cast']}).catch(()=>false);
    } else {
      gotPost = true;
    }
    if (!gotPost) {
      alert('Permission required to post a cast. Grant when prompted to share.');
      return;
    }
    const text = `I scored ${STATE.score}/5 on Friend Guessr — can you beat me? #GuessR`;
    const media = STATE.shareId && BACKEND_ROOT ? [{ type: 'image', url: `${BACKEND_ROOT}/api/sharecard?id=${STATE.shareId}` }] : [];
    if (sdk && sdk.createCast) {
      await sdk.createCast({ text, media });
      alert('Shared to Warpcast!');
    } else {
      alert('Mock share: ' + text);
    }
  } catch (err) {
    console.error(err);
    alert('Could not share your score.');
  }
}

async function challengeFriends() {
  try {
    const sdk = await MiniAppSDK.init().catch(()=>null);
    let gotPost = false;
    if (sdk && sdk.requestPermissions) {
      gotPost = await sdk.requestPermissions({scopes: ['post_cast']}).catch(()=>false);
    } else {
      gotPost = true;
    }
    if (!gotPost) {
      alert('Permission required to post a cast. Grant when prompted to challenge.');
      return;
    }
    const text = `I got ${STATE.score}/5 on Friend Guessr. Can you beat me? @friend1 @friend2 @friend3 #GuessR`;
    if (sdk && sdk.createCast) {
      await sdk.createCast({ text });
      alert('Challenge posted!');
    } else {
      alert('Mock challenge: ' + text);
    }
  } catch (err) {
    console.error(err);
    alert('Could not post challenge.');
  }
}

// Entry: wait for DOM ready then attach global listeners
window.addEventListener('DOMContentLoaded', () => {
  const { frame, playBtn, howBtn, foot, templates } = getEls();
  renderStart(frame, foot, templates);
  // Attach listeners now that elements exist
  playBtn.addEventListener('click', startGame);
  howBtn.addEventListener('click', () => renderHow(frame, foot));
});
