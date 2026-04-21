// =============================================
//  ตัวแปรทั้งหมดของเกม
// =============================================

// โหลดไฟล์เสียง snap.mp3 ไว้ตั้งแต่แรก พร้อมเล่นทันทีที่ต้องการ
const snapSound = new Audio('snap.mp3');

let TOTAL_TIME = getSelectedTime(); // เวลาตามโหมดที่เลือก (วินาที)

let totalLeft   = TOTAL_TIME; // เวลาที่เหลืออยู่ตอนนี้
let timerID     = null;       // ID ของ setInterval (ไว้ใช้ clearInterval)
let gameActive  = false;      // เกมกำลังเล่นอยู่ไหม

// สถานะสกิล
let timerPaused   = false; // Freeze กำลังทำงานอยู่ไหม
let slowActive    = false; // Slow กำลังทำงานอยู่ไหม
let slowTickCount = 0;     // นับ tick สำหรับ Slow (ทุก 2 tick ถึงจะลบ 1 วิ)
let effectTimeout = null;  // ID ของ setTimeout สกิล (ไว้ใช้ clearTimeout)

// สต็อกสกิล
const potions = { freeze: 1, slow: 1 };

// ข้อมูลคำ
const usedWords   = new Set(); // คำที่ใช้ไปแล้ว (ไม่ให้ซ้ำ)
const wordHistory = [];        // ลำดับคำทั้งหมดในรอบนี้

let currentWord    = ''; // คำที่พิมพ์ล่าสุด
let requiredLetter = ''; // ตัวอักษรที่คำต่อไปต้องขึ้นต้นด้วย

// คะแนน
let wordCount = 0;
let streak    = 0;
let best      = parseInt(localStorage.getItem('WordTail_solo_best') || '0');

// ===================== ปุ่ม pause ลับ (กด 5) =====================
// ใช้สำหรับอธิบายเกมให้อาจารย์ฟัง
let secretPaused = false;


// =============================================
//  อ่านค่าจาก UI
// =============================================

function getSelectedTime() {
  // อ่านตัวเลขจาก chip ที่มี class "sel" อยู่
  const chip = document.querySelector('#total-opts .diff-pill.sel');
  if (!chip) return 18; // default ถ้าไม่เจอ
  return parseInt(chip.querySelector('.dp-time').textContent);
}


// =============================================
//  การจัดการหน้าจอ (Setup / Game)
// =============================================

function showScreen(id) {
  // ซ่อนทุกหน้า แล้วแสดงแค่หน้าที่ต้องการ
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function selTotal(el, val) {
  // เมื่อกดเลือกโหมด → อัปเดต TOTAL_TIME และ highlight chip
  TOTAL_TIME = val;
  document.querySelectorAll('#total-opts .diff-pill').forEach(e => e.classList.remove('sel'));
  el.classList.add('sel');
}

function startGame() {
  // กดปุ่ม "เริ่มเกม" → อ่านเวลา, ไปหน้าเกม, รอ Enter
  TOTAL_TIME = getSelectedTime();
  showScreen('screen-game');
  resetGame();
  document.getElementById('ready-overlay').classList.add('show');
}

function beginGame() {
  // กด Enter หรือแตะ overlay → ซ่อน overlay แล้วเริ่มนับเวลา
  document.getElementById('ready-overlay').classList.remove('show');
  startTimer();
  document.getElementById('word-input').focus();
}

function goSetup() {
  // กด ✕ หรือกลับหน้า setup
  clearInterval(timerID);
  clearTimeout(effectTimeout);
  timerPaused  = false;
  slowActive   = false;
  secretPaused = false;
  gameActive   = false;
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('ready-overlay').classList.remove('show');
  showScreen('screen-setup');
}

function restartGame() {
  // กด "เล่นอีกรอบ" → reset แล้วรอ Enter อีกครั้ง
  document.getElementById('overlay').classList.remove('show');
  showScreen('screen-game');
  resetGame();
  document.getElementById('ready-overlay').classList.add('show');
}


// =============================================
//  Reset เกม (ล้างค่าทุกอย่าง ยังไม่เริ่มนับเวลา)
// =============================================

function resetGame() {
  // ล้างข้อมูลคำ
  wordHistory.length = 0;
  usedWords.clear();

  // reset สกิล
  potions.freeze = 1;
  potions.slow   = 1;
  timerPaused    = false;
  slowActive     = false;
  slowTickCount  = 0;
  secretPaused   = false;
  clearTimeout(effectTimeout);

  // reset ตัวแปรเกม
  currentWord    = '';
  requiredLetter = '';
  wordCount      = 0;
  streak         = 0;
  totalLeft      = TOTAL_TIME;
  gameActive     = false;

  // reset UI
  document.getElementById('history-list').innerHTML    = '';
  document.getElementById('word-input').value          = '';
  document.getElementById('word-input').disabled       = true;
  document.getElementById('btn-submit').disabled       = true;
  document.getElementById('current-word').textContent  = '—';
  document.getElementById('hint-line').innerHTML       = 'พิมพ์คำแรกได้เลย';
  document.getElementById('s-words').textContent       = '0';
  document.getElementById('s-best').textContent        = best;
  setStatus('');
  renderTimer();
  updatePotionUI();
  clearInterval(timerID);
}


// =============================================
//  Timer
// =============================================

function startTimer() {
  // เปิดใช้งาน input และเริ่มนับถอยหลัง
  gameActive    = true;
  timerPaused   = false;
  slowActive    = false;
  slowTickCount = 0;
  document.getElementById('word-input').disabled  = false;
  document.getElementById('btn-submit').disabled  = false;
  updatePotionUI();
  timerID = setInterval(tick, 1000); // เรียก tick() ทุก 1 วินาที
}

function tick() {
  // ฟังก์ชันนี้ถูกเรียกทุก 1 วินาที

  // ถ้า Freeze หรือ Pause ลับ → ไม่ทำอะไร เวลาไม่เดิน
  if (timerPaused || secretPaused) return;

  // ถ้า Slow → ข้ามทุก 2 tick (เหมือนเวลาเดินช้าลงครึ่งนึง)
  if (slowActive) {
    slowTickCount = (slowTickCount + 1) % 2;
    if (slowTickCount !== 0) return; // tick คี่ → ข้าม
  }

  // ลบเวลา 1 วินาที
  totalLeft--;
  renderTimer();

  // เวลาหมด → จบเกม
  if (totalLeft <= 0) {
    clearInterval(timerID);
    endGame();
  }
}

function renderTimer() {
  // วาดวงกลมนาฬิกาและตัวเลขเวลา
  const circumference = 188.5; // เส้นรอบวง = 2 × π × 30
  const pct    = Math.max(0, totalLeft / TOTAL_TIME);
  const offset = circumference * (1 - pct);

  const ring = document.getElementById('ring-fg');
  const num  = document.getElementById('timer-number');

  ring.style.strokeDashoffset = offset;
  ring.classList.toggle('danger', totalLeft <= 5 && !timerPaused && !secretPaused);

  // แสดงข้อความในวงกลม
  if (timerPaused || secretPaused) {
    num.textContent = 'STOP';
    num.classList.remove('danger');
  } else {
    num.textContent = totalLeft;
    num.classList.toggle('danger', totalLeft <= 5);
  }
}




// =============================================
//  ตรวจสอบคำที่พิมพ์
// =============================================

function validate(word) {
  if (!word)                   return { ok: false, msg: 'พิมพ์คำก่อนนะ' };
  if (!/^[a-z]+$/.test(word)) return { ok: false, msg: 'ใช้ตัวอักษรอังกฤษเท่านั้น' };
  if (usedWords.has(word))     return { ok: false, msg: `"${word}" ถูกใช้ไปแล้ว` };
  if (requiredLetter && word[0] !== requiredLetter)
    return { ok: false, msg: `ต้องขึ้นต้นด้วย "${requiredLetter.toUpperCase()}"` };
  // เช็ค wordlist (ถ้าโหลดสำเร็จ)
  if (validWords.size > 0 && !validWords.has(word))
    return { ok: false, msg: `"${word}" ไม่ใช่คำที่รู้จัก` };
  return { ok: true };
}


// =============================================
//  ส่งคำ
// =============================================

function submitWord() {
  if (!gameActive) return;

  const word = document.getElementById('word-input').value.trim().toLowerCase();
  const result = validate(word);

  // คำผิด → แสดง error แล้วหยุด
  if (!result.ok) {
    setStatus(result.msg, 'err');
    return;
  }

  // คำถูก → บันทึกและอัปเดต UI
  // เล่นเสียง snap ทุกครั้งที่ส่งคำสำเร็จ
  snapSound.currentTime = 0; // รีเซ็ตให้เล่นจากต้นทุกครั้ง (กรณีกดเร็วๆ)
  snapSound.play();
  usedWords.add(word);
  wordHistory.push(word);
  currentWord    = word;
  requiredLetter = word[word.length - 1]; // ตัวสุดท้ายของคำ

  renderWord(word);
  renderHint(requiredLetter);
  addTag(word);

  wordCount++;
  streak++;

  // อัปเดตสถิติ
  if (wordCount > best) {
    best = wordCount;
    localStorage.setItem('WordTail_solo_best', best);
  }
  document.getElementById('s-words').textContent = wordCount;
  document.getElementById('s-best').textContent  = best;

  // เพิ่มเวลา +5 วิ ต่อคำ (ไม่เกินเวลาสูงสุดของโหมดที่เลือก)
  totalLeft = Math.min(totalLeft + 5, TOTAL_TIME);
  renderTimer();

  // ล้าง input และรอคำต่อไป
  document.getElementById('word-input').value = '';
  setStatus('+1', 'ok');
  document.getElementById('word-input').focus();
}


// =============================================
//  จบเกม
// =============================================

function endGame() {
  gameActive = false;
  clearInterval(timerID);
  document.getElementById('word-input').disabled  = true;
  document.getElementById('btn-submit').disabled  = true;

  // เตรียมข้อมูลแสดงผล
  const playerName = document.getElementById('input-name').value.trim() || 'คุณ';
  const prevBest   = parseInt(localStorage.getItem('ll_prev_best') || '0');
  localStorage.setItem('ll_prev_best', wordCount);

  document.getElementById('o-score').textContent = wordCount;

  if (wordCount === 0) {
    document.getElementById('o-msg').textContent    = 'ไม่มีคำเลย ลองใหม่นะ';
    document.getElementById('o-record').textContent = '';
  } else if (wordCount > prevBest) {
    document.getElementById('o-msg').textContent    = `${playerName} ทำได้ ${wordCount} คำ`;
    document.getElementById('o-record').textContent = `สถิติใหม่! เดิม ${prevBest} คำ`;
  } else {
    document.getElementById('o-msg').textContent    = `${playerName} ทำได้ ${wordCount} คำ`;
    document.getElementById('o-record').textContent = `สถิติสูงสุด ${best} คำ`;
  }

  document.getElementById('overlay').classList.add('show');
}


// =============================================
//  UI Helpers (ฟังก์ชันเล็กๆ ช่วย render)
// =============================================

function setStatus(msg, type = '') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className   = type;
}

function renderWord(word) {
  // แสดงคำปัจจุบัน และ highlight ตัวอักษรสุดท้าย
  const el = document.getElementById('current-word');
  if (!word) { el.textContent = '—'; return; }
  const body = word.slice(0, -1);       // ทุกตัวยกเว้นตัวท้าย
  const last = word.slice(-1);          // ตัวท้ายอักษรเดียว
  el.innerHTML = `${body}<span class="hl">${last}</span>`;
}

function renderHint(letter) {
  // แสดงคำใบ้ว่าคำต่อไปต้องขึ้นต้นด้วยอะไร
  const el = document.getElementById('hint-line');
  if (!letter) {
    el.innerHTML = 'พิมพ์คำแรกได้เลย';
  } else {
    el.innerHTML = `คำต่อไปต้องขึ้นต้นด้วย <strong>${letter.toUpperCase()}</strong>`;
  }
}

function addTag(word) {
  // เพิ่มคำที่ใช้แล้วใน history แถบด้านล่าง
  const tag = document.createElement('div');
  tag.className   = 'word-tag';
  tag.textContent = word;
  document.getElementById('history-list').prepend(tag); // ใส่ไว้หัวสุด
}


// =============================================
//  Keyboard Shortcuts
// =============================================

document.addEventListener('keydown', function(e) {
  const isReady = document.getElementById('ready-overlay').classList.contains('show');

  // Enter ตอนรอเริ่ม → เริ่มเกม
  if (isReady && e.key === 'Enter') {
    beginGame();
    return;
  }

  // ปุ่มต่อไปนี้ใช้ได้เฉพาะตอนเกมกำลังเล่นอยู่เท่านั้น
  if (!gameActive || isReady) return;

  if (e.key === '1') {
    e.preventDefault(); // กันไม่ให้เลข 1 ไปพิมพ์ใน input
    usePotion('freeze');
  }

  if (e.key === '2') {
    e.preventDefault(); // กันไม่ให้เลข 2 ไปพิมพ์ใน input
    usePotion('slow');
  }

  // 5 = ปุ่มลับ หยุด/เล่นต่อ (สำหรับอธิบายเกมให้อาจารย์)
  if (e.key === '5') {
    e.preventDefault(); // กันไม่ให้เลข 5 ไปพิมพ์ใน input
    secretPaused = !secretPaused; // toggle หยุด/เล่นต่อ
    if (secretPaused) {
      setStatus('⏸ หยุดชั่วคราว (กด 5 เพื่อเล่นต่อ)', 'ok');
    } else {
      setStatus('▶ เล่นต่อแล้ว!', 'ok');
    }
    renderTimer();
  }
});

// Enter ใน input → ส่งคำ
document.getElementById('word-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitWord();
});