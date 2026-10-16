// ลิงก์ Google Sheets CSV ของคุณ
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSd8BSZPjascQ2cdoYOK3ry0iCd_a4UX_Ap6djWphXQW4_b2LPhlWxgqojGedObI_XaU9pw3RNMJUrO/pub?gid=0&single=true&output=csv";

// ชุดโจทย์สำรอง
let defaultQuestions = [
    {
        image: "https://www.google.com/logos/2010/pacman10-i.png",
        hints: ["เกมคลาสสิกวงกลมเหลือง", "วิ่งหนีผีสี่สี", "เกมกินจุดแพคแมน"],
        answer: "PAC-MAN"
    }
];

let questions = [];
let currentQuestionIndex = 0;
let teams = [];
let activeTeamIndex = 0;
let hintCount = 0;
let timerInterval = null;
let isPaused = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'hint') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.25);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'correct') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now); osc.stop(now + 0.35);
    } else if (type === 'tick') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'out') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'win') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const noteOsc = audioCtx.createOscillator();
            const noteGain = audioCtx.createGain();
            noteOsc.type = 'triangle';
            noteOsc.frequency.setValueAtTime(freq, now + idx * 0.12);
            noteGain.gain.setValueAtTime(0.3, now + idx * 0.12);
            noteGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.4);
            noteOsc.connect(noteGain);
            noteGain.connect(audioCtx.destination);
            noteOsc.start(now + idx * 0.12);
            noteOsc.stop(now + idx * 0.12 + 0.4);
        });
    }
}

async function startGame() {
    const numTeams = parseInt(document.getElementById('num-teams').value);
    const startTime = parseInt(document.getElementById('start-time').value);
    const shouldShuffle = document.getElementById('shuffle-teams').checked;

    questions = [...defaultQuestions];
    if (SHEET_CSV_URL.trim() !== "") {
        try {
            const res = await fetch(SHEET_CSV_URL);
            const text = await res.text();
            const rows = text.split('\n').map(row => row.split(','));
            let loaded = [];
            for (let i = 1; i < rows.length; i++) {
                let r = rows[i];
                if (r.length >= 5) {
                    loaded.push({
                        image: r[0].trim().replace(/^"|"$/g, ''),
                        hints: [r[1].trim().replace(/^"|"$/g, ''), r[2].trim().replace(/^"|"$/g, ''), r[3].trim().replace(/^"\vert{}"$/g, '')],
                        answer: r[4].trim().replace(/^"|"$/g, '')
                    });
                }
            }
            if (loaded.length > 0) questions = loaded;
        } catch (err) {
            console.warn("ไม่สามารถโหลดจาก CSV ได้ ระบบจะใช้ชุดโจทย์สำรองแทน", err);
        }
    }

    questions.sort(() => Math.random() - 0.5);

    teams = [];
    const teamNames = ['ทีม A', 'ทีม B', 'ทีม C', 'ทีม D'];
    for (let i = 0; i < numTeams; i++) {
        teams.push({ id: i, name: teamNames[i], time: startTime, isEliminated: false });
    }

    if (shouldShuffle) {
        teams.sort(() => Math.random() - 0.5);
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    renderTeamsUI();
    loadQuestion();
    startTimer();
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isPaused) return;

        let currentTeam = teams[activeTeamIndex];
        if (!currentTeam.isEliminated) {
            currentTeam.time--;
            if (currentTeam.time <= 10 && currentTeam.time > 0) playSound('tick');
            if (currentTeam.time <= 0) {
                currentTeam.time = 0;
                currentTeam.isEliminated = true;
                playSound('out');
                checkGameStatus();
            }
            updateTimerUI();
        }
    }, 1000);
}

function nextTurn() {
    let loops = 0;
    do {
        activeTeamIndex = (activeTeamIndex + 1) % teams.length;
        loops++;
    } while (teams[activeTeamIndex].isEliminated && loops < teams.length);
    hintCount = 0;
    updateTurnUI();
}

function loadQuestion() {
    if (currentQuestionIndex >= questions.length) {
        currentQuestionIndex = 0;
        questions.sort(() => Math.random() - 0.5);
    }

    const q = questions[currentQuestionIndex];
    document.getElementById('doodle-img').src = q.image;
    
    // เอาข้อความเฉลยออก เหลือไว้แค่แสดงหมายเลขข้อเท่านั้น
    document.getElementById('question-counter').innerText = `ข้อที่ ${currentQuestionIndex + 1}`;
    
    document.getElementById('hints-container').innerHTML = `<div class="text-sm text-slate-400 italic">💡 คำใบ้ยังไม่ถูกเปิด (กดปุ่มเปิดคำใบ้ด้านล่าง)</div>`;
}

function useHint() {
    const q = questions[currentQuestionIndex];
    if (hintCount >= 3) {
        alert('เปิดคำใบ้ครบ 3 ข้อแล้ว!');
        return;
    }

    playSound('hint');
    let penalty = hintCount === 0 ? 2 : (hintCount === 1 ? 3 : 5);

    teams[activeTeamIndex].time = Math.max(0, teams[activeTeamIndex].time - penalty);
    if (teams[activeTeamIndex].time === 0) {
        teams[activeTeamIndex].isEliminated = true;
        playSound('out');
        checkGameStatus();
    }
    updateTimerUI();

    hintCount++;
    let hintsHtml = '';
    for (let i = 0; i < hintCount; i++) {
        hintsHtml += `<div class="bg-slate-900/80 p-2.5 rounded-lg border border-slate-700 text-sm text-yellow-300"><b>คำใบ้ที่ ${i+1}:</b> ${q.hints[i]}</div>`;
    }
    document.getElementById('hints-container').innerHTML = hintsHtml;
}

function wrongAnswer() {
    playSound('wrong');
    teams[activeTeamIndex].time = Math.max(0, teams[activeTeamIndex].time - 3);
    if (teams[activeTeamIndex].time === 0) {
        teams[activeTeamIndex].isEliminated = true;
        playSound('out');
        checkGameStatus();
    }
    updateTimerUI();
    isPaused = true;
    setTimeout(() => { isPaused = false; }, 2000);
}

function correctAnswer() {
    playSound('correct');
    currentQuestionIndex++;
    nextTurn();
    loadQuestion();
}

function checkGameStatus() {
    const activeTeams = teams.filter(t => !t.isEliminated);
    if (activeTeams.length <= 1) {
        clearInterval(timerInterval);
        playSound('win');
        const winner = activeTeams.length === 1 ? activeTeams[0].name : "เสมอ (เวลาหมดพร้อมกัน)";
        document.getElementById('winner-text').innerText = `🏆 ผู้ชนะคือ: ${winner}!`;
        document.getElementById('game-over-modal').classList.remove('hidden');
    } else {
        nextTurn();
    }
}

function renderTeamsUI() {
    const container = document.getElementById('teams-container');
    container.innerHTML = teams.map((t, idx) => `
        <div id="team-card-${idx}" class="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center transition">
            <div class="font-bold text-lg text-slate-200">${t.name}</div>
            <div id="team-time-${idx}" class="text-3xl font-extrabold text-yellow-400 my-1">${t.time}s</div>
            <div id="team-status-${idx}" class="text-xs text-slate-400">กำลังเล่น</div>
        </div>
    `).join('');
    updateTurnUI();
}

function updateTimerUI() {
    teams.forEach((t, idx) => {
        const timeEl = document.getElementById(`team-time-${idx}`);
        if (timeEl) timeEl.innerText = `${t.time}s`;

        const card = document.getElementById(`team-card-${idx}`);
        const status = document.getElementById(`team-status-${idx}`);
        if (t.isEliminated && card) {
            card.classList.add('eliminated-card');
            if (status) {
                status.innerText = '❌ ตกรอบ';
                status.className = 'text-xs text-red-400 font-bold';
            }
        }
    });
}

function updateTurnUI() {
    teams.forEach((t, idx) => {
        const card = document.getElementById(`team-card-${idx}`);
        const status = document.getElementById(`team-status-${idx}`);
        if (!t.isEliminated && card) {
            if (idx === activeTeamIndex) {
                card.classList.add('active-turn-card', 'ring-2', 'ring-yellow-400');
                if (status) status.innerText = '👉 ตาของคุณ';
            } else {
                card.classList.remove('active-turn-card', 'ring-2', 'ring-yellow-400');
                if (status) status.innerText = 'รอคิว...';
            }
        }
    });
    document.getElementById('current-turn-badge').innerText = `ตาของ: ${teams[activeTeamIndex].name}`;
}