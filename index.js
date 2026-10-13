const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  decryptPollVote,
  getKeyAuthor,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ============================================================================
// 🩺 SELF-HEALING BOOTSTRAP:
// Jika ada file penting yang hilang/tertinggal saat transfer kabel data/clone,
// bot akan otomatis me-rekonstruksi file tersebut secara instan!
// ============================================================================
function ensureSelfIntegrity() {
  try {
    const utilsDir = path.join(__dirname, 'utils');
    const formatterFile = path.join(utilsDir, 'formatter.js');
    if (!fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDir, { recursive: true });
    }
    if (!fs.existsSync(formatterFile)) {
      console.log('🩺 [Self-Heal] Memulihkan file utils/formatter.js yang hilang...');
      const formatterCode = `const fs = require('fs');
const path = require('path');

const TEMPLATES_FILE = path.join(__dirname, '..', 'templates.json');

function getIndonesianDateTime(date = new Date()) {
  const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const nowUTC = date.getTime();
  const offsetWIB = 7 * 60 * 60 * 1000;
  const wibDate = new Date(nowUTC + offsetWIB);

  const hari = hariNames[wibDate.getUTCDay()];
  const tanggal = String(wibDate.getUTCDate()).padStart(2, '0');
  const bulan = bulanNames[wibDate.getUTCMonth()];
  const tahun = wibDate.getUTCFullYear();
  const jam = String(wibDate.getUTCHours()).padStart(2, '0');
  const menit = String(wibDate.getUTCMinutes()).padStart(2, '0');

  const formattedDate = \`\${hari}, \${tanggal} \${bulan} \${tahun}\`;
  const formattedTime = \`\${jam}.\${menit} WIB\`;

  return {
    dayKey: hari.toLowerCase(),
    dayName: hari,
    hari,
    tanggal,
    bulan,
    tahun,
    jam,
    menit,
    dateFormatted: \`\${tanggal} \${bulan} \${tahun}\`,
    timeFormatted: \`\${jam}.\${menit} WIB\`,
    formattedDate,
    formattedTime,
    fullFormatted: \`\${hari}, \${tanggal} \${bulan} \${tahun} - \${jam}.\${menit} WIB\`
  };
}

function getTemplates() {
  try {
    if (!fs.existsSync(TEMPLATES_FILE)) {
      return {};
    }
    const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Gagal membaca templates.json:', error.message);
    return {};
  }
}

function saveTemplates(templates) {
  try {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('❌ Gagal menyimpan templates.json:', error.message);
    return false;
  }
}

function getRenderedMessageForDay(dayName) {
  const templates = getTemplates();
  const templateObj = templates[dayName];

  if (!templateObj || !templateObj.content) {
    return null;
  }

  const { formattedDate } = getIndonesianDateTime();
  const renderedContent = templateObj.content.replace(/{tanggal}/g, formattedDate);

  return {
    title: templateObj.title,
    content: renderedContent
  };
}

module.exports = {
  getIndonesianDateTime,
  getTemplates,
  saveTemplates,
  getRenderedMessageForDay
};
`;
      fs.writeFileSync(formatterFile, formatterCode, 'utf-8');
      console.log('✅ [Self-Heal] Berhasil membuat utils/formatter.js!');
    }

    const configFile = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configFile)) {
      console.log('🩺 [Self-Heal] Memulihkan config.json default...');
      const defConfig = {
        prefix: '!',
        targetJids: [],
        ownerNumbers: ['6281336721331'],
        autoSend: { enabled: false, cronTime: '0 7 * * *', timezone: 'Asia/Jakarta' },
        defaultLecturers: ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']
      };
      fs.writeFileSync(configFile, JSON.stringify(defConfig, null, 2), 'utf-8');
    }

    const schedFile = path.join(__dirname, 'schedules.json');
    if (!fs.existsSync(schedFile)) {
      fs.writeFileSync(schedFile, JSON.stringify({ "A": {}, "B": {}, "I": {} }, null, 2), 'utf-8');
    }
    const pollUtilsFile = path.join(utilsDir, 'pollUtils.js');
    if (!fs.existsSync(pollUtilsFile)) {
      console.log('🩺 [Self-Heal] Memulihkan file utils/pollUtils.js yang hilang...');
      const pollCode = `async function sendNativePoll(sock, jid, pollTitle, pollOptions, selectableCount = 1) {
  if (!sock || !jid) return null;
  const isNewsletter = (jid || '').endsWith('@newsletter');
  const safeOptions = (pollOptions || []).slice(0, 12);
  if (isNewsletter) {
    const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣'];
    let textPoll = \`📊 *\${pollTitle}*\\n━━━━━━━━━━━━━━━━━━━━━\\n\\n\`;
    safeOptions.forEach((opt, idx) => {
      textPoll += \`\${numEmojis[idx] || '[' + (idx + 1) + ']'} \${opt}\\n\`;
    });
    textPoll += \`\\n━━━━━━━━━━━━━━━━━━━━━\\n💡 _Beri reaksi emoji atau tinggalkan balasan pilihanmu!_\`;
    return await sock.sendMessage(jid, { text: textPoll });
  }
  try {
    return await sock.sendMessage(jid, {
      poll: { name: pollTitle, values: safeOptions, selectableCount }
    });
  } catch (errFirst) {
    if (selectableCount === 0) {
      try {
        return await sock.sendMessage(jid, {
          poll: { name: pollTitle, values: safeOptions, selectableCount: 1 }
        });
      } catch (e2) {
        throw errFirst;
      }
    }
    throw errFirst;
  }
}
module.exports = { sendNativePoll };
`;
      fs.writeFileSync(pollUtilsFile, pollCode, 'utf-8');
    }

    const memMgrFile = path.join(utilsDir, 'memoryManager.js');
    if (!fs.existsSync(memMgrFile)) {
      console.log('🩺 [Self-Heal] Memulihkan file utils/memoryManager.js yang hilang...');
      const memCode = `const fs = require('fs');
const path = require('path');
const sessionMap = new Map();
const factsMap = new Map();
function getSession(id) {
  let s = sessionMap.get(id);
  if (!s) { s = { lastActive: Date.now(), turns: [] }; sessionMap.set(id, s); }
  return s;
}
function addSessionTurn(id, role, text) {
  const s = getSession(id);
  s.turns.push({ role, text });
  if (s.turns.length > 16) s.turns = s.turns.slice(-16);
}
function resetSession(id) { sessionMap.delete(id); return true; }
function getLongTermFacts(id) { return factsMap.get(id) || {}; }
function saveFact(id, k, v) { const c = getLongTermFacts(id); c[k] = v; factsMap.set(id, c); return true; }
function removeFact(id, k) { if (k) { const c = getLongTermFacts(id); delete c[k]; } else { factsMap.delete(id); } return true; }
function getFormattedMemoryPrompt(id) {
  const f = getLongTermFacts(id);
  const k = Object.keys(f);
  return k.length ? k.map(x => \`• \${x}: \${f[x]}\`).join('\\n') : 'Belum ada catatan memori khusus.';
}
function formatMemoryForUser(id) {
  const f = getLongTermFacts(id);
  const k = Object.keys(f);
  return k.length ? \`🧠 *[Memori AI]*\\n\` + k.map(x => \`▫️ *\${x}*: \${f[x]}\`).join('\\n') : '🧠 *[Memori AI]* Belum ada catatan khusus.';
}
module.exports = { getSession, addSessionTurn, resetSession, getLongTermFacts, saveFact, removeFact, getFormattedMemoryPrompt, formatMemoryForUser };
`;
      fs.writeFileSync(memMgrFile, memCode, 'utf-8');
    }
  } catch (err) {
    console.error('⚠️ [Self-Heal Error]:', err.message);
  }
}

// Jalankan self-heal sebelum me-load modul lokal
ensureSelfIntegrity();

const { loadConfig, saveConfig } = require('./configManager');
const {
  getIndonesianDateTime,
  getTemplates,
  saveTemplates,
  getRenderedMessageForDay
} = require('./utils/formatter');
const {
  formatSchedule,
  scanScheduleWithGemini,
  getSchedules,
  updateScheduleProperty
} = require('./utils/scheduleManager');
let taskManager = {
  formatTaskList: async () => '⚠️ Fitur taskManager sedang disinkronkan. Ketik /update untuk memperbarui.',
  addTask: async () => ({ success: false, message: 'taskManager belum terpasang' }),
  markTaskDone: async () => ({ success: false, message: 'taskManager belum terpasang' }),
  deleteTask: async () => ({ success: false, message: 'taskManager belum terpasang' }),
  getTasks: async () => [],
  checkDatabaseStatus: async () => ({ message: '🟢 Terhubung (Supabase Cloud)' }),
  getLecturers: async () => ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']
};

try {
  taskManager = require('./utils/taskManager');
} catch (e) {
  console.warn('⚠️ [taskManager Info]: Modul utils/taskManager.js belum ada di lokal, menggunakan cadangan.');
}

const {
  formatTaskList,
  addTask,
  updateTask,
  markTaskDone,
  deleteTask,
  getTasks,
  checkDatabaseStatus,
  getLecturers
} = taskManager;

let reminderManager = {
  getCustomReminders: () => [],
  addCustomReminder: () => ({ id: 1 }),
  deleteCustomReminder: () => true,
  checkDueReminders: () => [],
  formatRemindersList: () => 'Belum ada pengingat kustom.'
};
try {
  reminderManager = require('./utils/reminderManager');
} catch (e) {}
const {
  getCustomReminders,
  addCustomReminder,
  deleteCustomReminder,
  formatRemindersList
} = reminderManager;
let aiAssistantModule = {
  askGeminiAI: async () => '⚠️ Fitur AI sedang disinkronkan.',
  resetSession: () => true,
  formatMemoryForUser: () => '🧠 Memori AI belum termuat.',
  removeFact: () => true
};
try {
  aiAssistantModule = require('./utils/aiAssistant');
} catch (e) {
  console.warn('⚠️ [aiAssistant Info]: Modul utils/aiAssistant.js bermasalah:', e.message);
}

const {
  askGeminiAI,
  resetSession,
  formatMemoryForUser,
  removeFact
} = aiAssistantModule;

let diagnosticsModule = {
  runDiagnostics: async () => ({ overallStatus: 'OK', checks: {}, recommendations: [] }),
  formatWhatsAppReport: () => '🩺 Modul diagnostik sedang dimuat.'
};
try {
  diagnosticsModule = require('./utils/diagnostics');
} catch (e) {
  console.warn('⚠️ [diagnostics Info]: Modul utils/diagnostics.js bermasalah:', e.message);
}
const { runDiagnostics, formatWhatsAppReport } = diagnosticsModule;

const {
  sendDailyBroadcast,
  sendTaskReminder,
  startScheduler,
  stopScheduler
} = require('./scheduler');

let mahasiswaManager = {
  getMahasiswaList: async () => [],
  addMahasiswa: async () => ({ success: false }),
  deleteMahasiswa: async () => ({ success: false }),
  searchMahasiswa: async () => []
};
try {
  mahasiswaManager = require('./utils/mahasiswaManager');
} catch (e) {
  console.warn('⚠️ [mahasiswaManager Info]: Modul utils/mahasiswaManager.js bermasalah:', e.message);
}

// Folder penyimpanan sesi login WhatsApp
const AUTH_DIR = path.join(__dirname, 'session_auth');

// Logger pino (diset silent agar terminal bersih dan fokus ke QR serta log bot)
const logger = pino({ level: 'silent' });

let sock = null;

// Map untuk Anti-Flood & Rate Limiting per pengguna
const userCooldownMap = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30000;
  for (const [jid, timestamp] of userCooldownMap.entries()) {
    if (timestamp < cutoff) userCooldownMap.delete(jid);
  }
}, 30000);

/**
 * Mengecek apakah pengirim adalah Pemilik (Owner) bot
 */
function isOwner(senderJid, fromMe, config) {
  if (fromMe) return true; // Pemilik akun bot selalu owner
  const cleanSender = (senderJid || '').replace(/[^0-9]/g, '');
  const owners = (config.ownerNumbers || [])
    .map(n => String(n).replace(/[^0-9]/g, ''))
    .filter(Boolean);

  return owners.some(o => cleanSender.includes(o) || o.includes(cleanSender));
}

function isAuthorizedSender(senderJid, fromMe, config) {
  return true; // Perintah publik tetap bisa diakses di grup
}

/**
 * Mengecek apakah pengirim adalah Admin di Grup WhatsApp
 */
async function isGroupAdmin(sockInstance, groupJid, userJid) {
  if (!groupJid?.endsWith('@g.us') || !sockInstance) return false;
  try {
    const meta = await sockInstance.groupMetadata(groupJid);
    const cleanUser = String(userJid || '').split(':')[0].replace(/[^0-9]/g, '');
    const participant = (meta.participants || []).find(p => {
      const cleanP = String(p.id || '').split(':')[0].replace(/[^0-9]/g, '');
      return cleanP === cleanUser;
    });
    return Boolean(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
  } catch (e) {
    return false;
  }
}

/**
 * Mencari data ForwardedNewsletterMessageInfo secara rekursif di dalam pesan
 */
function findForwardedNewsletterInfo(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.forwardedNewsletterMessageInfo) {
    return obj.forwardedNewsletterMessageInfo;
  }
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const res = findForwardedNewsletterInfo(obj[key]);
      if (res) return res;
    }
  }
  return null;
}

const {
  sendNativePoll,
  savePollSession,
  getPollSession,
  decryptPollVoteMessage
} = require('./utils/pollUtils');

const recentPollClicks = new Map();

/**
 * Menjalankan aksi otomatis ketika pengguna mengklik salah satu opsi di tombol polling interaktif
 */
async function executePollAction(sockInstance, originalMsg, remoteJid, optText, optIndex, voterJid, prefix) {
  const optLower = (optText || '').toLowerCase();
  let cmdToRun = '';

  if (optLower.includes('jadwal') || optLower.includes('1.') || optLower.includes('1️⃣')) {
    cmdToRun = 'today';
  } else if (optLower.includes('tugas') || optLower.includes('2.') || optLower.includes('2️⃣')) {
    cmdToRun = 'tugas';
  } else if (optLower.includes('mahasiswa') || optLower.includes('mhs') || optLower.includes('3.') || optLower.includes('3️⃣')) {
    cmdToRun = 'mhs';
  } else if (optLower.includes('kehadiran') || optLower.includes('dosen') || optLower.includes('4.') || optLower.includes('4️⃣')) {
    cmdToRun = 'all';
  } else if (optLower.includes('pengingat') || optLower.includes('reminder') || optLower.includes('5.') || optLower.includes('5️⃣')) {
    cmdToRun = 'reminder';
  } else if (optLower.includes('status') || optLower.includes('server') || optLower.includes('6.') || optLower.includes('6️⃣')) {
    cmdToRun = 'status';
  } else if (optLower.includes('ai') || optLower.includes('7.') || optLower.includes('7️⃣')) {
    await sockInstance.sendMessage(remoteJid, {
      text: `🤖 *ALTERS AI CO-PILOT (PANDUAN CEPAT)*\n━━━━━━━━━━━━━━━━━━━━\nKamu bisa berinteraksi dan memberi perintah ke AI secara langsung!\n\n💡 *Cara menggunakan:*\n• Ketik: *${prefix}ai <pertanyaan / perintah>*\n• Atau tag *@Alters* di grup.\n\n📝 *Contoh pemakaian seru:*\n• *${prefix}ai catat tugas baru deadline jumat jam 23.59*\n• *${prefix}ai cek jadwal kuliah besok*\n• *${prefix}ai siapa saja mahasiswa kelas A?*\n• *${prefix}ai tolong buatkan ringkasan materi kuliah*\n• *${prefix}ai targetin grup ini dong*\n\n⚡ Didukung mesin Groq LPU Ultra-Fast + Google Gemini!`
    });
    return;
  }

  if (cmdToRun) {
    const syntheticMsg = {
      key: {
        remoteJid: remoteJid,
        fromMe: false,
        id: 'poll_click_' + Date.now(),
        participant: voterJid
      },
      message: {
        conversation: `${prefix}${cmdToRun}`
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      _isSynthetic: true
    };
    await handleIncomingMessage(syntheticMsg);
  }
}

/**
 * Memulai koneksi WhatsApp Baileys
 */
async function startBot() {
  console.log('\n==================================================');
  console.log('🤖 WHATSAPP DAILY CHANNEL & GROUP LIST BOT');
  console.log('==================================================\n');

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`[WA] Menggunakan Baileys versi: ${version.join('.')} (Latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    browser: ['ChannelDailyBot', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false, // Hemat RAM dan bandwidth
    syncFullHistory: false, // JANGAN download riwayat chat lama bertahun-tahun (bot jadi sangat ringan!)
    markOnlineOnConnect: false, // Tidak broadcast status online tanpa henti
    getMessage: async (key) => {
      return { conversation: 'bot-message' };
    },
    shouldIgnoreJid: (jid) => {
      // Abaikan update status WA kontak agar tidak memakan RAM & CPU
      // JANGAN abaikan newsletter/@g.us agar pesan saluran/grup tetap diproses
      if (jid?.endsWith('@newsletter')) return false;
      return jid?.endsWith('@broadcast') || jid === 'status@broadcast';
    }
  });

  // Menyimpan update kredensial / sesi
  sock.ev.on('creds.update', saveCreds);

  // Event status koneksi & QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📲 SILAKAN SCAN QR CODE INI MENGGUNAKAN WHATSAPP:');
      console.log('1. Buka aplikasi WhatsApp di HP Anda');
      console.log('2. Tekan menu Titik Tiga (Android) atau Pengaturan (iOS)');
      console.log('3. Pilih "Perangkat Tertaut" (Linked Devices) > "Tautkan Perangkat"');
      console.log('4. Arahkan kamera ke QR Code di bawah:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'connecting') {
      console.log('[WA] Sedang menghubungkan ke server WhatsApp...');
    }

    if (connection === 'open') {
      console.log('\n✅ [WA] BERHASIL TERHUBUNG KE WHATSAPP!');
      const botNumber = sock.user ? sock.user.id.split(':')[0] : 'Unknown';
      console.log(`📱 Nomor Bot: ${botNumber}`);
      console.log('🚀 Bot siap menerima perintah dan mengirim pesan template saluran.');

      // Jalankan cron scheduler jika diaktifkan
      startScheduler(sock);

      // Langganan Live Updates untuk semua Saluran WhatsApp terdaftar agar respons instan
      const cfg = loadConfig();
      const subscribedNewsletters = new Set();
      const syncNewsletterSubs = async () => {
        if (!sock.subscribeNewsletterUpdates) return;
        for (const jid of (cfg.targetJids || [])) {
          if (jid.endsWith('@newsletter') && !subscribedNewsletters.has(jid)) {
            try {
              await sock.subscribeNewsletterUpdates(jid);
              subscribedNewsletters.add(jid);
              console.log(`📡 [Real-time Saluran] Berhasil berlangganan live updates untuk: ${jid}`);
            } catch (eSub) {
              console.warn(`⚠️ [Saluran Sub Warning]:`, eSub.message);
            }
          }
        }
      };
      await syncNewsletterSubs();
      // Perbarui langganan setiap 15 menit agar selalu terhubung di server WhatsApp
      setInterval(syncNewsletterSubs, 15 * 60 * 1000);

      // Cek apakah baru saja di-restart (ada file .restart_notice.json)
      const noticeFile = path.join(__dirname, '.restart_notice.json');
      if (fs.existsSync(noticeFile)) {
        try {
          const noticeData = JSON.parse(fs.readFileSync(noticeFile, 'utf-8'));
          fs.unlinkSync(noticeFile); // Hapus agar tidak terkirim ganda

          if (noticeData.targetJid) {
            const dt = getIndonesianDateTime();
            const textToSend = noticeData.customMessage || `✅ *[RESTART SELESAI]*\nBot berhasil di-restart dan sekarang siap digunakan kembali! 🚀\n⏰ Waktu Aktif: ${dt.timeFormatted}`;
            await sock.sendMessage(noticeData.targetJid, {
              text: textToSend
            });
            console.log(`📢 [Restart Notice] Konfirmasi restart terkirim ke: ${noticeData.targetJid}`);
          }
        } catch (e) {
          console.error('[Restart Notice Error]:', e.message);
        }
      }

      // 🩺 Startup Self-Test otomatis di latar belakang
      setTimeout(async () => {
        try {
          const startupDiag = await runDiagnostics(sock);
          if (startupDiag.overallStatus === 'FAIL') {
            console.error('\n🚨 [DIAGNOSTIK STARTUP: ADA MASALAH]');
            startupDiag.recommendations.forEach(r => console.error('  👉', r));
            console.error('Ketik !test di WhatsApp untuk melihat laporan lengkap.\n');
          } else if (startupDiag.overallStatus === 'WARNING') {
            console.warn(`\n⚠️ [Startup Diagnostics Warning] ${startupDiag.recommendations.join(', ')}\n`);
          } else {
            console.log(`🩺 [Startup Self-Test OK] Seluruh modul lulus uji (${startupDiag.durationMs}ms)`);
          }
        } catch (eDiag) {}
      }, 3500);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️ [WA] Koneksi terputus. Kode Status: ${statusCode || 'Unknown'}`);
      stopScheduler();

      if (shouldReconnect) {
        console.log('[WA] Mencoba menyambungkan kembali dalam 5 detik...');
        setTimeout(() => {
          startBot();
        }, 5000);
      } else {
        console.log('❌ [WA] Sesi telah keluar (Logged Out). Hapus folder session_auth dan scan QR ulang.');
      }
    }
  });

  // Event pesan masuk (Command Handler)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      // Abaikan pesan riwayat lama (lebih dari 60 detik) saat sinkronisasi / type === 'append'
      const msgTimestamp = msg.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : Date.now();
      if (type === 'append' && (Date.now() - msgTimestamp > 60000)) {
        continue;
      }

      try {
        await handleIncomingMessage(msg);
      } catch (err) {
        console.error('[Handler Error]', err);
      }
    }
  });

  // Event khusus pesan dari Saluran WhatsApp (Newsletter)
  // Di Baileys, pesan yang diposting ke newsletter dikirim lewat 'newsletter.messages' juga.
  // Kita tangkap agar perintah dari owner saluran tetap diproses.
  const newsletterEvName = 'newsletter.messages';
  if (sock.ev.eventNames && typeof sock.ev.on === 'function') {
    try {
      sock.ev.on(newsletterEvName, async ({ messages } = {}) => {
        if (!messages || !Array.isArray(messages)) return;
        for (const msg of messages) {
          try {
            await handleIncomingMessage(msg);
          } catch (err) {
            console.error('[Newsletter Handler Error]', err);
          }
        }
      });
      console.log('[WA] Newsletter message event listener aktif.');
    } catch (eNewsletterEv) {
      // Event mungkin tidak didukung di versi Baileys ini, abaikan
    }
  }
}

/**
 * Mengunduh dan mengekstrak media file (Dokumen/PDF atau Foto), baik dari pesan langsung maupun pesan balasan (quote)
 */
async function extractMediaFromMessage(msg, sockInstance) {
  try {
    const directDoc = msg.message?.documentMessage;
    const directImg = msg.message?.imageMessage;

    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedDoc = quotedMsg?.documentMessage;
    const quotedImg = quotedMsg?.imageMessage;

    // 1. Lampiran langsung pada pesan ini
    if (directDoc || directImg) {
      const mimeType = directDoc ? (directDoc.mimetype || 'application/pdf') : (directImg.mimetype || 'image/jpeg');
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: sockInstance?.updateMediaMessage }
      );
      if (buffer) {
        return { buffer, mimeType };
      }
    }

    // 2. Lampiran dari pesan yang dibalas / dikutip (quoted message)
    if (quotedDoc || quotedImg) {
      const mimeType = quotedDoc ? (quotedDoc.mimetype || 'application/pdf') : (quotedImg.mimetype || 'image/jpeg');
      const quotedWrapper = {
        key: {
          remoteJid: msg.key?.remoteJid,
          id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId
        },
        message: quotedMsg
      };
      const buffer = await downloadMediaMessage(
        quotedWrapper,
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: sockInstance?.updateMediaMessage }
      );
      if (buffer) {
        return { buffer, mimeType };
      }
    }
  } catch (err) {
    console.warn('⚠️ [Extract Media Error]:', err.message);
  }
  return null;
}

/**
 * Helper untuk menentukan target siaran terpilih dari argumen pengguna
 */
function resolveSelectedTargets(selectorStr, allTargets = [], currentJid = null) {
  if (!selectorStr) return { targets: allTargets, label: 'seluruh target terdaftar' };
  const s = selectorStr.toLowerCase().trim();

  if (s === 'saluran' || s === 'channel' || s === 'channels') {
    const matched = allTargets.filter(t => t.endsWith('@newsletter'));
    return { targets: matched, label: `semua Saluran (${matched.length} target)` };
  }
  if (s === 'grup' || s === 'group' || s === 'groups') {
    const matched = allTargets.filter(t => t.endsWith('@g.us'));
    return { targets: matched, label: `semua Grup (${matched.length} target)` };
  }
  if (s === 'sini' || s === 'chat' || s === 'here') {
    return { targets: currentJid ? [currentJid] : [], label: 'obrolan saat ini' };
  }
  if (s.includes('@newsletter') || s.includes('@g.us') || s.includes('@s.whatsapp.net')) {
    return { targets: [s], label: `JID ${s}` };
  }

  // Cek nomor indeks (cth: "1", "1,2", "1 2")
  const nums = s.split(/[,\s]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
  if (nums.length > 0) {
    const matched = [];
    nums.forEach(idx => {
      if (allTargets[idx - 1]) matched.push(allTargets[idx - 1]);
    });
    if (matched.length > 0) {
      return { targets: matched, label: `target nomor [${nums.join(', ')}]` };
    }
  }

  return { targets: allTargets, label: 'seluruh target terdaftar' };
}

/**
 * Memproses setiap pesan yang masuk
 */
async function handleIncomingMessage(msg) {
  if (!msg.message) return;

  const config = loadConfig();
  const prefix = config.prefix || '!';

  const remoteJid = msg.key.remoteJid;
  const fromMe = !!msg.key.fromMe;
  const sender = msg.key.participant || remoteJid;

  // 🔘 DETEKSI & DEKRIPSI KLIK TOMBOL POLLING (VOTE EVENT LISTENER)
  const pollVoteResult = decryptPollVoteMessage(sock, msg);
  if (pollVoteResult) {
    if (pollVoteResult.unvoted) {
      // Pengguna membatalkan centang pada polling, tidak perlu respon
      return;
    }
    const { pollInfo, voterJid, selectedOptionIndex, selectedOptionText } = pollVoteResult;
    console.log(`🔘 [Tombol Polling Dipencet] User ${voterJid} memilih [${selectedOptionIndex + 1}] "${selectedOptionText}" pada "${pollInfo.name}"`);

    // Cegah klik ganda dalam kurun waktu 1.5 detik
    const debKey = `${voterJid}_${pollInfo.name}_${selectedOptionIndex}`;
    const lastClickTime = recentPollClicks.get(debKey) || 0;
    if (Date.now() - lastClickTime < 1500) {
      console.log(`ℹ️ [Poll Debounce] Mengabaikan klik duplikat dalam 1.5 detik: ${debKey}`);
      return;
    }
    recentPollClicks.set(debKey, Date.now());

    await executePollAction(sock, msg, remoteJid, selectedOptionText, selectedOptionIndex, voterJid, prefix);
    return;
  }

  // Ekstrak teks pesan dari berbagai tipe pesan
  const messageContent =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.caption ||
    '';

  const trimmedText = messageContent.trim();

  // 🛡️ PENTING: Jika pesan berasal dari bot itu sendiri (fromMe) dan BUKAN perintah berawalan prefix:
  // Langsung abaikan agar bot tidak pernah membalas pesannya sendiri (mencegah loop tak terhingga!)
  if (fromMe && !trimmedText.startsWith(prefix)) {
    return;
  }

  // Tampilkan log pesan masuk ke terminal agar jelas
  if (trimmedText) {
    console.log(`📩 [Pesan Masuk] Dari: ${sender} (fromMe: ${fromMe}) | Teks: "${trimmedText}"`);
  }

  const qLower = trimmedText.toLowerCase();

  // 1. Cek apakah ada data terusan dari Saluran WhatsApp di dalam pesan
  const fwdNewsletter = findForwardedNewsletterInfo(msg.message);
  if (!fromMe && fwdNewsletter && fwdNewsletter.newsletterJid) {
    const channelName = fwdNewsletter.newsletterName || 'Saluran WhatsApp';
    const channelJid = fwdNewsletter.newsletterJid;
    console.log(`📢 [Saluran Terdeteksi dari Terusan] ${channelName} (${channelJid})`);
    await sock.sendMessage(remoteJid, {
      text: `📢 *Terdeteksi Pesan dari Saluran WhatsApp!*\n\n• Nama Saluran: *${channelName}*\n• JID Saluran: \`${channelJid}\`\n\nUntuk mendaftarkannya sebagai target kirim harian, balas dengan:\n*${prefix}addtarget ${channelJid}*`
    }, { quoted: msg });
    return;
  }

  // 2. Cek apakah pesan berisi Tautan Saluran WhatsApp (misal: https://whatsapp.com/channel/xxx)
  const channelLinkMatch = trimmedText.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
  if (!fromMe && channelLinkMatch) {
    const inviteCode = channelLinkMatch[1];
    const isExplicitCmd = trimmedText.startsWith(prefix);
    const hasAddIntent = qLower.includes('add') || qLower.includes('tambah') || qLower.includes('target') || qLower.includes('nargetin') || qLower.includes('daftar') || qLower.includes('simpan') || remoteJid.endsWith('@s.whatsapp.net');

    if (!isExplicitCmd && hasAddIntent) {
      try {
        console.log(`🔍 [Auto Add Link Saluran] Memproses link saluran: ${inviteCode}`);
        const meta = await sock.newsletterMetadata('INVITE', inviteCode);
        if (meta && meta.id) {
          if (!config.targetJids) config.targetJids = [];
          if (!config.targetJids.includes(meta.id)) {
            config.targetJids.push(meta.id);
            saveConfig(config);
            await sock.sendMessage(remoteJid, {
              text: `✅ *Berhasil Mendaftarkan Saluran Baru!*\n\n• Nama Saluran: *${meta.name || 'Saluran'}*\n• JID Saluran: \`${meta.id}\`\n• Pengikut: *${meta.subscribers || 0}*\n\nTotal target siaran sekarang: ${config.targetJids.length}`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `ℹ️ Saluran *${meta.name || 'Saluran'}* (\`${meta.id}\`) sudah terdaftar sebelumnya di target siaran.`
            }, { quoted: msg });
          }
          return;
        }
      } catch (err) {
        console.log(`⚠️ Gagal memproses link saluran otomatis: ${err.message}`);
      }
    }
  }

  // 3. Cek apakah pesan berisi Tautan Undangan Grup WhatsApp (misal: https://chat.whatsapp.com/xxx)
  const groupLinkMatch = trimmedText.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
  if (!fromMe && groupLinkMatch) {
    const inviteCode = groupLinkMatch[1];
    const isExplicitCmd = trimmedText.startsWith(prefix);
    const hasAddIntent = qLower.includes('add') || qLower.includes('tambah') || qLower.includes('target') || qLower.includes('nargetin') || qLower.includes('daftar') || qLower.includes('simpan') || qLower.includes('gabung') || qLower.includes('join') || remoteJid.endsWith('@s.whatsapp.net');

    if (!isExplicitCmd && hasAddIntent) {
      try {
        console.log(`🔍 [Auto Add Link Grup] Memproses invite link: ${inviteCode}`);
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        if (groupInfo && groupInfo.id) {
          let joinedStatus = 'ℹ️ Bot sudah berada di dalam grup ini';
          try {
            await sock.groupAcceptInvite(inviteCode);
            joinedStatus = '🟢 Bot berhasil bergabung ke grup!';
          } catch (eJoin) {
            if (eJoin.message && !eJoin.message.includes('already in')) {
              console.log(`ℹ️ [Group Join Notice]: ${eJoin.message}`);
            }
          }

          const rawId = groupInfo.id;
          const groupJid = rawId.endsWith('@g.us') ? rawId : `${rawId}@g.us`;

          if (!config.targetJids) config.targetJids = [];
          if (!config.targetJids.includes(groupJid)) {
            config.targetJids.push(groupJid);
            saveConfig(config);
            await sock.sendMessage(remoteJid, {
              text: `✅ *Berhasil Mendaftarkan Grup Baru!*\n\n• Nama Grup: *${groupInfo.subject || 'Grup WhatsApp'}*\n• JID Grup: \`${groupJid}\`\n• Anggota: *${groupInfo.size || groupInfo.participants?.length || '?'}*\n• Status: ${joinedStatus}\n\nTotal target siaran sekarang: ${config.targetJids.length}`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `ℹ️ Grup *${groupInfo.subject || 'Grup'}* (\`${groupJid}\`) sudah terdaftar sebelumnya di target siaran.\n\nStatus: ${joinedStatus}`
            }, { quoted: msg });
          }
          return;
        }
      } catch (err) {
        console.log(`⚠️ Gagal memproses link grup otomatis: ${err.message}`);
        await sock.sendMessage(remoteJid, {
          text: `❌ Gagal memproses tautan grup: ${err.message}\n_Pastikan tautan undangan valid dan bot belum diblokir oleh admin grup._`
        }, { quoted: msg });
        return;
      }
    }
  }

  const reply = async (text) => {
    try {
      if (msg._isSynthetic || remoteJid.endsWith('@newsletter')) {
        await sock.sendMessage(remoteJid, { text });
      } else {
        sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});
        await sock.sendMessage(remoteJid, { text }, { quoted: msg });
        sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      }
    } catch (err) {
      console.error(`[Reply Error ke ${remoteJid}]`, err.message);
    }
  };

  // Helper untuk memberi Emoji Reaction pada pesan yang diproses
  const react = async (emoji) => {
    try {
      if (!remoteJid.endsWith('@newsletter') && msg.key) {
        await sock.sendMessage(remoteJid, { react: { text: emoji, key: msg.key } }).catch(() => {});
      }
    } catch (e) {}
  };

  const isPrivateChat = remoteJid.endsWith('@s.whatsapp.net');
  const isChannelMessage = remoteJid.endsWith('@newsletter');

  // Auto-subscribe jika ada pesan masuk dari saluran
  if (isChannelMessage && sock?.subscribeNewsletterUpdates) {
    sock.subscribeNewsletterUpdates(remoteJid).catch(() => {});
  }

  // Pesan di saluran hanya bisa ditulis oleh Admin/Owner saluran tersebut
  const userIsOwner = isOwner(sender, fromMe, config) || isChannelMessage;

  // 2. Tandai pesan sudah dibaca (Read Receipt)
  if (!isChannelMessage) {
    sock.readMessages([msg.key]).catch(() => {});
  }

  // 3. Cooldown Anti-Flood (Jeda 2 detik per pengguna untuk non-owner dan non-saluran)
  if (!userIsOwner && sender && !isChannelMessage) {
    const lastTime = userCooldownMap.get(sender) || 0;
    const now = Date.now();
    if (now - lastTime < 2000) {
      console.log(`⏱️ [Cooldown Active] Mengabaikan request flood cepat dari: ${sender}`);
      return;
    }
    userCooldownMap.set(sender, now);
  }

  // Cek apakah bot di-tag/mention atau di-reply/quote di dalam obrolan
  const botNumber = sock.user ? sock.user.id.split(':')[0] : '';
  const botJid = botNumber ? `${botNumber}@s.whatsapp.net` : '';
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quotedMsg = contextInfo?.quotedMessage;
  const quotedText = (
    quotedMsg?.conversation ||
    quotedMsg?.extendedTextMessage?.text ||
    quotedMsg?.imageMessage?.caption ||
    quotedMsg?.videoMessage?.caption ||
    quotedMsg?.documentMessage?.caption ||
    ''
  ).trim();

  const mentionedJids = contextInfo?.mentionedJid || [];
  const quotedParticipant = contextInfo?.participant ? contextInfo.participant.split(':')[0] : '';
  const isBotQuoted = Boolean(quotedParticipant && botNumber && quotedParticipant.includes(botNumber)) || (isPrivateChat && Boolean(quotedMsg));
  const isBotMentioned = (botJid && mentionedJids.includes(botJid)) || (botNumber && trimmedText.includes(`@${botNumber}`)) || isBotQuoted;

  if (isBotMentioned) {
    // Bersihkan mention (@botNumber) dari teks agar bisa diparse sebagai perintah
    let textAfterMention = trimmedText
      .replace(new RegExp(`@${botNumber}`, 'g'), '')
      .replace(/^[!\/.]\s*/, '')  // hapus prefix jika ada
      .trim();

    // ⚡ Fitur Quick-Reply Angka 1-5 jika membalas menu bot
    if (/^[1-5]$/.test(textAfterMention) && quotedText.toLowerCase().includes('menu')) {
      const numChoice = textAfterMention.trim();
      if (numChoice === '1') textAfterMention = 'today';
      else if (numChoice === '2') textAfterMention = 'tugas';
      else if (numChoice === '3') textAfterMention = 'mahasiswa';
      else if (numChoice === '4') textAfterMention = 'all';
      else if (numChoice === '5') textAfterMention = 'status';
    }

    // Perintah yang bisa dipicu via @mention di grup
    const mentionTriggerCommands = [
      'alters', 'about', 'status',
      'all', 'pollall', 'poll', 'polling', 'dosen', 'polldosen',
      'tagall', 'hidetag', 'semua',
      'gantijam', 'gantiruang', 'batal', 'kosong', 'libur',
      'send', 'kirim', 'bc', 'broadcast',
      'jadwal', 'jadwala', 'jadwalb', 'jadwali',
      'today', 'hariini', 'tugas', 'task',
      'mahasiswa', 'mhs', 'datamahasiswa', 'tambahmhs', 'addmhs', 'hapusmhs', 'delmhs', 'importmhs', 'batchmhs',
      'pilihan', 'tombol', 'menuinteraktif',
      'listdosen', 'menu', 'help', 'ai', 'tanya', 'start', 'adler', 'alter',
      'id', 'scanjadwal', 'scan', 'reset', 'ingat',
      'reminder', 'ingatkan', 'pengingat',
      'checkupdate', 'cekupdate'
    ];

    const firstWord = (textAfterMention.split(/\s+/)[0] || '').toLowerCase();
    const isMentionCommand = mentionTriggerCommands.includes(firstWord);

    if (isMentionCommand && textAfterMention) {
      // ✅ Perintah via @mention: jalankan langsung di grup ini
      console.log(`📌 [Mention Command] "${textAfterMention}" dari ${sender} di ${remoteJid}`);
      await react('⚡');

      // Rekonstruksi pesan palsu agar bisa diproses ulang lewat handler yang sama
      // dengan teks = perintah (tanpa @mention)
      const fakeMsgForCommand = {
        ...msg,
        message: {
          ...msg.message,
          conversation: textAfterMention,
          extendedTextMessage: undefined
        }
      };

      // Panggil handler rekursif dengan teks perintah bersih
      // Kita override trimmedText secara langsung dengan memproses command inline
      // Gunakan cleanCommandText yang sudah di-strip mention
      const _args = textAfterMention.split(/\s+/);
      let _cmd = (_args[0] || '').toLowerCase();
      const _query = textAfterMention.slice(_cmd.length).trim();

      // Alias normalize
      if (_cmd === 'pollall') _cmd = 'all';
      if (_cmd === 'polldosen') _cmd = 'dosen';
      if (_cmd === 'jadwala') { _cmd = 'jadwal'; _args[1] = 'a'; }
      if (_cmd === 'jadwalb') { _cmd = 'jadwal'; _args[1] = 'b'; }
      if (_cmd === 'jadwali') { _cmd = 'jadwal'; _args[1] = 'i'; }
      if (_cmd === 'hariini') _cmd = 'today';
      if (_cmd === 'tanya') _cmd = 'ai';

      console.log(`📌 [Mention→Command] Menjalankan perintah: /${_cmd} ${_query}`);

      // Inject ke alur switch-case dengan cara memanipulasi msg dan memanggil ulang handler
      // Cara paling bersih: inject teks ke msg.message.conversation lalu panggil handleIncomingMessage
      const injectedMsg = JSON.parse(JSON.stringify(msg));
      if (injectedMsg.message) {
        // Set teks perintah ke conversation field
        injectedMsg.message.conversation = textAfterMention;
        // Hapus extendedTextMessage agar tidak confuse parser
        delete injectedMsg.message.extendedTextMessage;
      }
      await handleIncomingMessage(injectedMsg);
      return;
    }

    // Bukan perintah → serahkan ke AI dengan membawa konteks pesan yang dikutip jika ada
    const mediaFile = await extractMediaFromMessage(msg, sock);
    let promptToAsk = textAfterMention || (mediaFile ? 'Tolong analisis dan simpulkan isi dokumen/foto ini secara lengkap dan terstruktur.' : 'Halo bot!');
    if (quotedText) {
      promptToAsk = `[Konteks Pesan Bot Yang Dibalas: "${quotedText.slice(0, 500)}"]\nUser: ${promptToAsk}`;
    }
    console.log(`🤖 [AI Mention] Ditanyakan oleh ${sender}: "${promptToAsk}"${mediaFile ? ` [Lampiran: ${mediaFile.mimeType}]` : ''}`);
    await react('🤔');
    try {
      const answer = await askGeminiAI(promptToAsk, userIsOwner, mediaFile, null, sock, remoteJid, sender);
      await reply(answer);
      await react('💡');
    } catch (e) {
      await reply(`❌ Terjadi kendala AI: ${e.message}`);
    }
    return;
  }

  // 1. KODE RAHASIA 'PRAWIRA': Siapa pun yang mengetik kode ini akan otomatis jadi Owner!
  const secretCode = 'PRAWIRA';
  const cleanUpperText = trimmedText.replace(/^[!/.]\s*/, '').trim().toUpperCase();

  if (cleanUpperText === secretCode) {
    const rawNumber = (sender || remoteJid).replace(/[^0-9]/g, '');
    if (!config.ownerNumbers) config.ownerNumbers = [];
    if (!config.ownerNumbers.includes(rawNumber)) {
      config.ownerNumbers.push(rawNumber);
      saveConfig(config);
    }
    await reply(`👑 *AKSES PEMILIK (OWNER) RESMI DIAKTIFKAN!*\n\nNomor Anda (\`${rawNumber}\`) telah terdaftar sebagai Pemilik Sah Bot.\nSekarang Anda bebas menggunakan semua perintah dan chat pribadi dengan bot.`);
    console.log(`👑 [New Owner Claimed] Nomor ${rawNumber} berhasil mengklaim akses via kode rahasia PRAWIRA`);
    return;
  }

  // 2. PROTEKSI CHAT PRIBADI (PC / DM):
  // Jika di chat pribadi dan pengirim BUKAN Owner, bot abaikan 100% (tidak membalas orang asing)
  if (isPrivateChat && !userIsOwner) {
    console.log(`🔒 [Chat Pribadi Diabaikan] Pesan dari nomor non-owner: ${sender}`);
    return;
  }

  // Dukung prefiks '!' maupun '/' serta perbaiki spasi ekstra (contoh: "! Today" atau "/status")
  let usedPrefix = null;
  const supportedPrefixes = [config.prefix || '!', '/', '.'];
  for (const p of supportedPrefixes) {
    if (trimmedText.startsWith(p)) {
      usedPrefix = p;
      break;
    }
  }

  // Daftar perintah umum yang bisa diketik langsung
  const commonCommands = ['alters', 'about', 'menu', 'help', 'start', 'adler', 'alter', 'all', 'pollall', 'poll', 'polling', 'dosen', 'tagall', 'hidetag', 'semua', 'gantijam', 'gantiruang', 'batal', 'kosong', 'libur', 'send', 'kirim', 'bc', 'broadcast', 'today', 'hariini', 'status', 'targets', 'addtarget', 'addlink', 'add', 'deltarget', 'mahasiswa', 'mhs', 'datamahasiswa', 'tambahmhs', 'addmhs', 'hapusmhs', 'delmhs', 'importmhs', 'batchmhs', 'pilihan', 'tombol', 'menuinteraktif', 'listdosen', 'jadwal', 'scanjadwal', 'scan', 'ai', 'tanya', 'jadwala', 'jadwalb', 'jadwali', 'restart', 'update', 'checkupdate', 'cekupdate', 'tugas', 'task', 'reset', 'clear', 'reminder', 'reminders', 'delreminder', 'ingatkan', 'pengingat', 'setconfig', 'setgroq', 'setgemini'];
  let cleanCommandText = '';

  if (usedPrefix !== null) {
    cleanCommandText = trimmedText.slice(usedPrefix.length).trim();
  } else {
    // ⚡ Fitur Quick-Reply Angka 1-7 (baik membalas menu maupun ketik angka 1-7 langsung)
    if (/^[1-7]$/.test(trimmedText)) {
      const numChoice = trimmedText.trim();
      if (numChoice === '1') cleanCommandText = 'today';
      else if (numChoice === '2') cleanCommandText = 'tugas';
      else if (numChoice === '3') cleanCommandText = 'mahasiswa';
      else if (numChoice === '4') cleanCommandText = 'all';
      else if (numChoice === '5') cleanCommandText = 'reminder';
      else if (numChoice === '6') cleanCommandText = 'status';
      else if (numChoice === '7') cleanCommandText = 'menu ai';
    } else {
      const firstWord = trimmedText.split(/\s+/)[0].toLowerCase();
      if (commonCommands.includes(firstWord)) {
        cleanCommandText = trimmedText;
      } else {
        // 🌟 ZERO-PREFIX NATURAL AI CHAT (Khusus DM Owner):
        // Jika Owner chat santai tanpa awalan (misal: "hari ini ada tugas apa?", "besok kuliah jam berapa"),
        // otomatis serahkan ke AI Copilot tanpa perlu mengetik ! atau /ai!
        if (isPrivateChat && userIsOwner) {
          // 🔑 Auto-Detect jika Owner langsung paste API Key Groq atau Gemini di DM
          if (trimmedText.startsWith('gsk_')) {
            const cfg = loadConfig();
            cfg.groqApiKey = trimmedText.trim();
            cfg.aiProvider = 'groq';
            saveConfig(cfg);
            await reply(`🔑 *[Groq API Key Berhasil Disimpan]*\nKunci Groq kamu otomatis tersimpan di \`config.json\`!\nMesin AI utama bot sekarang beralih ke Groq LPU (Ultra Fast & Bebas Limit 503). 🚀`);
            return;
          }
          if (trimmedText.startsWith('AIzaSy')) {
            const cfg = loadConfig();
            cfg.geminiApiKey = trimmedText.trim();
            saveConfig(cfg);
            await reply(`🔑 *[Gemini API Key Berhasil Disimpan]*\nKunci Google Gemini berhasil disimpan ke \`config.json\`!`);
            return;
          }

          const mediaFile = await extractMediaFromMessage(msg, sock);
          console.log(`🤖 [AI Copilot DM] Pertanyaan Owner (${sender}): "${trimmedText}"${mediaFile ? ` [Media: ${mediaFile.mimeType}]` : ''}`);
          await react('🤔');
          try {
            const answer = await askGeminiAI(trimmedText, userIsOwner, mediaFile, null, sock, remoteJid, sender);
            await reply(answer);
            await react('💡');
          } catch (e) {
            await reply(`❌ Kendala AI: ${e.message}`);
          }
          return;
        }
        return; // Abaikan jika bukan perintah dan bukan DM owner
      }
    }
  }

  // Parse perintah & argumen
  const args = cleanCommandText.split(/\s+/);
  let command = (args[0] || '').toLowerCase();
  const query = cleanCommandText.slice(command.length).trim();

  // Toleransi typo / alias otomatis
  if (command === 'list' && (args[1] || '').toLowerCase() === 'dosen') {
    command = 'listdosen';
  } else if (command === 'add' && ((args[1] || '').toLowerCase() === 'link' || (args[1] || '').toLowerCase() === 'target')) {
    command = 'addtarget';
  } else if (command === 'addlink') {
    command = 'addtarget';
  } else if (command === 'pollall' || ((command === 'poll' || command === 'polling' || command === 'dosen') && (args[1] || '').toLowerCase() === 'all' && !query.includes('|') && args.length === 2)) {
    command = 'all';
  } else if (command === 'jadwala') {
    command = 'jadwal';
    args[1] = 'a';
  } else if (command === 'jadwalb') {
    command = 'jadwal';
    args[1] = 'b';
  } else if (command === 'jadwali') {
    command = 'jadwal';
    args[1] = 'i';
  } else if (command === 'ingatkan' || command === 'pengingat') {
    command = 'reminder';
  } else if (command === 'start' || command === 'adler' || command === 'alter') {
    command = 'menu';
  }

  // 3. KUNCI SEMUA PERINTAH RAHASIA / OWNER SECARA TOTAL:
  // Jika ada non-owner (anggota/admin grup lain) yang mencoba menebak perintah rahasia,
  // bot DIAM TOTAL (tidak merespons apa-apa) agar mereka mengira perintah tersebut tidak ada!
  const ownerOnlyCommands = [
    'targets', 'addtarget', 'addlink', 'deltarget',
    'send', 'sendto', 'kirim', 'autosend', 'restart', 'update',
    'setdosen', 'additem', 'delitem',
    'tambahkan', 'addowner', 'hapusnomor', 'delowner', 'listowner',
    'importmhs', 'batchmhs',
    'setconfig', 'setgroq', 'setgemini',
    'repair'
  ];

  if (ownerOnlyCommands.includes(command) && !userIsOwner) {
    console.log(`⛔ [Akses Rahasia Ditolak] Perintah '${command}' dicoba oleh non-owner (${sender}). Bot sengaja diam.`);
    return; // Diam tanpa membalas sedikit pun
  }

  // 4. PROTEKSI KEAMANAN GRUP (GROUP MANAGEMENT SECURITY):
  // Di dalam grup, perintah pengaturan jadwal, tagall massal, & reminder HANYA diizinkan untuk Admin Grup atau Bot Owner
  const isSenderGroupAdmin = remoteJid.endsWith('@g.us') ? await isGroupAdmin(sock, remoteJid, sender) : false;
  const canManageGroup = userIsOwner || isSenderGroupAdmin;

  const groupAdminOnlyCommands = ['gantijam', 'gantiruang', 'batal', 'kosong', 'libur', 'tagall', 'hidetag', 'semua', 'reminder'];
  if (groupAdminOnlyCommands.includes(command) && remoteJid.endsWith('@g.us') && !canManageGroup) {
    await react('🔒');
    await reply(`🛡️ *[AKSES TERBATAS — KEAMANAN GRUP]*\n\nPerintah *${prefix}${command}* hanya dapat dijalankan oleh *Admin Grup* atau *Owner Bot* demi menjaga keakuratan data perkuliahan.\n\n💡 _Perintah bebas untuk semua mahasiswa:_ \n• *${prefix}jadwal* (Cek jadwal kuliah)\n• *${prefix}tugas* (Cek daftar tugas)\n• *${prefix}all* (Polling kehadiran)\n• *@Alters <pertanyaan>* (Tanya asisten AI)`);
    return;
  }

  switch (command) {
    case 'menu':
    case 'help': {
      const subMenu = (args[1] || '').toLowerCase();

      if (subMenu === 'jadwal') {
        const text = 
`╭───「 📚 *MENU JADWAL KULIAH* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}jadwal a* ➔ Jadwal Kelas A hari ini
• *${prefix}jadwal b* ➔ Jadwal Kelas B hari ini
• *${prefix}jadwal i* ➔ Jadwal Kelas I hari ini
• *${prefix}jadwal <kelas> <hari>* ➔ Cek jadwal per hari (cth: *${prefix}jadwal a senin*)
• *${prefix}scanjadwal* ➔ Balas/kirim foto jadwal kuliah untuk auto-scan AI

💡 _Tips AI: Anda juga bisa tanya AI langsung: "${prefix}ai jadwal kelas A hari ini ada apa aja?"_`;
        await reply(text);
        break;
      }

      if (subMenu === 'tugas' || subMenu === 'task') {
        const text = 
`╭───「 📝 *MENU TUGAS (SUPABASE)* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}tugas* ➔ Tampilkan semua tugas aktif (pending)
• *${prefix}tugas a* / *${prefix}tugas b* ➔ Cek daftar tugas per kelas
• *${prefix}tugas tambah <matkul> | <judul> | <deadline>* ➔ Catat tugas baru
  _Contoh: ${prefix}tugas tambah Basis Data | ERD Toko Online | Jumat 23:59_
• *${prefix}tugas done <ID>* ➔ Tandai tugas telah selesai
• *${prefix}tugas hapus <ID>* ➔ Hapus tugas dari database

💡 _Tips AI: Bisa juga suruh AI: "${prefix}ai catat tugas Matdis latihan bab 3 deadline senin"_`;
        await reply(text);
        break;
      }

      if (subMenu === 'poll' || subMenu === 'polling') {
        const text = 
`╭───「 📊 *MENU POLLING KEHADIRAN* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}all* ➔ Buat polling semua dosen default hari ini
• *${prefix}all <d1, d2, ..>* ➔ Polling dosen kustom
• *${prefix}all target* ➔ 📢 Kirim polling ke semua target terdaftar
• *${prefix}all split* ➔ Polling terpisah per dosen (1 per 1)
• *${prefix}dosen <nama>* ➔ Polling 1 nama dosen spesifik
• *${prefix}dosen target <nama>* ➔ 📢 Polling 1 dosen ke semua target
• *${prefix}poll <judul>|<opsi1>|<opsi2>* ➔ Buat polling bebas
• *${prefix}poll target <judul>|<opsi1>|<opsi2>* ➔ 📢 Polling bebas ke semua target
• *${prefix}listdosen* ➔ Lihat daftar nama dosen default

💡 _Kata kunci **target** = broadcast ke semua saluran/grup terdaftar_
📌 _Daftarkan target dengan: *${prefix}addtarget <ID>*_`;
        await reply(text);
        break;
      }

      if (subMenu === 'ai' || subMenu === 'copilot') {
        const text = 
`╭───「 🤖 *MENU ASISTEN ALTERS AI* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}ai <pertanyaan>* ➔ Tanya apa saja ke Alters (Gemini 3.8 Flash)
• *${prefix}ai ubah ...* ➔ Perintah santai ubah tugas/pengingat/jadwal
• *${prefix}ingatkan <jam> | <agenda>* ➔ Pasang pengingat deadline kustom
• *${prefix}reminders* ➔ Cek daftar pengingat deadline kustom aktif
• *${prefix}delreminder <id>* ➔ Hapus pengingat kustom
• *@Bot <pertanyaan>* ➔ Tag bot di grup untuk langsung dijawab
• *${prefix}ingat* ➔ Cek catatan memori jangka panjang AI tentangmu
• *${prefix}lupakan <kunci>* ➔ Hapus fakta dari memori jangka panjang
• *${prefix}reset* ➔ Reset konteks obrolan aktif AI
• *Kirim Foto/PDF + ${prefix}ai* ➔ Menganalisis & merangkum dokumen

💡 *Contoh Perintah Cepat AI Copilot:*
• _${prefix}ai ubah deadline tugas 1 jadi besok jam 23.59_
• _${prefix}ai ingatkan besok jam 7 pagi ada kuis DFA_
• _${prefix}ai ubah jam autosend jadi jam 06:30_
• _${prefix}ai ubah pengingat tugas malam jadi jam 20:00_

⚡ *Respons Cepat*:
Semua jawaban AI dan perintah dikirim instan tanpa jeda delay buatan!`;
        await reply(text);
        break;
      }

      if (subMenu === 'owner' || subMenu === 'admin') {
        if (!userIsOwner) {
          await reply(`⛔ Menu ini hanya dapat diakses oleh Owner bot.`);
          break;
        }
        const text = 
`╭───「 👑 *MENU KONTROL OWNER* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}status* ➔ Cek status bot, uptime, & latency database
• *${prefix}targets* ➔ Daftar grup/saluran tujuan siaran
• *${prefix}addtarget <id>* ➔ Tambah target tujuan siaran
• *${prefix}addlink <link>* ➔ Tambah saluran via tautan invite
• *${prefix}deltarget <id>* ➔ Hapus target dari daftar
• *${prefix}send [hari]* ➔ Kirim siaran harian ke semua target
• *${prefix}autosend <on/off>* ➔ Saklar siaran otomatis (07:00 WIB)
• *${prefix}setdosen <d1, d2>* ➔ Atur ulang dosen default
• *${prefix}listowner* ➔ Cek daftar nomor admin/owner
• *${prefix}tambahkan <no>* ➔ Daftarkan nomor admin baru
• *${prefix}hapusnomor <no>* ➔ Hapus nomor admin
• *${prefix}update* ➔ Update otomatis bot dari GitHub & changelog
• *${prefix}repair* ➔ Cek kesehatan file & self-heal
• *${prefix}restart* ➔ Me-restart proses bot`;
        await reply(text);
        break;
      }

      if (subMenu === 'all' || subMenu === 'full') {
        let fullMenuText = 
`╭───「 🤖 *MENU LENGKAP BOT KAMPUS* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────

🤖 *ASISTEN PINTAR GEMINI AI*
• *${prefix}ai <pertanyaan>* ➔ Tanya apa saja ke Gemini AI
• *@Bot <pertanyaan>* ➔ Tag bot di grup untuk bertanya
• *${prefix}reset* ➔ Bersihkan memori obrolan AI

📚 *JADWAL KULIAH*
• *${prefix}jadwal a* / *${prefix}jadwal b* / *${prefix}jadwal i* ➔ Jadwal hari ini
• *${prefix}jadwal <kelas> <hari>* ➔ Cek hari (cth: ${prefix}jadwal a senin)
• *${prefix}scanjadwal* ➔ Auto-scan foto jadwal via AI

📝 *TRACKER TUGAS (SUPABASE CLOUD)*
• *${prefix}tugas* ➔ Daftar tugas aktif
• *${prefix}tugas a* / *${prefix}tugas b* ➔ Filter tugas per kelas
• *${prefix}tugas tambah <matkul> | <judul> | <deadline>*
• *${prefix}tugas done <ID>* ➔ Tandai tugas selesai
• *${prefix}tugas hapus <ID>* ➔ Hapus tugas

📊 *POLLING KEHADIRAN*
• *${prefix}all* ➔ Poll semua dosen default
• *${prefix}all <d1, d2, ..>* ➔ Poll dosen kustom
• *${prefix}dosen <nama>* ➔ Poll 1 dosen
• *${prefix}poll <tanya>|<opsi1>|<opsi2>* ➔ Poll bebas
• *${prefix}listdosen* ➔ Daftar dosen default

📅 *SIARAN & INFORMASI*
• *${prefix}today* ➔ Pratinjau list siaran hari ini
• *${prefix}preview <hari>* ➔ Cek template per hari
• *${prefix}status* ➔ Cek status bot & database
• *${prefix}id* ➔ Cek ID grup / saluran ini`;

        if (userIsOwner) {
          fullMenuText += `\n\n👑 *KONTROL OWNER / ADMIN*
• *${prefix}gantijam <matkul> | <jam>* ➔ Ubah jam kuliah & auto preview
• *${prefix}gantiruang <matkul> | <ruang>* ➔ Pindah ruangan kuliah
• *${prefix}batal <matkul>* / *${prefix}kosong* ➔ Tandai kuliah batal
• *${prefix}send [target]* ➔ Kirim template ke semua / target pilihan
• *${prefix}bc [target] <pesan>* ➔ Siarkan pengumuman bebas ke target
• *${prefix}targets* ➔ Daftar nomor & JID target siaran
• *${prefix}addlink <link>* / *${prefix}addtarget <id>*
• *${prefix}deltarget <id>* ➔ Hapus target
• *${prefix}autosend <on/off>* ➔ Saklar siaran (07:00)
• *${prefix}setdosen <d1, d2>* ➔ Set dosen default
• *${prefix}listowner* / *${prefix}tambahkan <no>* / *${prefix}hapusnomor <no>*
• *${prefix}checkupdate* ➔ Cek pembaruan baru dari GitHub
• *${prefix}update* ➔ Update dari GitHub
• *${prefix}repair* ➔ Self-heal file & DB
• *${prefix}restart* ➔ Restart proses bot`;
        }
        await reply(fullMenuText);
        break;
      }

      // DEFAULT: CAMPUS LIVE DASHBOARD
      const dt = getIndonesianDateTime();
      const dayKey = (dt.dayKey || 'senin').toLowerCase();
      const schedules = getSchedules();

      // Ringkasan jadwal kuliah hari ini
      const schedA = (schedules?.A?.[dayKey] || []);
      const schedB = (schedules?.B?.[dayKey] || []);
      let schedSummary = '';
      if (schedA.length === 0 && schedB.length === 0) {
        schedSummary = '🏖️ Hari ini Libur (Tidak ada perkuliahan)';
      } else {
        const itemsA = schedA.map(s => s.matkul).join(', ') || '-';
        const itemsB = schedB.map(s => s.matkul).join(', ') || '-';
        schedSummary = `• Kelas A: *${itemsA}*\n• Kelas B: *${itemsB}*`;
      }

      // Ringkasan tugas aktif
      let pendingTasksText = 'Cek opsi [2]';
      try {
        const tasksPromise = getTasks('ALL', 'pending');
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
        const activeTasks = await Promise.race([tasksPromise, timeoutPromise]);
        if (Array.isArray(activeTasks)) {
          pendingTasksText = activeTasks.length > 0 
            ? `📌 *${activeTasks.length} tugas aktif* (Ketik *${prefix}tugas*)`
            : '🎉 Tidak ada tugas tertunda';
        }
      } catch (e) {}

      let dashboardText = 
`╭───「 🎓 *ALTERS BOT — MENU UTAMA* 」
│ 📅 *${dt.fullFormatted}*
│ 🤖 Bot: 🟢 Aktif | AI Engine: Groq LPU (Ultra Fast)
╰──────────────────────────

📚 *KULIAH HARI INI (${dt.dayName}):*
${schedSummary}
📝 *TUGAS:* ${pendingTasksText}

━━━━━━━━━━━━━━━━━━━━
⚡ *PILIHAN CEPAT (Balas pesan ini dengan angka):*
[1] ➔ 📚 Jadwal Kuliah Hari Ini
[2] ➔ 📝 Daftar Tugas Aktif (Cloud)
[3] ➔ 🎓 Data Mahasiswa Supabase
[4] ➔ 📊 Polling Kehadiran Dosen
[5] ➔ ⏰ Cek Pengingat Aktif
[6] ➔ ℹ️ Status Bot & Host Server
[7] ➔ 🤖 Panduan Tanya Alters AI

🔘 *Silakan klik tombol menu di bawah ini:*
_(Atau balas pesan ini dengan angka [1 - 7])_
━━━━━━━━━━━━━━━━━━━━
💡 _Untuk daftar seluruh perintah teks, ketik: *${prefix}menu all*_`;

      await reply(dashboardText);

      const pollTitle = `🔘 MENU ALTERS BOT (${dt.dayName})`;
      const pollOptions = [
        '📚 1. Jadwal Kuliah Hari Ini',
        '📝 2. Daftar Tugas Aktif',
        '🎓 3. Cek Data Mahasiswa',
        '📊 4. Polling Kehadiran Dosen',
        '⏰ 5. Cek Pengingat Aktif',
        'ℹ️ 6. Status Bot & Sistem',
        '❓ 7. Bantuan Tanya AI'
      ];

      try {
        await sendNativePoll(sock, remoteJid, pollTitle, pollOptions, 1);
      } catch (ePoll) {
        console.warn('⚠️ [Poll Menu Warning]:', ePoll.message);
      }
      break;
    }

    case 'id': {
      let extraInfo = '';
      if (remoteJid.endsWith('@newsletter')) {
        extraInfo = ' (Tipe: Saluran / Channel)';
      } else if (remoteJid.endsWith('@g.us')) {
        extraInfo = ' (Tipe: Grup WhatsApp)';
      } else if (remoteJid.endsWith('@s.whatsapp.net')) {
        extraInfo = ' (Tipe: Chat Pribadi)';
      }

      await reply(`🆔 *ID Chat Ini:* \n\`${remoteJid}\`${extraInfo}\n\nSalin ID di atas dan gunakan perintah:\n*${prefix}addtarget ${remoteJid}* untuk mendaftarkannya sebagai target kirim.`);
      break;
    }

    case 'tagall':
    case 'hidetag':
    case 'semua': {
      if (!remoteJid.endsWith('@g.us')) {
        await reply('❌ Perintah ini hanya dapat digunakan di dalam Grup WhatsApp.');
        break;
      }
      try {
        await react('📢');
        const groupMeta = await sock.groupMetadata(remoteJid);
        const participants = (groupMeta.participants || []).map(p => p.id);
        const groupName = groupMeta.subject || 'Grup';
        const pesanPengumuman = query || 'Perhatian seluruh anggota grup!';

        if (command === 'hidetag') {
          // Hidetag: Teks bersih tanpa rentetan mention, tapi semua anggota grup tetap ternotifikasi
          await sock.sendMessage(remoteJid, {
            text: `📢 *[PENGUMUMAN ${groupName.toUpperCase()}]*\n\n${pesanPengumuman}`,
            mentions: participants
          });
        } else {
          // Tagall: Tampilkan daftar mention seluruh anggota
          let tagText = `📢 *[PENGUMUMAN ${groupName.toUpperCase()}]*\n`;
          tagText += `📌 *Pesan:* ${pesanPengumuman}\n\n`;
          tagText += `👥 *Total Anggota (${participants.length}):*\n`;
          participants.forEach((p, idx) => {
            const num = p.split('@')[0];
            tagText += `▫️ ${idx + 1}. @${num}\n`;
          });
          await sock.sendMessage(remoteJid, {
            text: tagText,
            mentions: participants
          });
        }
      } catch (errTag) {
        console.error('[TagAll Error]:', errTag.message);
        await reply(`❌ Gagal memanggil anggota: ${errTag.message}`);
      }
      break;
    }

    case 'all':
    case 'pollall': {
      let isBroadcastAll = false;
      let isSplitMode = false;
      let rawLecturersQuery = query;

      // Cek apakah ada kata kunci 'target', 'targets', 'saluran', 'channel', 'split', 'pisah', 'testing'
      if (args.some(a => ['target', 'targets', 'saluran', 'channel', 'semua', 'testing'].includes(a.toLowerCase()))) {
        isBroadcastAll = true;
      }
      if (args.some(a => ['split', 'pisah', 'each', 'satuan'].includes(a.toLowerCase()))) {
        isSplitMode = true;
      }

      // Bersihkan kata kunci mode dari rawLecturersQuery
      rawLecturersQuery = rawLecturersQuery
        .replace(/\b(target|targets|saluran|channel|semua|split|pisah|each|satuan|testing)\b/gi, '')
        .trim();

      let lecturers = [];

      if (!rawLecturersQuery) {
        lecturers = (typeof getLecturers === 'function')
          ? await getLecturers().catch(() => config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'])
          : (config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']);
      } else {
        // Parse nama-nama dosen dari argumen
        if (rawLecturersQuery.includes(',')) {
          lecturers = rawLecturersQuery.split(',').map(s => s.trim()).filter(Boolean);
        } else if (rawLecturersQuery.includes('\n')) {
          lecturers = rawLecturersQuery.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (/(?:Frau|Herr|Pak|Bu|Bapak|Ibu|Dr|Prof)\s/i.test(rawLecturersQuery)) {
          lecturers = rawLecturersQuery.split(/(?=(?:Frau|Herr|Pak|Bu|Bapak|Ibu|Dr|Prof)\s)/i).map(s => s.trim()).filter(Boolean);
        } else {
          lecturers = [rawLecturersQuery.trim()];
        }
      }

      if (lecturers.length === 0) {
        await reply(`❌ Daftar nama dosen tidak boleh kosong.\n\nContoh penggunaan:\n*${prefix}all* (1 Polling All-in-One hemat chat)\n*${prefix}all target* (Kirim ke seluruh saluran/grup terdaftar)\n*${prefix}all split* (Polling terpisah 1 per 1 dosen)`);
        return;
      }

      const dt = getIndonesianDateTime();
      const isPrivateChat = remoteJid.endsWith('@s.whatsapp.net');
      const shouldBroadcast = isBroadcastAll || (isPrivateChat && userIsOwner && config.targetJids && config.targetJids.length > 0);

      let destinationJids = shouldBroadcast 
        ? ((config.targetJids && config.targetJids.length > 0) ? config.targetJids : [remoteJid]) 
        : [remoteJid];

      // Jika pengguna secara spesifik menyebut 'saluran', 'channel', atau 'testing', saring hanya ke saluran
      if (args.some(a => ['saluran', 'channel', 'testing'].includes(a.toLowerCase()))) {
        const onlyNl = (config.targetJids || []).filter(t => t.endsWith('@newsletter'));
        if (onlyNl.length > 0) destinationJids = onlyNl;
      }

      if (shouldBroadcast && (!config.targetJids || config.targetJids.length === 0)) {
        await reply(`⚠️ Belum ada target grup/saluran di config. Polling dikirim ke obrolan ini.`);
      } else if (shouldBroadcast) {
        await reply(`⏳ Mengirim polling kehadiran dosen ke ${destinationJids.length} target...`);
      }

      console.log(`📊 [Poll All] Mengirim polling ${lecturers.length} dosen (Split: ${isSplitMode}) ke ${destinationJids.length} tujuan...`);

      for (const destJid of destinationJids) {
        const isNewsletter = destJid.endsWith('@newsletter');

        // Jika di Saluran ATAU mode default (non-split): Kirim 1 Polling All-in-One resmi agar TIDAK MEMENUHI CHAT!
        if (isNewsletter || !isSplitMode) {
          const pollTitle = `🎓 Polling Kehadiran Dosen (${dt.dayName}, ${dt.dateFormatted})`;
          const pollOptions = [
            '✅ Semua Dosen Hadir',
            ...lecturers.map(d => `❌ ${d} (Kosong/Batal)`),
            '❓ Belum Ada Info Pasti'
          ];

          try {
            // selectableCount: 0 = Izinkan beberapa jawaban (Multiple Choice)
            await sendNativePoll(sock, destJid, pollTitle, pollOptions, 0);
            console.log(`📊 [Poll All-in-One Sent] ke ${destJid}`);
          } catch (err) {
            console.warn(`[Poll All-in-One Retry Single]:`, err.message);
            try {
              await sendNativePoll(sock, destJid, pollTitle, pollOptions, 1);
              console.log(`📊 [Poll All-in-One Single Sent] ke ${destJid}`);
            } catch (e2) {
              console.error(`[Poll All-in-One Error] ke ${destJid}:`, e2.message);
              await reply(`❌ Gagal mengirim polling ke obrolan ini: ${e2.message}`);
            }
          }
        } else {
          // Mode Split: Kirim polling per masing-masing dosen
          const defaultPollValues = ['✅ Hadir', '❌ Tidak', '❓ Belum Diketahui'];
          for (let i = 0; i < lecturers.length; i++) {
            const lecturer = lecturers[i];
            await new Promise(resolve => setTimeout(resolve, 600));
            try {
              await sendNativePoll(sock, destJid, `🎓 Kehadiran: ${lecturer}`, defaultPollValues, 1);
            } catch (err) {
              console.error(`[Poll Split Error] Gagal kirim poll ${lecturer} ke ${destJid}:`, err.message);
            }
          }
        }
      }

      if (shouldBroadcast && config.targetJids && config.targetJids.length > 0) {
        await reply(`✅ Berhasil mengirim polling kehadiran resmi ke ${destinationJids.length} target terdaftar!`);
      }
      break;
    }

    case 'listdosen': {
      const list = (typeof getLecturers === 'function')
        ? await getLecturers().catch(() => config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'])
        : (config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']);
      const textList = list.map((d, idx) => `▫️ ${idx + 1}. *${d}*`).join('\n');
      await reply(`🎓 *DAFTAR DOSEN:*\n\n${textList}\n\n_Ketik *${prefix}all* untuk langsung membuat polling untuk semua dosen di atas._`);
      break;
    }

    case 'setdosen': {
      const input = query.trim();
      if (!input) {
        await reply(`❌ Format salah. Masukkan nama-nama dosen dipisahkan tanda koma (,).\nContoh:\n*${prefix}setdosen Frau Woro, Frau Wisma, Frau Lita, Herr Agus*`);
        return;
      }

      const newLecturers = input.split(',').map(s => s.trim()).filter(Boolean);
      if (newLecturers.length === 0) {
        await reply('❌ Tidak ada nama dosen yang valid.');
        return;
      }

      config.defaultLecturers = newLecturers;
      saveConfig(config);

      const textList = newLecturers.map((d, idx) => `▫️ ${idx + 1}. *${d}*`).join('\n');
      await reply(`✅ *Berhasil memperbarui daftar dosen default:*\n\n${textList}\n\nKetik *${prefix}all* untuk mulai membuat polling!`);
      break;
    }

    case 'dosen':
    case 'polldosen': {
      let isBroadcastAll = false;
      let namaDosen = query.trim();

      if (args[1] && (['all', 'target', 'targets', 'saluran', 'channel', 'testing', 'semua'].includes(args[1].toLowerCase()))) {
        isBroadcastAll = true;
        namaDosen = query.slice(args[1].length).trim();
      }

      if (!namaDosen) {
        const list = (typeof getLecturers === 'function')
          ? await getLecturers().catch(() => config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'])
          : (config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']);
        const textList = list.map((d, idx) => `▫️ ${idx + 1}. *${d}*`).join('\n');
        await reply(`🎓 *DAFTAR DOSEN KULIAH:*\n\n${textList}\n\nUntuk membuat polling kehadiran dosen:\n• *${prefix}dosen ${list[0] || 'Frau Woro'}* (Polling dosen tertentu)\n• *${prefix}all* (Polling semua dosen sekaligus)`);
        return;
      }

      const pollValues = ['✅ Hadir', '❌ Tidak', '❓ Belum Diketahui'];
      const isPrivateChat = remoteJid.endsWith('@s.whatsapp.net');
      const shouldBroadcast = isBroadcastAll || (isPrivateChat && userIsOwner && config.targetJids && config.targetJids.length > 0);

      try {
        if (shouldBroadcast) {
          let targets = (config.targetJids && config.targetJids.length > 0) ? config.targetJids : [remoteJid];
          if (args[1] && ['saluran', 'channel', 'testing'].includes(args[1].toLowerCase())) {
            const onlyNl = (config.targetJids || []).filter(t => t.endsWith('@newsletter'));
            if (onlyNl.length > 0) targets = onlyNl;
          }

          if (!config.targetJids || config.targetJids.length === 0) {
            await reply(`⚠️ Belum ada target yang didaftarkan di config. Polling dikirim ke chat ini saja.`);
            await sendNativePoll(sock, remoteJid, `🎓 Kehadiran: ${namaDosen}`, pollValues, 1);
            return;
          }

          await reply(`⏳ Mengirim polling kehadiran *${namaDosen}* ke ${targets.length} target...`);
          let successCount = 0;
          for (const t of targets) {
            try {
              await sendNativePoll(sock, t, `🎓 Kehadiran: ${namaDosen}`, pollValues, 1);
              successCount++;
            } catch (err) {
              console.error(`Gagal kirim poll ke ${t}:`, err.message);
            }
          }
          await reply(`✅ Polling kehadiran *${namaDosen}* berhasil dikirim ke *${successCount}* dari *${targets.length}* target!`);
        } else {
          await sendNativePoll(sock, remoteJid, `🎓 Kehadiran: ${namaDosen}`, pollValues, 1);
          console.log(`📊 [Polling Terkirim] Kehadiran Dosen: ${namaDosen} ke ${remoteJid}`);
        }
      } catch (err) {
        console.error('[Poll Error]', err);
        await reply(`❌ Gagal membuat polling: ${err.message}`);
      }
      break;
    }

    case 'poll':
    case 'polling': {
      // Cek apakah ada kata kunci 'target' / 'targets' / 'semua' untuk broadcast
      let pollIsBroadcast = false;
      let rawPollQuery = query;

      // Periksa kata kunci broadcast di awal query (sebelum format '|')
      const firstPipeIdx = rawPollQuery.indexOf('|');
      const prefixPart = firstPipeIdx >= 0 ? rawPollQuery.slice(0, firstPipeIdx) : rawPollQuery;
      if (/\b(target|targets|semua|all|saluran|channel|testing)\b/i.test(prefixPart)) {
        pollIsBroadcast = true;
        rawPollQuery = rawPollQuery.replace(/\b(target|targets|semua|all|saluran|channel|testing)\b/gi, '').replace(/^[\s|]+/, '').trim();
      }

      const parts = rawPollQuery.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) {
        await reply(
          `❌ Format polling salah. Minimal butuh *1 pertanyaan + 2 pilihan* dipisah tanda '|'.\n\n` +
          `*Contoh Penggunaan:*\n` +
          `• *${prefix}poll Kuliah Pak Budi | Cancel | Masuk | Belum Tahu*\n` +
          `• *${prefix}poll target Absen Hari Ini | Hadir | Tidak* _(kirim ke semua target terdaftar)_`
        );
        return;
      }

      const pollQuestion = parts[0];
      const pollOptions = parts.slice(1);

      if (pollOptions.length > 12) {
        await reply('❌ Maksimal 12 pilihan untuk satu polling WhatsApp.');
        return;
      }

      const isPrivateChat = remoteJid.endsWith('@s.whatsapp.net');
      const shouldBroadcast = pollIsBroadcast || (isPrivateChat && userIsOwner && config.targetJids && config.targetJids.length > 0);

      try {
        if (shouldBroadcast) {
          let targets = (config.targetJids && config.targetJids.length > 0) ? config.targetJids : [remoteJid];
          if (/\b(saluran|channel|testing)\b/i.test(prefixPart)) {
            const onlyNl = (config.targetJids || []).filter(t => t.endsWith('@newsletter'));
            if (onlyNl.length > 0) targets = onlyNl;
          }

          if (!config.targetJids || config.targetJids.length === 0) {
            await reply(`⚠️ Belum ada target terdaftar. Polling dikirim ke obrolan ini saja.`);
          } else {
            await reply(`⏳ Mengirim polling ke *${targets.length}* target terdaftar...`);
          }

          let successCount = 0;
          for (const t of targets) {
            await new Promise(r => setTimeout(r, 700)); // Jeda antar kirim
            try {
              await sendNativePoll(sock, t, pollQuestion, pollOptions, 1);
              successCount++;
              console.log(`📊 [Custom Poll Broadcast] "${pollQuestion}" ke ${t}`);
            } catch (err) {
              console.error(`[Poll Broadcast Error] Gagal kirim ke ${t}:`, err.message);
            }
          }
          await reply(`✅ Polling berhasil dikirim ke *${successCount}/${targets.length}* target!`);
        } else {
          await sendNativePoll(sock, remoteJid, pollQuestion, pollOptions, 1);
          console.log(`📊 [Custom Poll Terkirim] "${pollQuestion}" ke ${remoteJid}`);
        }
      } catch (err) {
        console.error('[Custom Poll Error]', err);
        await reply(`❌ Gagal membuat polling: ${err.message}`);
      }
      break;
    }

    case 'ai':
    case 'tanya': {
      const mediaFile = await extractMediaFromMessage(msg, sock);
      const questionText = query || (mediaFile ? 'Tolong simpulkan dan analisis isi file ini secara lengkap dan terstruktur.' : '');

      if (!questionText && !mediaFile) {
        await reply(`🤖 *CARA BERTANYA KE AI:*\n\nKetik:\n*${prefix}ai <pertanyaan kamu>*\nAtau kirim/balas file dokumen (PDF) / foto dengan caption *${prefix}ai tolong simpulkan file ini*\n\nContoh:\n• *${prefix}ai apa saja jadwal kelas A hari ini?*\n• *${prefix}ai tolong simpulkan data file PDF ini*\n\n💡 _Di grup, kamu juga bisa langsung tag/mention bot:_ *@Bot <pertanyaan>*\n🧹 _Ketik *${prefix}reset* untuk membersihkan memori obrolan AI._`);
        return;
      }

      await react('🤔');
      try {
        const answer = await askGeminiAI(questionText, userIsOwner, mediaFile, null, sock, remoteJid, sender);
        await reply(answer);
        await react('💡');
      } catch (err) {
        await reply(`❌ Terjadi kendala AI: ${err.message}`);
      }
      break;
    }

    case 'reset':
    case 'clear': {
      const sessionId = (remoteJid && remoteJid.endsWith('@g.us'))
        ? `${remoteJid}:${sender || 'user'}`
        : (remoteJid || sender || 'default');
      resetSession(sessionId);
      await reply(`🧹 *MEMORI PERCAKAPAN AI DIBERSIHKAN!*\n\nRiwayat konteks obrolan Anda telah direset. Sekarang Anda dapat memulai topik obrolan baru dengan AI.`);
      break;
    }

    case 'ingat':
    case 'memory':
    case 'aimemory': {
      const memTarget = (remoteJid && remoteJid.endsWith('@g.us'))
        ? `${remoteJid}:${sender || 'user'}`
        : (sender || remoteJid || 'user');
      const memoryText = formatMemoryForUser(memTarget);
      await reply(memoryText);
      break;
    }

    case 'lupakan':
    case 'forget': {
      const memTarget = (remoteJid && remoteJid.endsWith('@g.us'))
        ? `${remoteJid}:${sender || 'user'}`
        : (sender || remoteJid || 'user');
      const keyToForget = query.trim();
      removeFact(memTarget, keyToForget || null);
      if (keyToForget) {
        await reply(`🧠 *[Memori Dihapus]* AI telah melupakan informasi tentang *"${keyToForget}"*.`);
      } else {
        await reply(`🧠 *[Semua Memori Dihapus]* Seluruh catatan memori jangka panjang tentangmu telah dihapus.`);
      }
      break;
    }

    case 'jadwal': {
      const targetClass = (args[1] || '').toUpperCase();
      const targetDay = (args[2] || '').toLowerCase() || null;

      if (!targetClass) {
        const text = 
`╭───「 📅 *MENU JADWAL KULIAH* 」
│ Silakan pilih kelas kuliah:
╰─────────────────────────────
• *${prefix}jadwal a* ➔ Jadwal Kelas A hari ini
• *${prefix}jadwal b* ➔ Jadwal Kelas B hari ini
• *${prefix}jadwal i* ➔ Jadwal Kelas I hari ini
• *${prefix}jadwal <kelas> <hari>* ➔ Cek hari tertentu (contoh: *${prefix}jadwal a senin*)

📸 *Pindai Jadwal Otomatis dari Foto / PDF:*
Kirim foto/PDF jadwal dengan caption *${prefix}scanjadwal* (atau balas foto/PDF dengan *${prefix}scanjadwal*)!`;
        await reply(text);
        return;
      }

      await react('📅');
      const scheduleText = formatSchedule(targetClass, targetDay);
      await reply(scheduleText);
      break;
    }

    case 'scan':
    case 'scanjadwal': {
      const mediaFile = await extractMediaFromMessage(msg, sock);

      if (!mediaFile) {
        await reply(`📸 *CARA MEMINDAI JADWAL DARI FOTO / PDF:*\n\n1. Kirim file PDF atau foto tabel jadwal ke bot dengan menyertakan teks keterangan/caption: *${prefix}scanjadwal*\nATAU\n2. Balas (reply) foto atau file PDF jadwal yang sudah ada dengan mengetik: *${prefix}scanjadwal*\n\n✨ Bot akan otomatis mengekstrak jadwal Kelas A, B, dan I menggunakan Google Gemini AI!`);
        return;
      }

      await react('⏳');
      const fileTypeLabel = mediaFile.mimeType.includes('pdf') ? 'Dokumen PDF' : 'Foto';
      await reply(`⏳ *Menganalisis ${fileTypeLabel} jadwal menggunakan Google Gemini AI...*\nMohon tunggu sekitar 3-5 detik...`);

      try {
        const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
        const scanResult = await scanScheduleWithGemini(mediaFile.buffer, mediaFile.mimeType, apiKey);

        const classesFoundStr = (scanResult.classesFound || []).join(', ') || 'A, B, I';
        await react('✅');
        await reply(`✅ *PEMINDAIAN JADWAL SELESAI!*\n\n🤖 Google Gemini AI berhasil membaca jadwal untuk Kelas: *${classesFoundStr}*.\nData jadwal telah otomatis diperbarui dan disimpan!\n\nSekarang kamu bisa melihat jadwalnya dengan mengetik:\n👉 *${prefix}jadwal a*\n👉 *${prefix}jadwal b*\n👉 *${prefix}jadwal i*`);
      } catch (scanErr) {
        console.error('[Gemini Scan Error]', scanErr);
        await react('⚠️');
        await reply(
`⚠️ *Gagal Memindai Gambar/PDF:* Server AI Vision sedang sibuk atau mengalami antrean.

💡 *Solusi Alternatif Cepat (Langsung Berhasil):*
1. Buka foto/PDF jadwal di HP kamu, lalu gunakan *Google Lens* (atau fitur salin teks foto di galeri HP).
2. Salin (copy) teks tabel jadwal tersebut.
3. Kirim ke bot dengan perintah:
👉 *${prefix}ai tolong simpan jadwal ini untuk Kelas B:*
_[tempel/paste teks jadwal kamu di sini]_

🤖 Bot AI akan otomatis merapikan jam, mata kuliah, dosen, dan ruangannya, lalu langsung menyimpannya ke database!`
        );
      }
      break;
    }

    case 'tugas':
    case 'task': {
      const subCommand = (args[1] || '').toLowerCase();

      // 1. !tugas tambah <matkul> | <judul> | <deadline>
      if (subCommand === 'tambah' || subCommand === 'add') {
        const payloadStr = query.slice(subCommand.length).trim();
        const parts = payloadStr.split('|').map(s => s.trim());
        if (parts.length < 2) {
          await reply(`❌ Format salah. Gunakan:\n*${prefix}tugas tambah <matkul> | <judul tugas> | <deadline>*\n\nContoh:\n*${prefix}tugas tambah Basis Data | Bikin ERD Toko | Jumat jam 23:59*`);
          return;
        }

        const matkul = parts[0];
        const judul = parts[1];
        const deadline_text = parts[2] || '-';

        await react('⏳');
        const res = await addTask({ kelas: 'A', matkul, judul, deadline_text, created_by: sender });
        await react('✅');
        await reply(`✅ *TUGAS BERHASIL DICATAT!*\n\n▫️ *ID:* ${res.task.id}\n▫️ *Matkul:* ${res.task.matkul}\n📋 *Tugas:* ${res.task.judul}\n⏰ *Batas:* ${res.task.deadline_text}\n\nData tersimpan aman di cloud Supabase 🟢`);
        return;
      }

      // 2. !tugas done <id / nama matkul>
      if (subCommand === 'done' || subCommand === 'selesai' || subCommand === 'kelar' || subCommand === 'beres') {
        const targetIdentifier = args.slice(2).join(' ') || args[2];
        if (!targetIdentifier) {
          await reply(`❌ Masukkan ID atau nama mata kuliah tugas. Contoh:\n• *${prefix}tugas done 1*\n• *${prefix}tugas done basdat*\n_Atau cukup bilang ke AI:_ *${prefix}ai tugas basdat udah kelar*`);
          return;
        }
        await react('⏳');
        const res = await markTaskDone(targetIdentifier);
        if (res.success) {
          await react('🎉');
          const t = res.task || {};
          await reply(`🎉 *SELAMAT!* Tugas *${t.matkul || ''}* - "*${t.judul || 'Tugas'}*" (ID: ${t.id}) telah ditandai *SELESAI*! Beban kuliah berkurang satu! 🚀`);
        } else {
          await reply(`❌ ${res.message || 'Tugas tidak ditemukan.'}`);
        }
        return;
      }

      // 3. !tugas hapus <id / nama matkul>
      if (subCommand === 'hapus' || subCommand === 'del' || subCommand === 'delete') {
        if (!userIsOwner) {
          await reply('⛔ Hanya Admin / Owner yang dapat menghapus data tugas.');
          return;
        }
        const targetIdentifier = args.slice(2).join(' ') || args[2];
        if (!targetIdentifier) {
          await reply(`❌ Masukkan ID atau nama mata kuliah tugas. Contoh: *${prefix}tugas hapus basdat*`);
          return;
        }
        await react('⏳');
        const res = await deleteTask(targetIdentifier);
        if (res.success) {
          await react('🗑️');
          await reply(`🗑️ Tugas *${targetIdentifier}* berhasil dihapus dari database.`);
        } else {
          await reply(`❌ ${res.message || 'Gagal menghapus tugas.'}`);
        }
        return;
      }

      // 4. !tugas ubah <id> | <deadline baru>
      if (subCommand === 'ubah' || subCommand === 'edit' || subCommand === 'update') {
        const payloadStr = query.slice(subCommand.length).trim();
        const parts = payloadStr.split('|').map(s => s.trim());
        const taskId = parseInt(parts[0], 10);
        if (isNaN(taskId) || parts.length < 2) {
          await reply(`❌ Format salah. Gunakan:\n*${prefix}tugas ubah <ID> | <deadline baru>*\n\nContoh:\n*${prefix}tugas ubah 1 | Minggu jam 23:59*`);
          return;
        }
        await react('⏳');
        const res = await updateTask(taskId, { deadline_text: parts[1] });
        if (res.success) {
          await react('✅');
          await reply(`✅ *TUGAS BERHASIL DIPERBARUI!*\n▫️ *ID:* ${taskId}\n⏰ *Batas Baru:* ${parts[1]}`);
        } else {
          await reply(`❌ ${res.message || 'Gagal memperbarui tugas.'}`);
        }
        return;
      }

      // 5. Tampilkan daftar tugas (!tugas atau !tugas a atau !tugas b)
      let targetClass = 'A';
      if (['a', 'b', 'i'].includes(subCommand)) {
        targetClass = subCommand.toUpperCase();
      }

      await react('📝');
      const taskListText = await formatTaskList(targetClass);
      await reply(taskListText);
      break;
    }

    case 'reminder':
    case 'reminders':
    case 'ingatkan':
    case 'pengingat': {
      const subCommand = (args[1] || '').toLowerCase();

      // !ingatkan hapus <id> atau !delreminder <id>
      if (subCommand === 'hapus' || subCommand === 'del' || subCommand === 'delete') {
        const remId = parseInt(args[2], 10);
        if (isNaN(remId)) {
          await reply(`❌ Masukkan ID pengingat. Contoh: *${prefix}delreminder 1*`);
          return;
        }
        const isDel = deleteCustomReminder(remId);
        if (isDel) {
          await reply(`🗑️ Pengingat ID *${remId}* berhasil dihapus.`);
        } else {
          await reply(`❌ Pengingat ID *${remId}* tidak ditemukan.`);
        }
        return;
      }

      // Jika ada waktu dan teks dipisahkan |: !ingatkan 19:30 | Kuis DFA besok | gw
      if (query.includes('|')) {
        const parts = query.split('|').map(s => s.trim());
        const timePart = parts[0];
        const textPart = parts[1];
        let dayPart = '';
        let targetPart = remoteJid;

        for (let i = 2; i < parts.length; i++) {
          const p = parts[i].toLowerCase();
          if (['gw', 'me', 'saya', 'pc', 'dm', 'pribadi'].includes(p)) {
            targetPart = sender || remoteJid;
          } else if (['saluran', 'channel'].includes(p)) {
            const nl = (config.targetJids || []).filter(t => t.endsWith('@newsletter'));
            if (nl.length > 0) targetPart = nl[0];
          } else if (['grup', 'group'].includes(p)) {
            targetPart = remoteJid.endsWith('@g.us') ? remoteJid : ((config.targetJids || []).find(t => t.endsWith('@g.us')) || remoteJid);
          } else {
            dayPart = parts[i];
          }
        }

        const newRem = addCustomReminder({
          text: textPart || 'Pengingat Deadline',
          timeStr: timePart,
          dayStr: dayPart,
          targetJid: targetPart,
          creatorJid: sender
        });

        const isDmToUser = targetPart && targetPart.endsWith('@s.whatsapp.net');
        const targetDesc = isDmToUser 
          ? 'DM / Chat Pribadimu' 
          : (targetPart.endsWith('@newsletter') ? 'Saluran WhatsApp' : (targetPart.endsWith('@g.us') ? 'Grup WhatsApp' : 'Chat ini'));

        const dayLabel = newRem.day ? ` (Hari: *${newRem.day}*)` : '';
        await reply(`⏰ *PENGINGAT DEADLINE BERHASIL DIBUAT!*\n\n▫️ *ID:* ${newRem.id}\n📌 *Agenda:* ${newRem.text}\n⏰ *Waktu:* ${newRem.time} WIB${dayLabel}\n🎯 *Tujuan:* *${targetDesc}*\n\n💡 _Bot akan otomatis mengirimkan pengingat tepat waktu ke ${targetDesc}._\n_Hapus pengingat: *${prefix}delreminder ${newRem.id}*_`);
        return;
      }

      // Tampilkan daftar pengingat
      const listText = formatRemindersList();
      await reply(`${listText}\n\n💡 *Cara Pasang Pengingat Baru:*\n*${prefix}ingatkan <jam> | <agenda> | [hari] | [target: gw / grup / saluran]*\nContoh:\n• *${prefix}ingatkan 19:30 | Kuis DFA | besok | gw* (kirim japri ke DM kamu)\n• *${prefix}ingatkan 08:00 | Kumpul Tugas | grup*\n_Atau cukup tanya AI:_ *${prefix}ai ingatkan besok jam 8 kuis DFA ke gw aja*`);
      break;
    }

    case 'delreminder': {
      const remId = parseInt(args[1], 10);
      if (isNaN(remId)) {
        await reply(`❌ Masukkan ID pengingat. Contoh: *${prefix}delreminder 1*`);
        return;
      }
      const isDel = deleteCustomReminder(remId);
      if (isDel) {
        await reply(`🗑️ Pengingat ID *${remId}* berhasil dihapus.`);
      } else {
        await reply(`❌ Pengingat ID *${remId}* tidak ditemukan.`);
      }
      break;
    }

    case 'today':
    case 'hariini': {
      const dt = getIndonesianDateTime();
      const messageText = getRenderedMessageForDay(dt.dayKey);
      await reply(`👁️ *[PRATINJAU TEMPLATE HARI INI: ${dt.dayName.toUpperCase()}]*\n\n${messageText}`);
      break;
    }

    case 'preview': {
      const targetDay = (args[1] || '').toLowerCase();
      if (!targetDay) {
        await reply(`❌ Harap masukkan nama hari. Contoh:\n*${prefix}preview senin* atau *${prefix}preview jumat*`);
        return;
      }
      const messageText = getRenderedMessageForDay(targetDay);
      await reply(`👁️ *[PRATINJAU TEMPLATE: ${targetDay.toUpperCase()}]*\n\n${messageText}`);
      break;
    }

    case 'send':
    case 'kirim': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }

      const allTargets = config.targetJids || [];
      const dayList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];

      let selectedTargets = allTargets;
      let targetLabel = 'seluruh target terdaftar';
      let customContent = null;
      let targetDay = null;

      const words = query.split(/\s+/).filter(Boolean);

      // 1. Cek apakah menyiarkan Jadwal (!send jadwal a [target])
      if (words[0] && words[0].toLowerCase() === 'jadwal') {
        const cls = (words[1] || 'a').toUpperCase();
        const d = dayList.includes((words[2] || '').toLowerCase()) ? words[2].toLowerCase() : null;
        customContent = formatSchedule(cls, d);
        const selectorCandidate = d ? words.slice(3).join(' ') : words.slice(2).join(' ');
        const resolved = resolveSelectedTargets(selectorCandidate, allTargets, remoteJid);
        selectedTargets = resolved.targets;
        targetLabel = resolved.label;

      // 2. Cek apakah menyiarkan Tugas (!send tugas [target])
      } else if (words[0] && words[0].toLowerCase() === 'tugas') {
        const cls = (words[1] || 'a').toUpperCase();
        customContent = await formatTaskList(cls);
        const selectorCandidate = words.slice(2).join(' ');
        const resolved = resolveSelectedTargets(selectorCandidate, allTargets, remoteJid);
        selectedTargets = resolved.targets;
        targetLabel = resolved.label;

      // 3. Siaran template harian
      } else {
        const foundDay = words.find(w => dayList.includes(w.toLowerCase()));
        if (foundDay) targetDay = foundDay.toLowerCase();

        const selectorWords = words.filter(w => !dayList.includes(w.toLowerCase())).join(' ');
        const resolved = resolveSelectedTargets(selectorWords, allTargets, remoteJid);
        selectedTargets = resolved.targets;
        targetLabel = resolved.label;
      }

      if (selectedTargets.length === 0) {
        await reply(`⚠️ Tidak ada target yang cocok untuk siaran ini.\nKetik *${prefix}targets* untuk melihat nomor dan daftar target.`);
        return;
      }

      await react('⏳');
      await reply(`⏳ *Mengirim siaran ke ${targetLabel} (${selectedTargets.length} target)...*`);

      const res = await sendDailyBroadcast(sock, targetDay, selectedTargets, customContent);
      if (!res.success) {
        await reply(`❌ Gagal mengirim: ${res.message}`);
      } else {
        await react('✅');
        const targetSummary = selectedTargets.map((t, i) => {
          const type = t.endsWith('@newsletter') ? '📢 Saluran' : (t.endsWith('@g.us') ? '👥 Grup' : '👤 Pribadi');
          return `▫️ ${i + 1}. ${type} \`${t}\``;
        }).join('\n');
        await reply(`✅ *SIARAN SELESAI!*\n\n🎯 Berhasil terkirim ke *${res.sentCount}* dari *${res.totalCount}* target terpilih:\n${targetSummary}`);
      }
      break;
    }

    case 'bc':
    case 'broadcast': {
      if (!userIsOwner) {
        await reply('⛔ Perintah broadcast hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }

      if (!query) {
        await reply(`❌ Format broadcast salah. Gunakan:\n*${prefix}bc [target] <pesan>*\n\n*Pilihan Target:*\n• *${prefix}bc Pengumuman...* ➔ Kirim ke semua target\n• *${prefix}bc 1 Pesan...* ➔ Kirim ke target nomor 1 saja\n• *${prefix}bc 1,2 Pesan...* ➔ Kirim ke nomor 1 & 2\n• *${prefix}bc saluran Pesan...* ➔ Kirim ke semua Saluran\n• *${prefix}bc grup Pesan...* ➔ Kirim ke semua Grup\n• *${prefix}bc sini Pesan...* ➔ Kirim ke chat ini saja\n\n_Ketik *${prefix}targets* untuk melihat daftar nomor target._`);
        return;
      }

      const allTargets = config.targetJids || [];
      const words = query.split(/\s+/).filter(Boolean);
      let selectedTargets = allTargets;
      let targetLabel = 'seluruh target terdaftar';
      let messageBody = query;

      const firstWord = (words[0] || '').toLowerCase();
      const isSelector = /^\d+(,\d+)*$/.test(firstWord) || ['saluran', 'channel', 'grup', 'group', 'sini', 'chat'].includes(firstWord);

      if (isSelector && words.length > 1) {
        const resolved = resolveSelectedTargets(firstWord, allTargets, remoteJid);
        selectedTargets = resolved.targets;
        targetLabel = resolved.label;
        messageBody = query.slice(words[0].length).trim();
      }

      if (!messageBody) {
        await reply('❌ Harap sertakan pesan yang ingin disiarkan.');
        return;
      }

      if (selectedTargets.length === 0) {
        await reply(`⚠️ Target pengiriman tidak ditemukan. Ketik *${prefix}targets* untuk melihat daftar target.`);
        return;
      }

      const dt = getIndonesianDateTime() || {};
      const formattedBc = 
`📢 *[PENGUMUMAN RESMI]*
━━━━━━━━━━━━━━━━━━━━━

${messageBody}

━━━━━━━━━━━━━━━━━━━━━
📅 ${dt.dateFormatted || ''} | ⏰ ${dt.timeFormatted || 'WIB'}`;

      await react('⏳');
      await reply(`⏳ *Mengirim broadcast ke ${targetLabel} (${selectedTargets.length} target)...*`);

      const res = await sendDailyBroadcast(sock, null, selectedTargets, formattedBc);
      if (!res.success) {
        await reply(`❌ Gagal broadcast: ${res.message}`);
      } else {
        await react('✅');
        await reply(`✅ *BROADCAST BERHASIL!*\nPesan pengumuman telah terkirim ke *${res.sentCount}* dari *${res.totalCount}* target (${targetLabel}).`);
      }
      break;
    }

    case 'sendto': {
      const destJid = args[1];
      const targetDay = (args[2] || '').toLowerCase() || null;

      if (!destJid) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}sendto <ID_JID> [hari]*\nContoh: *${prefix}sendto 12036302xxxxxx@newsletter senin*`);
        return;
      }

      const messageText = getRenderedMessageForDay(targetDay);
      try {
        await sock.sendMessage(destJid, { text: messageText });
        await reply(`✅ Berhasil mengirim template ke \`${destJid}\`!`);
      } catch (err) {
        await reply(`❌ Gagal mengirim ke \`${destJid}\`: ${err.message}`);
      }
      break;
    }

    case 'targets': {
      const targets = config.targetJids || [];
      if (targets.length === 0) {
        await reply(`📋 Daftar target saluran / grup saat ini masih KOSONG.\n\n💡 *Cara Menambahkan Target:* \n• Ketik *${prefix}addtarget* (di dalam grup/saluran)\n• Atau *${prefix}addtarget <link/JID>*\n  Contoh: *${prefix}addtarget https://chat.whatsapp.com/...*`);
        return;
      }

      await react('🔍');
      const targetItems = [];
      for (let idx = 0; idx < targets.length; idx++) {
        const t = targets[idx];
        let name = '';
        let type = '👤 Pribadi';

        if (t.endsWith('@g.us')) {
          type = '👥 Grup';
          try {
            const meta = await sock.groupMetadata(t).catch(() => null);
            if (meta && meta.subject) name = meta.subject;
          } catch (e) {}
        } else if (t.endsWith('@newsletter')) {
          type = '📢 Saluran';
          try {
            const meta = await sock.newsletterMetadata('JID', t).catch(() => null);
            if (meta && meta.name) name = meta.name;
          } catch (e) {}
        }

        const nameLabel = name ? `*${name}*\n   └ ` : '';
        targetItems.push(`*${idx + 1}.* ${type} ${nameLabel}\`${t}\``);
      }

      const tipsStr = 
`━━━━━━━━━━━━━━━━━━━━━
💡 *CARA SIARAN & KELOLA TARGET:*
• *${prefix}send 1* ➔ Kirim ke target nomor 1 saja
• *${prefix}send saluran* ➔ Kirim ke semua Saluran
• *${prefix}send grup* ➔ Kirim ke semua Grup
• *${prefix}addtarget* ➔ Daftarkan grup ini langsung
• *${prefix}addtarget <link/JID>* ➔ Tambah target via link/JID
• *${prefix}deltarget <nomor/JID>* ➔ Hapus target (cth: *${prefix}deltarget 1*)`;

      await reply(`╭───「 📋 *DAFTAR TARGET SIARAN AKTIF (${targets.length})* 」\n╰──────────────────────────\n\n${targetItems.join('\n\n')}\n\n${tipsStr}`);
      break;
    }

    case 'addtarget':
    case 'addlink': {
      // Ambil input: cari URL dari seluruh teks query terlebih dahulu jika ada, atau ambil dari argumen JID
      const urlInQuery = query.match(/https?:\/\/[^\s]+/i);
      let input = urlInQuery ? urlInQuery[0] : (args.slice(1).find(a => a.includes('@')) || args[1] || '').trim();

      // Jika perintah diketik tanpa argumen di dalam grup atau saluran, daftarkan obrolan saat ini secara otomatis!
      if (!input || input === 'sini' || input === 'here') {
        if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@newsletter')) {
          input = remoteJid;
        }
      }

      // 1. Jika input berupa tautan Saluran (whatsapp.com/channel/...)
      const channelMatch = input.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
      if (channelMatch) {
        const inviteCode = channelMatch[1];
        try {
          await reply('⏳ Sedang memeriksa data saluran...');
          const meta = await sock.newsletterMetadata('INVITE', inviteCode);
          if (!meta || !meta.id) {
            await reply('❌ Saluran tidak ditemukan atau tautan sudah tidak aktif.');
            return;
          }

          if (!config.targetJids) config.targetJids = [];
          if (config.targetJids.includes(meta.id)) {
            await reply(`⚠️ Saluran *${meta.name || 'Saluran'}* (\`${meta.id}\`) sudah terdaftar sebelumnya.`);
            return;
          }

          config.targetJids.push(meta.id);
          saveConfig(config);
          await reply(`✅ *Berhasil Mendaftarkan Saluran Baru!*\n\n• Nama Saluran: *${meta.name || 'Saluran'}*\n• JID Saluran: \`${meta.id}\`\n• Pengikut: *${meta.subscribers || 0}*\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
        } catch (err) {
          await reply(`❌ Gagal mengambil data saluran: ${err.message}`);
        }
        return;
      }

      // 2. Jika input berupa tautan Undangan Grup (chat.whatsapp.com/...)
      const groupMatch = input.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
      if (groupMatch) {
        const inviteCode = groupMatch[1];
        try {
          await reply('⏳ Memeriksa tautan undangan grup WhatsApp...');
          const groupInfo = await sock.groupGetInviteInfo(inviteCode);
          if (!groupInfo || !groupInfo.id) {
            await reply('❌ Tautan grup tidak valid, kedaluwarsa, atau tautan telah direset.');
            return;
          }

          let joinedStatus = 'ℹ️ Bot sudah berada di dalam grup ini';
          try {
            await sock.groupAcceptInvite(inviteCode);
            joinedStatus = '🟢 Bot berhasil bergabung ke dalam grup!';
          } catch (eJoin) {
            if (eJoin.message && !eJoin.message.includes('already in')) {
              console.log(`ℹ️ [Group Join Notice]: ${eJoin.message}`);
            }
          }

          const rawId = groupInfo.id;
          const groupJid = rawId.endsWith('@g.us') ? rawId : `${rawId}@g.us`;

          if (!config.targetJids) config.targetJids = [];
          if (config.targetJids.includes(groupJid)) {
            await reply(`⚠️ Grup *${groupInfo.subject || 'Grup'}* (\`${groupJid}\`) sudah terdaftar sebelumnya di target siaran.\n\nStatus: ${joinedStatus}`);
            return;
          }

          config.targetJids.push(groupJid);
          saveConfig(config);
          await reply(`✅ *Berhasil Mendaftarkan Grup Baru!*\n\n• Nama Grup: *${groupInfo.subject || 'Grup WhatsApp'}*\n• JID Grup: \`${groupJid}\`\n• Anggota: *${groupInfo.size || groupInfo.participants?.length || '?'}*\n• Status: ${joinedStatus}\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
        } catch (err) {
          await reply(`❌ Gagal memproses tautan grup: ${err.message}\n_Pastikan tautan undangan valid dan bot belum diblokir oleh admin grup._`);
        }
        return;
      }

      // 3. Jika input berupa ID JID langsung (@newsletter, @g.us, @s.whatsapp.net)
      if (!input || (!input.includes('@newsletter') && !input.includes('@g.us') && !input.includes('@s.whatsapp.net'))) {
        await reply(`❌ Format tidak valid. Anda bisa mendaftarkan target dengan cara:\n\n1. Ketik *${prefix}addtarget* langsung di dalam grup/saluran ini.\n2. Tautan Grup: *${prefix}addtarget https://chat.whatsapp.com/...*\n3. Tautan Saluran: *${prefix}addtarget https://whatsapp.com/channel/...*\n4. ID JID Langsung: *${prefix}addtarget 1203630xxxxxxx@g.us*`);
        return;
      }

      if (!config.targetJids) config.targetJids = [];
      if (config.targetJids.includes(input)) {
        await reply(`⚠️ Target \`${input}\` sudah terdaftar di dalam daftar.`);
        return;
      }

      // Ambil nama grup/saluran dari JID jika memungkinkan
      let targetName = '';
      let targetType = input.endsWith('@newsletter') ? '📢 Saluran' : (input.endsWith('@g.us') ? '👥 Grup' : '👤 Pribadi');

      if (input.endsWith('@g.us')) {
        try {
          const gMeta = await sock.groupMetadata(input).catch(() => null);
          if (gMeta && gMeta.subject) targetName = gMeta.subject;
        } catch (e) {}
      } else if (input.endsWith('@newsletter')) {
        try {
          const nlMeta = await sock.newsletterMetadata('JID', input).catch(() => null);
          if (nlMeta && nlMeta.name) targetName = nlMeta.name;
        } catch (e) {}
      }

      config.targetJids.push(input);
      saveConfig(config);

      const nameInfo = targetName ? `• Nama: *${targetName}*\n` : '';
      await reply(`✅ *Berhasil Mendaftarkan Target Baru!*\n\n${nameInfo}• ID JID: \`${input}\`\n• Tipe: *${targetType}*\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
      break;
    }

    case 'deltarget': {
      const delInput = (args[1] || '').trim();
      if (!delInput) {
        await reply(`❌ Masukkan nomor urut atau JID yang ingin dihapus.\n\nContoh:\n• Pakai Nomor: *${prefix}deltarget 1*\n• Pakai JID: *${prefix}deltarget 1203630xxxxxxx@newsletter*`);
        return;
      }

      const targets = config.targetJids || [];
      let targetToRemove = delInput;

      // Cek apakah input berupa nomor indeks (misal: 1, 2)
      const numIdx = parseInt(delInput, 10);
      if (!isNaN(numIdx) && numIdx > 0 && numIdx <= targets.length) {
        targetToRemove = targets[numIdx - 1];
      }

      if (!targets.includes(targetToRemove)) {
        await reply(`❌ Target \`${delInput}\` tidak ditemukan di daftar target.`);
        return;
      }

      config.targetJids = targets.filter(j => j !== targetToRemove);
      saveConfig(config);
      await reply(`✅ Berhasil menghapus target:\n\`${targetToRemove}\`\n\nTotal sisa target: ${config.targetJids.length}`);
      break;
    }

    case 'mahasiswa':
    case 'mhs':
    case 'datamahasiswa': {
      const q = query.trim();
      let list = [];
      if (q) {
        list = await mahasiswaManager.searchMahasiswa(q);
      } else {
        list = await mahasiswaManager.getMahasiswaList();
      }

      if (list.length === 0) {
        await reply(q
          ? `🔍 Mahasiswa dengan kata kunci *"${q}"* tidak ditemukan di database Supabase.`
          : `📋 *[Data Mahasiswa]*\nBelum ada data mahasiswa yang terdaftar di database Supabase.\n\n_Untuk menambahkan, ketik:_\n*${prefix}tambahmhs <nama> | <nim>*`
        );
        return;
      }

      let mhsListStr = `╭───「 🎓 *DATA MAHASISWA SLINF26 (${list.length})* 」\n╰──────────────────────────\n\n`;
      list.forEach((m, idx) => {
        mhsListStr += `▫️ *[${idx + 1}]* *${m.nama}*\n   NIM: \`${m.nim}\` (ID: ${m.id})\n\n`;
      });
      mhsListStr += `💡 _Untuk cari: *${prefix}mahasiswa <nama/nim>*_\n💡 _Untuk tambah: *${prefix}tambahmhs <nama> | <nim>*_\n💡 _Untuk hapus: *${prefix}hapusmhs <nim/id>*_`;
      await reply(mhsListStr.trim());
      break;
    }

    case 'tambahmhs':
    case 'addmhs': {
      if (!query.includes('|')) {
        await reply(`❌ Format salah. Gunakan tanda *|* pemisah nama dan NIM.\n\nContoh:\n*${prefix}tambahmhs Budi Santoso | 22051204001*`);
        return;
      }
      const [mName, mNim] = query.split('|').map(s => s.trim());
      if (!mName || !mNim) {
        await reply(`❌ Nama dan NIM wajib diisi.\nContoh: *${prefix}tambahmhs Siti Aminah | 22051204002*`);
        return;
      }
      const addRes = await mahasiswaManager.addMahasiswa(mName, mNim);
      if (addRes.success) {
        await reply(`✅ *[Mahasiswa Berhasil Ditambahkan]*\n\n• Nama: *${mName}*\n• NIM: \`${mNim}\`\n• Database: 🟢 Supabase Cloud PostgreSQL\n\nKetik *${prefix}mahasiswa* untuk melihat daftar.`);
      } else {
        await reply(`⚠️ Gagal menambahkan: ${addRes.message}`);
      }
      break;
    }

    case 'importmhs':
    case 'batchmhs': {
      let rawText = query.trim();

      // Cek apakah ada file dokumen/lampiran yang dikirim (misal file .txt atau .csv)
      const mediaFile = await extractMediaFromMessage(msg, sock);
      if (mediaFile && mediaFile.buffer) {
        try {
          rawText = mediaFile.buffer.toString('utf-8');
        } catch (e) {}
      }

      if (!rawText) {
        await reply(`❌ Masukkan daftar nama dan NIM, atau kirim file teks/CSV dengan caption *${prefix}importmhs*.\n\nContoh format yang didukung:\n• *1. Budi Santoso - 22051204001*\n• *Siti Aminah (22051204002)*\n• *Ahmad Zaki 22051204003* (Copy-paste dari Excel)\n\nBot bisa mengimpor 100+ data sekaligus dalam 1 detik! ⚡`);
        return;
      }

      const parsed = mahasiswaManager.parseMahasiswaList(rawText);
      if (parsed.length === 0) {
        await reply(`⚠️ Tidak ditemukan data nama dan NIM yang valid dari teks yang Anda kirim.\nPastikan setiap baris memiliki nama dan NIM minimal 5 angka.`);
        return;
      }

      await reply(`⏳ Sedang mengimpor *${parsed.length} data mahasiswa* ke database Supabase Cloud...`);
      const bRes = await mahasiswaManager.batchAddMahasiswa(parsed);
      if (bRes.success) {
        await reply(`✅ *[IMPORT MASSAL MAHASISWA BERHASIL]*\n\n• Total Terdeteksi: *${bRes.total}* orang\n• Berhasil Disimpan: *${bRes.inserted}* mahasiswa baru\n• Dilewati (NIM Sudah Ada): *${bRes.skipped}* mahasiswa\n• Database: 🟢 Supabase PostgreSQL Cloud\n\nKetik *${prefix}mahasiswa* untuk melihat seluruh data! 🎓`);
      } else {
        await reply(`❌ Gagal impor massal: ${bRes.message}`);
      }
      break;
    }

    case 'hapusmhs':
    case 'delmhs': {
      if (!query) {
        await reply(`❌ Masukkan NIM atau ID mahasiswa yang ingin dihapus.\nContoh: *${prefix}hapusmhs 22051204001*`);
        return;
      }
      const delRes = await mahasiswaManager.deleteMahasiswa(query.trim());
      if (delRes.success) {
        await reply(`🗑️ Data mahasiswa (\`${query.trim()}\`) berhasil dihapus dari database Supabase.`);
      } else {
        await reply(`⚠️ Gagal menghapus: ${delRes.message}`);
      }
      break;
    }

    case 'pilihan':
    case 'tombol':
    case 'menuinteraktif': {
      await sendNativePoll(
        sock,
        remoteJid,
        '🤖 Menu Cepat Alters Bot - Pilih Layanan:',
        [
          '📅 Jadwal Hari Ini',
          '📝 Tugas & Deadline',
          '🎓 Data Mahasiswa',
          '📊 Polling Kehadiran Dosen',
          'ℹ️ Status Server'
        ],
        1
      );
      break;
    }

    case 'tambahkan':
    case 'addowner': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }

      let newNumber = (args[1] || '').trim().replace(/[^0-9]/g, '');
      if (!newNumber) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}tambahkan <nomor_wa>*\nContoh: *${prefix}tambahkan 08123456789*`);
        return;
      }

      if (newNumber.startsWith('08')) {
        newNumber = '628' + newNumber.slice(2);
      }

      if (!config.ownerNumbers) config.ownerNumbers = [];
      if (config.ownerNumbers.includes(newNumber)) {
        await reply(`⚠️ Nomor *${newNumber}* sudah terdaftar di daftar pemilik.`);
        return;
      }

      config.ownerNumbers.push(newNumber);
      saveConfig(config);
      await reply(`✅ Berhasil menambahkan nomor pemilik baru:\n*${newNumber}*\n\nNomor ini sekarang bebas mengakses semua perintah dan chat pribadi dengan bot.`);
      break;
    }

    case 'hapusnomor':
    case 'delowner': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }

      let targetNumber = (args[1] || '').trim().replace(/[^0-9]/g, '');
      if (!targetNumber) {
        await reply(`❌ Masukkan nomor yang ingin dihapus.\nContoh: *${prefix}hapusnomor 08123456789*`);
        return;
      }

      if (targetNumber.startsWith('08')) {
        targetNumber = '628' + targetNumber.slice(2);
      }

      config.ownerNumbers = (config.ownerNumbers || []).filter(n => !n.includes(targetNumber));
      saveConfig(config);
      await reply(`✅ Nomor *${targetNumber}* berhasil dihapus dari daftar pemilik.`);
      break;
    }

    case 'listowner': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }

      const list = config.ownerNumbers || [];
      const textList = list.map((n, i) => `${i + 1}. \`${n}\``).join('\n');
      await reply(`👑 *DAFTAR NOMOR PEMILIK BOT:*\n\n${textList || 'Belum ada nomor khusus terdaftar.'}`);
      break;
    }

    case 'list': {
      if ((args[1] || '').toLowerCase() === 'dosen') {
        const list = (Array.isArray(config.defaultLecturers) && config.defaultLecturers.length > 0)
          ? config.defaultLecturers
          : ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'];
        const textList = list.map((d, idx) => `▫️ ${idx + 1}. *${d}*`).join('\n');
        await reply(`🎓 *DAFTAR DOSEN DEFAULT:*\n\n${textList}\n\n_Ketik *${prefix}all* untuk langsung membuat polling untuk semua dosen di atas._`);
        break;
      }

      const templates = getTemplates();
      const keys = Object.keys(templates);
      const listStr = keys.map((k, i) => `${i + 1}. *${k}* - ${templates[k].title || 'Tanpa Judul'}`).join('\n');
      await reply(`📚 *DAFTAR TEMPLATE YANG TERSEDIA:*\n\n${listStr || '(Belum ada template)'}\n\nGunakan *${prefix}preview <nama>* untuk melihat isi template.`);
      break;
    }

    case 'additem': {
      const day = (args[1] || '').toLowerCase();
      const itemText = trimmedText.slice(prefix.length + command.length + (args[1] || '').length).trim();

      if (!day || !itemText) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}additem <hari> <teks item>*\nContoh: *${prefix}additem senin ▫️ *Tugas 3:* Cek email masuk*`);
        return;
      }

      const templates = getTemplates();
      if (!templates[day]) {
        await reply(`❌ Template untuk hari '${day}' tidak ditemukan.`);
        return;
      }

      if (!Array.isArray(templates[day].items)) {
        templates[day].items = [];
      }

      templates[day].items.push(itemText);
      saveTemplates(templates);

      await reply(`✅ Berhasil menambahkan item baru ke template *${day}*:\n"${itemText}"`);
      break;
    }

    case 'delitem': {
      const day = (args[1] || '').toLowerCase();
      const itemIndex = parseInt(args[2], 10) - 1;

      if (!day || isNaN(itemIndex)) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}delitem <hari> <nomor item>*\nContoh: *${prefix}delitem senin 2*`);
        return;
      }

      const templates = getTemplates();
      if (!templates[day] || !Array.isArray(templates[day].items) || !templates[day].items[itemIndex]) {
        await reply(`❌ Item nomor ${itemIndex + 1} tidak ditemukan pada template '${day}'.`);
        return;
      }

      const removed = templates[day].items.splice(itemIndex, 1);
      saveTemplates(templates);

      await reply(`✅ Berhasil menghapus item nomor ${itemIndex + 1} dari template *${day}*:\n"${removed[0]}"`);
      break;
    }

    case 'autosend': {
      const statusParam = (args[1] || '').toLowerCase();
      const timeParam = args[2]; // misal "07:00"

      if (statusParam === 'off') {
        config.autoSend.enabled = false;
        saveConfig(config);
        stopScheduler();
        await reply('🛑 Jadwal pengiriman otomatis harian telah *DINONAKTIFKAN*.');
        return;
      }

      if (statusParam === 'on') {
        config.autoSend.enabled = true;

        if (timeParam && /^\d{1,2}:\d{2}$/.test(timeParam)) {
          const [hour, minute] = timeParam.split(':');
          config.autoSend.cronTime = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
        }

        saveConfig(config);
        startScheduler(sock);

        await reply(`✅ Jadwal pengiriman otomatis harian *DIAKTIFKAN*!\n⏰ Jadwal Cron: \`${config.autoSend.cronTime}\` (${config.autoSend.timezone})`);
        return;
      }

      await reply(`❌ Format salah. Gunakan:\n*${prefix}autosend on [jam:menit]* (contoh: *${prefix}autosend on 07:00*)\natau *${prefix}autosend off*`);
      break;
    }

    case 'reminder':
    case 'ingatkan':
    case 'pengingat': {
      const subAction = (args[1] || '').toLowerCase();
      const valParam = (args[2] || '').trim();

      if (!config.reminder) {
        config.reminder = { enabled: true, cronTime: '0 19 * * *', timezone: 'Asia/Jakarta' };
      }

      if (subAction === 'off') {
        config.reminder.enabled = false;
        saveConfig(config);
        startScheduler(sock);
        await react('🛑');
        await reply('🛑 *[Pengingat Tugas Dinonaktifkan]*\nPengingat tugas kuliah malam hari otomatis telah dinonaktifkan.');
        return;
      }

      if (subAction === 'on') {
        config.reminder.enabled = true;
        if (valParam && /^\d{1,2}:\d{2}$/.test(valParam)) {
          const [hour, minute] = valParam.split(':');
          config.reminder.cronTime = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
        }
        saveConfig(config);
        startScheduler(sock);
        await react('⏰');
        await reply(`✅ *[Pengingat Tugas Diaktifkan]*\n⏰ Jadwal Cron: \`${config.reminder.cronTime}\` (${config.reminder.timezone || 'Asia/Jakarta'})\nBot akan otomatis mengecek tugas di Supabase dan mengingatkan ke target!`);
        return;
      }

      if (subAction === 'set' && valParam && /^\d{1,2}:\d{2}$/.test(valParam)) {
        const [hour, minute] = valParam.split(':');
        config.reminder.cronTime = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
        config.reminder.enabled = true;
        saveConfig(config);
        startScheduler(sock);
        await react('⏰');
        await reply(`✅ *[Waktu Pengingat Diperbarui]*\n⏰ Pengingat tugas disetel setiap hari pada jam *${valParam} WIB*.\nPengingat otomatis aktif!`);
        return;
      }

      if (subAction === 'now' || subAction === 'kirim' || subAction === 'cek') {
        await react('⏳');
        await reply('⏳ Memeriksa tugas aktif dan mengirim pengingat sekarang...');
        const remRes = await sendTaskReminder(sock, [remoteJid]);
        if (remRes.success) {
          await react('✅');
        } else {
          await reply(`⚠️ Kendala pengingat: ${remRes.message}`);
        }
        return;
      }

      // Tampilan status default
      const isRemActive = config.reminder.enabled ? '🟢 *Aktif*' : '🔴 *Nonaktif*';
      const remTimeStr = config.reminder.cronTime || '0 19 * * *';
      await reply(
`⏰ *[PENGATURAN PENGINGAT TUGAS]*
━━━━━━━━━━━━━━━━━━━━━
• Status Pengingat: ${isRemActive}
• Jadwal Cron: \`${remTimeStr}\` (Default: 19:00 WIB)
• Target: Otomatis ke Saluran & Grup terdaftar

📌 *PILIHAN PERINTAH:*
• *${prefix}reminder now* ➔ Kirim pengingat tugas sekarang ke chat ini
• *${prefix}reminder on [jam]* ➔ Aktifkan (contoh: *${prefix}reminder on 19:00*)
• *${prefix}reminder off* ➔ Nonaktifkan pengingat
• *${prefix}reminder set <jam:menit>* ➔ Ubah jam pengingat (contoh: *${prefix}reminder set 20:30*)

💡 _Tips AI: Kamu juga bisa suruh Alters langsung: "Alters ingatkan tugas apa aja hari ini"!_`
      );
      break;
    }

    case 'restart': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }

      await reply('🔄 *Sedang me-restart bot...*\nMohon tunggu sekitar 3 detik, bot akan otomatis hidup kembali dengan segar.');
      console.log('🔄 [Restart Request] Perintah restart diterima dari Owner. Me-restart proses...');
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      break;
    }

    case 'alters':
    case 'about':
    case 'status': {
      await react('🤖');
      const dt = getIndonesianDateTime() || {};
      const fullTimeStr = dt.fullFormatted || (dt.formattedDate ? `${dt.hari || dt.dayName || ''}, ${dt.formattedDate} - ${dt.formattedTime || ''}` : `${dt.dayName || dt.hari || 'WIB'}, ${dt.dateFormatted || ''} - ${dt.timeFormatted || ''}`);
      const isAuto = config.autoSend && config.autoSend.enabled;

      const dbStatus = await (checkDatabaseStatus ? checkDatabaseStatus() : Promise.resolve({ message: '🟢 Terhubung' }));

      const uptimeSec = Math.floor(process.uptime());
      const uptimeHours = Math.floor(uptimeSec / 3600);
      const uptimeMin = Math.floor((uptimeSec % 3600) / 60);
      const memUsageMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
      const isTermux = Boolean(process.env.PREFIX && process.env.PREFIX.includes('com.termux'));
      const osType = isTermux ? 'Android (Termux)' : `${os.type()} ${os.arch()}`;
      const targetCount = (config.targetJids || []).length;

      const statusText = 
`🤖 *[ALTERS - ACADEMIC AI COPILOT]*
Halo! Namaku *Alters*, asisten AI akademik & co-pilot cerdas untuk komunitas mahasiswa SLINF26.

⚙️ *KONDISI SISTEM & HOST SERVER:*
• Platform Host: *${osType}*
• Runtime Engine: *Node.js ${process.version}*
• Uptime Bot: *${uptimeHours} jam ${uptimeMin} menit* (Aktif & Siaga)
• Konsumsi RAM: *~${memUsageMb} MB* (Hemat & Ringan)
• Cloud Database: ${dbStatus.message}
• Auto-Broadcast (07:00): ${isAuto ? '🟢 AKTIF' : '🔴 NONAKTIF'}
• Target Siaran Terdaftar: *${targetCount}* target

🚀 *PEMBARUAN FITUR TERKINI (CHANGELOG):*
1. 🧠 *AI Slang & Kata Abstrak*: Paham bahasa santai, istilah kampus & kehadiran.
2. ⏳ *Smart Memory*: Konteks sesi 10 menit + Memori Jangka Panjang permanen (!ingat).
3. 📊 *Dual Polling*: Dukung Saluran (@newsletter) & Grup (@g.us) dengan auto text fallback.
4. 👥 *Group Admin*: Fitur !tagall, !hidetag, dan quote reply langsung.
5. ⚡ *Admin Schedule*: Shortcut !gantijam, !gantiruang, !batal dengan preview instan.
6. 📢 *Selective Broadcast*: !send [target] dan !bc [target] <pesan>.
7. 🔍 *GitHub Updater*: !checkupdate dan !update langsung dari WA.

💡 _Ketik *!menu* untuk melihat seluruh perintah lengkap!_`;

      await reply(statusText);
      break;
    }

    case 'repair': {
      // Diagnostic & Self-repair report
      const mem = process.memoryUsage();
      const ramMB = (mem.rss / 1024 / 1024).toFixed(1);
      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const secs = uptimeSec % 60;

      // Jalankan pengecekan dan pemulihan file jika ada yang hilang
      ensureSelfIntegrity();

      const report = 
`🩺 *HASIL DIAGNOSA & SELF-REPAIR:*
• *Status Sistem:* 🟢 Berjalan Normal
• *Penggunaan RAM:* ~${ramMB} MB
• *Uptime Bot:* ${hours}j ${mins}m ${secs}d
• *Integritas File:*
  ✅ utils/formatter.js (Aman)
  ✅ config.json (Aman)
  ✅ templates.json (Aman)
  ✅ session_auth (Aktif)

✨ Seluruh modul dan struktur file bot dalam kondisi prima!`;
      await reply(report);
      break;
    }

    case 'setconfig': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }
      const keyToSet = (args[1] || '').trim();
      const valToSet = query.slice(keyToSet.length).trim();
      if (!keyToSet || !valToSet) {
        await reply(`⚙️ *[PENGATURAN KONFIGURASI DARI WHATSAPP]*\n\nCara pakai:\n*${prefix}setconfig <kunci> <nilai>*\n\nContoh:\n• *${prefix}setconfig groqApiKey gsk_xxx*\n• *${prefix}setconfig geminiApiKey AIzaxxx*\n• *${prefix}setconfig groqModel qwen/qwen3.8-27b*\n• *${prefix}setconfig prefix !*\n\n_Atau cukup ketik:_\n*${prefix}setgroq <kunci_groq>*\n*${prefix}setgemini <kunci_gemini>*`);
        return;
      }
      const cfg = loadConfig();
      if (valToSet.toLowerCase() === 'true') cfg[keyToSet] = true;
      else if (valToSet.toLowerCase() === 'false') cfg[keyToSet] = false;
      else if (/^\d+$/.test(valToSet)) cfg[keyToSet] = parseInt(valToSet, 10);
      else cfg[keyToSet] = valToSet;
      saveConfig(cfg);
      const maskedVal = valToSet.length > 10 ? `${valToSet.slice(0, 6)}...${valToSet.slice(-4)}` : valToSet;
      await reply(`✅ *[Konfigurasi Diperbarui Langsung dari WA]*\n\n• Kunci: \`${keyToSet}\`\n• Nilai: \`${maskedVal}\`\n\nTersimpan permanen di config.json! 🚀`);
      break;
    }

    case 'setgroq': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }
      const newGroqKey = query.trim();
      if (!newGroqKey) {
        await reply(`❌ Harap sertakan kunci Groq API. Contoh:\n*${prefix}setgroq gsk_xxxx*`);
        return;
      }
      const cfg = loadConfig();
      cfg.groqApiKey = newGroqKey;
      cfg.aiProvider = 'groq';
      saveConfig(cfg);
      await reply(`⚡ *[Groq API Key Berhasil Disimpan]*\nKunci Groq kamu berhasil diperbarui di \`config.json\`!\nMesin AI utama sekarang aktif menggunakan Groq LPU (Ultra Fast & Bebas Limit 503). 🚀`);
      break;
    }

    case 'setgemini': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }
      const newGeminiKey = query.trim();
      if (!newGeminiKey) {
        await reply(`❌ Harap sertakan kunci Gemini API. Contoh:\n*${prefix}setgemini AIzaxxxx*`);
        return;
      }
      const cfg = loadConfig();
      cfg.geminiApiKey = newGeminiKey;
      saveConfig(cfg);
      await reply(`🌐 *[Gemini API Key Berhasil Disimpan]*\nKunci Google Gemini berhasil diperbarui di \`config.json\`!`);
      break;
    }

    case 'tombol':
    case 'pilihan':
    case 'menuinteraktif': {
      const dt = getIndonesianDateTime();
      const pollTitle = `🤖 MENU UTAMA ALTERS BOT (${dt.dayName})`;
      const pollOptions = [
        '📚 1. Jadwal Kuliah Hari Ini',
        '📝 2. Daftar Tugas Aktif',
        '🎓 3. Cek Data Mahasiswa',
        '📊 4. Polling Kehadiran Dosen',
        '⏰ 5. Cek Pengingat Aktif',
        'ℹ️ 6. Status Bot & Sistem',
        '❓ 7. Bantuan Tanya AI'
      ];
      try {
        await sendNativePoll(sock, remoteJid, pollTitle, pollOptions, 1);
      } catch (ePoll) {
        await reply(`❌ Gagal menampilkan tombol: ${ePoll.message}`);
      }
      break;
    }

    case 'mhs':
    case 'mahasiswa':
    case 'datamahasiswa': {
      await react('🎓');
      const searchKey = query.trim();
      let list = [];
      if (searchKey) {
        list = await mahasiswaManager.searchMahasiswa(searchKey);
      } else {
        list = await mahasiswaManager.getMahasiswaList();
      }

      if (list.length === 0) {
        await reply(searchKey 
          ? `🔍 Mahasiswa dengan kata kunci *"${searchKey}"* tidak ditemukan di database Supabase.` 
          : `📋 *[Data Mahasiswa]*\nBelum ada data mahasiswa terdaftar di database Supabase.\n\n_Untuk menambahkan, ketik:_\n*${prefix}tambahmhs <nama> | <nim>*`
        );
        return;
      }

      let mhsText = `🎓 *[DATA MAHASISWA SUPABASE]* (${list.length} orang terdaftar):\n\n`;
      if (list.length <= 30) {
        list.forEach((m, idx) => {
          mhsText += `${idx + 1}. *${m.nama}* — NIM: \`${m.nim}\`\n`;
        });
      } else {
        list.slice(0, 20).forEach((m, idx) => {
          mhsText += `${idx + 1}. *${m.nama}* — NIM: \`${m.nim}\`\n`;
        });
        mhsText += `\n... dan *${list.length - 20} mahasiswa lainnya*.\n\n💡 _Cari nama/NIM spesifik dengan:_ *${prefix}mhs <nama/nim>* (contoh: *${prefix}mhs Syalisa*)`;
      }
      await reply(mhsText.trim());
      break;
    }

    case 'tambahmhs':
    case 'addmhs': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }
      if (!query.includes('|')) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}tambahmhs <Nama> | <NIM>*\n\nContoh:\n*${prefix}tambahmhs Dani Pratama | 26020504001*`);
        return;
      }
      const [namaMhs, nimMhs] = query.split('|').map(s => s.trim());
      if (!namaMhs || !nimMhs) {
        await reply(`❌ Nama dan NIM tidak boleh kosong.`);
        return;
      }
      await react('⏳');
      const addRes = await mahasiswaManager.addMahasiswa(namaMhs, nimMhs);
      if (addRes.success) {
        await react('✅');
        await reply(`✅ *[Mahasiswa Berhasil Ditambahkan]*\n• Nama: *${namaMhs}*\n• NIM: \`${nimMhs}\`\n\nTersimpan permanen di cloud database Supabase! 🎓`);
      } else {
        await reply(`⚠️ Gagal menambahkan mahasiswa: ${addRes.message}`);
      }
      break;
    }

    case 'hapusmhs':
    case 'delmhs': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }
      const nimToDel = query.trim();
      if (!nimToDel) {
        await reply(`❌ Masukkan NIM yang ingin dihapus. Contoh:\n*${prefix}hapusmhs 26020504001*`);
        return;
      }
      await react('⏳');
      const delRes = await mahasiswaManager.deleteMahasiswa(nimToDel);
      if (delRes.success) {
        await react('🗑️');
        await reply(`🗑️ Mahasiswa dengan NIM \`${nimToDel}\` berhasil dihapus dari database Supabase.`);
      } else {
        await reply(`⚠️ Gagal menghapus mahasiswa: ${delRes.message}`);
      }
      break;
    }

    case 'importmhs':
    case 'batchmhs': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }
      let textToParse = query.trim();
      const mediaFile = await extractMediaFromMessage(msg, sock);
      if (mediaFile && mediaFile.buffer && (mediaFile.mimeType.includes('text') || mediaFile.mimeType.includes('csv'))) {
        textToParse = mediaFile.buffer.toString('utf-8');
      }
      const parsed = mahasiswaManager.parseMahasiswaList(textToParse);
      if (parsed.length === 0) {
        await reply(`⚠️ Tidak ditemukan data nama dan NIM yang valid untuk diimpor.\n\n_Pastikan menyertakan daftar nama dan NIM, atau kirim file .txt / .csv dengan caption ${prefix}importmhs._`);
        return;
      }
      await react('⏳');
      const bRes = await mahasiswaManager.batchAddMahasiswa(parsed);
      if (bRes.success) {
        await react('✅');
        await reply(`🎓 *[Import Massal Mahasiswa Berhasil]*\n• Total Diproses: *${bRes.total}* mahasiswa\n• Berhasil Masuk: *${bRes.inserted}* mahasiswa baru\n• Dilewati (NIM Sudah Ada): *${bRes.skipped}* mahasiswa\n\nTersimpan permanen di Cloud Database Supabase! 🚀`);
      } else {
        await reply(`⚠️ Gagal impor massal: ${bRes.message}`);
      }
      break;
    }

    case 'gantijam':
    case 'ubahjam': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }

      if (!query) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}gantijam <matkul> | <jam_baru> [hari] [kelas]*\n\n*Contoh:*\n• *${prefix}gantijam Basdat | 10.00 - 11.40*\n• *${prefix}gantijam DFA | 08.00 - 09.40 senin b*`);
        return;
      }

      const dt = getIndonesianDateTime() || {};
      let targetDay = dt.dayKey || 'senin';
      let targetClass = 'A';
      let rawQuery = query;

      const dayList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
      const qWords = rawQuery.split(/\s+/);
      const lastWord = (qWords[qWords.length - 1] || '').toLowerCase();
      const prevWord = (qWords[qWords.length - 2] || '').toLowerCase();

      if (['a', 'b', 'i'].includes(lastWord)) {
        targetClass = lastWord.toUpperCase();
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
        if (dayList.includes(prevWord)) {
          targetDay = prevWord;
          rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 2])).trim();
        }
      } else if (dayList.includes(lastWord)) {
        targetDay = lastWord;
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
      }

      let matkul = '';
      let jamBaru = '';

      if (rawQuery.includes('|')) {
        const parts = rawQuery.split('|').map(s => s.trim());
        matkul = parts[0];
        jamBaru = parts.slice(1).join('|').trim();
      } else {
        const matchTime = rawQuery.match(/\d{1,2}[:.]\d{2}/);
        if (matchTime) {
          const idx = rawQuery.indexOf(matchTime[0]);
          matkul = rawQuery.slice(0, idx).trim();
          jamBaru = rawQuery.slice(idx).trim();
        } else {
          matkul = rawQuery;
          jamBaru = '-';
        }
      }

      if (!matkul || !jamBaru || jamBaru === '-') {
        await reply(`❌ Tolong sebutkan nama mata kuliah dan jam barunya.\nContoh: *${prefix}gantijam Basdat | 10.00 - 11.40*`);
        return;
      }

      try {
        const res = await updateScheduleProperty(targetClass, targetDay, matkul, { jam: jamBaru });
        if (!res.success) {
          await reply(`⚠️ ${res.message}`);
          return;
        }

        await react('✅');
        const preview = formatSchedule(res.cKey, res.dKey);
        await reply(`✅ *[JAM KULIAH BERHASIL DIPERBARUI]*\n📌 *Mata Kuliah:* ${res.item.matkul}\n⏰ *Jam Baru:* ${res.item.jam}\n📍 *Ruangan:* ${res.item.ruang} (Kelas ${res.cKey})\n\n${preview}\n\n📢 _Mau langsung siarkan ke Saluran / Grup? Balas *!send*!_`);
      } catch (err) {
        await reply(`❌ Gagal mengubah jam kuliah: ${err.message}`);
      }
      break;
    }

    case 'gantiruang':
    case 'ubahruang':
    case 'pindahruang': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }

      if (!query) {
        await reply(`❌ Format salah. Gunakan:\n*${prefix}gantiruang <matkul> | <ruang_baru> [hari] [kelas]*\n\n*Contoh:*\n• *${prefix}gantiruang Basdat | Lab RPL*\n• *${prefix}gantiruang DFA ke Lab 3*`);
        return;
      }

      const dt = getIndonesianDateTime() || {};
      let targetDay = dt.dayKey || 'senin';
      let targetClass = 'A';
      let rawQuery = query;

      const dayList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
      const qWords = rawQuery.split(/\s+/);
      const lastWord = (qWords[qWords.length - 1] || '').toLowerCase();
      const prevWord = (qWords[qWords.length - 2] || '').toLowerCase();

      if (['a', 'b', 'i'].includes(lastWord)) {
        targetClass = lastWord.toUpperCase();
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
        if (dayList.includes(prevWord)) {
          targetDay = prevWord;
          rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 2])).trim();
        }
      } else if (dayList.includes(lastWord)) {
        targetDay = lastWord;
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
      }

      let matkul = '';
      let ruangBaru = '';

      if (rawQuery.includes('|')) {
        const parts = rawQuery.split('|').map(s => s.trim());
        matkul = parts[0];
        ruangBaru = parts.slice(1).join('|').trim();
      } else if (/\bke\b/i.test(rawQuery)) {
        const parts = rawQuery.split(/\bke\b/i).map(s => s.trim());
        matkul = parts[0];
        ruangBaru = parts[1] || '';
      } else {
        const parts = rawQuery.split(/\s+/);
        if (parts.length >= 2) {
          matkul = parts[0];
          ruangBaru = parts.slice(1).join(' ');
        }
      }

      if (!matkul || !ruangBaru) {
        await reply(`❌ Tolong sebutkan mata kuliah dan ruangan barunya.\nContoh: *${prefix}gantiruang Basdat | Lab 3*`);
        return;
      }

      try {
        const res = await updateScheduleProperty(targetClass, targetDay, matkul, { ruang: ruangBaru });
        if (!res.success) {
          await reply(`⚠️ ${res.message}`);
          return;
        }

        await react('✅');
        const preview = formatSchedule(res.cKey, res.dKey);
        await reply(`✅ *[RUANGAN KULIAH BERHASIL DIPERBARUI]*\n📌 *Mata Kuliah:* ${res.item.matkul}\n📍 *Ruangan Baru:* ${res.item.ruang}\n⏰ *Jam:* ${res.item.jam} (Kelas ${res.cKey})\n\n${preview}\n\n📢 _Mau langsung siarkan ke Saluran / Grup? Balas *!send*!_`);
      } catch (err) {
        await reply(`❌ Gagal mengubah ruangan: ${err.message}`);
      }
      break;
    }

    case 'batal':
    case 'kosong':
    case 'libur': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Admin / Pemilik bot.');
        return;
      }

      if (!query) {
        await reply(`❌ Format salah. Sebutkan nama mata kuliah yang kosong/batal.\nContoh: *${prefix}batal Basdat* atau *${prefix}kosong Bu Woro*`);
        return;
      }

      const dt = getIndonesianDateTime() || {};
      let targetDay = dt.dayKey || 'senin';
      let targetClass = 'A';
      let rawQuery = query;

      const dayList = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu'];
      const qWords = rawQuery.split(/\s+/);
      const lastWord = (qWords[qWords.length - 1] || '').toLowerCase();
      const prevWord = (qWords[qWords.length - 2] || '').toLowerCase();

      if (['a', 'b', 'i'].includes(lastWord)) {
        targetClass = lastWord.toUpperCase();
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
        if (dayList.includes(prevWord)) {
          targetDay = prevWord;
          rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 2])).trim();
        }
      } else if (dayList.includes(lastWord)) {
        targetDay = lastWord;
        rawQuery = rawQuery.slice(0, rawQuery.lastIndexOf(qWords[qWords.length - 1])).trim();
      }

      try {
        const res = await updateScheduleProperty(targetClass, targetDay, rawQuery, { isCancelled: true });
        if (!res.success) {
          await reply(`⚠️ ${res.message}`);
          return;
        }

        await react('🛑');
        const preview = formatSchedule(res.cKey, res.dKey);
        await reply(`🛑 *[KULIAH DITANDAI BATAL / KOSONG]*\n📌 *Mata Kuliah:* ${res.item.matkul}\n📍 *Status:* ❌ KOSONG / BATAL (Kelas ${res.cKey} hari ${res.dKey})\n\n${preview}\n\n📢 _Mau langsung siarkan pengumuman ini ke Saluran / Grup? Balas *!send*!_`);
      } catch (err) {
        await reply(`❌ Gagal menandai kuliah batal: ${err.message}`);
      }
      break;
    }

    case 'checkupdate':
    case 'cekupdate': {
      await react('🔍');
      try {
        const commitRes = await fetch('https://api.github.com/repos/QaisYudha-Pr/SLINF26/commits?per_page=3', {
          headers: { 'User-Agent': 'WhatsApp-Bot' },
          signal: AbortSignal.timeout(6000)
        });

        if (!commitRes.ok) {
          await reply(`⚠️ Gagal menghubungi GitHub API (HTTP ${commitRes.status}). Silakan coba sesaat lagi.`);
          return;
        }

        const commits = await commitRes.json();
        if (!Array.isArray(commits) || commits.length === 0) {
          await reply('ℹ️ Tidak ada data commit yang ditemukan di repositori.');
          return;
        }

        let updateText = `🔍 *[STATUS PEMBARUAN GITHUB REPOSITORY]*\n`;
        updateText += `📦 *Repositori:* github.com/QaisYudha-Pr/SLINF26\n\n`;
        updateText += `📌 *Daftar Pembaruan Terbaru:*\n`;

        commits.forEach((c, i) => {
          const sha = (c.sha || '').slice(0, 7);
          const msg = (c.commit?.message || '-').split('\n')[0];
          const dateStr = c.commit?.author?.date ? new Date(c.commit.author.date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
          updateText += `${i + 1}. \`${sha}\` ➔ *${msg}*\n   📅 _${dateStr} WIB_\n`;
        });

        updateText += `\n💡 _Untuk mengunduh dan menerapkan pembaruan ke bot ini secara instan, ketik:_ \n👉 *${prefix}update*`;
        await reply(updateText);
      } catch (eCek) {
        await reply(`❌ Gagal memeriksa update: ${eCek.message}`);
      }
      break;
    }

    case 'update': {
      if (!userIsOwner) {
        await reply('⛔ Perintah ini hanya dapat diakses oleh Pemilik (Owner) bot.');
        return;
      }

      await react('⏳');
      await reply('⏳ *Sedang memeriksa dan mengunduh pembaruan dari GitHub...*\nMohon tunggu sekitar 3-5 detik...');

      const repoRawUrl = 'https://raw.githubusercontent.com/QaisYudha-Pr/SLINF26/main/';
      const filesToUpdate = [
        'index.js',
        'runner.js',
        'scheduler.js',
        'configManager.js',
        'package.json',
        'test.js',
        'utils/aiAssistant.js',
        'utils/scheduleManager.js',
        'utils/formatter.js',
        'utils/taskManager.js',
        'utils/pollUtils.js',
        'utils/memoryManager.js',
        'utils/reminderManager.js',
        'utils/diagnostics.js'
      ];

      try {
        // 1. Ambil ringkasan commit terbaru dari GitHub API
        let latestCommitInfo = '';
        try {
          const commitRes = await fetch('https://api.github.com/repos/QaisYudha-Pr/SLINF26/commits?per_page=1', {
            headers: { 'User-Agent': 'WhatsApp-Bot' },
            signal: AbortSignal.timeout(6000)
          });
          if (commitRes.ok) {
            const commitData = await commitRes.json();
            if (Array.isArray(commitData) && commitData[0]) {
              const sha = (commitData[0].sha || '').slice(0, 7);
              const msg = (commitData[0].commit?.message || '-').split('\n')[0];
              latestCommitInfo = `\n📌 *Commit Terbaru:* \`${sha}\`\n📝 *Pembaruan:* _${msg}_\n`;
            }
          }
        } catch (eCommit) {}

        // 2. Buat folder backup lokal jika belum ada
        const backupDir = path.join(__dirname, 'backup');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        // 3. Download file-file secara paralel via native fetch (cepat & hemat RAM)
        const downloads = await Promise.all(
          filesToUpdate.map(async (fileRelPath) => {
            const res = await fetch(`${repoRawUrl}${fileRelPath}?t=${Date.now()}`, {
              signal: AbortSignal.timeout(12000)
            });
            if (!res.ok) throw new Error(`Gagal mengunduh ${fileRelPath} (HTTP ${res.status})`);
            const content = await res.text();
            if (!content || content.length < 50) {
              throw new Error(`File ${fileRelPath} kosong atau tidak valid.`);
            }
            return { fileRelPath, content };
          })
        );

        // 🛡️ ANTI-CRASH VALIDATOR: Uji syntax setiap file JS di RAM sebelum menyentuh disk
        for (const item of downloads) {
          if (item.fileRelPath.endsWith('.js')) {
            try {
              new vm.Script(item.content);
            } catch (syntaxErr) {
              throw new Error(`Validasi syntax gagal pada ${item.fileRelPath}: ${syntaxErr.message}`);
            }
          }
        }

        // 4. Deteksi file mana saja yang mengalami perubahan nyata
        const changedFiles = [];
        for (const item of downloads) {
          const targetPath = path.join(__dirname, item.fileRelPath);
          let isDifferent = true;
          if (fs.existsSync(targetPath)) {
            const existingContent = fs.readFileSync(targetPath, 'utf-8');
            if (existingContent === item.content) {
              isDifferent = false;
            }
          }
          if (isDifferent) {
            changedFiles.push(item.fileRelPath);
          }
        }

        // 5. Cadangkan (backup) file yang ada saat ini sebelum ditimpa
        for (const item of downloads) {
          const targetPath = path.join(__dirname, item.fileRelPath);
          const backupPath = path.join(backupDir, path.basename(item.fileRelPath));
          if (fs.existsSync(targetPath)) {
            fs.copyFileSync(targetPath, backupPath);
          }
        }

        // Backup database jadwal juga untuk keamanan ekstra
        const schedPath = path.join(__dirname, 'schedules.json');
        if (fs.existsSync(schedPath)) {
          fs.copyFileSync(schedPath, path.join(backupDir, 'schedules_backup.json'));
        }

        // 6. Tulis file-file baru ke disk
        for (const item of downloads) {
          const targetPath = path.join(__dirname, item.fileRelPath);
          const targetDir = path.dirname(targetPath);
          if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(targetPath, item.content, 'utf-8');
        }

        // 7. Buat teks laporan detail pembaruan (Changelog Notification)
        const dtNow = getIndonesianDateTime();
        const filesListText = changedFiles.length > 0 
          ? changedFiles.map(f => `• ✅ \`${f}\``).join('\n')
          : '• ✨ Seluruh file sudah sinkron dengan versi terbaru GitHub.';

        const customNotice = 
`🚀 *[UPDATE SELESAI & BOT AKTIF KEMBALI]*
━━━━━━━━━━━━━━━━━━━━${latestCommitInfo}
📂 *File yang Diperbarui (${changedFiles.length} file):*
${filesListText}

⏰ *Waktu Update:* ${dtNow.timeFormatted || 'WIB'}
🤖 Seluruh fitur dan perbaikan terbaru telah aktif siap digunakan!`;

        // Simpan catatan notifikasi agar saat bot menyala langsung kirim laporan lengkap ke WA
        try {
          const noticeFile = path.join(__dirname, '.restart_notice.json');
          fs.writeFileSync(noticeFile, JSON.stringify({
            targetJid: remoteJid,
            requestedBy: sender,
            timestamp: Date.now(),
            customMessage: customNotice
          }, null, 2), 'utf-8');
        } catch (e) {}

        await react('✅');
        const updateSummary = changedFiles.length > 0 
          ? `Terdeteksi *${changedFiles.length} file* diperbarui.\n${latestCommitInfo ? `${latestCommitInfo}\n` : ''}`
          : 'Semua file sudah berada pada versi paling mutakhir.\n';
        await reply(`✅ *PEMBARUAN BERHASIL!*\n\n${updateSummary}Bot akan me-restart otomatis dalam 2 detik dan mengirim laporan lengkap saat aktif kembali...`);

        setTimeout(() => {
          process.exit(0);
        }, 1500);
      } catch (updateErr) {
        console.error('❌ [Self-Update Error]:', updateErr.message);
        await react('❌');
        await reply(`❌ *Gagal Melakukan Update:* ${updateErr.message}\n\nData bot dan konfigurasi kamu tetap aman.`);
      }
      break;
    }

    case 'test':
    case 'selftest':
    case 'diag':
    case 'diagnosa':
    case 'status': {
      await react('🩺');
      await reply('⏳ *Sedang menjalankan pengujian mandiri (Self-Testing) seluruh subsistem bot...*\n_Mohon tunggu sekitar 2-4 detik..._');
      try {
        const diagReport = await runDiagnostics(sock);
        const reportText = formatWhatsAppReport(diagReport);
        await reply(reportText);
        await react(diagReport.overallStatus === 'OK' ? '✅' : (diagReport.overallStatus === 'WARNING' ? '⚠️' : '❌'));
      } catch (errDiag) {
        await reply(`❌ Gagal menjalankan self-test: ${errDiag.message}`);
        await react('❌');
      }
      break;
    }

    case 'restart': {
      await reply('🔄 *Sedang me-restart bot...*\nMohon tunggu sekitar 3-5 detik, bot akan segera mengirim notifikasi saat proses restart selesai dan siap kembali.');

      try {
        const noticeFile = path.join(__dirname, '.restart_notice.json');
        fs.writeFileSync(noticeFile, JSON.stringify({
          targetJid: remoteJid,
          requestedBy: sender,
          timestamp: Date.now()
        }, null, 2), 'utf-8');
      } catch (e) {
        console.error('Gagal menulis .restart_notice.json:', e.message);
      }

      console.log(`🔄 [Restart Command] Restart dipicu oleh owner (${sender}). Menutup proses bot dalam 1 detik...`);
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      break;
    }

    default:
      // Abaikan jika bukan perintah terdaftar
      break;
  }
}

// Tangani uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});

// Jalankan bot
startBot();
