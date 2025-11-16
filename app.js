// Select screens
const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const scoreScreen = document.getElementById("score-screen");

// Buttons
const playBtn = document.getElementById("play-btn");
const playAgainBtn = document.getElementById("play-again-btn");
const shareBtn = document.getElementById("share-btn");
const challengeBtn = document.getElementById("challenge-btn");

// Game elements
const castText = document.getElementById("cast-text");
const optionsContainer = document.getElementById("options-container");
const scoreDisplay = document.getElementById("score-display");
const rankDisplay = document.getElementById("rank-display");
const timerElement = document.getElementById("timer");

// Game state
let score = 0;
let streak = 0;
let questionIndex = 0;
const TOTAL_QUESTIONS = 5;
let questions = [];

// Placeholder questions for now
const placeholderQuestions = [
  { text: "I love Farcaster!", author: "alice" },
  { text: "Node.js is awesome!", author: "bob" },
  { text: "JavaScript forever!", author: "charlie" },
  { text: "I’m building a mini-app!", author: "dave" },
  { text: "Who said this?", author: "eve" }
];

// Helper: shuffle array
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Start game
playBtn.onclick = () => {
  startScreen.style.display = "none";
  gameScreen.style.display = "block";
  score = 0;
  streak = 0;
  questionIndex = 0;
  questions = shuffle(placeholderQuestions).slice(0, TOTAL_QUESTIONS);
  nextQuestion();
};

// Play again
playAgainBtn.onclick = () => {
  scoreScreen.style.display = "none";
  startScreen.style.display = "block";
};

// Show next question
function nextQuestion() {
  if (questionIndex >= TOTAL_QUESTIONS) {
    return showScore();
  }

  const q = questions[questionIndex];
  castText.textContent = q.text;

  // Generate options (one correct + 2 random)
  let options = [q.author];
  while (options.length < 3) {
    const randomAuthor = placeholderQuestions[Math.floor(Math.random() * placeholderQuestions.length)].author;
    if (!options.includes(randomAuthor)) options.push(randomAuthor);
  }
  options = shuffle(options);

  // Render buttons
  optionsContainer.innerHTML = options.map(o => `<button class="option-btn">${o}</button>`).join("");
  document.querySelectorAll(".option-btn").forEach(btn => {
    btn.onclick = () => {
      if (btn.textContent === q.author) {
        score++;
        streak++;
      } else {
        streak = 0;
      }
      questionIndex++;
      nextQuestion();
    };
  });

  // Optional: 7-second countdown timer
  let timer = 7;
  timerElement.textContent = timer;
  const countdown = setInterval(() => {
    timer--;
    timerElement.textContent = timer;
    if (timer <= 0) {
      clearInterval(countdown);
      questionIndex++;
      nextQuestion();
    }
  }, 1000);
}

// Show score screen
function showScore() {
  gameScreen.style.display = "none";
  scoreScreen.style.display = "block";
  scoreDisplay.textContent = score;
  rankDisplay.textContent = `Your streak: ${streak}`;

  // Share score via Farcaster
  shareBtn.onclick = async () => {
    try {
      const { sdk } = await import("https://esm.sh/@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({
        text: `I scored ${score}/${TOTAL_QUESTIONS} on Friend Guessr! Can you beat me?`,
        embeds: [window.location.href],
      });
      alert("Score shared on Farcaster!");
    } catch (err) {
      console.error(err);
      alert("Failed to share score.");
    }
  };

  // Challenge friends (pre-filled cast)
  challengeBtn.onclick = async () => {
    try {
      const { sdk } = await import("https://esm.sh/@farcaster/miniapp-sdk");
      await sdk.actions.composeCast({
        text: `I got ${score}/${TOTAL_QUESTIONS} on Friend Guessr! Can you beat me? @friend1 @friend2 @friend3`,
        embeds: [window.location.href],
      });
      alert("Challenge sent!");
    } catch (err) {
      console.error(err);
      alert("Failed to challenge friends.");
    }
  };
      }
