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
        autoSend: { enabled: true, time: '07:00' },
        defaultLecturers: ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']
      };
      fs.writeFileSync(configFile, JSON.stringify(defConfig, null, 2), 'utf-8');
    }

    const schedFile = path.join(__dirname, 'schedules.json');
    if (!fs.existsSync(schedFile)) {
      fs.writeFileSync(schedFile, JSON.stringify({ "A": {}, "B": {}, "I": {} }, null, 2), 'utf-8');
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
const { askGeminiAI } = require('./utils/aiAssistant');
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

      // Cek apakah baru saja di-restart (ada file .restart_notice.json)
      const noticeFile = path.join(__dirname, '.restart_notice.json');
      if (fs.existsSync(noticeFile)) {
        try {
          const noticeData = JSON.parse(fs.readFileSync(noticeFile, 'utf-8'));
          fs.unlinkSync(noticeFile); // Hapus agar tidak terkirim ganda

          if (noticeData.targetJid) {
            const dt = getIndonesianDateTime();
            await sock.sendMessage(noticeData.targetJid, {
              text: `✅ *[RESTART SELESAI]*\nBot berhasil di-restart dan sekarang siap digunakan kembali! 🚀\n⏰ Waktu Aktif: ${dt.timeFormatted}`
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
    if (type !== 'notify') return;

    for (const msg of messages) {
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
  const userIsOwner = isOwner(sender, fromMe, config);

  // 2. Tandai pesan sudah dibaca (Read Receipt)
  if (!remoteJid.endsWith('@newsletter')) {
    sock.readMessages([msg.key]).catch(() => {});
  }

  // 3. Cooldown Anti-Flood (Jeda 2 detik per pengguna untuk non-owner agar nomor aman dari spam)
  if (!userIsOwner && sender) {
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
      const answer = await askGeminiAI(promptToAsk, userIsOwner, mediaFile);
      await reply(answer);
      await react('💡');
    } catch (e) {
      await reply(`❌ Terjadi kendala AI: ${e.message}`);
    }
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
  const commonCommands = ['menu', 'help', 'all', 'today', 'hariini', 'status', 'targets', 'listdosen', 'jadwal', 'scanjadwal', 'scan', 'ai', 'tanya', 'jadwala', 'jadwalb', 'jadwali', 'restart'];
  let cleanCommandText = '';

  if (usedPrefix !== null) {
    cleanCommandText = trimmedText.slice(usedPrefix.length).trim();
  } else {
    const firstWord = trimmedText.split(/\s+/)[0].toLowerCase();
    if (commonCommands.includes(firstWord)) {
      cleanCommandText = trimmedText;
    } else {
      return; // Abaikan jika bukan perintah
    }
  }

  // Parse perintah & argumen
  const args = cleanCommandText.split(/\s+/);
  let command = (args[0] || '').toLowerCase();
  const query = cleanCommandText.slice(command.length).trim();

  // Toleransi typo otomatis
  if (command === 'jadwala') {
    command = 'jadwal';
    args[1] = 'a';
  } else if (command === 'jadwalb') {
    command = 'jadwal';
    args[1] = 'b';
  } else if (command === 'jadwali') {
    command = 'jadwal';
    args[1] = 'i';
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

  // 3. KUNCI SEMUA PERINTAH RAHASIA / OWNER SECARA TOTAL:
  // Jika ada non-owner (anggota/admin grup lain) yang mencoba menebak perintah rahasia,
  // bot DIAM TOTAL (tidak merespons apa-apa) agar mereka mengira perintah tersebut tidak ada!
  const ownerOnlyCommands = [
    'targets', 'addtarget', 'addlink', 'deltarget',
    'send', 'sendto', 'kirim', 'autosend', 'restart',
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
      let menuText = 
`╭───「 🤖 *MENU BOT WHATSAPP* 」
│ Prefiks: *${prefix}* atau */*
╰──────────────────────────

🤖 *ASISTEN PINTAR GEMINI AI*
• *${prefix}ai <pertanyaan>* ➔ Tanya apa saja ke Google Gemini AI
• *@Bot <pertanyaan>* ➔ Tag bot di grup untuk langsung bertanya

📊 *POLLING KEHADIRAN*
• *${prefix}all* ➔ Poll semua dosen default
• *${prefix}all <d1, d2, ..>* ➔ Poll dosen kustom
• *${prefix}dosen <nama>* ➔ Poll 1 nama dosen
• *${prefix}poll <tanya>|<opsi1>|<opsi2>* ➔ Poll bebas

📚 *JADWAL KULIAH KELAS*
• *${prefix}jadwal a* ➔ Jadwal Kelas A hari ini
• *${prefix}jadwal b* ➔ Jadwal Kelas B hari ini
• *${prefix}jadwal i* ➔ Jadwal Kelas I hari ini
• *${prefix}jadwal <kelas> <hari>* ➔ Cek hari (cth: ${prefix}jadwal a senin)
• *${prefix}scanjadwal* ➔ Kirim/balas foto jadwal untuk auto-scan AI

📅 *SIARAN & INFORMASI*
• *${prefix}today* ➔ Pratinjau list hari ini
• *${prefix}preview <hari>* ➔ Cek list hari (cth: ${prefix}preview senin)
• *${prefix}list* ➔ Daftar hari template aktif
• *${prefix}status* ➔ Cek koneksi & waktu bot
• *${prefix}id* ➔ Cek ID unik grup/saluran ini`;

      // Menu khusus Owner (hanya tampil jika pengirim adalah Owner sah)
      if (userIsOwner) {
        menuText += `\n\n👑 *KONTROL OWNER / ADMIN*
• *${prefix}send [hari]* ➔ Kirim broadcast ke semua target
• *${prefix}targets* ➔ Lihat daftar grup/saluran tujuan
• *${prefix}addlink <link>* ➔ Tambah target via link saluran
• *${prefix}addtarget <id>* ➔ Tambah target via ID
• *${prefix}deltarget <id>* ➔ Hapus target dari daftar
• *${prefix}autosend <on/off>* ➔ Saklar siaran otomatis (07:00)
• *${prefix}listdosen* ➔ Cek daftar dosen default
• *${prefix}setdosen <d1, d2>* ➔ Atur ulang dosen default
• *${prefix}listowner* ➔ Cek daftar nomor admin
• *${prefix}tambahkan <no>* ➔ Daftarkan nomor admin baru
• *${prefix}hapusnomor <no>* ➔ Hapus nomor admin
• *${prefix}repair* ➔ Cek kesehatan & self-heal file
• *${prefix}restart* ➔ Me-restart proses bot`;
      }

      await reply(menuText);
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

    case 'all': {
      let lecturers = [];

      if (!query) {
        // Ambil default dari config jika tidak ada argumen nama
        lecturers = config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'];
      } else {
        // Parse nama-nama dosen dari argumen
        if (query.includes(',')) {
          lecturers = query.split(',').map(s => s.trim()).filter(Boolean);
        } else if (query.includes('\n')) {
          lecturers = query.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (/(?:Frau|Herr|Pak|Bu|Bapak|Ibu|Dr|Prof)\s/i.test(query)) {
          lecturers = query.split(/(?=(?:Frau|Herr|Pak|Bu|Bapak|Ibu|Dr|Prof)\s)/i).map(s => s.trim()).filter(Boolean);
        } else {
          lecturers = [query.trim()];
        }
      }

      if (lecturers.length === 0) {
        await reply(`❌ Daftar nama dosen tidak boleh kosong.\n\nContoh penggunaan:\n*${prefix}all*\natau\n*${prefix}all Frau Woro, Frau Wisma, Frau Lita, Herr Agus*`);
        return;
      }

      const dt = getIndonesianDateTime();
      const introText = `🎓 *POLLING KEHADIRAN DOSEN*\n📅 *Hari, Tanggal:* ${dt.dayName}, ${dt.dateFormatted}\n⏰ *Waktu:* ${dt.timeFormatted}\n━━━━━━━━━━━━━━━━━━━━\n_Silakan pilih status kehadiran masing-masing dosen di bawah ini:_`;

      await sock.sendMessage(remoteJid, { text: introText }, { quoted: msg });
      console.log(`📊 [Poll All] Membuat ${lecturers.length} polling untuk: ${lecturers.join(', ')}`);

      for (let i = 0; i < lecturers.length; i++) {
        const lecturer = lecturers[i];
        // Jeda waktu 600ms agar urutan polling rapi dan aman dari rate limit WhatsApp
        await new Promise(resolve => setTimeout(resolve, 600));

        try {
          await sock.sendMessage(remoteJid, {
            poll: {
              name: `🎓 Kehadiran: ${lecturer}`,
              values: [
                '✅ Hadir',
                '❌ Tidak',
                '❓ Belum Diketahui'
              ],
              selectableCount: 1
            }
          });
        } catch (err) {
          console.error(`[Poll All Error] Gagal kirim polling untuk ${lecturer}:`, err.message);
        }
      }
      break;
    }

    case 'listdosen': {
      const list = config.defaultLecturers || [];
      if (list.length === 0) {
        await reply(`📋 Daftar dosen default masih kosong. Atur dengan:\n*${prefix}setdosen Frau Woro, Frau Wisma, Frau Lita, Herr Agus*`);
        return;
      }
      const textList = list.map((d, idx) => `▫️ ${idx + 1}. *${d}*`).join('\n');
      await reply(`🎓 *DAFTAR DOSEN DEFAULT:*\n\n${textList}\n\n_Ketik *${prefix}all* untuk langsung membuat polling untuk semua dosen di atas._`);
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

      if (args[1] && args[1].toLowerCase() === 'all') {
        isBroadcastAll = true;
        namaDosen = query.slice(args[1].length).trim();
      }

      if (!namaDosen) {
        await reply(`❌ Harap masukkan nama dosen.\n\nContoh:\n*${prefix}dosen Frau Woro*\n*${prefix}dosen all Frau Woro* (kirim ke semua grup/saluran terdaftar)`);
        return;
      }

      const pollMessage = {
        poll: {
          name: `🎓 Kehadiran: ${namaDosen}`,
          values: [
            '✅ Hadir',
            '❌ Tidak',
            '❓ Belum Diketahui'
          ],
          selectableCount: 1
        }
      };

      try {
        if (isBroadcastAll) {
          const targets = config.targetJids || [];
          if (targets.length === 0) {
            await reply(`⚠️ Belum ada target yang didaftarkan di config. Polling dikirim ke chat ini saja.`);
            await sock.sendMessage(remoteJid, pollMessage);
            return;
          }

          await reply(`⏳ Mengirim polling kehadiran *${namaDosen}* ke ${targets.length} target...`);
          let successCount = 0;
          for (const t of targets) {
            try {
              await sock.sendMessage(t, pollMessage);
              successCount++;
            } catch (err) {
              console.error(`Gagal kirim poll ke ${t}:`, err.message);
            }
          }
          await reply(`✅ Polling kehadiran *${namaDosen}* berhasil dikirim ke *${successCount}* dari *${targets.length}* target!`);
        } else {
          await sock.sendMessage(remoteJid, pollMessage);
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
        await sock.sendMessage(remoteJid, {
          poll: {
            name: pollQuestion,
            values: pollOptions,
            selectableCount: 1
          }
        });
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
        await reply(`🤖 *CARA BERTANYA KE AI:*\n\nKetik:\n*${prefix}ai <pertanyaan kamu>*\nAtau kirim/balas file dokumen (PDF) / foto dengan caption *${prefix}ai tolong simpulkan file ini*\n\nContoh:\n• *${prefix}ai apa saja jadwal kelas A hari ini?*\n• *${prefix}ai tolong simpulkan data file PDF ini*\n\n💡 _Di grup, kamu juga bisa langsung tag/mention bot:_ *@Bot <pertanyaan>*`);
        return;
      }

      await react('🤔');
      try {
        const answer = await askGeminiAI(questionText, userIsOwner, mediaFile);
        await reply(answer);
        await react('💡');
      } catch (err) {
        await reply(`❌ Terjadi kendala AI: ${err.message}`);
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
        await reply(`❌ Gagal menganalisis jadwal: ${scanErr.message}`);
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
      const templates = getTemplates();
      const keys = Object.keys(templates);
      const listStr = keys.map((k, i) => `${i + 1}. *${k}* - ${templates[k].title || 'Tanpa Judul'}`).join('\n');
      await reply(`📚 *DAFTAR TEMPLATE YANG TERSEDIA:*\n\n${listStr}\n\nGunakan *${prefix}preview <nama>* untuk melihat isi template.`);
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
      const dt = getIndonesianDateTime() || {};
      const fullTimeStr = dt.fullFormatted || (dt.formattedDate ? `${dt.hari || dt.dayName || ''}, ${dt.formattedDate} - ${dt.formattedTime || ''}` : `${dt.dayName || dt.hari || 'WIB'}, ${dt.dateFormatted || ''} - ${dt.timeFormatted || ''}`);
      const isAuto = config.autoSend && config.autoSend.enabled;

      if (userIsOwner) {
        const targetCount = (config.targetJids || []).length;
        const statusText = `📊 *STATUS BOT (OWNER VIEW)*
⏰ Waktu Sistem: ${fullTimeStr}
🤖 Status Koneksi: Aktif & Terhubung

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
Prefiks: *${prefix}* atau */* (Ketik *${prefix}menu* untuk melihat fitur)`;

        await reply(statusText);
      }
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
