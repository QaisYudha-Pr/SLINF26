const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig } = require('../configManager');

const ROOT_DIR = path.join(__dirname, '..');

/**
 * Menjalankan self-testing komprehensif terhadap seluruh subsistem bot
 * @param {object|null} sock Instance Baileys socket jika dijalankan di dalam bot yang sedang aktif
 * @returns {Promise<object>} Hasil diagnosa seluruh modul
 */
async function runDiagnostics(sock = null) {
  const startTime = Date.now();
  const config = loadConfig();

  const report = {
    timestamp: new Date().toISOString(),
    overallStatus: 'OK', // 'OK', 'WARNING', 'FAIL'
    durationMs: 0,
    system: {
      nodeVersion: process.version,
      platform: `${os.platform()} (${os.arch()})`,
      uptimeSec: Math.floor(process.uptime()),
      memoryRssMb: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      memoryHeapMb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
    },
    checks: {
      config: { status: 'PENDING', message: '', details: null },
      geminiAi: { status: 'PENDING', message: '', latencyMs: 0, model: '', details: null },
      database: { status: 'PENDING', message: '', latencyMs: 0, mode: '', taskCount: 0, details: null },
      storage: { status: 'PENDING', message: '', details: null },
      reminders: { status: 'PENDING', message: '', pendingCount: 0, details: null },
      whatsapp: { status: 'PENDING', message: '', phone: null, targets: { total: 0, channels: 0, groups: 0 } }
    },
    recommendations: []
  };

  // 1. CEK KONFIGURASI (config.json)
  try {
    const configPath = path.join(ROOT_DIR, 'config.json');
    if (!fs.existsSync(configPath)) {
      report.checks.config = {
        status: 'FAIL',
        message: 'File config.json tidak ditemukan!'
      };
      report.recommendations.push('Duplikasi config.example.json menjadi config.json lalu isi kredensial Anda.');
    } else {
      const ownerCount = Array.isArray(config.ownerNumbers) ? config.ownerNumbers.length : 0;
      const hasPrefix = !!config.prefix;
      if (ownerCount === 0 || config.ownerNumbers.includes('YOUR_PHONE_NUMBER_HERE')) {
        report.checks.config = {
          status: 'WARNING',
          message: 'Nomor Owner belum diatur dengan benar.',
          details: { ownerCount, prefix: config.prefix }
        };
        report.recommendations.push('Atur nomor HP Anda di ownerNumbers pada config.json agar memiliki hak admin.');
      } else {
        report.checks.config = {
          status: 'OK',
          message: `Konfigurasi valid (${ownerCount} Owner terdaftar, prefiks: "${config.prefix || '!'}")`,
          details: { ownerCount, prefix: config.prefix }
        };
      }
    }
  } catch (err) {
    report.checks.config = { status: 'FAIL', message: `Gagal membaca konfigurasi: ${err.message}` };
    report.recommendations.push('Periksa format JSON pada config.json (pastikan tidak ada koma berlebih).');
  }

  // 2. CEK GEMINI AI API (Konektivitas, API Key, Latency)
  const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  const geminiModel = config.geminiModel || 'models/gemini-3.5-flash-lite';
  report.checks.geminiAi.model = geminiModel;

  if (!geminiKey || geminiKey.includes('YOUR_GEMINI') || geminiKey.includes('AIzaSy...')) {
    report.checks.geminiAi = {
      status: 'FAIL',
      model: geminiModel,
      message: 'Gemini API Key belum diisi atau masih berupa placeholder!',
      latencyMs: 0
    };
    report.recommendations.push('Dapatkan API Key gratis di https://aistudio.google.com/ lalu isi ke geminiApiKey di config.json.');
  } else {
    const aiStart = Date.now();
    try {
      // Normalisasi nama model untuk endpoint URL
      const cleanModel = geminiModel.replace(/^models\//, '');
      const aiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${geminiKey}`;
      
      const payload = {
        contents: [{ role: 'user', parts: [{ text: 'Ping test. Balas singkat: PONG' }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.1 }
      };

      let res = await fetch(aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });

      // Jika 503 (temporary high demand spike), coba retry sekali setelah 1.2 detik
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 1200));
        res = await fetch(aiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });
      }

      const aiLatency = Date.now() - aiStart;
      report.checks.geminiAi.latencyMs = aiLatency;

      if (res.ok) {
        const data = await res.json();
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'OK';
        report.checks.geminiAi.status = 'OK';
        report.checks.geminiAi.message = `Terhubung & Responsif (${aiLatency}ms) — Respon: "${replyText.substring(0, 50)}"`;
      } else {
        const errText = await res.text().catch(() => '');
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        let isWarning = false;

        if (res.status === 400) errMsg = 'Permintaan tidak valid atau model tidak cocok';
        if (res.status === 403) errMsg = 'API Key Gemini tidak valid atau izin ditolak';
        if (res.status === 429) {
          errMsg = 'Batas kuota/rate limit Gemini tercapai (coba beberapa saat lagi)';
          isWarning = true;
        }
        if (res.status === 404) errMsg = `Model "${geminiModel}" tidak ditemukan di akun ini`;
        if (res.status === 503) {
          errMsg = 'Server Google Gemini sementara sibuk (High Demand Spike)';
          isWarning = true;
        }

        report.checks.geminiAi.status = isWarning ? 'WARNING' : 'FAIL';
        report.checks.geminiAi.message = `${errMsg} (${aiLatency}ms)`;
        report.checks.geminiAi.details = errText.substring(0, 150);

        if (isWarning) {
          report.recommendations.push(`Layanan Gemini sedang padat trafik (${errMsg}). Kredensial valid, bot tetap dapat memproses pesan.`);
        } else {
          report.recommendations.push(`Periksa API Key Gemini Anda di config.json. Detail: ${errMsg}`);
        }
      }
    } catch (err) {
      const aiLatency = Date.now() - aiStart;
      report.checks.geminiAi.status = 'FAIL';
      report.checks.geminiAi.latencyMs = aiLatency;
      report.checks.geminiAi.message = `Gagal terhubung ke Google API: ${err.message}`;
      report.recommendations.push('Periksa koneksi internet ke generativelanguage.googleapis.com.');
    }
  }

  // 3. CEK DATABASE (Supabase Cloud atau Fallback tasks.json)
  const sb = config.supabase || (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  } : null);

  if (sb && sb.url && sb.anonKey && !sb.url.includes('YOUR_PROJECT_ID')) {
    report.checks.database.mode = 'Supabase Cloud PostgreSQL';
    const dbStart = Date.now();
    try {
      const sbEndpoint = `${sb.url}/rest/v1/tasks?status=eq.pending&order=id.asc`;
      const res = await fetch(sbEndpoint, {
        headers: {
          'apikey': sb.anonKey,
          'Authorization': `Bearer ${sb.anonKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });
      const dbLatency = Date.now() - dbStart;
      report.checks.database.latencyMs = dbLatency;

      if (res.ok) {
        const data = await res.json();
        const activeCount = Array.isArray(data) ? data.length : 0;
        report.checks.database.status = 'OK';
        report.checks.database.taskCount = activeCount;
        report.checks.database.message = `Cloud Database Terhubung (${dbLatency}ms) — ${activeCount} tugas aktif terdeteksi`;
      } else {
        const errBody = await res.text().catch(() => '');
        report.checks.database.status = 'WARNING';
        report.checks.database.message = `Gagal query tabel Supabase (HTTP ${res.status}). Fallback ke lokal aktif.`;
        report.checks.database.details = errBody.substring(0, 150);
        report.recommendations.push('Periksa tabel "tasks" di Supabase SQL Editor. Pastikan query CREATE TABLE sudah dieksekusi.');
      }
    } catch (err) {
      report.checks.database.status = 'WARNING';
      report.checks.database.latencyMs = Date.now() - dbStart;
      report.checks.database.message = `Koneksi Supabase timeout (${err.message}). Fallback ke lokal.`;
      report.recommendations.push('Koneksi Supabase terputus. Bot tetap dapat berjalan menggunakan database lokal tasks.json.');
    }
  } else {
    report.checks.database.mode = 'Local File Storage (tasks.json)';
    try {
      const tasksPath = path.join(ROOT_DIR, 'tasks.json');
      let localTasks = [];
      if (fs.existsSync(tasksPath)) {
        localTasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8') || '[]');
      }
      const activeCount = Array.isArray(localTasks) ? localTasks.filter(t => !t.selesai).length : 0;
      report.checks.database.status = 'OK';
      report.checks.database.taskCount = activeCount;
      report.checks.database.message = `Mode Lokal Aktif — ${activeCount} tugas aktif di tasks.json`;
    } catch (err) {
      report.checks.database.status = 'FAIL';
      report.checks.database.message = `Gagal membaca tasks.json: ${err.message}`;
      report.recommendations.push('Periksa izin baca/tulis file tasks.json di folder bot.');
    }
  }

  // 4. CEK PENYIMPANAN LOKAL (Permissions & Files)
  try {
    const testFile = path.join(ROOT_DIR, '.write_test_tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    const factsPath = path.join(ROOT_DIR, 'memory_facts.json');
    const sessionsPath = path.join(ROOT_DIR, 'memory_sessions.json');
    const factsExist = fs.existsSync(factsPath);
    const sessionsExist = fs.existsSync(sessionsPath);

    report.checks.storage = {
      status: 'OK',
      message: 'Izin Tulis Disk OK, sistem memori AI siap.',
      details: { factsExist, sessionsExist }
    };
  } catch (err) {
    report.checks.storage = {
      status: 'FAIL',
      message: `Izin tulis disk bermasalah: ${err.message}`
    };
    report.recommendations.push('Pastikan folder bot memiliki izin Read & Write penuh.');
  }

  // 5. CEK ENGINE CUSTOM REMINDERS
  try {
    const remindersPath = path.join(ROOT_DIR, 'custom_reminders.json');
    let reminderList = [];
    if (fs.existsSync(remindersPath)) {
      reminderList = JSON.parse(fs.readFileSync(remindersPath, 'utf8') || '[]');
    }
    const pending = reminderList.filter(r => !r.sent);
    report.checks.reminders = {
      status: 'OK',
      message: `${pending.length} pengingat terjadwal aktif`,
      pendingCount: pending.length
    };
  } catch (err) {
    report.checks.reminders = {
      status: 'WARNING',
      message: `File custom_reminders.json korup atau tidak valid: ${err.message}`
    };
    report.recommendations.push('Format custom_reminders.json rusak, reset menjadi [] jika perlu.');
  }

  // 6. CEK KONEKSI WHATSAPP
  if (sock) {
    try {
      const userJid = sock.user?.id;
      const targets = config.targetJids || [];
      const channels = targets.filter(t => t.endsWith('@newsletter')).length;
      const groups = targets.filter(t => t.endsWith('@g.us')).length;

      if (userJid) {
        report.checks.whatsapp = {
          status: 'OK',
          message: `Tersambung sebagai ${sock.user?.name || userJid.split(':')[0]}`,
          phone: userJid.split(':')[0],
          targets: { total: targets.length, channels, groups }
        };
      } else {
        report.checks.whatsapp = {
          status: 'WARNING',
          message: 'Socket aktif tetapi data pengguna belum lengkap.',
          phone: null,
          targets: { total: targets.length, channels, groups }
        };
      }
    } catch (err) {
      report.checks.whatsapp = {
        status: 'WARNING',
        message: `Gagal membaca status WhatsApp: ${err.message}`
      };
    }
  } else {
    report.checks.whatsapp = {
      status: 'INFO',
      message: 'Self-test dijalankan via CLI/Terminal (WhatsApp socket offline)',
      phone: null,
      targets: {
        total: (config.targetJids || []).length,
        channels: (config.targetJids || []).filter(t => t.endsWith('@newsletter')).length,
        groups: (config.targetJids || []).filter(t => t.endsWith('@g.us')).length
      }
    };
  }

  // EVALUASI STATUS KESELURUHAN
  const statuses = Object.values(report.checks).map(c => c.status);
  if (statuses.includes('FAIL')) {
    report.overallStatus = 'FAIL';
  } else if (statuses.includes('WARNING')) {
    report.overallStatus = 'WARNING';
  } else {
    report.overallStatus = 'OK';
  }

  report.durationMs = Date.now() - startTime;
  return report;
}

/**
 * Format laporan self-test dalam gaya Markdown estetis WhatsApp
 * @param {object} rep Hasil dari runDiagnostics()
 * @returns {string} Teks pesan WhatsApp
 */
function formatWhatsAppReport(rep) {
  const getBadge = (status) => {
    switch (status) {
      case 'OK': return '🟢 *OK*';
      case 'WARNING': return '🟡 *WARNING*';
      case 'FAIL': return '🔴 *FAIL*';
      default: return '⚪ *INFO*';
    }
  };

  const overallBadge = rep.overallStatus === 'OK' 
    ? '🟢 *SISTEM SEHAT (ALL GREEN)*' 
    : (rep.overallStatus === 'WARNING' ? '🟡 *PERHATIAN (WARNINGS DETECTED)*' : '🔴 *ADA MASALAH KRITIS (ISSUES FOUND)*');

  const c = rep.checks;

  let text = 
`╭───「 🩺 *SELF-TEST & DIAGNOSTIK ALTERS* 」
│ Status: ${overallBadge}
│ Durasi Uji: *${rep.durationMs}ms*
╰────────────────────────────────

🔍 *Hasil Diagnosa Subsistem:*

▫️ *Konfigurasi & Owner:* ${getBadge(c.config.status)}
   └ ${c.config.message}

▫️ *Google Gemini AI:* ${getBadge(c.geminiAi.status)}
   ├ Model: \`${c.geminiAi.model}\`
   └ ${c.geminiAi.message}

▫️ *Database & Tugas:* ${getBadge(c.database.status)}
   ├ Mode: *${c.database.mode}*
   └ ${c.database.message}

▫️ *Penyimpanan & I/O:* ${getBadge(c.storage.status)}
   └ ${c.storage.message}

▫️ *Custom Reminder Engine:* ${getBadge(c.reminders.status)}
   └ ${c.reminders.message}

▫️ *Koneksi WhatsApp:* ${getBadge(c.whatsapp.status)}
   ├ Status: ${c.whatsapp.message}
   └ Target Siaran: *${c.whatsapp.targets.channels} Saluran*, *${c.whatsapp.targets.groups} Grup*

📊 *Info Runtime Mesin:*
• Node.js: *${rep.system.nodeVersion}* | Platform: *${rep.system.platform}*
• RAM: *${rep.system.memoryRssMb} MB* (Heap: *${rep.system.memoryHeapMb} MB*)
• Uptime Bot: *${Math.floor(rep.system.uptimeSec / 60)} menit*`;

  if (rep.recommendations.length > 0) {
    text += `\n\n🛠️ *Saran Perbaikan / Solusi:*`;
    rep.recommendations.forEach((rec, idx) => {
      text += `\n${idx + 1}. ${rec}`;
    });
  } else {
    text += `\n\n✨ *Semua modul berfungsi optimal tanpa kendala! Siap beroperasi penuh.*`;
  }

  return text;
}

/**
 * Format laporan self-test untuk Terminal / CLI
 * @param {object} rep Hasil dari runDiagnostics()
 */
function formatConsoleReport(rep) {
  const getBadge = (status) => {
    switch (status) {
      case 'OK': return '[\x1b[32mOK\x1b[0m]';
      case 'WARNING': return '[\x1b[33mWARN\x1b[0m]';
      case 'FAIL': return '[\x1b[31mFAIL\x1b[0m]';
      default: return '[\x1b[36mINFO\x1b[0m]';
    }
  };

  console.log('\n======================================================');
  console.log('       🩺 ALTERS BOT - AUTOMATED SELF-TEST REPORT      ');
  console.log('======================================================');
  console.log(`Durasi Uji : ${rep.durationMs}ms`);
  console.log(`Node.js    : ${rep.system.nodeVersion} (${rep.system.platform})`);
  console.log(`RAM RSS    : ${rep.system.memoryRssMb} MB | Heap: ${rep.system.memoryHeapMb} MB`);
  console.log('------------------------------------------------------');

  const c = rep.checks;
  console.log(`${getBadge(c.config.status)} Konfigurasi : ${c.config.message}`);
  console.log(`${getBadge(c.geminiAi.status)} Gemini AI   : [${c.geminiAi.model}] ${c.geminiAi.message}`);
  console.log(`${getBadge(c.database.status)} Database    : [${c.database.mode}] ${c.database.message}`);
  console.log(`${getBadge(c.storage.status)} Storage I/O : ${c.storage.message}`);
  console.log(`${getBadge(c.reminders.status)} Reminders   : ${c.reminders.message}`);
  console.log(`${getBadge(c.whatsapp.status)} WhatsApp    : ${c.whatsapp.message}`);

  if (rep.recommendations.length > 0) {
    console.log('\n🛠️  SARAN PERBAIKAN:');
    rep.recommendations.forEach((rec, idx) => {
      console.log(`   ${idx + 1}. \x1b[33m${rec}\x1b[0m`);
    });
  } else {
    console.log('\n✨ \x1b[32mSemua subsistem lulus uji coba (ALL GREEN)! Bot siap digunakan.\x1b[0m');
  }
  console.log('======================================================\n');
}

module.exports = {
  runDiagnostics,
  formatWhatsAppReport,
  formatConsoleReport
};
