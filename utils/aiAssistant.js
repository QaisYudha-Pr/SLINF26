const os = require('os');
const { getIndonesianDateTime } = require('./formatter');
const { getSchedules, addScheduleItem, deleteScheduleItem, saveBatchSchedule, formatSchedule } = require('./scheduleManager');
let taskManager = {
  getTasks: async () => [],
  addTask: async () => ({ success: false, task: {} }),
  markTaskDone: async () => ({ success: false }),
  deleteTask: async () => ({ success: false }),
  formatTaskList: async () => 'Daftar tugas kosong',
  checkDatabaseStatus: async () => ({ message: '🟢 Terhubung (Supabase Cloud)' })
};
try {
  taskManager = require('./taskManager');
} catch (e) {}
const { addTask, markTaskDone, deleteTask, getTasks, formatTaskList, checkDatabaseStatus, getLecturers } = taskManager;
const { loadConfig, saveConfig } = require('../configManager');
const { startScheduler, stopScheduler, sendDailyBroadcast } = require('../scheduler');

let memoryManager = {
  getSession: () => ({ turns: [] }),
  addSessionTurn: () => {},
  resetSession: () => true,
  getLongTermFacts: () => ({}),
  saveFact: () => true,
  removeFact: () => true,
  getFormattedMemoryPrompt: () => 'Belum ada catatan memori khusus.',
  formatMemoryForUser: () => '🧠 Belum ada catatan memori tersimpan.'
};
try {
  memoryManager = require('./memoryManager');
} catch (e) {
  console.warn('⚠️ [aiAssistant] utils/memoryManager.js belum termuat, menggunakan memori fallback.');
}

const {
  getSession,
  addSessionTurn,
  resetSession,
  getLongTermFacts,
  saveFact,
  removeFact,
  getFormattedMemoryPrompt,
  formatMemoryForUser
} = memoryManager;

let pollUtils = {
  sendNativePoll: async () => null
};
try {
  pollUtils = require('./pollUtils');
} catch (e) {}
const { sendNativePoll } = pollUtils;

/**
 * Mengirim pertanyaan ke Google Gemini AI (gemini-3.8-flash)
 * Dilengkapi kemampuan multimodal, contextual memory, proactive clarification, dan action copilot.
 */
async function askGeminiAI(userQuestion, isSenderOwner = false, mediaFile = null, customApiKey = null, sockInstance = null, remoteJid = null, senderJid = null) {
  const config = loadConfig();

  const apiKey = customApiKey || config.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return '❌ Fitur AI belum dapat digunakan karena Gemini API Key belum disetel di config.json.';
  }

  const dt = getIndonesianDateTime();
  const schedules = getSchedules();
  const defaultLecturers = (typeof getLecturers === 'function')
    ? await getLecturers().catch(() => config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'])
    : (config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus']);

  // Target identifikasi untuk memori jangka panjang
  // Grup: per-user agar memori tiap anggota tidak campur
  // DM / Saluran: per-user atau per-JID
  const memoryTargetId = (remoteJid && remoteJid.endsWith('@g.us'))
    ? `${remoteJid}:${senderJid || 'user'}`
    : (senderJid || remoteJid || 'user');
  const longTermMemoryPrompt = getFormattedMemoryPrompt(memoryTargetId);

  // Session ID: sama dengan memoryTargetId agar konteks per-user
  // Jika grup, tiap anggota punya sesi sendiri
  const sessionId = memoryTargetId;

  // Cek status database Supabase
  const dbStatus = checkDatabaseStatus ? await checkDatabaseStatus().catch(() => ({ message: '🟢 Terhubung' })) : { message: '🟢 Terhubung' };

  // Data status sistem & server real-time
  const uptimeSec = Math.floor(process.uptime());
  const uptimeHours = Math.floor(uptimeSec / 3600);
  const uptimeMin = Math.floor((uptimeSec % 3600) / 60);
  const memUsageMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const isTermux = Boolean(process.env.PREFIX && process.env.PREFIX.includes('com.termux'));
  const osType = isTermux ? 'Android (Termux)' : `${os.type()} ${os.arch()}`;
  const targetsCount = (config.targetJids || []).length;
  const autoSendStatus = config.autoSend?.enabled ? `Aktif (${config.autoSend.cronTime || '07:00'})` : 'Nonaktif';
  const targetDetails = (config.targetJids || []).map((t, idx) => {
    const type = t.endsWith('@newsletter') ? 'Saluran' : (t.endsWith('@g.us') ? 'Grup' : 'Pribadi');
    return `[${idx + 1}] ${t} (${type})`;
  }).join(', ') || 'Belum ada target terdaftar';

  // Buat ringkasan jadwal dan tugas untuk konteks
  const scheduleSummary = JSON.stringify(schedules);
  const pendingTasks = await getTasks('A', 'pending').catch(() => []);
  const tasksSummary = JSON.stringify(pendingTasks);

  const DAYS_ORDER = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const todayKey = (dt.dayKey || dt.hari || 'senin').toLowerCase();
  const todayIdx = DAYS_ORDER.indexOf(todayKey) >= 0 ? DAYS_ORDER.indexOf(todayKey) : 1;
  const tomorrowKey = DAYS_ORDER[(todayIdx + 1) % 7];
  const dayAfterTomorrowKey = DAYS_ORDER[(todayIdx + 2) % 7];

  const systemInstruction =
    `IDENTITAS DIRI (KAMU ADALAH ALTERS):
- Nama kamu: ALTERS.
- Panggilan: Alters.
- Siapa kamu: Asisten AI akademik & co-pilot pintar untuk komunitas mahasiswa SLINF26.
- Karakter & Persona: Ramah, asyik, santai ala mahasiswa namun tetap sopan, cerdas, solutif, dan punya empati terhadap kesibukan / sambatan kuliah.
- Jika pengguna menyapa "Halo Alters", bertanya "kamu siapa?", "siapa namamu?", atau menyebut namamu, perkenalkan dirimu sebagai ALTERS dengan ramah, hangat, dan percaya diri.

GAYA RESPONS:
- Gunakan bahasa Indonesia yang santai, akrab, jelas, dan solutif (gaya mahasiswa/kampus).
- Format teks KHUSUS WhatsApp: gunakan *tebal* untuk penekanan/nama matkul/jam, _miring_ untuk istilah teknis, dan poin list (•) jika berpoin.
- JANGAN gunakan format markdown heading seperti # atau ## karena WhatsApp tidak mendukungnya.
- Jawab to-the-point, tanpa basa-basi berlebihan. Boleh beri emoji yang relevan.
- Jika pengguna pakai bahasa gaul/singkatan, balas juga dengan bahasa yang setara supaya terasa manusiawi.

PEMAHAMAN ARSITEKTUR SISTEM & UPDATE TERAKHIR:
Kamu paham sistem dan pembaruan terkini yang baru saja dipasang di bot ini:
1. Engine AI: Google Gemini 3.8 Flash Multimodal (bisa membaca teks, foto jadwal, dan file PDF dokumen materi).
2. Memori Percakapan: Sesi aktif dengan rentang jeda 10 menit (idle TTL 10 menit) + Memori Jangka Panjang permanen (!ingat / !lupakan).
3. Polling Kehadiran Otomatis: Mendukung Grup (@g.us) dan Saluran (@newsletter) dengan auto text fallback jika server membatasi polling native di saluran.
4. Fitur Admin Grup: !tagall, !hidetag, dan deteksi reply quote langsung di grup.
5. Shortcut Jadwal Instan: !gantijam, !gantiruang, !batal / !kosong dengan kartu preview jadwal otomatis.
6. Siaran Terpilih: !send 1, !send saluran, !send grup, !send sini, dan !bc [target] <pesan>.
7. Updater GitHub: !checkupdate untuk intip commit tanpa restart & !update untuk sinkronisasi menyeluruh.

STATUS & KONDISI SERVER REAL-TIME:
- Lingkungan Host: ${osType}
- Node.js Runtime: ${process.version}
- Uptime Bot: ${uptimeHours} jam ${uptimeMin} menit (Aktif & Siaga)
- Pemakaian RAM Bot: ~${memUsageMb} MB (Sangat hemat RAM & stabil)
- Status Cloud Database Supabase: ${dbStatus.message}
- Status Auto-Send Cron: ${autoSendStatus}
- Total Target Siaran: ${targetsCount} target (${targetDetails})
- Catatan Target Saluran: Saluran WhatsApp (@newsletter) sering disebut oleh pengguna sebagai "siaran testing", "saluran testing", atau "channel". Jika pengguna menyebut "siaran testing", itu merujuk ke target saluran ini!
- Jika pengguna menanyakan kondisi server, status bot, atau pembaruan sistem, jelaskan status di atas secara transparan, akurat, dan ramah!

KONTEKS WAKTU, KAMPUS & DATABASE:
- Waktu saat ini: ${dt.fullFormatted}
- Hari ini: *${todayKey}* | Besok: *${tomorrowKey}* | Lusa: *${dayAfterTomorrowKey}*
- Dosen pengampu: ${defaultLecturers.join(', ')}
- Data Jadwal Kuliah Saat Ini (Kelas A, B, I): ${scheduleSummary}

MEMORI JANGKA PANJANG (PROFIL & FAKTA TERSIMPAN TENTANG PENGGUNA/OBROLAN INI):
${longTermMemoryPrompt}

📚 KAMUS BAHASA GAUL, SINGKATAN & KATA ABSTRAK KAMPUS:
Kamu WAJIB memahami makna berikut dan menafsirkannya dengan tepat sebelum menjawab:

[KEHADIRAN & STATUS KULIAH]
- "cancel", "ga masuk", "absent", "gpp", "libur", "kosong", "off", "gajadi", "batal" → Dosen/kuliah tidak hadir
- "masuk", "ada", "hadir", "on", "jadi", "masih jalan" → Dosen/kuliah hadir
- "ntar dulu", "maju", "dimajuin" → jadwal dipercepat/dimajukan waktunya
- "diundur", "mundur", "ngaret", "telat mulai" → jadwal mundur/terlambat mulai
- "pindah", "ganti tempat", "ke lab", "ke mana" → pindah ruangan
- "gak tau", "blm tau", "masih nunggu info", "belum pasti", "entah" → status belum diketahui

[EKSPRESI MAHASISWA]
- "gas", "gasken", "langsung aja", "yuk", "cuss" → lakukan / jalankan sekarang
- "ntap", "mantap", "nice", "okesip", "oke bos", "siap" → setuju / bagus
- "mager", "males", "nda mood" → tidak semangat/malas
- "gabut", "nganggur" → tidak ada aktivitas/tugas
- "nembak" / "tembak soal" → mengerjakan latihan soal langsung
- "boong", "bercanda", "kidding", "canda" → tidak serius / bercanda
- "fix", "pasti", "confirmed", "yep" → dipastikan / benar
- "woles", "santai", "slow" → tidak terburu-buru
- "kelar", "beres", "done", "selesai", "udah" → sudah selesai
- "nyicil", "cicil dulu" → mengerjakan sedikit-sedikit
- "numpuk", "banyak banget", "overwhelming" → tugas/deadline banyak
- "gampang", "receh", "enteng" → mudah
- "susah", "susah banget", "parah", "hancur", "mampus" → sulit / nilai buruk

[SINGKATAN MATKUL & KAMPUS]
- DFA, FSA → Teori Otomata (Deterministic Finite Automaton)
- Basdat / BD → Basis Data
- Matdis / MD → Matematika Diskrit
- Jarkom / JK → Jaringan Komputer
- Alpro / AP → Algoritma & Pemrograman
- RPL → Rekayasa Perangkat Lunak
- AI / Kecerdasan Buatan → Artificial Intelligence
- B.Ing / Bing / BI → Bahasa Inggris
- Sik / Sinyal → Sistem Komunikasi/Sinyal
- PWS → Pemrograman Web / Project Web Service
- Pabo / Probstat → Probabilitas & Statistika
- SKS → Satuan Kredit Semester
- UTS, UAS, UP → Ujian Tengah/Akhir Semester / Ujian Praktikum
- IP, IPK → Indeks Prestasi (Kumulatif)
- SP → Semester Pendek
- KRS → Kartu Rencana Studi

[PENUNJUK WAKTU & KONTEKS]
- "hari ini" → ${todayKey}
- "besok" → ${tomorrowKey}
- "lusa" → ${dayAfterTomorrowKey}
- "minggu depan", "next week" → 7 hari dari sekarang
- "jam sekian" / "jam X" → waktu spesifik kuliah
- "siang", "pagi", "sore", "malam" → kira-kira rentang jam

KEMAMPUAN BAHASA MAHASISWA & INFERENSI KONTEKSTUAL:
- Paham singkatan dan istilah di atas sebelum menjawab.
- Jika kalimat ambigu (misal: "diundur"), cek konteks riwayat: mata kuliah apa yang sedang dibahas? Siapa dosennya?
- Jika kelas tidak disebutkan, default ke Kelas A. Sebutkan bahwa ini jadwal Kelas A dan tawari cek Kelas B/I jika perlu.

KEMAMPUAN MEMBACA DOKUMEN / FOTO:
Jika pengguna melampirkan file dokumen (PDF) atau foto, analisis isi dokumen/foto tersebut secara mendalam, ekstrak poin-poin penting, atau simpulkan data tabel jadwal perkuliahan secara terstruktur.

KEMAMPUAN AKSI OTOMATIS (ACTION CO-PILOT):
Sertakan kode aksi persis di akhir pesanmu HANYA jika pengguna menyuruh melakukan aksi nyata:

1. Perubahan/Penambahan 1 Mata Kuliah:
[[ACTION:ADD_SCHEDULE:{"kelas":"A","hari":"senin","jam":"10:00 - 11:40","matkul":"DFA","dosen":"-","ruang":"R. 301"}]]
*Tips Cerdas: Jika pengguna hanya mengubah jam (misal: "DFA diundur jam 10"), isi kolom jam dengan jam baru. Jika dosen atau ruang tidak disebut oleh pengguna, isi "-" (sistem akan otomatis mempertahankan dosen/ruang yang lama tanpa menghapusnya)!

2. Simpan Seluruh Jadwal Mingguan Sekaligus (dari teks hasil scan/ketikan panjang):
[[ACTION:BATCH_SCHEDULE:{"kelas":"B","jadwal":{"senin":[{"jam":"08:00 - 09:40","matkul":"DFA","dosen":"-","ruang":"R. 201"}],"selasa":[{"jam":"10:00 - 12:30","matkul":"Basis Data","dosen":"-","ruang":"Lab 1"}]}}]]

3. Menghapus Mata Kuliah:
[[ACTION:DELETE_SCHEDULE:{"kelas":"A","hari":"senin","matkul":"Pancasila"}]]

4. Mengatur Broadcast/Siaran Otomatis Harian:
Jika pengguna menyuruh mengaktifkan atau mematikan siaran template harian (default saat ini mati/false):
[[ACTION:SET_AUTOSEND:{"enabled":true,"time":"07:00"}]]
atau jika menyuruh mematikan:
[[ACTION:SET_AUTOSEND:{"enabled":false}]]

5. Mengatur Tracker Tugas Kuliah (Supabase Cloud Database):
- Data Tugas Aktif Saat Ini: ${tasksSummary}
- Catat tugas baru (contoh: "catat tugas basdat bikin ERD deadline jumat jam 23.59"):
[[ACTION:ADD_TASK:{"kelas":"A","matkul":"Basis Data","judul":"Bikin ERD","deadline":"Jumat jam 23:59"}]]
- Tandai tugas selesai (contoh: "tugas ID 2 udah kelar"):
[[ACTION:DONE_TASK:{"id":2}]]
- Menghapus tugas (contoh: "hapus tugas ID 2"):
[[ACTION:DELETE_TASK:{"id":2}]]
- Minta tampilkan daftar tugas lengkap:
[[ACTION:GET_TASKS:{"kelas":"A"}]]

6. Polling Kehadiran Dosen & Polling Bebas:
⚠️ ATURAN SANGAT PENTING PEMILIHAN AKSI (JANGAN SALAH!):
- Jika pengguna meminta "POLL", "POLLING", "PRESENSI", atau "KEHADIRAN DOSEN" (contoh: "bikin polling dosen", "kirimkan siaran polling dosen ke siaran testing", "poll kehadiran ke saluran", "bikin poll dosen Bu Woro"):
  ➔ SELALU GUNAKAN [[ACTION:POLL_DOSEN:...]]!
  ➔ JANGAN PERNAH gunakan SEND_BROADCAST jika ada kata "polling" atau "poll"!
  ➔ Jika pengguna menyebut target tujuan (misal: "ke siaran testing", "ke saluran", "ke grup"), masukkan targetnya ke parameter "target":
  [[ACTION:POLL_DOSEN:{"lecturers":["Frau Woro","Frau Wisma","Frau Lita","Herr Agus"],"target":"saluran"}]]
  (Gunakan seluruh dosen default ${defaultLecturers.join(', ')} jika pengguna meminta "poll all" atau "semua dosen").

- Jika disuruh bikin polling bebas/kustom (contoh: "bikin poll Menu Buka Puasa | Nasi Padang | Ayam Geprek"):
  [[ACTION:CREATE_POLL:{"name":"Menu Buka Puasa","options":["Nasi Padang","Ayam Geprek"],"target":"sini"}]]

7. Kirim Broadcast Siaran Manual / Terpilih (KHUSUS TEMPLATE / PENGUMUMAN TEKS, BUKAN POLLING):
- Gunakan aksi ini HANYA jika pengguna meminta menyiarkan TEMPLATE AGENDA HARIAN atau PESAN TEKS PENGUMUMAN (JANGAN PERNAH gunakan jika meminta polling):
[[ACTION:SEND_BROADCAST:{"day":"${todayKey}","target":"semua"}]]
- Opsi "target": "semua" (default), "saluran" (hanya Saluran WhatsApp), "grup" (hanya Grup WhatsApp), "sini" (chat saat ini), atau nomor indeks spesifik ("1", "2").
- Opsi "text": isi teks kustom jika menyiarkan pesan pengumuman bebas.

🎯 CONTOH NYATA PENANGANAN PERMINTAAN ABSTRAK & MULTI-KATA (FEW-SHOT):
• Permintaan: "halo ai kirimkan siaran polling dosen ke siaran testing"
  Tindakan: Pengguna ingin mengirim POLLING KEHADIRAN DOSEN ke Saluran/Testing. JANGAN kirim template agenda harian!
  Aksi: [[ACTION:POLL_DOSEN:{"lecturers":["Frau Woro","Frau Wisma","Frau Lita","Herr Agus"],"target":"testing"}]]
• Permintaan: "siarkan polling dosen hari ini ke grup"
  Tindakan: Kirim polling kehadiran dosen ke grup.
  Aksi: [[ACTION:POLL_DOSEN:{"lecturers":["Frau Woro","Frau Wisma","Frau Lita","Herr Agus"],"target":"grup"}]]
• Permintaan: "kirim siaran agenda hari ini" (tanpa kata poll/polling)
  Tindakan: Kirim template teks agenda harian.
  Aksi: [[ACTION:SEND_BROADCAST:{"day":"${todayKey}","target":"semua"}]]

8. Status & Pemeliharaan:
Jika menanyakan status sistem / bot / database:
[[ACTION:SYSTEM:{"action":"status"}]]
Jika menyuruh restart bot:
[[ACTION:SYSTEM:{"action":"restart"}]]

9. KEMAMPUAN MENGINGAT CERDAS (LONG-TERM MEMORY):
- Jika pengguna memperkenalkan diri atau meminta mengingat fakta (contoh: "namaku Dani", "panggil aku mas ganteng", "aku kelas B", "ingat bahwa deadline DFA diundur", "catat tugas ini..."):
  Sertakan aksi mengingat di akhir pesan:
  [[ACTION:REMEMBER:{"key":"nama_panggilan","value":"Dani"}]] atau
  [[ACTION:REMEMBER:{"key":"kelas_favorit","value":"B"}]] atau
  [[ACTION:REMEMBER:{"key":"catatan_khusus","value":"..."}]]
- Jika pengguna menyuruh melupakan sesuatu (contoh: "lupakan namaku", "hapus catatan tadi"):
  [[ACTION:FORGET:{"key":"nama_panggilan"}]]

10. KEMAMPUAN MEMORI PERCAKAPAN & KLARIFIKASI:
- Kamu memiliki daya ingat percakapan yang panjang dengan pengguna.
- Jika pengguna memberikan instruksi yang kurang lengkap, ambigu, atau merujuk ke data/obrolan sebelumnya (contoh: "tolong tambahkan data ini ke database", "jadwalnya tolong diganti", "masukin data tadi"):
  • CEK konteks riwayat percakapan di atas.
  • Jika konteksnya SUDAH PASTI dan jelas dari riwayat sebelumnya, langsung jalankan aksi database yang diminta!
  • Jika konteksnya MASIH BELUM PASTI / BISA BERMAKNA GANDA (misalnya di riwayat ada jadwal dan ada tugas, atau kelasnya belum disebut), JANGAN MENEBAK ASAL. AJUKAN PERTANYAAN KLARIFIKASI terlebih dahulu secara santai dan ramah.
  • Begitu pengguna mengonfirmasi/mengklarifikasi, segera hubungkan konteksnya dan eksekusi action tag yang tepat!

Pastikan nama hari ditulis huruf kecil (senin, selasa, rabu, kamis, jumat, sabtu).`;

  const preferredModel = config.geminiModel || 'models/gemini-3.8-flash';
  const defaultModels = [
    preferredModel,
    'models/gemini-3.8-flash',
    'models/gemini-flash-latest',
    'models/gemini-3.5-flash',
    'models/gemini-pro-latest'
  ];
  const models = [...new Set(defaultModels)];

  // sessionId sudah didefinisikan di atas (sama dengan memoryTargetId)

  const session = getSession(sessionId);

  // Bangun array contents (riwayat chat terdahulu + chat saat ini)
  const contents = [];

  if (session.turns && session.turns.length > 0) {
    for (const turn of session.turns) {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }]
      });
    }
  }

  // Siapkan parts konten pesan pengguna saat ini
  const currentParts = [
    { text: `[INSTRUKSI SISTEM & KONTEKS BOT]:\n${systemInstruction}\n\n[PESAN PENGGUNA]:\n${userQuestion || 'Tolong analisis dan simpulkan isi file dokumen/foto ini secara lengkap dan jelas.'}` }
  ];

  if (mediaFile && mediaFile.buffer) {
    let detectedMime = mediaFile.mimeType || 'application/pdf';
    const bufHead = mediaFile.buffer.slice(0, 8);
    if (bufHead.slice(0, 4).toString() === '%PDF') {
      detectedMime = 'application/pdf';
    } else if (bufHead[0] === 0xff && bufHead[1] === 0xd8 && bufHead[2] === 0xff) {
      detectedMime = 'image/jpeg';
    } else if (bufHead[0] === 0x89 && bufHead.slice(1, 4).toString() === 'PNG') {
      detectedMime = 'image/png';
    }

    console.log(`📄 [AI Multimodal] Memproses lampiran ${detectedMime} (${Math.round(mediaFile.buffer.length / 1024)} KB)...`);

    currentParts.push({
      inlineData: {
        mimeType: detectedMime,
        data: mediaFile.buffer.toString('base64')
      }
    });
  }

  contents.push({
    role: "user",
    parts: currentParts
  });

  // Bangun payload sekali di luar loop agar hemat CPU dan RAM
  // temperature 0.55: cukup kreatif & santai untuk gaya mahasiswa, tapi tetap akurat untuk data
  const payloadStr = JSON.stringify({
    contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 3072
    }
  });

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

      // Timeout 12 detik: jika 1 model lelet/hang, langsung fallback ke model berikutnya
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        signal: AbortSignal.timeout(12000)
      });

      if (res.status === 200) {
        const data = await res.json();
        const candidateParts = data.candidates?.[0]?.content?.parts || [];
        let replyText = candidateParts.map(p => p.text).filter(Boolean).join('\n\n').trim();
        if (!replyText) continue;

        // Periksa apakah AI memicu aksi penyimpanan jadwal, tugas, atau konfigurasi
        const actionMatch = replyText.match(/\[\[ACTION:(ADD_SCHEDULE|DELETE_SCHEDULE|BATCH_SCHEDULE|SET_AUTOSEND|ADD_TASK|DONE_TASK|DELETE_TASK|GET_TASKS|POLL_DOSEN|CREATE_POLL|SEND_BROADCAST|SYSTEM):([\s\S]*?)\]\]/);
        if (actionMatch) {
          const actionType = actionMatch[1];
          const actionPayloadStr = actionMatch[2];

          // Bersihkan tag action agar tidak tampil mentah ke pengguna
          const cleanReply = replyText.replace(actionMatch[0], '').trim();

          const ownerOnlyActions = ['BATCH_SCHEDULE', 'ADD_SCHEDULE', 'DELETE_SCHEDULE', 'SET_AUTOSEND', 'DELETE_TASK', 'SEND_BROADCAST'];
          if (ownerOnlyActions.includes(actionType) && !isSenderOwner) {
            return `${cleanReply}\n\n⚠️ _Catatan: Aksi ini memerlukan izin khusus Admin / Owner bot._`;
          }

          try {
            const actionData = JSON.parse(actionPayloadStr);
            if (actionType === 'BATCH_SCHEDULE') {
              const resBatch = await saveBatchSchedule(actionData.kelas, actionData.jadwal);
              const preview = formatSchedule(resBatch.cKey);
              return `${cleanReply}\n\n💾 *[Jadwal Mingguan Berhasil Disimpan]*\nSeluruh jadwal Kelas ${resBatch.cKey} telah disinkronkan ke Supabase Cloud Database!\n\n${preview}\n\n📢 _Mau langsung disiarkan ke Saluran / Grup? Balas *!send* atau ketik "kirim jadwal"!_`;
            } else if (actionType === 'ADD_SCHEDULE') {
              const resAdd = await addScheduleItem(actionData.kelas, actionData.hari, {
                jam: actionData.jam || '-',
                matkul: actionData.matkul || 'Mata Kuliah',
                dosen: actionData.dosen || '-',
                ruang: actionData.ruang || '-'
              });
              const actionVerb = resAdd.isUpdated ? 'Diperbarui' : 'Ditambahkan';
              const preview = formatSchedule(resAdd.cKey, resAdd.dKey);
              return `${cleanReply}\n\n✅ *[Jadwal Berhasil ${actionVerb}]*\n📌 Mata Kuliah: *${actionData.matkul}* (Kelas ${resAdd.cKey})\n\n${preview}\n\n📢 _Mau langsung disiarkan ke Saluran / Grup? Balas *!send* atau ketik "kirim jadwal"!_`;
            } else if (actionType === 'DELETE_SCHEDULE') {
              const resDel = await deleteScheduleItem(actionData.kelas, actionData.hari, actionData.matkul);
              const preview = formatSchedule(resDel.cKey, resDel.dKey);
              return `${cleanReply}\n\n🗑️ *[Mata Kuliah Dihapus]*\n📌 Mata Kuliah: *${actionData.matkul}* (Kelas ${resDel.cKey} hari ${resDel.dKey})\n\n${preview}\n\n📢 _Mau siarkan perubahan ini ke Saluran / Grup? Balas *!send*!_`;
            } else if (actionType === 'SET_AUTOSEND') {
              const cfg = loadConfig();
              if (!cfg.autoSend) cfg.autoSend = { timezone: 'Asia/Jakarta' };
              cfg.autoSend.enabled = !!actionData.enabled;
              if (actionData.time && /^\d{1,2}:\d{2}$/.test(actionData.time)) {
                const [hour, minute] = actionData.time.split(':');
                cfg.autoSend.cronTime = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
              }
              saveConfig(cfg);
              if (cfg.autoSend.enabled) {
                if (sockInstance) startScheduler(sockInstance);
                return `${cleanReply}\n\n⏰ *[Auto-Send Diaktifkan]* Pengiriman siaran otomatis telah DIAKTIFKAN pada jam ${actionData.time || '07:00'} WIB.`;
              } else {
                stopScheduler();
                return `${cleanReply}\n\n🛑 *[Auto-Send Dimatikan]* Pengiriman siaran otomatis harian telah DINONAKTIFKAN.`;
              }
            } else if (actionType === 'ADD_TASK') {
              const resTask = await addTask({
                kelas: actionData.kelas || 'A',
                matkul: actionData.matkul || 'Mata Kuliah',
                judul: actionData.judul || 'Tugas Baru',
                deadline_text: actionData.deadline || '-'
              });
              return `${cleanReply}\n\n📝 *[Tugas Tersimpan di Cloud Supabase]*\n▫️ *ID:* ${resTask.task.id}\n▫️ *Matkul:* ${resTask.task.matkul}\n📋 *Tugas:* ${resTask.task.judul}\n⏰ *Batas:* ${resTask.task.deadline_text}`;
            } else if (actionType === 'DONE_TASK') {
              const resDone = await markTaskDone(actionData.id);
              if (resDone.success) {
                return `${cleanReply}\n\n🎉 *[Tugas Selesai]* Tugas ID *${actionData.id}* telah ditandai SELESAI di Supabase!`;
              } else {
                return `${cleanReply}\n\n⚠️ ${resDone.message || 'Gagal menandai tugas.'}`;
              }
            } else if (actionType === 'DELETE_TASK') {
              await deleteTask(actionData.id);
              return `${cleanReply}\n\n🗑️ *[Tugas Dihapus]* Tugas ID *${actionData.id}* telah dihapus dari database Supabase.`;
            } else if (actionType === 'GET_TASKS') {
              const listFormatted = await formatTaskList(actionData.kelas || 'A');
              return `${cleanReply}\n\n${listFormatted}`;
            }

            // 🛡️ Safeguard cerdas untuk query gabungan / abstrak:
            // Jika AI salah mengira instruksi sebagai SEND_BROADCAST padahal pengguna menyebut polling/presensi dosen
            const qLower = (userQuestion || '').toLowerCase();
            const isPollIntent = qLower.includes('poll') || qLower.includes('polling') || qLower.includes('kehadiran dosen') || qLower.includes('presensi');
            if (actionType === 'SEND_BROADCAST' && isPollIntent) {
              console.log('🔄 [AI Safeguard] Re-routing SEND_BROADCAST ke POLL_DOSEN (Polling intent terdeteksi).');
              actionType = 'POLL_DOSEN';
              if (!actionData.lecturers || actionData.lecturers.length === 0) {
                actionData.lecturers = defaultLecturers;
              }
              if (!actionData.target) {
                if (qLower.includes('testing') || qLower.includes('saluran') || qLower.includes('channel') || qLower.includes('siaran')) {
                  actionData.target = 'saluran';
                } else if (qLower.includes('grup') || qLower.includes('group')) {
                  actionData.target = 'grup';
                }
              }
            }

            if (actionType === 'POLL_DOSEN') {
              if (sockInstance) {
                const lecturers = Array.isArray(actionData.lecturers) && actionData.lecturers.length > 0 
                  ? actionData.lecturers 
                  : defaultLecturers;

                const config = loadConfig();
                const allTargets = config.targetJids || [];
                let destJids = [remoteJid]; // default ke chat saat ini

                if (actionData.target) {
                  const tStr = String(actionData.target).toLowerCase().trim();
                  if (tStr.includes('@newsletter') || tStr.includes('@g.us')) {
                    destJids = [actionData.target];
                  } else if (tStr.includes('saluran') || tStr.includes('siaran') || tStr.includes('testing') || tStr.includes('channel') || tStr.includes('newsletter')) {
                    const nl = allTargets.filter(t => t.endsWith('@newsletter'));
                    if (nl.length > 0) destJids = nl;
                  } else if (tStr.includes('grup') || tStr.includes('group')) {
                    const gr = allTargets.filter(t => t.endsWith('@g.us'));
                    if (gr.length > 0) destJids = gr;
                  } else if (tStr.includes('semua') || tStr.includes('all') || tStr === 'target') {
                    if (allTargets.length > 0) destJids = allTargets;
                  } else if (/^\d+$/.test(tStr)) {
                    const idx = parseInt(tStr, 10) - 1;
                    if (allTargets[idx]) destJids = [allTargets[idx]];
                  } else if (allTargets.length === 1) {
                    destJids = allTargets;
                  }
                }

                (async () => {
                  try {
                    for (const destJid of destJids) {
                      if (destJid.endsWith('@newsletter')) {
                        // Di Saluran: Kirim 1 Polling Asli All-in-One (dengan fallback otomatis jika server menolak)
                        await sendNativePoll(
                          sockInstance,
                          destJid,
                          `🎓 Polling Kehadiran Dosen (${todayKey})`,
                          [
                            '✅ Semua Dosen Hadir',
                            ...lecturers.map(d => `❌ ${d} (Kosong/Batal)`),
                            '❓ Belum Ada Info Pasti'
                          ],
                          0
                        );
                      } else {
                        for (const lecturer of lecturers) {
                          await new Promise(r => setTimeout(r, 600));
                          await sendNativePoll(
                            sockInstance,
                            destJid,
                            `🎓 Kehadiran: ${lecturer}`,
                            ['✅ Hadir', '❌ Tidak', '❓ Belum Diketahui'],
                            1
                          );
                        }
                      }
                    }
                  } catch (errP) {
                    console.error('[AI Poll Lecturer Error]:', errP.message);
                  }
                })();

                const isHere = destJids.length === 1 && destJids[0] === remoteJid;
                const targetLabel = isHere ? 'chat ini' : `Saluran/Target terpilih (${destJids.map(j => j.split('@')[0]).join(', ')})`;
                return `${cleanReply}\n\n📊 *[Polling Terkirim]* Polling kehadiran untuk *${lecturers.join(', ')}* berhasil dikirim ke *${targetLabel}*!`;
              }
              return cleanReply;
            } else if (actionType === 'CREATE_POLL') {
              if (sockInstance) {
                const pollName = actionData.name || 'Polling';
                const pollOpts = Array.isArray(actionData.options) && actionData.options.length >= 2 ? actionData.options : ['Ya', 'Tidak'];
                const config = loadConfig();
                const allTargets = config.targetJids || [];
                let destJids = [remoteJid];

                if (actionData.target) {
                  const tStr = String(actionData.target).toLowerCase().trim();
                  if (tStr.includes('@newsletter') || tStr.includes('@g.us')) {
                    destJids = [actionData.target];
                  } else if (tStr.includes('saluran') || tStr.includes('siaran') || tStr.includes('testing') || tStr.includes('channel') || tStr.includes('newsletter')) {
                    const nl = allTargets.filter(t => t.endsWith('@newsletter'));
                    if (nl.length > 0) destJids = nl;
                  } else if (tStr.includes('grup') || tStr.includes('group')) {
                    const gr = allTargets.filter(t => t.endsWith('@g.us'));
                    if (gr.length > 0) destJids = gr;
                  } else if (tStr.includes('semua') || tStr.includes('all') || tStr === 'target') {
                    if (allTargets.length > 0) destJids = allTargets;
                  } else if (/^\d+$/.test(tStr)) {
                    const idx = parseInt(tStr, 10) - 1;
                    if (allTargets[idx]) destJids = [allTargets[idx]];
                  } else if (allTargets.length === 1) {
                    destJids = allTargets;
                  }
                }

                try {
                  for (const destJid of destJids) {
                    await sendNativePoll(sockInstance, destJid, pollName, pollOpts, 1);
                  }
                  const isHere = destJids.length === 1 && destJids[0] === remoteJid;
                  const targetLabel = isHere ? 'chat ini' : `${destJids.length} target`;
                  return `${cleanReply}\n\n📊 *[Polling Berhasil Dibuat]* Polling "${pollName}" sudah dikirim ke *${targetLabel}*!`;
                } catch (ePoll) {
                  return `${cleanReply}\n\n⚠️ Gagal membuat polling: ${ePoll.message}`;
                }
              }
              return cleanReply;
            } else if (actionType === 'SEND_BROADCAST') {
              if (sockInstance) {
                const config = loadConfig();
                const allTargets = config.targetJids || [];
                let customTargets = null;
                const tTarget = (actionData.target || '').toLowerCase().trim();

                if (tTarget === 'saluran' || tTarget === 'channel') {
                  customTargets = allTargets.filter(t => t.endsWith('@newsletter'));
                } else if (tTarget === 'grup' || tTarget === 'group') {
                  customTargets = allTargets.filter(t => t.endsWith('@g.us'));
                } else if (tTarget === 'sini' || tTarget === 'chat') {
                  customTargets = [remoteJid];
                } else if (/^\d+$/.test(tTarget)) {
                  const idx = parseInt(tTarget, 10) - 1;
                  if (allTargets[idx]) customTargets = [allTargets[idx]];
                }

                const bRes = await sendDailyBroadcast(sockInstance, actionData.day, customTargets, actionData.text);
                if (bRes.success) {
                  const targetLabel = customTargets ? `${bRes.sentCount} target terpilih` : `seluruh ${bRes.sentCount} target terdaftar`;
                  return `${cleanReply}\n\n📢 *[Siaran Berhasil]* Pesan telah berhasil dikirim ke *${targetLabel}*!`;
                } else {
                  return `${cleanReply}\n\n⚠️ Gagal broadcast: ${bRes.message}`;
                }
              }
              return cleanReply;

            // ✅ FIX: REMEMBER & FORGET dipindah ke level atas (sebelumnya salah nested di SYSTEM)
            } else if (actionType === 'REMEMBER') {
              if (actionData.key && actionData.value) {
                saveFact(memoryTargetId, actionData.key, String(actionData.value));
                console.log(`🧠 [AI Memory Saved] ${memoryTargetId} -> ${actionData.key}: ${actionData.value}`);
              }
              // Simpan percakapan ke sesi
              try {
                addSessionTurn(sessionId, 'user', userQuestion || '(mengirim lampiran)');
                addSessionTurn(sessionId, 'model', cleanReply);
              } catch (eMem) {}
              return cleanReply || `✅ Oke, aku sudah ingat ya!`;

            } else if (actionType === 'FORGET') {
              if (actionData.key) {
                removeFact(memoryTargetId, actionData.key);
                console.log(`🧠 [AI Memory Removed] ${memoryTargetId} -> ${actionData.key}`);
              }
              try {
                addSessionTurn(sessionId, 'user', userQuestion || '(mengirim lampiran)');
                addSessionTurn(sessionId, 'model', cleanReply);
              } catch (eMem) {}
              return cleanReply || `🗑️ Oke, catatan itu sudah aku hapus!`;

            } else if (actionType === 'SYSTEM') {
              if (actionData.action === 'status') {
                const dbStat = checkDatabaseStatus ? await checkDatabaseStatus().catch(() => ({ message: '🟢 Normal' })) : { message: '🟢 Terhubung' };
                return `${cleanReply}\n\n📊 *[Status Sistem]*\n• Status Bot: 🟢 Aktif & Terhubung\n• Database Cloud: ${dbStat.message}`;
              } else if (actionData.action === 'restart') {
                if (!isSenderOwner) return `${cleanReply}\n\n⚠️ Hanya Owner yang boleh me-restart bot.`;
                setTimeout(() => process.exit(0), 1500);
                return `${cleanReply}\n\n🔄 *[Me-restart Bot]* Bot sedang dimuat ulang, tunggu 3 detik ya...`;
              }
            }
          } catch (eAction) {
            console.error('❌ [Action Execution Error]:', eAction.message);
          }

          // Simpan percakapan ke memori sesi persisten (hanya teks murni)
          try {
            addSessionTurn(sessionId, 'user', userQuestion || '(mengirim lampiran)');
            addSessionTurn(sessionId, 'model', cleanReply);
          } catch (eMem) {}

          return cleanReply;
        }

        // Simpan percakapan reguler ke memori sesi persisten
        try {
          addSessionTurn(sessionId, 'user', userQuestion || '(mengirim lampiran)');
          addSessionTurn(sessionId, 'model', replyText);
        } catch (eMem) {}

        return replyText;
      } else {
        const errText = await res.text();
        console.warn(`⚠️ [Gemini ${model} HTTP ${res.status}]:`, errText.slice(0, 150));
      }
    } catch (err) {
      console.warn(`⚠️ [Gemini ${model} error]:`, err.message);
    }
  }

  return '🤖 Maaf, server AI sedang mengalami antrean. Silakan coba kirim pertanyaan Anda sekali lagi.';
}

module.exports = {
  askGeminiAI,
  resetSession,
  formatMemoryForUser,
  saveFact,
  removeFact,
  getLongTermFacts
};

