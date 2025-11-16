/**
 * GuessR — frontend-only miniapp shell
 *
 * Notes:
 * - This is a client-only implementation that expects a backend with the API contract described in the blueprint.
 * - Configure BACKEND_ROOT to point at your Render/Vercel backend.
 * - The app uses the Farcaster miniapp SDK ESM bundle via esm.sh; adapt import to your bundler if needed.
 *
 * Files:
 *  - index.html (this file)
 *  - style.css
 *  - app.js
 */

// CONFIG: set your backend root URL here
const BACKEND_ROOT = '' // e.g. 'https://guessr-api.example.com'

// Farcaster miniapp SDK (ESM bundle)
import * as MiniAppSDK from 'https://esm.sh/@farcaster/miniapp-sdk@1.0.0';

// Simple state
const STATE = {
  fid: null,
  profile: null,
  seed: null,
  questions: [],
  idx: 0,
  answers: [],
  score: 0,
  startedAt: null,
  timer: null
};

const app = document.getElementById('app');
const frame = document.getElementById('frame');
const playBtn = document.getElementById('playBtn');
const howBtn = document.getElementById('howBtn');
const foot = document.getElementById('foot');

// UI helpers
function clearFrame() {
  frame.innerHTML = '';
}

function renderStart() {
  clearFrame();
  const tpl = document.getElementById('start-template').content.cloneNode(true);
  frame.appendChild(tpl);
  foot.textContent = 'Fast 5-question rounds — designed for Frames Feed';
}

function renderHow() {
  clearFrame();
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

function renderQuestion(q) {
  clearFrame();
  const tpl = document.getElementById('question-template').content.cloneNode(true);
  frame.appendChild(tpl);

  const castPreview = frame.querySelector('#castPreview');
  // show partial/blurred text
  castPreview.innerHTML = `<div class="blur">${escapeHtml(q.castPreview)}</div>`;

  const optionsEl = frame.querySelector('#options');
  optionsEl.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'avatar-btn';
    b.dataset.fid = opt.fid;
    b.innerHTML = `
      <img src="${opt.avatar}" alt="${escapeHtml(opt.username)}" />
      <span class="label">${escapeHtml(opt.username)}</span>
    `;
    b.addEventListener('click', () => handleAnswer(q.questionId, opt.fid));
    optionsEl.appendChild(b);
  });

  // optional timer
  startQuestionTimer(7, frame.querySelector('#timer'), () => {
    // auto-fail if time runs out: treat as wrong
    handleAnswer(q.questionId, null);
  });
}

// flash animation for correct/incorrect
function flash(correct = true) {
  const f = document.createElement('div');
  f.className = 'flash ' + (correct ? 'correct' : 'incorrect');
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 200);
}

function renderScore() {
  clearFrame();
  const tpl = document.getElementById('score-template').content.cloneNode(true);
  frame.appendChild(tpl);
  frame.querySelector('#scoreText').textContent = `You got ${STATE.score}/5 right!`;
  frame.querySelector('#rankText').textContent = `Top ${STATE.rankPercentile || '—'} of FC players today`;
  foot.textContent = '';

  document.getElementById('shareBtn').addEventListener('click', shareScore);
  document.getElementById('challengeBtn').addEventListener('click', challengeFriends);
  document.getElementById('againBtn').addEventListener('click', startGame);
}

// helpers
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function startQuestionTimer(seconds, el, onExpired) {
  clearInterval(STATE.timer);
  let t = seconds;
  el.textContent = '';
  el.classList.add('visible');
  el.textContent = t;
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

// API helpers — these call your backend. If BACKEND_ROOT is empty, we use a mocked local flow.
async function apiStart(fid) {
  if (!BACKEND_ROOT) {
    // mock: provide a random seed
    return { questionsSeed: Math.random().toString(36).slice(2), availableCount: 20 };
  }
  const res = await fetch(`${BACKEND_ROOT}/api/start?fid=${encodeURIComponent(fid)}`);
  return await res.json();
}

async function apiQuestion(seed, idx) {
  if (!BACKEND_ROOT) {
    // mock question: random text and 3 fake users, one correct
    const users = Array.from({length:3}).map((_,i)=>({
      fid: `fid_${Math.floor(Math.random()*10000)}${i}`,
      username: `user${Math.floor(Math.random()*1000)}${i}`,
      avatar: `https://api.dicebear.com/6.x/identicon/svg?seed=${Math.random().toString(36).slice(2)}`
    }));
    const correctIdx = Math.floor(Math.random()*3);
    const castPreview = ["Just saw the wildest thing", "Can't believe this drop", "Learning to build in public", "This made my day"][Math.floor(Math.random()*4)];
    const q = {
      questionId: `${seed}_${idx}`,
      castPreview: castPreview,
      options: users,
      correctFid: users[correctIdx].fid,
      expiresAt: new Date(Date.now()+60000).toISOString()
    };
    return q;
  }
  const res = await fetch(`${BACKEND_ROOT}/api/question?seed=${encodeURIComponent(seed)}&idx=${idx}`);
  return await res.json();
}

async function apiScore(payload) {
  if (!BACKEND_ROOT) {
    // basic server-side validation mock
    const correctCount = payload.answers.reduce((acc,a)=> acc + (a.selectedFid && Math.random() > 0.4 ? 1 : 0), 0);
    const score = Math.min(5, correctCount);
    return { score, streak: 0, rankPercentile: Math.max(1, Math.floor(Math.random()*100)), shareId: 'mock_share_' + Date.now() };
  }
  const res = await fetch(`${BACKEND_ROOT}/api/score`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// Game flow
async function startGame() {
  // require login/auth to use Farcaster features — we'll attempt to get basic profile via the SDK
  // NOTE: In production, use SIWE + backend exchange as in the blueprint.
  try {
    foot.textContent = 'Signing in to Farcaster...';
    const sdk = await MiniAppSDK.init();
    // request basic profile permission via SDK
    const ok = await sdk.requestPermissions({scopes: ['read_profile', 'read_following']}).catch(()=>false);
    if (!ok) {
      foot.textContent = 'Permissions required to fetch casts from people you follow.';
      return;
    }
    const profile = await sdk.getProfile();
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

    // prefetch 5 questions (fast)
    for (let i=0;i<5;i++){
      const q = await apiQuestion(STATE.seed, i);
      STATE.questions.push(q);
    }
    playRound();
  } catch (err) {
    console.error(err);
    foot.textContent = 'Could not start the game. Try again.';
  }
}

function playRound() {
  if (STATE.idx >= STATE.questions.length) {
    endGame();
    return;
  }
  const q = STATE.questions[STATE.idx];
  renderQuestion(q);
}

async function handleAnswer(questionId, selectedFid) {
  // stop timer
  clearInterval(STATE.timer);

  // find question and verify (client-side minimal)
  const q = STATE.questions[STATE.idx];
  const correct = selectedFid && selectedFid === q.correctFid;

  // optimistic UI flash
  flash(correct);
  if (correct) STATE.score += 1;

  STATE.answers.push({ questionId, selectedFid, ts: Date.now() });
  STATE.idx += 1;

  // small delay to mimic flash frame
  await new Promise(r => setTimeout(r, 220));
  playRound();
}

async function endGame() {
  // submit score to backend
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
  renderScore();
  foot.textContent = 'Share your result to Warpcast and challenge friends!';
}

// Sharing (requires post_cast permission); this uses the Farcaster miniapp SDK client post flow
async function shareScore() {
  try {
    const sdk = await MiniAppSDK.init();
    const gotPost = await sdk.requestPermissions({scopes: ['post_cast']}).catch(()=>false);
    if (!gotPost) {
      alert('Permission required to post a cast. Grant when prompted to share.');
      return;
    }
    // craft a simple share message
    const text = `I scored ${STATE.score}/5 on Friend Guessr — can you beat me? #GuessR`;
    // if backend generated an OG card, use its URL; else we post text-only
    const media = STATE.shareId && BACKEND_ROOT ? [{ type: 'image', url: `${BACKEND_ROOT}/api/sharecard?id=${STATE.shareId}` }] : [];
    await sdk.createCast({ text, media });
    alert('Shared to Warpcast!');
  } catch (err) {
    console.error(err);
    alert('Could not share your score.');
  }
}

async function challengeFriends() {
  try {
    const sdk = await MiniAppSDK.init();
    const gotPost = await sdk.requestPermissions({scopes: ['post_cast']}).catch(()=>false);
    if (!gotPost) {
      alert('Permission required to post a cast. Grant when prompted to challenge.');
      return;
    }
    // prefill with a callout tagging up to 3 sample friends (in production, let user pick)
    const text = `I got ${STATE.score}/5 on Friend Guessr. Can you beat me? @friend1 @friend2 @friend3 #GuessR`;
    await sdk.createCast({ text });
    alert('Challenge posted!');
  } catch (err) {
    console.error(err);
    alert('Could not post challenge.');
  }
}

// Init
renderStart();
playBtn.addEventListener('click', startGame);
howBtn.addEventListener('click', renderHow);
