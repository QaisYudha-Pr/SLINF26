const { getIndonesianDateTime } = require('./formatter');
const { getSchedules, addScheduleItem, deleteScheduleItem, saveBatchSchedule } = require('./scheduleManager');
const { loadConfig, saveConfig } = require('../configManager');
const { startScheduler, stopScheduler } = require('../scheduler');

/**
 * Mengirim pertanyaan ke Google Gemini AI (gemini-3.8-flash)
 * Dilengkapi kemampuan multimodal (membaca PDF & Foto) dan auto-save jadwal kuliah.
 */
async function askGeminiAI(userQuestion, isSenderOwner = false, mediaFile = null, customApiKey = null, sockInstance = null) {
  const config = loadConfig();
  const apiKey = customApiKey || config.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return '❌ Fitur AI belum dapat digunakan karena Gemini API Key belum disetel di config.json.';
  }

  const dt = getIndonesianDateTime();
  const schedules = getSchedules();
  const defaultLecturers = config.defaultLecturers || ['Frau Woro', 'Frau Wisma', 'Frau Lita', 'Herr Agus'];

  // Buat ringkasan jadwal untuk konteks
  const scheduleSummary = JSON.stringify(schedules);

  const DAYS_ORDER = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const todayKey = (dt.dayKey || dt.hari || 'senin').toLowerCase();
  const todayIdx = DAYS_ORDER.indexOf(todayKey) >= 0 ? DAYS_ORDER.indexOf(todayKey) : 1;
  const tomorrowKey = DAYS_ORDER[(todayIdx + 1) % 7];
  const dayAfterTomorrowKey = DAYS_ORDER[(todayIdx + 2) % 7];

  const systemInstruction =
    `Kamu adalah asisten pintar WhatsApp yang ramah, gaul namun sopan, cerdas, dan tanggap membantu mahasiswa/pengguna.
GAYA RESPONS:
- Gunakan bahasa Indonesia yang santai, akrab, jelas, dan solutif (gaya mahasiswa/kampus).
- Format teks KHUSUS WhatsApp: gunakan *tebal* untuk penekanan/nama matkul/jam, _miring_ untuk istilah teknis, dan poin list (•) jika berpoin.
- JANGAN gunakan format markdown heading seperti # atau ## karena WhatsApp tidak mendukungnya.
- Jawab secara to-the-point tanpa basa-basi berlebihan.

KONTEKS WAKTU & KAMPUS:
- Waktu saat ini: ${dt.fullFormatted}
- Hari ini: *${todayKey}* | Besok: *${tomorrowKey}* | Lusa: *${dayAfterTomorrowKey}*
- Dosen pengampu: ${defaultLecturers.join(', ')}
- Data Jadwal Kuliah Saat Ini (Kelas A, B, I): ${scheduleSummary}

KEMAMPUAN BAHASA MAHASISWA & SINGKATAN KAMPUS:
- Paham singkatan matkul: DFA, Basdat (Basis Data), Matdis (Matematika Diskrit), Jarkom (Jaringan Komputer), Alpro (Algoritma Pemrograman), RPL, AI, B.Inggris, dll.
- Paham istilah perubahan:
  • "diundur" / "dimajuin" / "ganti jam" ➔ Perbarui jam matkul terkait.
  • "pindah ruang" / "ke lab" ➔ Perbarui ruangan matkul terkait.
  • "kosong" / "batal" / "cancel" / "libur" / "dosen ga masuk" ➔ Beri tahu mahasiswa, atau hapus/update jika diminta.
- Paham penunjuk waktu relatif: "hari ini" (${todayKey}), "besok" (${tomorrowKey}), "lusa" (${dayAfterTomorrowKey}).
- Jika kelas tidak disebutkan (misal: "jadwal hari ini apa"), periksa Kelas A terlebih dahulu dan sebutkan bahwa ini jadwal Kelas A, atau beri ringkasan singkat Kelas A & B.

KEMAMPUAN MEMBACA DOKUMEN / FOTO:
Jika pengguna melampirkan file dokumen (PDF) atau foto, analisis isi dokumen/foto tersebut secara mendalam, ekstrak poin-poin penting, atau simpulkan data tabel jadwal perkuliahan secara terstruktur.

KEMAMPUAN DATABASE JADWAL OTOMATIS:
Setiap kali pengguna menyuruh MENYIMPAN, MENGUBAH, atau MENGHAPUS jadwal kuliah, kamu HARUS menyertakan kode aksi persis di akhir pesanmu:

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

Pastikan nama hari ditulis huruf kecil (senin, selasa, rabu, kamis, jumat, sabtu).`;

  const models = [
    'models/gemini-flash-lite-latest',
    'models/gemini-flash-latest',
    'models/gemini-3.5-flash',
    'models/gemini-3.8-flash'
  ];

  // Siapkan parts konten (teks + media jika ada)
  const parts = [
    { text: `${systemInstruction}\n\nPertanyaan/Instruksi Pengguna: "${userQuestion || 'Tolong analisis dan simpulkan isi file dokumen/foto ini secara lengkap dan jelas.'}"` }
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

    parts.push({
      inlineData: {
        mimeType: detectedMime,
        data: mediaFile.buffer.toString('base64')
      }
    });
  }

  // Bangun payload sekali di luar loop agar hemat CPU dan RAM
  const payloadStr = JSON.stringify({
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      temperature: 0.3,
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
        let replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!replyText) continue;

        replyText = replyText.trim();

        // Periksa apakah AI memicu aksi penyimpanan jadwal atau konfigurasi
        const actionMatch = replyText.match(/\[\[ACTION:(ADD_SCHEDULE|DELETE_SCHEDULE|BATCH_SCHEDULE|SET_AUTOSEND):([\s\S]*?)\]\]/);
        if (actionMatch) {
          const actionType = actionMatch[1];
          const actionPayloadStr = actionMatch[2];

          // Bersihkan tag action agar tidak tampil mentah ke pengguna
          const cleanReply = replyText.replace(actionMatch[0], '').trim();

          if (!isSenderOwner) {
            return `${cleanReply}\n\n⚠️ _Catatan: Hanya Admin / Owner bot yang diizinkan untuk mengubah database jadwal kuliah._`;
          }

          try {
            const actionData = JSON.parse(actionPayloadStr);
            if (actionType === 'BATCH_SCHEDULE') {
              const resBatch = saveBatchSchedule(actionData.kelas, actionData.jadwal);
              return `${cleanReply}\n\n💾 *[Auto-Save Berhasil]* Seluruh jadwal mingguan *Kelas ${resBatch.cKey}* telah otomatis disimpan ke database! (Ketik *!jadwal ${resBatch.cKey.toLowerCase()}* untuk melihat).`;
            } else if (actionType === 'ADD_SCHEDULE') {
              const resAdd = addScheduleItem(actionData.kelas, actionData.hari, {
                jam: actionData.jam || '-',
                matkul: actionData.matkul || 'Mata Kuliah',
                dosen: actionData.dosen || '-',
                ruang: actionData.ruang || '-'
              });
              return `${cleanReply}\n\n💾 *[Auto-Save Berhasil]* Data telah otomatis tersimpan ke jadwal *Kelas ${resAdd.cKey}* hari *${resAdd.dKey}*! (Ketik *!jadwal ${resAdd.cKey.toLowerCase()}* untuk melihat).`;
            } else if (actionType === 'DELETE_SCHEDULE') {
              const resDel = deleteScheduleItem(actionData.kelas, actionData.hari, actionData.matkul);
              return `${cleanReply}\n\n🗑️ *[Database Terupdate]* Mata kuliah *${actionData.matkul}* telah dihapus dari jadwal Kelas ${resDel.cKey} hari ${resDel.dKey}.`;
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
            }
          } catch (eAction) {
            console.error('❌ [Action Execution Error]:', eAction.message);
          }
          return cleanReply;
        }

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
  askGeminiAI
};
