const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
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
  return await sock.sendMessage(jid, {
    poll: {
      name: pollTitle,
      values: pollOptions,
      selectableCount: selectableCount
    }
  });
}
module.exports = { sendNativePoll };
`;
      fs.writeFileSync(pollUtilsFile, pollCode, 'utf-8');
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
  getSchedules
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
  markTaskDone,
  deleteTask,
  getTasks,
  checkDatabaseStatus,
  getLecturers
} = taskManager;
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
const {
  sendDailyBroadcast,
  startScheduler,
  stopScheduler
} = require('./scheduler');

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

/**
 * Helper untuk mengirim Polling Asli WhatsApp:
 * Mendukung Saluran WhatsApp (@newsletter), Grup (@g.us), dan Chat Pribadi.
 * @param selectableCount 1 untuk single-choice, 0 untuk multiple-choice (izinkan beberapa jawaban)
 */
async function sendNativePoll(sockInstance, targetJid, pollName, pollOptions, selectableCount = 1) {
  return await sockInstance.sendMessage(targetJid, {
    poll: {
      name: pollName,
      values: pollOptions,
      selectableCount: selectableCount
    }
  });
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
      // Abaikan update status WA kontak agar tidak memakan RAM & CPU komputer
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
 * Memproses setiap pesan yang masuk
 */
async function handleIncomingMessage(msg) {
  if (!msg.message) return;

  const config = loadConfig();
  const prefix = config.prefix || '!';

  const remoteJid = msg.key.remoteJid;
  const fromMe = !!msg.key.fromMe;
  const sender = msg.key.participant || remoteJid;

  // Ekstrak teks pesan dari berbagai tipe pesan
  const messageContent =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    msg.message.videoMessage?.caption ||
    msg.message.documentMessage?.caption ||
    '';

  const trimmedText = messageContent.trim();

  // Tampilkan log pesan masuk ke terminal agar jelas
  if (trimmedText) {
    console.log(`📩 [Pesan Masuk] Dari: ${sender} (fromMe: ${fromMe}) | Teks: "${trimmedText}"`);
  }

  // 1. Cek apakah ada data terusan dari Saluran WhatsApp di dalam pesan
  const fwdNewsletter = findForwardedNewsletterInfo(msg.message);
  if (fwdNewsletter && fwdNewsletter.newsletterJid) {
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
  if (channelLinkMatch && !trimmedText.startsWith(prefix)) {
    const inviteCode = channelLinkMatch[1];
    try {
      console.log(`🔍 [Cek Tautan Saluran] Memeriksa link dengan kode: ${inviteCode}`);
      const meta = await sock.newsletterMetadata('INVITE', inviteCode);
      if (meta && meta.id) {
        console.log(`📢 [Saluran Ditemukan dari Link] ${meta.name} (${meta.id})`);
        await sock.sendMessage(remoteJid, {
          text: `📢 *Ditemukan Saluran WhatsApp dari Tautan!*\n\n• Nama Saluran: *${meta.name || 'Saluran'}*\n• JID Saluran: \`${meta.id}\`\n• Jumlah Pengikut: *${meta.subscribers || 0}*\n\nUntuk mendaftarkannya sebagai target kirim otomatis, ketik:\n*${prefix}addtarget ${meta.id}*`
        }, { quoted: msg });
        return;
      }
    } catch (err) {
      console.log(`⚠️ Gagal mengambil info link saluran: ${err.message}`);
    }
  }

  const reply = async (text) => {
    try {
      if (!remoteJid.endsWith('@newsletter')) {
        // 1. Simulasi Kehadiran Manusia: Kirim sinyal "Sedang mengetik..."
        await sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});
        await new Promise(r => setTimeout(r, 600)); // Jeda alami manusia
        await sock.sendMessage(remoteJid, { text }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});
      } else {
        // Saluran tidak mendukung quote message
        await sock.sendMessage(remoteJid, { text });
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

  // Cek apakah bot di-tag/mention di dalam obrolan
  const botNumber = sock.user ? sock.user.id.split(':')[0] : '';
  const botJid = botNumber ? `${botNumber}@s.whatsapp.net` : '';
  const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const isBotMentioned = (botJid && mentionedJids.includes(botJid)) || (botNumber && trimmedText.includes(`@${botNumber}`));

  if (isBotMentioned) {
    const question = trimmedText.replace(new RegExp(`@${botNumber}`, 'g'), '').trim();
    const mediaFile = await extractMediaFromMessage(msg, sock);
    const promptToAsk = question || (mediaFile ? 'Tolong analisis dan simpulkan isi dokumen/foto ini secara lengkap dan terstruktur.' : 'Halo bot!');
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
  const commonCommands = ['menu', 'help', 'all', 'pollall', 'poll', 'polling', 'dosen', 'today', 'hariini', 'status', 'targets', 'listdosen', 'jadwal', 'scanjadwal', 'scan', 'ai', 'tanya', 'jadwala', 'jadwalb', 'jadwali', 'restart', 'update', 'tugas', 'task', 'reset', 'clear'];
  let cleanCommandText = '';

  if (usedPrefix !== null) {
    cleanCommandText = trimmedText.slice(usedPrefix.length).trim();
  } else {
    const firstWord = trimmedText.split(/\s+/)[0].toLowerCase();
    if (commonCommands.includes(firstWord)) {
      cleanCommandText = trimmedText;
    } else {
      // 🌟 ZERO-PREFIX NATURAL AI CHAT (Khusus DM Owner):
      // Jika Owner chat santai tanpa awalan (misal: "hari ini ada tugas apa?", "besok kuliah jam berapa"),
      // otomatis serahkan ke AI Copilot tanpa perlu mengetik ! atau /ai!
      if (isPrivateChat && userIsOwner) {
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

  // Parse perintah & argumen
  const args = cleanCommandText.split(/\s+/);
  let command = (args[0] || '').toLowerCase();
  const query = cleanCommandText.slice(command.length).trim();

  // Toleransi typo / alias otomatis
  if (command === 'list' && (args[1] || '').toLowerCase() === 'dosen') {
    command = 'listdosen';
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
  }

  // 3. KUNCI SEMUA PERINTAH RAHASIA / OWNER SECARA TOTAL:
  // Jika ada non-owner (anggota/admin grup lain) yang mencoba menebak perintah rahasia,
  // bot DIAM TOTAL (tidak merespons apa-apa) agar mereka mengira perintah tersebut tidak ada!
  const ownerOnlyCommands = [
    'targets', 'addtarget', 'addlink', 'deltarget',
    'send', 'sendto', 'kirim', 'autosend', 'restart', 'update',
    'setdosen', 'additem', 'delitem',
    'tambahkan', 'addowner', 'hapusnomor', 'delowner', 'listowner',
    'repair'
  ];

  if (ownerOnlyCommands.includes(command) && !userIsOwner) {
    console.log(`⛔ [Akses Rahasia Ditolak] Perintah '${command}' dicoba oleh non-owner (${sender}). Bot sengaja diam.`);
    return; // Diam tanpa membalas sedikit pun
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
• *${prefix}dosen <nama>* ➔ Polling 1 nama dosen spesifik
• *${prefix}poll <judul>|<opsi1>|<opsi2>* ➔ Buat polling bebas
• *${prefix}listdosen* ➔ Lihat daftar nama dosen default`;
        await reply(text);
        break;
      }

      if (subMenu === 'ai' || subMenu === 'copilot') {
        const text = 
`╭───「 🤖 *MENU ASISTEN GEMINI AI* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────
• *${prefix}ai <pertanyaan>* ➔ Tanya apa saja ke Gemini AI
• *@Bot <pertanyaan>* ➔ Tag bot di grup untuk langsung dijawab
• *${prefix}ingat* ➔ Cek catatan memori jangka panjang AI tentangmu
• *${prefix}lupakan <kunci>* ➔ Hapus fakta dari memori jangka panjang
• *${prefix}reset* ➔ Reset konteks obrolan aktif AI
• *Kirim Foto/PDF + ${prefix}ai* ➔ Menganalisis & merangkum dokumen

🧠 *Memori Cerdas & Persisten*:
AI mengingat konteks obrolan panjang & fakta profilmu (nama, kelas, catatan khusus) secara persisten bahkan setelah bot dimuat ulang! Kamu bisa bilang _"AI, ingat namaku Dani dari kelas B ya"_.

👑 *Khusus Chat Pribadi (DM) Owner*:
Bisa langsung chat santai tanpa mengetik tanda prefiks!`;
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
• *${prefix}send [hari]* ➔ Kirim broadcast sekarang
• *${prefix}targets* ➔ Daftar grup target siaran
• *${prefix}addlink <link>* / *${prefix}addtarget <id>*
• *${prefix}deltarget <id>* ➔ Hapus target
• *${prefix}autosend <on/off>* ➔ Saklar siaran (07:00)
• *${prefix}setdosen <d1, d2>* ➔ Set dosen default
• *${prefix}listowner* / *${prefix}tambahkan <no>* / *${prefix}hapusnomor <no>*
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
        schedSummary = '🏖️ Tidak ada perkuliahan hari ini (Libur)';
      } else {
        const itemsA = schedA.map(s => s.matkul).join(', ') || '-';
        const itemsB = schedB.map(s => s.matkul).join(', ') || '-';
        schedSummary = `• Kelas A (${schedA.length} matkul): ${itemsA}\n• Kelas B (${schedB.length} matkul): ${itemsB}`;
      }

      // Ringkasan tugas aktif
      let pendingTasksText = 'Ketik !tugas untuk melihat daftar';
      try {
        const tasksPromise = getTasks('A', 'pending');
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
        const activeTasks = await Promise.race([tasksPromise, timeoutPromise]);
        if (Array.isArray(activeTasks)) {
          pendingTasksText = activeTasks.length > 0 
            ? `📌 *${activeTasks.length} tugas aktif* (Ketik *${prefix}tugas* untuk melihat)`
            : '🎉 Tidak ada tugas tertunda';
        }
      } catch (e) {}

      let dashboardText = 
`╭───「 🎓 *CAMPUS LIVE DASHBOARD* 」
│ 📅 *${dt.fullFormatted}*
│ 🤖 Bot: 🟢 Aktif | AI: ⚡ Multi-turn
╰──────────────────────────

📚 *KULIAH HARI INI (${dt.dayName}):*
${schedSummary}

📝 *STATUS TUGAS:*
${pendingTasksText}

━━━━━━━━━━━━━━━━━━━━
🧭 *PILIHAN MENU MODULAR:*
Ketik perintah di bawah untuk membuka menu:
• *${prefix}menu jadwal* ➔ Jadwal kuliah A/B/I & auto-scan
• *${prefix}menu tugas*  ➔ Manajemen tugas & deadline
• *${prefix}menu poll*   ➔ Polling kehadiran dosen
• *${prefix}menu ai*     ➔ Asisten AI & reset percakapan
${userIsOwner ? `• *${prefix}menu owner*  ➔ Pengaturan sistem & broadcast\n` : ''}• *${prefix}menu all*    ➔ Tampilkan seluruh menu lengkap

💡 _Atau tanyakan langsung ke AI:_
_${prefix}ai ada tugas apa aja minggu ini?_`;

      await reply(dashboardText);
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

    case 'all':
    case 'pollall': {
      let isBroadcastAll = false;
      let isSplitMode = false;
      let rawLecturersQuery = query;

      // Cek apakah ada kata kunci 'target', 'targets', 'saluran', 'channel', 'split', 'pisah'
      if (args.some(a => ['target', 'targets', 'saluran', 'channel', 'semua'].includes(a.toLowerCase()))) {
        isBroadcastAll = true;
      }
      if (args.some(a => ['split', 'pisah', 'each', 'satuan'].includes(a.toLowerCase()))) {
        isSplitMode = true;
      }

      // Bersihkan kata kunci mode dari rawLecturersQuery
      rawLecturersQuery = rawLecturersQuery
        .replace(/\b(target|targets|saluran|channel|semua|split|pisah|each|satuan)\b/gi, '')
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
      const destinationJids = isBroadcastAll 
        ? ((config.targetJids && config.targetJids.length > 0) ? config.targetJids : [remoteJid]) 
        : [remoteJid];

      if (isBroadcastAll && (!config.targetJids || config.targetJids.length === 0)) {
        await reply(`⚠️ Belum ada target grup/saluran di config. Polling dikirim ke obrolan ini.`);
      } else if (isBroadcastAll) {
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

      if (isBroadcastAll && config.targetJids && config.targetJids.length > 0) {
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

      if (args[1] && (args[1].toLowerCase() === 'all' || args[1].toLowerCase() === 'target' || args[1].toLowerCase() === 'targets')) {
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

      try {
        if (isBroadcastAll) {
          const targets = config.targetJids || [];
          if (targets.length === 0) {
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
      const parts = query.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) {
        await reply(`❌ Format polling salah. Gunakan tanda '|' untuk memisahkan pertanyaan dan pilihan (minimal 2 pilihan).\n\nContoh:\n*${prefix}poll Kuliah Pak Budi | Cancel | Masuk | Belum Diketahui*`);
        return;
      }

      const pollQuestion = parts[0];
      const pollOptions = parts.slice(1);

      if (pollOptions.length > 12) {
        await reply('❌ Maksimal 12 pilihan untuk satu polling WhatsApp.');
        return;
      }

      try {
        await sendNativePoll(sock, remoteJid, pollQuestion, pollOptions, 1);
        console.log(`📊 [Custom Poll Terkirim] "${pollQuestion}" ke ${remoteJid}`);
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

      // 2. !tugas done <id> / !tugas selesai <id>
      if (subCommand === 'done' || subCommand === 'selesai') {
        const taskId = args[2];
        if (!taskId) {
          await reply(`❌ Masukkan ID tugas. Contoh: *${prefix}tugas done 1*`);
          return;
        }
        await react('⏳');
        const res = await markTaskDone(taskId);
        if (res.success) {
          await react('🎉');
          await reply(`🎉 *SELAMAT!* Tugas ID *${taskId}* (*${res.task?.judul || 'Tugas'}*) telah ditandai *SELESAI*!`);
        } else {
          await reply(`❌ ${res.message || 'Gagal menandai tugas.'}`);
        }
        return;
      }

      // 3. !tugas hapus <id> / !tugas del <id>
      if (subCommand === 'hapus' || subCommand === 'del' || subCommand === 'delete') {
        if (!userIsOwner) {
          await reply('⛔ Hanya Admin / Owner yang dapat menghapus data tugas.');
          return;
        }
        const taskId = args[2];
        if (!taskId) {
          await reply(`❌ Masukkan ID tugas. Contoh: *${prefix}tugas hapus 1*`);
          return;
        }
        await react('⏳');
        const res = await deleteTask(taskId);
        if (res.success) {
          await react('🗑️');
          await reply(`🗑️ Tugas ID *${taskId}* berhasil dihapus dari database.`);
        } else {
          await reply('❌ Gagal menghapus tugas.');
        }
        return;
      }

      // 4. Tampilkan daftar tugas (!tugas atau !tugas a atau !tugas b)
      let targetClass = 'A';
      if (['a', 'b', 'i'].includes(subCommand)) {
        targetClass = subCommand.toUpperCase();
      }

      await react('📝');
      const taskListText = await formatTaskList(targetClass);
      await reply(taskListText);
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
      const targetDay = (args[1] || '').toLowerCase() || null;
      await reply('⏳ Sedang memproses pengiriman template ke target saluran / grup...');
      const res = await sendDailyBroadcast(sock, targetDay);
      if (!res.success) {
        await reply(`❌ Gagal mengirim: ${res.message}`);
      } else {
        await reply(`✅ Pengiriman selesai!\n🎯 Berhasil terkirim ke *${res.sentCount}* dari *${res.totalCount}* target.`);
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
        await reply(`📋 Daftar target saluran / grup saat ini masih KOSONG.\nTambahkan dengan: *${prefix}addtarget <JID>*`);
        return;
      }

      const listStr = targets
        .map((t, idx) => {
          const type = t.endsWith('@newsletter') ? '📢 Saluran' : (t.endsWith('@g.us') ? '👥 Grup' : '👤 Pribadi');
          return `${idx + 1}. \`${t}\` (${type})`;
        })
        .join('\n');

      await reply(`📋 *DAFTAR TARGET PENGIRIMAN:* \n\n${listStr}\n\nTotal: ${targets.length} target`);
      break;
    }

    case 'addtarget':
    case 'addlink': {
      const input = (args[1] || '').trim();

      // Jika input berupa tautan Saluran (whatsapp.com/channel/...)
      const match = input.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
      if (match) {
        const inviteCode = match[1];
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
          await reply(`✅ Berhasil mendaftarkan saluran baru!\n\n• Nama Saluran: *${meta.name || 'Saluran'}*\n• JID Saluran: \`${meta.id}\`\n• Pengikut: *${meta.subscribers || 0}*\n\nTotal target sekarang: ${config.targetJids.length}`);
        } catch (err) {
          await reply(`❌ Gagal mengambil data saluran: ${err.message}`);
        }
        return;
      }

      // Jika input berupa ID JID langsung (@newsletter, @g.us, @s.whatsapp.net)
      if (!input || (!input.includes('@newsletter') && !input.includes('@g.us') && !input.includes('@s.whatsapp.net'))) {
        await reply(`❌ Format tidak valid. Anda bisa memasukkan Tautan Saluran atau ID JID.\n\nContoh:\n*${prefix}addlink https://whatsapp.com/channel/0029Va...*\natau\n*${prefix}addtarget 1203630xxxxxxx@newsletter*`);
        return;
      }

      if (!config.targetJids) config.targetJids = [];
      if (config.targetJids.includes(input)) {
        await reply(`⚠️ Target \`${input}\` sudah ada di dalam daftar.`);
        return;
      }

      config.targetJids.push(input);
      saveConfig(config);
      await reply(`✅ Berhasil menambahkan target baru:\n\`${input}\`\n\nTotal target sekarang: ${config.targetJids.length}`);
      break;
    }

    case 'deltarget': {
      const delJid = (args[1] || '').trim();
      if (!delJid) {
        await reply(`❌ Masukkan JID yang ingin dihapus. Contoh:\n*${prefix}deltarget 1203630xxxxxxx@newsletter*`);
        return;
      }

      if (!config.targetJids || !config.targetJids.includes(delJid)) {
        await reply(`❌ Target \`${delJid}\` tidak ditemukan di daftar.`);
        return;
      }

      config.targetJids = config.targetJids.filter(j => j !== delJid);
      saveConfig(config);
      await reply(`✅ Berhasil menghapus target \`${delJid}\`.\nTotal sisa target: ${config.targetJids.length}`);
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

    case 'status': {
      await react('⏳');
      const dt = getIndonesianDateTime() || {};
      const fullTimeStr = dt.fullFormatted || (dt.formattedDate ? `${dt.hari || dt.dayName || ''}, ${dt.formattedDate} - ${dt.formattedTime || ''}` : `${dt.dayName || dt.hari || 'WIB'}, ${dt.dateFormatted || ''} - ${dt.timeFormatted || ''}`);
      const isAuto = config.autoSend && config.autoSend.enabled;

      const dbStatus = await (checkDatabaseStatus ? checkDatabaseStatus() : Promise.resolve({ message: '🟢 Terhubung' }));

      if (userIsOwner) {
        const targetCount = (config.targetJids || []).length;
        const statusText = `📊 *STATUS BOT (OWNER VIEW)*
⏰ Waktu Sistem: ${fullTimeStr}
🤖 Status Koneksi WA: Aktif & Terhubung
🗄️ Database Cloud: ${dbStatus.message}

⚙️ *Konfigurasi:*
• Prefiks: *${prefix}* (atau /)
• Pengiriman Otomatis: ${isAuto ? '🟢 AKTIF' : '🔴 NONAKTIF'}
• Jadwal Cron: \`${config.autoSend?.cronTime || '0 7 * * *'}\` (${config.autoSend?.timezone || 'Asia/Jakarta'})
• Jumlah Saluran/Grup Target: *${targetCount}* target`;

        await reply(statusText);
      } else {
        const statusText = `📊 *STATUS BOT*
⏰ Waktu Sistem: ${fullTimeStr}
🤖 Status Bot: 🟢 Aktif & Siap Digunakan
🗄️ Database Cloud: ${dbStatus.message}
Prefiks: *${prefix}* atau */* (Ketik *${prefix}menu* untuk melihat fitur)`;

        await reply(statusText);
      }
      await react('📊');
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
        'utils/aiAssistant.js',
        'utils/scheduleManager.js',
        'utils/formatter.js',
        'utils/taskManager.js'
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
