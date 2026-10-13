const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '..', 'memory_sessions.json');
const FACTS_FILE = path.join(__dirname, '..', 'memory_facts.json');

// Memory in-memory cache
let sessionMap = new Map();
let factsMap = new Map();

// Load sessions from disk
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      sessionMap = new Map(Object.entries(data));
    }
  } catch (e) {
    console.warn('⚠️ [MemoryManager] Gagal memuat memory_sessions.json:', e.message);
  }
}

// Save sessions to disk
let sessionSaveTimeout = null;
function saveSessionsDebounced() {
  if (sessionSaveTimeout) clearTimeout(sessionSaveTimeout);
  sessionSaveTimeout = setTimeout(() => {
    try {
      const obj = Object.fromEntries(sessionMap);
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.warn('⚠️ [MemoryManager] Gagal menyimpan memory_sessions.json:', e.message);
    }
  }, 1000);
}

// Load long-term facts from disk
function loadFacts() {
  try {
    if (fs.existsSync(FACTS_FILE)) {
      const raw = fs.readFileSync(FACTS_FILE, 'utf-8');
      const data = JSON.parse(raw);
      factsMap = new Map(Object.entries(data));
    }
  } catch (e) {
    console.warn('⚠️ [MemoryManager] Gagal memuat memory_facts.json:', e.message);
  }
}

// Save long-term facts to disk
function saveFacts() {
  try {
    const obj = Object.fromEntries(factsMap);
    fs.writeFileSync(FACTS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ [MemoryManager] Gagal menyimpan memory_facts.json:', e.message);
  }
}

// Init
loadSessions();
loadFacts();

// TTL 10 Menit untuk sesi percakapan aktif (sesuai jeda waktu mengobrol)
const SESSION_TTL = 10 * 60 * 1000;

// Bersihkan sesi kadaluarsa berkala (setiap 5 menit)
setInterval(() => {
  const now = Date.now();
  let modified = false;
  for (const [id, s] of sessionMap.entries()) {
    if (now - (s.lastActive || 0) > SESSION_TTL) {
      sessionMap.delete(id);
      modified = true;
    }
  }
  if (modified) saveSessionsDebounced();
}, 5 * 60 * 1000);

/**
 * Mengambil sesi percakapan
 */
function getSession(sessionId) {
  const now = Date.now();
  let session = sessionMap.get(sessionId);
  if (!session || (now - (session.lastActive || 0) > SESSION_TTL)) {
    session = { lastActive: now, turns: [] };
  }
  session.lastActive = now;
  sessionMap.set(sessionId, session);
  return session;
}

/**
 * Menyimpan turn percakapan baru
 */
function addSessionTurn(sessionId, role, text) {
  if (!sessionId || !text) return;
  const session = getSession(sessionId);
  session.turns.push({ role, text });

  // Simpan hingga 16 turns (8 pasang tanya-jawab)
  if (session.turns.length > 16) {
    session.turns = session.turns.slice(-16);
  }
  session.lastActive = Date.now();
  sessionMap.set(sessionId, session);
  saveSessionsDebounced();
}

/**
 * Me-reset memori sesi percakapan jangka pendek
 */
function resetSession(sessionId) {
  if (!sessionId) return false;
  sessionMap.delete(sessionId);
  for (const key of sessionMap.keys()) {
    if (key.includes(sessionId)) sessionMap.delete(key);
  }
  saveSessionsDebounced();
  return true;
}

/**
 * Mengambil fakta jangka panjang tentang user/grup
 */
function getLongTermFacts(targetId) {
  if (!targetId) return {};
  return factsMap.get(targetId) || {};
}

/**
 * Menyimpan fakta jangka panjang (Long-Term Memory)
 */
function saveFact(targetId, key, value) {
  if (!targetId || !key) return false;
  const current = factsMap.get(targetId) || {};
  current[key] = value;
  current.updatedAt = new Date().toISOString();
  factsMap.set(targetId, current);
  saveFacts();
  return true;
}

/**
 * Menghapus fakta jangka panjang
 */
function removeFact(targetId, key) {
  if (!targetId) return false;
  const current = factsMap.get(targetId);
  if (!current) return false;
  if (key) {
    delete current[key];
    factsMap.set(targetId, current);
  } else {
    factsMap.delete(targetId);
  }
  saveFacts();
  return true;
}

/**
 * Format fakta memori menjadi teks ringkas untuk prompt AI
 */
function getFormattedMemoryPrompt(targetId) {
  const facts = getLongTermFacts(targetId);
  const keys = Object.keys(facts).filter(k => k !== 'updatedAt');
  if (keys.length === 0) return 'Belum ada catatan memori khusus untuk pengguna ini.';

  return keys.map(k => `• ${k}: ${facts[k]}`).join('\n');
}

/**
 * Format memori untuk ditampilkan ke user (perintah !ingat)
 */
function formatMemoryForUser(targetId) {
  const facts = getLongTermFacts(targetId);
  const keys = Object.keys(facts).filter(k => k !== 'updatedAt');
  if (keys.length === 0) {
    return '🧠 *[Memori AI Kosong]*\nAI belum memiliki catatan jangka panjang khusus tentang kamu/grup ini.\nKamu bisa minta AI mengingat sesuatu, contoh:\n_\"AI, ingat nama panggilanku Ryan dari Kelas B ya\"_';
  }

  let text = '🧠 *[Catatan Memori Jangka Panjang AI]*\n\nBerikut hal-hal penting yang diingat AI tentangmu:\n';
  for (const k of keys) {
    text += `▫️ *${k}*: ${facts[k]}\n`;
  }
  text += '\n_Tips: Kamu bisa menyuruh AI melupakan dengan mengetik "AI, lupakan [topik]" atau gunakan perintah !lupakan._';
  return text;
}

module.exports = {
  getSession,
  addSessionTurn,
  resetSession,
  getLongTermFacts,
  saveFact,
  removeFact,
  getFormattedMemoryPrompt,
  formatMemoryForUser
};
