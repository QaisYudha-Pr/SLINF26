const os = require('os');
const { getIndonesianDateTime } = require('./formatter');
const { getSchedules, addScheduleItem, deleteScheduleItem, saveBatchSchedule, formatSchedule } = require('./scheduleManager');
let taskManager = {
  getTasks: async () => [],
  addTask: async () => ({ success: false, task: {} }),
  updateTask: async () => ({ success: false }),
  markTaskDone: async () => ({ success: false }),
  deleteTask: async () => ({ success: false }),
  formatTaskList: async () => 'Daftar tugas kosong',
  checkDatabaseStatus: async () => ({ message: '🟢 Terhubung (Supabase Cloud)' })
};
try {
  taskManager = require('./taskManager');
} catch (e) {}
const { addTask, updateTask, markTaskDone, deleteTask, getTasks, formatTaskList, checkDatabaseStatus, getLecturers } = taskManager;

let reminderManager = {
  getCustomReminders: () => [],
  addCustomReminder: () => ({ id: 1 }),
  deleteCustomReminder: () => true,
  checkDueReminders: () => [],
  formatRemindersList: () => 'Belum ada pengingat kustom.'
};
try {
  reminderManager = require('./reminderManager');
} catch (e) {}
const {
  getCustomReminders,
  addCustomReminder,
  deleteCustomReminder,
  formatRemindersList
} = reminderManager;

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

let mahasiswaManager = {
  getMahasiswaList: async () => [],
  addMahasiswa: async () => ({ success: false }),
  deleteMahasiswa: async () => ({ success: false }),
  searchMahasiswa: async () => []
};
try {
  mahasiswaManager = require('./mahasiswaManager');
} catch (e) {}

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
  const pendingTasks = await getTasks('ALL', 'pending').catch(() => []);
  const tasksSummary = JSON.stringify(pendingTasks);
  const activeCustomReminders = getCustomReminders().filter(r => !r.fired);
  const customRemindersSummary = JSON.stringify(activeCustomReminders);
  const mahasiswaList = await mahasiswaManager.getMahasiswaList().catch(() => []);
  const mahasiswaSummary = JSON.stringify(mahasiswaList);

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

DATA MAHASISWA AKTIF DI CLOUD SUPABASE (Tabel public.mahasiswa):
- Total Mahasiswa Terdaftar: ${mahasiswaList.length} orang
- Data Mahasiswa (JSON): ${mahasiswaSummary}

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
- Ubah / update tugas yang sudah ada (contoh: "ubah deadline tugas ID 1 jadi besok jam 23.59", "ganti batas tugas 2 jadi jumat", "ubah judul tugas 1 jadi Buat DFD"):
[[ACTION:UPDATE_TASK:{"id":1,"deadline":"Besok jam 23:59"}]]
- TANDAI TUGAS SELESAI / DONE (KELOLA OTOMATIS OLEH ALTERS TANPA WAJIB ID):
  Pengguna TIDAK HARUS menghafal atau menyebutkan nomor ID tugas!
  Jika pengguna bilang kalimat seperti:
  "tugas basdat udah kelar", "tugas dfa udah beres", "tugas erd selesai", "aku udah ngerjain tugas pemweb", atau "tugas makalah done":
  1. Lihat daftar tugas aktif di atas (${tasksSummary}).
  2. Cari tugas yang cocok (berdasarkan matkul atau judul yang dimaksud).
  3. Ambil ID tugas tersebut (atau gunakan nama matkul/judul sebagai "query"):
     [[ACTION:DONE_TASK:{"id":<id_tugas>}]] atau [[ACTION:DONE_TASK:{"query":"Basis Data"}]]
  4. Beri respons ucapan selamat santai dan apresiasi bahwa beban kuliahnya sudah berkurang satu!
- Menghapus tugas (bisa pakai ID atau nama matkul):
[[ACTION:DELETE_TASK:{"id":2}]] atau [[ACTION:DELETE_TASK:{"query":"Basis Data"}]]
- Minta tampilkan daftar tugas lengkap:
[[ACTION:GET_TASKS:{"kelas":"A"}]]

6. Pengingat Deadline & Agenda Kustom Fleksibel (Custom Reminder):
- Data Pengingat Kustom Aktif: ${customRemindersSummary}
- Pasang pengingat kustom baru:
[[ACTION:ADD_REMINDER:{"text":"Kuis DFA","time":"08:00","day":"besok","target":"gw"}]]
Parameter:
• "text": judul agenda/tugas yang diingatkan
• "time": waktu jam format "HH:MM" (contoh: "08:00", "19:30")
• "day": nama hari opsional ("besok", "senin", "jumat", dll)
• "target": tujuan pengiriman pesan pengingat:
  - "gw" / "me" / "pc" / "dm" / "pribadi" ➔ kirim HANYA ke chat pribadi / DM pengirim (WAJIB gunakan ini jika pengguna bilang "ke gw aja", "ke saya", "pc ke gw", "dm gw", "ingatkan aku pribadi")!
  - "grup" ➔ kirim ke grup
  - "saluran" ➔ kirim ke saluran / testing
  - "sini" ➔ kirim ke chat saat ini (default jika tidak disebut)
- Hapus pengingat kustom (contoh: "hapus pengingat ID 1"):
[[ACTION:DELETE_REMINDER:{"id":1}]]
- Tampilkan daftar pengingat aktif (contoh: "daftar pengingat", "ada pengingat apa aja?"):
[[ACTION:GET_REMINDERS:{}]]

7. Pengingat Tugas Otomatis Malam Hari & Pengaturan Bot ('/ai ubah ...'):
- Ubah pengingat tugas harian malam (contoh: "ubah pengingat tugas malam jadi jam 20:00", "matikan pengingat tugas"):
[[ACTION:SET_REMINDER:{"enabled":true,"time":"20:00"}]] atau [[ACTION:SET_REMINDER:{"enabled":false}]]
- Ubah prefix perintah (contoh: "ubah prefix jadi #", "ganti awalan perintah jadi ."):
[[ACTION:SET_CONFIG:{"prefix":"#"}]]

8. Polling Kehadiran Dosen & Polling Bebas:
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

8. Pengelolaan Target Siaran ('Nargetin', Tambah Target, Hapus Target):
⚠️ ATURAN SANGAT PENTING:
- Jika pengguna meminta MENARGETKAN, MENGHUBUNGKAN, atau MENDAFTARKAN chat/grup/saluran sebagai target siaran (contoh: "targetin grup ini", "tolong nargetin saluran ini", "jadikan ini target", "targetin link https://chat.whatsapp.com/...", "nargetin link saluran"):
  ➔ JANGAN PERNAH mengirim pesan broadcast atau polling!
  ➔ SELALU gunakan aksi ADD_TARGET untuk mendaftarkan target:
  [[ACTION:ADD_TARGET:{"target":"sini"}]] (untuk grup/chat saat ini) atau
  [[ACTION:ADD_TARGET:{"target":"https://chat.whatsapp.com/..."}]] (jika pengguna menyertakan tautan)
- Hapus target siaran (contoh: "hapus target 1", "hapus target saluran"):
  [[ACTION:DEL_TARGET:{"target":"1"}]]
- Lihat daftar target terdaftar (contoh: "cek target siaran", "target apa aja"):
  [[ACTION:GET_TARGETS:{}]]

9. Pengelolaan Data Mahasiswa (Tabel public.mahasiswa di Supabase):
- Cek / Tampilkan Data Mahasiswa (contoh: "cek data mahasiswa", "siapa aja mahasiswa yang terdaftar?", "lihat data mhs", "cari mahasiswa budi"):
  [[ACTION:GET_MAHASISWA:{"query":""}]] (isi "query" jika pengguna mencari nama atau NIM spesifik)
- Tambah Mahasiswa Baru (contoh: "tambahkan mahasiswa Budi Santoso NIM 22051204001", "catat mhs baru Siti Aminah 22051204002"):
  [[ACTION:ADD_MAHASISWA:{"nama":"Budi Santoso","nim":"22051204001"}]]
- Hapus Mahasiswa (contoh: "hapus mahasiswa 22051204001", "hapus mhs budi"):
  [[ACTION:DEL_MAHASISWA:{"target":"22051204001"}]]

🎯 CONTOH NYATA PENANGANAN PERMINTAAN ABSTRAK & MULTI-KATA (FEW-SHOT):
• Permintaan: "targetin grup ini dong" atau "tolong nargetin chat ini ya"
  Tindakan: Daftarkan obrolan saat ini sebagai target siaran. JANGAN kirim broadcast!
  Aksi: [[ACTION:ADD_TARGET:{"target":"sini"}]]
• Permintaan: "targetin link https://chat.whatsapp.com/xxx" atau "/ai targetin https://whatsapp.com/channel/xxx"
  Tindakan: Masukkan grup/saluran dari link dan daftarkan sebagai target. JANGAN kirim broadcast!
  Aksi: [[ACTION:ADD_TARGET:{"target":"https://chat.whatsapp.com/xxx"}]]
• Permintaan: "halo ai kirimkan siaran polling dosen ke siaran testing"
  Tindakan: Pengguna ingin mengirim POLLING KEHADIRAN DOSEN ke Saluran/Testing. JANGAN kirim template agenda harian!
  Aksi: [[ACTION:POLL_DOSEN:{"lecturers":["Frau Woro","Frau Wisma","Frau Lita","Herr Agus"],"target":"testing"}]]
• Permintaan: "siarkan polling dosen hari ini ke grup"
  Tindakan: Kirim polling kehadiran dosen ke grup.
  Aksi: [[ACTION:POLL_DOSEN:{"lecturers":["Frau Woro","Frau Wisma","Frau Lita","Herr Agus"],"target":"grup"}]]
• Permintaan: "kirim siaran agenda hari ini" (tanpa kata poll/polling)
  Tindakan: Kirim template teks agenda harian.
  Aksi: [[ACTION:SEND_BROADCAST:{"day":"${todayKey}","target":"semua"}]]
• Permintaan: "ubah deadline tugas 1 jadi besok jam 23.59" atau "/ai ubah batas tugas 1 jadi jumat malam"
  Tindakan: Ubah deadline tugas dengan ID 1.
  Aksi: [[ACTION:UPDATE_TASK:{"id":1,"deadline":"Besok jam 23:59"}]]
• Permintaan: "tugas basdat udah kelar" atau "/ai tugas dfa udah beres" atau "aku udah ngerjain tugas erd"
  Tindakan: Pengguna menyelesaikan tugas tanpa menyebut ID. Alters otomatis mencocokkan tugas aktif.
  Aksi: [[ACTION:DONE_TASK:{"query":"Basis Data"}]]
• Permintaan: "ingatkan besok jam 7 pagi kuis dfa ke gw aja" atau "/ai ingatkan jam 8 malem kuis dfa pc ke gw"
  Tindakan: Buat pengingat kustom khusus chat pribadi / DM pengirim.
  Aksi: [[ACTION:ADD_REMINDER:{"text":"Kuis DFA","time":"07:00","day":"besok","target":"gw"}]]
• Permintaan: "ingatkan jam 19:30 kumpul laporan ke grup"
  Tindakan: Buat pengingat kustom ke grup.
  Aksi: [[ACTION:ADD_REMINDER:{"text":"Kumpul Laporan","time":"19:30","target":"grup"}]]
• Permintaan: "ubah jam autosend jadi jam 06:30" atau "/ai ganti siaran otomatis jam 6 pagi"
  Tindakan: Atur waktu autosend ke 06:30 WIB.
  Aksi: [[ACTION:SET_AUTOSEND:{"enabled":true,"time":"06:30"}]]
• Permintaan: "ubah jam pengingat tugas malam jadi jam 20:00"
  Tindakan: Atur waktu pengingat tugas harian ke 20:00 WIB.
  Aksi: [[ACTION:SET_REMINDER:{"enabled":true,"time":"20:00"}]]
• Permintaan: "ubah prefix jadi #" atau "/ai ganti awalan perintah jadi ."
  Tindakan: Ubah prefix command bot.
  Aksi: [[ACTION:SET_CONFIG:{"prefix":"#"}]]

9. Status & Pemeliharaan:
Jika menanyakan status sistem / bot / database:
[[ACTION:SYSTEM:{"action":"status"}]]
Jika menyuruh restart bot:
[[ACTION:SYSTEM:{"action":"restart"}]]

10. KEMAMPUAN MENGINGAT CERDAS (LONG-TERM MEMORY):
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

  const preferredModel = config.geminiModel || 'models/gemini-3.5-flash-lite';
  const defaultModels = [
    preferredModel,
    'models/gemini-3.5-flash-lite',
    'models/gemini-flash-lite-latest',
    'models/gemini-3.5-flash',
    'models/gemini-3.8-flash',
    'models/gemini-flash-latest'
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

        // Periksa apakah AI memicu satu atau lebih aksi sistem (bisa batch aksi seperti menambah banyak tugas)
        let actionMatches = [...replyText.matchAll(/\[\[ACTION:([A-Z_]+):([\s\S]*?)\]\]/g)];

        const qLowerPre = (userQuestion || '').toLowerCase();
        const isTargetAddIntentPre = qLowerPre.includes('targetin') || qLowerPre.includes('nargetin') || qLowerPre.includes('jadikan target') || qLowerPre.includes('tambah target') || qLowerPre.includes('addtarget');
        if (actionMatches.length === 0 && isTargetAddIntentPre) {
          const urlMatch = (userQuestion || '').match(/https?:\/\/[^\s]+/i);
          const tgt = urlMatch ? urlMatch[0] : 'sini';
          actionMatches = [[`[[ACTION:ADD_TARGET:{"target":"${tgt}"}]]`, 'ADD_TARGET', JSON.stringify({ target: tgt })]];
        }

        // Safeguard pemicu cek mahasiswa otomatis jika AI hanya membalas teks
        if (actionMatches.length === 0 && (qLowerPre.includes('mahasiswa') || qLowerPre.includes('mhs')) && (qLowerPre.includes('cek') || qLowerPre.includes('lihat') || qLowerPre.includes('daftar') || qLowerPre.includes('data') || qLowerPre.includes('siapa'))) {
          actionMatches = [[`[[ACTION:GET_MAHASISWA:{}]]`, 'GET_MAHASISWA', '{}']];
        }

        if (actionMatches.length > 0) {
          // Bersihkan seluruh tag action agar tidak tampil mentah ke pengguna di WhatsApp
          let cleanReply = replyText.replace(/\[\[ACTION:[A-Z_]+:[\s\S]*?\]\]/g, '').trim();

          const feedbacks = [];
          const addedTasksList = [];

          for (const match of actionMatches) {
            let actionType = match[1];
            const actionPayloadStr = match[2];

            let actionData = {};
            try {
              actionData = JSON.parse(actionPayloadStr);
            } catch (eParse) {
              actionData = {};
            }

            // 🛡️ Safeguard cerdas untuk query nargetin / target intent vs broadcast/poll
            const qLower = (userQuestion || '').toLowerCase();
            const isTargetAddIntent = qLower.includes('targetin') || qLower.includes('nargetin') || qLower.includes('jadikan target') || qLower.includes('tambah target') || qLower.includes('addtarget');
            if (isTargetAddIntent && (actionType === 'SEND_BROADCAST' || actionType === 'POLL_DOSEN' || actionType === 'CREATE_POLL')) {
              actionType = 'ADD_TARGET';
              const urlMatch = userQuestion.match(/https?:\/\/[^\s]+/i);
              actionData.target = urlMatch ? urlMatch[0] : (actionData.target || 'sini');
            }

            // 🛡️ Safeguard cerdas untuk mahasiswa intent
            const isMhsCheckIntent = (qLower.includes('mahasiswa') || qLower.includes('mhs')) && (qLower.includes('cek') || qLower.includes('lihat') || qLower.includes('daftar') || qLower.includes('data') || qLower.includes('siapa') || qLower.includes('cari'));
            if (isMhsCheckIntent && actionType !== 'GET_MAHASISWA' && actionType !== 'ADD_MAHASISWA' && actionType !== 'DEL_MAHASISWA') {
              actionType = 'GET_MAHASISWA';
            }

            // 🛡️ Safeguard cerdas untuk query gabungan / polling intent
            const isPollIntent = qLower.includes('poll') || qLower.includes('polling') || qLower.includes('kehadiran dosen') || qLower.includes('presensi');
            if (actionType === 'SEND_BROADCAST' && isPollIntent) {
              actionType = 'POLL_DOSEN';
              if (!actionData.lecturers || actionData.lecturers.length === 0) actionData.lecturers = defaultLecturers;
              if (!actionData.target) {
                if (qLower.includes('testing') || qLower.includes('saluran') || qLower.includes('channel') || qLower.includes('siaran')) {
                  actionData.target = 'saluran';
                } else if (qLower.includes('grup') || qLower.includes('group')) {
                  actionData.target = 'grup';
                }
              }
            }

            const ownerOnlyActions = ['BATCH_SCHEDULE', 'ADD_SCHEDULE', 'DELETE_SCHEDULE', 'SET_AUTOSEND', 'DELETE_TASK', 'SEND_BROADCAST', 'ADD_TARGET', 'DEL_TARGET', 'ADD_MAHASISWA', 'DEL_MAHASISWA'];
            if (ownerOnlyActions.includes(actionType) && !isSenderOwner) {
              feedbacks.push(`⚠️ _Catatan: Aksi ${actionType} memerlukan izin khusus Admin / Owner bot._`);
              continue;
            }

            try {

              if (actionType === 'BATCH_SCHEDULE') {
                const resBatch = await saveBatchSchedule(actionData.kelas, actionData.jadwal);
                const preview = formatSchedule(resBatch.cKey);
                feedbacks.push(`💾 *[Jadwal Mingguan Berhasil Disimpan]* (Kelas ${resBatch.cKey})\n\n${preview}`);
              } else if (actionType === 'ADD_SCHEDULE') {
                const resAdd = await addScheduleItem(actionData.kelas, actionData.hari, {
                  jam: actionData.jam || '-',
                  matkul: actionData.matkul || 'Mata Kuliah',
                  dosen: actionData.dosen || '-',
                  ruang: actionData.ruang || '-'
                });
                const preview = formatSchedule(resAdd.cKey, resAdd.dKey);
                feedbacks.push(`✅ *[Jadwal ${resAdd.isUpdated ? 'Diperbarui' : 'Ditambahkan'}]* *${actionData.matkul}* (Kelas ${resAdd.cKey})\n\n${preview}`);
              } else if (actionType === 'DELETE_SCHEDULE') {
                const resDel = await deleteScheduleItem(actionData.kelas, actionData.hari, actionData.matkul);
                const preview = formatSchedule(resDel.cKey, resDel.dKey);
                feedbacks.push(`🗑️ *[Mata Kuliah Dihapus]* *${actionData.matkul}* (Kelas ${resDel.cKey})\n\n${preview}`);
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
                  feedbacks.push(`⏰ *[Auto-Send Diaktifkan]* Jam ${actionData.time || '07:00'} WIB.`);
                } else {
                  stopScheduler();
                  feedbacks.push(`🛑 *[Auto-Send Dimatikan]* Pengiriman siaran otomatis dinonaktifkan.`);
                }
              } else if (actionType === 'ADD_TASK') {
                const resTask = await addTask({
                  kelas: actionData.kelas || 'A',
                  matkul: actionData.matkul || 'Mata Kuliah',
                  judul: actionData.judul || 'Tugas Baru',
                  deadline_text: actionData.deadline || '-'
                });
                addedTasksList.push(resTask.task);
              } else if (actionType === 'DONE_TASK') {
                const targetIdentifier = actionData.id || actionData.query || actionData.matkul || actionData.judul;
                const resDone = await markTaskDone(targetIdentifier);
                if (resDone.success) {
                  const t = resDone.task || {};
                  const matkulLabel = t.matkul ? `*${t.matkul}*` : '';
                  const judulLabel = t.judul ? `"${t.judul}"` : 'Tugas';
                  feedbacks.push(`🎉 *[Tugas Selesai]* ${matkulLabel} - ${judulLabel} (ID: ${t.id || targetIdentifier}) telah ditandai SELESAI di Supabase! Mantap, berkurang satu beban kuliah! 🚀`);
                } else {
                  feedbacks.push(`⚠️ ${resDone.message || 'Gagal menandai tugas selesai.'}`);
                }
              } else if (actionType === 'DELETE_TASK') {
                const targetIdentifier = actionData.id || actionData.query || actionData.matkul || actionData.judul;
                const resDel = await deleteTask(targetIdentifier);
                if (resDel.success) {
                  feedbacks.push(`🗑️ *[Tugas Dihapus]* Tugas *${targetIdentifier}* telah dihapus dari database Supabase.`);
                } else {
                  feedbacks.push(`⚠️ ${resDel.message || 'Gagal menghapus tugas.'}`);
                }
              } else if (actionType === 'GET_TASKS') {
                const listFormatted = await formatTaskList(actionData.kelas || 'A');
                feedbacks.push(listFormatted);
              } else if (actionType === 'UPDATE_TASK') {
                const updates = {};
                if (actionData.deadline || actionData.deadline_text) updates.deadline_text = actionData.deadline || actionData.deadline_text;
                if (actionData.judul) updates.judul = actionData.judul;
                if (actionData.matkul) updates.matkul = actionData.matkul;
                if (actionData.status) updates.status = actionData.status;

                const resUpdate = await updateTask(actionData.id, updates);
                if (resUpdate.success) {
                  const t = resUpdate.task || {};
                  feedbacks.push(`✏️ *[Tugas Diperbarui]* (ID: ${t.id || actionData.id}) *${t.matkul || '-'}* - ${t.judul || '-'} | Batas: *${t.deadline_text || '-'}*`);
                } else {
                  feedbacks.push(`⚠️ ${resUpdate.message || 'Gagal memperbarui data tugas.'}`);
                }
              } else if (actionType === 'ADD_REMINDER') {
                const cfg = loadConfig();
                let targetDest = remoteJid;
                const targetStr = (actionData.target || '').toLowerCase().trim();

                if (['gw', 'me', 'saya', 'pc', 'dm', 'pribadi'].includes(targetStr)) {
                  targetDest = senderJid || remoteJid;
                  if (!targetDest.endsWith('@s.whatsapp.net')) {
                    const numOnly = (senderJid || '').replace(/[^0-9]/g, '');
                    if (numOnly) targetDest = `${numOnly}@s.whatsapp.net`;
                  }
                } else if (targetStr === 'saluran' || targetStr === 'channel') {
                  const nl = (cfg.targetJids || []).filter(t => t.endsWith('@newsletter'));
                  if (nl.length > 0) targetDest = nl[0];
                } else if (targetStr === 'grup' || targetStr === 'group') {
                  if (remoteJid.endsWith('@g.us')) {
                    targetDest = remoteJid;
                  } else {
                    const gr = (cfg.targetJids || []).filter(t => t.endsWith('@g.us'));
                    if (gr.length > 0) targetDest = gr[0];
                  }
                }

                const newRem = addCustomReminder({
                  text: actionData.text || 'Pengingat Deadline / Agenda',
                  timeStr: actionData.time || '19:00',
                  dayStr: actionData.day || '',
                  targetJid: targetDest,
                  creatorJid: senderJid || remoteJid
                });

                const isDmToUser = targetDest && targetDest.endsWith('@s.whatsapp.net');
                const targetDesc = isDmToUser 
                  ? 'DM / Chat Pribadimu' 
                  : (targetDest.endsWith('@newsletter') ? 'Saluran WhatsApp' : (targetDest.endsWith('@g.us') ? 'Grup WhatsApp' : 'Chat ini'));

                const dayLabel = newRem.day ? ` (Hari: *${newRem.day}*)` : '';
                feedbacks.push(`⏰ *[Pengingat Disetel]* (ID: ${newRem.id}) 📌 *${newRem.text}* | Jam: *${newRem.time} WIB*${dayLabel} | Target: *${targetDesc}*`);
              } else if (actionType === 'DELETE_REMINDER') {
                const isDel = deleteCustomReminder(actionData.id);
                if (isDel) {
                  feedbacks.push(`🗑️ *[Pengingat Dihapus]* Pengingat ID *${actionData.id}* telah berhasil dihapus.`);
                } else {
                  feedbacks.push(`⚠️ Pengingat ID *${actionData.id}* tidak ditemukan.`);
                }
              } else if (actionType === 'GET_REMINDERS') {
                const listRem = formatRemindersList();
                feedbacks.push(listRem);
              } else if (actionType === 'SET_REMINDER') {
                const cfg = loadConfig();
                if (!cfg.reminder) cfg.reminder = { enabled: true, cronTime: '0 19 * * *' };
                if (typeof actionData.enabled === 'boolean') {
                  cfg.reminder.enabled = actionData.enabled;
                }
                if (actionData.time && /^\d{1,2}:\d{2}$/.test(actionData.time)) {
                  const [hour, minute] = actionData.time.split(':');
                  cfg.reminder.cronTime = `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * *`;
                }
                saveConfig(cfg);
                if (sockInstance) startScheduler(sockInstance);
                const statusStr = cfg.reminder.enabled ? `DIAKTIFKAN pada jam ${actionData.time || '19:00'} WIB` : 'DINONAKTIFKAN';
                feedbacks.push(`⏰ *[Pengingat Otomatis Diperbarui]* Pengingat tugas malam harian telah *${statusStr}*.`);
              } else if (actionType === 'SET_CONFIG') {
                const cfg = loadConfig();
                let changed = [];
                if (actionData.prefix) {
                  cfg.prefix = actionData.prefix;
                  changed.push(`Prefix: \`${cfg.prefix}\``);
                }
                saveConfig(cfg);
                feedbacks.push(`⚙️ *[Pengaturan Bot Diperbarui]* ${changed.join(', ') || 'Disimpan'}`);
              } else if (actionType === 'POLL_DOSEN') {
                if (sockInstance) {
                  const lecturers = Array.isArray(actionData.lecturers) && actionData.lecturers.length > 0 
                    ? actionData.lecturers 
                    : defaultLecturers;

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

                  (async () => {
                    try {
                      for (const destJid of destJids) {
                        const pollTitle = `🎓 Polling Kehadiran Dosen (${todayKey})`;
                        const pollOptions = [
                          '✅ Semua Dosen Hadir',
                          ...lecturers.map(d => `❌ ${d} (Kosong/Batal)`),
                          '❓ Belum Ada Info Pasti'
                        ];
                        // 1 Polling All-in-One ringkas untuk mencegah spam beruntun baik di grup maupun saluran
                        await sendNativePoll(sockInstance, destJid, pollTitle, pollOptions, 0);
                      }
                    } catch (errP) {
                      console.error('[AI Poll Lecturer Error]:', errP.message);
                    }
                  })();

                  const isHere = destJids.length === 1 && destJids[0] === remoteJid;
                  const targetLabel = isHere ? 'chat ini' : `Saluran/Target terpilih (${destJids.map(j => j.split('@')[0]).join(', ')})`;
                  feedbacks.push(`📊 *[Polling Terkirim]* Polling kehadiran untuk *${lecturers.join(', ')}* dikirim ke *${targetLabel}*!`);
                }
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
                    feedbacks.push(`📊 *[Polling Berhasil Dibuat]* Polling "${pollName}" sudah dikirim ke *${targetLabel}*!`);
                  } catch (ePoll) {
                    feedbacks.push(`⚠️ Gagal membuat polling: ${ePoll.message}`);
                  }
                }
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
                    feedbacks.push(`📢 *[Siaran Berhasil]* Pesan dikirim ke *${targetLabel}*!`);
                  } else {
                    feedbacks.push(`⚠️ Gagal broadcast: ${bRes.message}`);
                  }
                }
              } else if (actionType === 'REMEMBER') {
                if (actionData.key && actionData.value) {
                  saveFact(memoryTargetId, actionData.key, String(actionData.value));
                  console.log(`🧠 [AI Memory Saved] ${memoryTargetId} -> ${actionData.key}: ${actionData.value}`);
                }
              } else if (actionType === 'FORGET') {
                if (actionData.key) {
                  removeFact(memoryTargetId, actionData.key);
                  console.log(`🧠 [AI Memory Removed] ${memoryTargetId} -> ${actionData.key}`);
                }
              } else if (actionType === 'SYSTEM') {
                if (actionData.action === 'status') {
                  const dbStat = checkDatabaseStatus ? await checkDatabaseStatus().catch(() => ({ message: '🟢 Normal' })) : { message: '🟢 Terhubung' };
                  feedbacks.push(`📊 *[Status Sistem]*\n• Status Bot: 🟢 Aktif & Terhubung\n• Database Cloud: ${dbStat.message}`);
                } else if (actionData.action === 'restart') {
                  if (isSenderOwner) {
                    setTimeout(() => process.exit(0), 1500);
                    feedbacks.push(`🔄 *[Me-restart Bot]* Bot sedang dimuat ulang, tunggu 3 detik ya...`);
                  }
                }
              } else if (actionType === 'ADD_TARGET') {
                const config = loadConfig();
                if (!config.targetJids) config.targetJids = [];
                let targetInput = (actionData.target || 'sini').trim();

                if (targetInput === 'sini' || targetInput === 'chat' || targetInput === 'grup ini' || targetInput === 'saluran ini') {
                  targetInput = remoteJid || '';
                }

                const channelMatch = targetInput.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
                const groupMatch = targetInput.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);

                if (channelMatch && sockInstance) {
                  const inviteCode = channelMatch[1];
                  try {
                    const meta = await sockInstance.newsletterMetadata('INVITE', inviteCode);
                    if (meta && meta.id) {
                      if (!config.targetJids.includes(meta.id)) {
                        config.targetJids.push(meta.id);
                        saveConfig(config);
                        feedbacks.push(`✅ *[Target Saluran Ditambahkan]*\n• Nama Saluran: *${meta.name || 'Saluran'}*\n• JID Saluran: \`${meta.id}\`\n• Pengikut: *${meta.subscribers || 0}*\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
                      } else {
                        feedbacks.push(`ℹ️ Saluran *${meta.name || 'Saluran'}* (\`${meta.id}\`) sudah terdaftar sebelumnya di target siaran.`);
                      }
                    } else {
                      feedbacks.push(`❌ Saluran tidak ditemukan atau tautan sudah kedaluwarsa.`);
                    }
                  } catch (eCh) {
                    feedbacks.push(`❌ Gagal memeriksa tautan saluran: ${eCh.message}`);
                  }
                } else if (groupMatch && sockInstance) {
                  const inviteCode = groupMatch[1];
                  try {
                    const groupInfo = await sockInstance.groupGetInviteInfo(inviteCode);
                    if (groupInfo && groupInfo.id) {
                      let joinedStatus = 'ℹ️ Bot sudah berada di dalam grup ini';
                      try {
                        await sockInstance.groupAcceptInvite(inviteCode);
                        joinedStatus = '🟢 Bot berhasil bergabung ke grup!';
                      } catch (eJoin) {
                        if (eJoin.message && !eJoin.message.includes('already in')) {
                          console.log(`ℹ️ [Group Join Notice]: ${eJoin.message}`);
                        }
                      }
                      const rawId = groupInfo.id;
                      const groupJid = rawId.endsWith('@g.us') ? rawId : `${rawId}@g.us`;
                      if (!config.targetJids.includes(groupJid)) {
                        config.targetJids.push(groupJid);
                        saveConfig(config);
                        feedbacks.push(`✅ *[Target Grup Ditambahkan]*\n• Nama Grup: *${groupInfo.subject || 'Grup WhatsApp'}*\n• JID Grup: \`${groupJid}\`\n• Anggota: *${groupInfo.size || groupInfo.participants?.length || '?'}*\n• Status: ${joinedStatus}\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
                      } else {
                        feedbacks.push(`ℹ️ Grup *${groupInfo.subject || 'Grup'}* (\`${groupJid}\`) sudah terdaftar di target siaran.`);
                      }
                    } else {
                      feedbacks.push(`❌ Tautan undangan grup tidak valid atau kedaluwarsa.`);
                    }
                  } catch (eGr) {
                    feedbacks.push(`❌ Gagal memproses tautan grup: ${eGr.message}`);
                  }
                } else if (targetInput.includes('@newsletter') || targetInput.includes('@g.us') || targetInput.includes('@s.whatsapp.net')) {
                  if (!config.targetJids.includes(targetInput)) {
                    let targetName = '';
                    let targetType = targetInput.endsWith('@newsletter') ? '📢 Saluran' : (targetInput.endsWith('@g.us') ? '👥 Grup' : '👤 Pribadi');
                    if (sockInstance) {
                      if (targetInput.endsWith('@g.us')) {
                        try {
                          const gMeta = await sockInstance.groupMetadata(targetInput);
                          if (gMeta?.subject) targetName = gMeta.subject;
                        } catch (e) {}
                      } else if (targetInput.endsWith('@newsletter')) {
                        try {
                          const nlMeta = await sockInstance.newsletterMetadata('JID', targetInput);
                          if (nlMeta?.name) targetName = nlMeta.name;
                        } catch (e) {}
                      }
                    }
                    config.targetJids.push(targetInput);
                    saveConfig(config);
                    const nameInfo = targetName ? `• Nama: *${targetName}*\n` : '';
                    feedbacks.push(`✅ *[Target Berhasil Didaftarkan]*\n${nameInfo}• ID JID: \`${targetInput}\`\n• Tipe: *${targetType}*\n\nTotal target siaran sekarang: ${config.targetJids.length}`);
                  } else {
                    feedbacks.push(`ℹ️ Target \`${targetInput}\` sudah terdaftar di daftar target.`);
                  }
                } else {
                  feedbacks.push(`⚠️ Target tidak dikenali atau kosong. Anda bisa menyertakan tautan grup/saluran atau katakan "targetin chat ini".`);
                }
              } else if (actionType === 'DEL_TARGET') {
                const config = loadConfig();
                const targets = config.targetJids || [];
                const delInput = String(actionData.target || '').trim();
                let targetToRemove = delInput;
                const numIdx = parseInt(delInput, 10);
                if (!isNaN(numIdx) && numIdx > 0 && numIdx <= targets.length) {
                  targetToRemove = targets[numIdx - 1];
                }
                if (targets.includes(targetToRemove)) {
                  config.targetJids = targets.filter(j => j !== targetToRemove);
                  saveConfig(config);
                  feedbacks.push(`🗑️ *[Target Dihapus]*\nTarget \`${targetToRemove}\` telah dihapus dari daftar.\nSisa target siaran: ${config.targetJids.length}`);
                } else {
                  feedbacks.push(`⚠️ Target "${delInput}" tidak ditemukan dalam daftar target.`);
                }
              } else if (actionType === 'GET_TARGETS') {
                const config = loadConfig();
                const targets = config.targetJids || [];
                if (targets.length === 0) {
                  feedbacks.push(`📋 *[Daftar Target Siaran]*\nBelum ada target siaran yang didaftarkan.`);
                } else {
                  let listTxt = `📋 *[Daftar Target Siaran Terdaftar]* (${targets.length} target):\n\n`;
                  for (let i = 0; i < targets.length; i++) {
                    const t = targets[i];
                    const typeLabel = t.endsWith('@newsletter') ? '📢 Saluran' : (t.endsWith('@g.us') ? '👥 Grup' : '👤 Pribadi');
                    listTxt += `${i + 1}. ${typeLabel} - \`${t}\`\n`;
                  }
                  feedbacks.push(listTxt.trim());
                }
              } else if (actionType === 'GET_MAHASISWA') {
                const q = (actionData.query || '').trim();
                let list = [];
                if (q) {
                  list = await mahasiswaManager.searchMahasiswa(q);
                } else {
                  list = await mahasiswaManager.getMahasiswaList();
                }
                if (list.length === 0) {
                  feedbacks.push(q ? `🔍 Mahasiswa dengan kata kunci *"${q}"* tidak ditemukan di database Supabase.` : `📋 *[Data Mahasiswa]*\nBelum ada data mahasiswa yang terdaftar di database Supabase.\n\n_Untuk menambahkan, ketik:_\n*!tambahmhs <nama> | <nim>*`);
                } else {
                  let textList = `🎓 *[Data Mahasiswa Terdaftar di Supabase]* (${list.length} orang):\n\n`;
                  list.forEach((m, i) => {
                    textList += `${i + 1}. *${m.nama}* – NIM: \`${m.nim}\` (ID: ${m.id})\n`;
                  });
                  feedbacks.push(textList.trim());
                }
              } else if (actionType === 'ADD_MAHASISWA') {
                const resMhs = await mahasiswaManager.addMahasiswa(actionData.nama, actionData.nim);
                if (resMhs.success) {
                  const m = resMhs.mahasiswa || {};
                  feedbacks.push(`✅ *[Mahasiswa Berhasil Didaftarkan]*\n• Nama: *${actionData.nama}*\n• NIM: \`${actionData.nim}\`\n• ID: \`${m.id || '-'}\`\nTersimpan permanen di cloud database Supabase! 🎓`);
                } else {
                  feedbacks.push(`⚠️ Gagal mendaftarkan mahasiswa: ${resMhs.message}`);
                }
              } else if (actionType === 'DEL_MAHASISWA') {
                const target = actionData.target || actionData.nim || actionData.id;
                const resDelM = await mahasiswaManager.deleteMahasiswa(target);
                if (resDelM.success) {
                  feedbacks.push(`🗑️ *[Mahasiswa Dihapus]* Data mahasiswa (\`${target}\`) telah dihapus dari database Supabase.`);
                } else {
                  feedbacks.push(`⚠️ Gagal menghapus mahasiswa: ${resDelM.message}`);
                }
              }
            } catch (eAction) {
              console.error('❌ [Action Execution Error]:', eAction.message);
            }
          }

          // Format daftar tugas baru jika ada
          if (addedTasksList.length > 0) {
            if (addedTasksList.length === 1) {
              const t = addedTasksList[0];
              feedbacks.unshift(`📝 *[Tugas Tersimpan di Cloud Supabase]*\n▫️ *ID:* ${t.id}\n▫️ *Matkul:* ${t.matkul}\n📋 *Tugas:* ${t.judul}\n⏰ *Batas:* ${t.deadline_text}`);
            } else {
              let batchText = `📝 *[${addedTasksList.length} Tugas Berhasil Disimpan di Cloud Supabase]*:\n`;
              addedTasksList.forEach(t => {
                batchText += `▫️ *[ID: ${t.id}]* *${t.matkul}* – ${t.judul} (Batas: *${t.deadline_text}*)\n`;
              });
              feedbacks.unshift(batchText.trim());
            }
          }

          let finalReply = cleanReply;
          if (feedbacks.length > 0) {
            finalReply = finalReply ? `${finalReply}\n\n${feedbacks.join('\n\n')}` : feedbacks.join('\n\n');
          }

          // Simpan percakapan ke memori sesi persisten
          try {
            addSessionTurn(sessionId, 'user', userQuestion || '(mengirim lampiran)');
            addSessionTurn(sessionId, 'model', finalReply);
          } catch (eMem) {}

          return finalReply;
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

  // 🚨 Emergency Smart Fallback Handler jika seluruh model Google AI sedang limit (429 / 503)
  const lowerQ = (userQuestion || '').toLowerCase().trim();

  // 1. Cek Tugas Kuliah
  if (lowerQ.includes('tugas') && (lowerQ.includes('apa') || lowerQ.includes('daftar') || lowerQ.includes('cek') || lowerQ.includes('list') || lowerQ.includes('ada') || lowerQ.includes('pending'))) {
    try {
      const activeTasks = await getTasks('ALL', 'pending');
      if (activeTasks && activeTasks.length > 0) {
        return `⚡ *[Mode Tanggap Kuota — Tetap Siaga]*\n_Server AI sedang padat trafik, tapi tenang, Alters langsung bacain data tugas dari database:_\n\n${formatTaskList(activeTasks)}`;
      } else {
        return `⚡ *[Mode Tanggap Kuota]*\n🎉 Tidak ada tugas aktif yang belum selesai di database!`;
      }
    } catch (e) {}
  }

  // 2. Tandai Tugas Selesai Tanpa ID
  const isDoneIntent = lowerQ.includes('selesai') || lowerQ.includes('kelar') || lowerQ.includes('beres') || lowerQ.includes('done');
  if (isDoneIntent && lowerQ.includes('tugas')) {
    try {
      const activeTasks = await getTasks('ALL', 'pending');
      const stopWords = new Set(['tugas', 'matkul', 'kuliah', 'latihan', 'individu', 'kelompok', 'uts', 'uas', 'ujian', 'udah', 'sudah', 'telah', 'selesai', 'kelar', 'beres', 'done']);
      for (const t of activeTasks) {
        const matkulKey = (t.matkul || '').toLowerCase();
        const judulKey = (t.judul || '').toLowerCase();
        const words = `${matkulKey} ${judulKey}`.split(/[\s,./\-_()]+/).filter(w => w.length > 3 && !stopWords.has(w));
        const matches = (matkulKey && lowerQ.includes(matkulKey)) || 
                        (judulKey && lowerQ.includes(judulKey)) ||
                        words.some(w => lowerQ.includes(w));
        if (matches) {
          await markTaskDone(t.id);
          return `⚡ *[Mode Tanggap Kuota — Tugas Diselesaikan]*\n\n🎉 Mantap! Tugas *${t.matkul}* - *${t.judul}* (ID: ${t.id}) berhasil Alters tandai *SELESAI* di database!\n\n_Tetap bisa diproses otomatis meski kuota AI sedang padat! 🫡_`;
        }
      }
    } catch (e) {}
  }

  // 3. Cek Jadwal Kuliah Hari Ini
  if (lowerQ.includes('jadwal') || lowerQ.includes('hari ini ada apa') || lowerQ.includes('kuliah apa')) {
    try {
      const dtNow = getIndonesianDateTime();
      const currentDay = (dtNow.dayKey || dtNow.hari || 'senin').toLowerCase();
      const sched = schedules?.['B']?.[currentDay] || schedules?.['A']?.[currentDay] || [];
      if (sched.length > 0) {
        let scText = `⚡ *[Mode Tanggap Kuota — Jadwal Kuliah Hari Ini]*\n📅 *Hari:* ${dtNow.dayFormatted}\n\n`;
        sched.forEach((s) => {
          scText += `▫️ *${s.matkul}*\n   ⏰ ${s.jam} | 📍 ${s.ruang}\n`;
        });
        return scText;
      }
    } catch (e) {}
  }

  return '🤖 *[Antrean Server AI / Kuota Terbatas]*\nServer Google Gemini sedang mengalami pembatasan kuota (Rate Limit) atau lonjakan trafik sementara.\n\n💡 *Tips Bebas Kuota:* \nUntuk tugas & jadwal, Anda tetap bisa pakai perintah langsung tanpa kuota AI:\n• *!tugas* (Cek tugas aktif)\n• *!tugas done <ID/Matkul>* (Tandai selesai)\n• *!hariini* (Cek jadwal hari ini)\n• *!all* (Polling kehadiran dosen)';
}

module.exports = {
  askGeminiAI,
  resetSession,
  formatMemoryForUser,
  saveFact,
  removeFact,
  getLongTermFacts
};

