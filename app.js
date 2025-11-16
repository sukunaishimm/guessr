// --- Tabs ---
const tabs = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabContents.forEach(tc => tc.classList.remove("active"));
    document.getElementById(target).classList.add("active");
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
  });
});

// Activate default tab
tabs[0].click();

// --- Farcaster SDK info ---
let userFid = null;
let username = "Guest";
let pfp = "https://via.placeholder.com/100"; // default placeholder

// --- Game state ---
const startBtn = document.getElementById("start-btn");
const castText = document.getElementById("cast-text");
const optionsContainer = document.getElementById("options-container");
const timerElement = document.getElementById("timer");
const streakDisplay = document.getElementById("streak-display");
const highScoreDisplay = document.getElementById("high-score");
const userPic = document.getElementById("user-pic");
const usernameDisplay = document.getElementById("username");

let score = 0;
let streak = 0;
let highScore = 0;
let questionIndex = 0;
const TOTAL_QUESTIONS = 5;
let questions = [];

// Placeholder questions
const placeholderQuestions = [
  { text: "I love Farcaster!", author: "alice" },
  { text: "Node.js is awesome!", author: "bob" },
  { text: "JavaScript forever!", author: "charlie" },
  { text: "I’m building a mini-app!", author: "dave" },
  { text: "Who said this?", author: "eve" }
];

// Shuffle helper
function shuffle(array) { return array.sort(() => Math.random() - 0.5); }

// --- Start Game ---
startBtn.addEventListener("click", () => {
  score = 0;
  questionIndex = 0;
  questions = shuffle(placeholderQuestions).slice(0, TOTAL_QUESTIONS);
  nextQuestion();
});

// --- Next Question ---
function nextQuestion() {
  if (questionIndex >= TOTAL_QUESTIONS) return endGame();

  const q = questions[questionIndex];
  castText.textContent = q.text;

  let options = [q.author];
  while (options.length < 3) {
    const rand = placeholderQuestions[Math.floor(Math.random() * placeholderQuestions.length)].author;
    if (!options.includes(rand)) options.push(rand);
  }
  options = shuffle(options);

  optionsContainer.innerHTML = options.map(o => `<button class="option-btn">${o}</button>`).join("");
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.onclick = () => {
      if (btn.textContent === q.author) { score++; streak++; }
      else { streak = 0; }
      questionIndex++;
      nextQuestion();
      streakDisplay.textContent = `Current Streak: ${streak}`;
    };
  });

  // Timer
  let timer = 7;
  timerElement.textContent = timer;
  const countdown = setInterval(() => {
    timer--;
    timerElement.textContent = timer;
    if (timer <= 0) { clearInterval(countdown); questionIndex++; nextQuestion(); }
  }, 1000);
}

// --- End Game ---
function endGame() {
  if (score > highScore) highScore = score;
  highScoreDisplay.textContent = `High Score: ${highScore}`;
  alert(`Game over! Score: ${score}, Streak: ${streak}`);
}

// --- User Profile (placeholder) ---
userPic.src = pfp;
usernameDisplay.textContent = `Username: ${username}`;
streakDisplay.textContent = `Current Streak: ${streak}`;
highScoreDisplay.textContent = `High Score: ${highScore}`;
