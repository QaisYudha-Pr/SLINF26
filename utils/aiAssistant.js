const { getIndonesianDateTime } = require('./formatter');
const { getSchedules, addScheduleItem, deleteScheduleItem, saveBatchSchedule } = require('./scheduleManager');
const { loadConfig } = require('../configManager');

/**
 * Mengirim pertanyaan ke Google Gemini AI (gemini-3.8-flash)
 * Dilengkapi kemampuan multimodal (membaca PDF & Foto) dan auto-save jadwal kuliah.
 */
async function askGeminiAI(userQuestion, isSenderOwner = false, mediaFile = null, customApiKey = null) {
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

  const systemInstruction =
    `Kamu adalah asisten pintar WhatsApp yang ramah, cerdas, dan siap membantu mahasiswa/pengguna.
Gaya respons:
- Gunakan bahasa Indonesia yang santai, sopan, dan jelas.
- Format teks KHUSUS WhatsApp: gunakan *tebal* untuk penekanan, _miring_ untuk istilah, dan poin list (•) jika berpoin.
- JANGAN gunakan format markdown heading seperti # atau ## karena WhatsApp tidak mendukungnya.
- Jawab secara to-the-point tanpa bertele-tele.

Konteks Informasi Kampus yang kamu miliki saat ini:
- Waktu saat ini: ${dt.fullFormatted}
- Dosen pengampu: ${defaultLecturers.join(', ')}
- Data Jadwal Kuliah Kelas (A, B, I): ${scheduleSummary}

KEMAMPUAN MEMBACA DOKUMEN / FOTO:
Jika pengguna melampirkan file dokumen (PDF) atau foto, analisis isi dokumen/foto tersebut secara mendalam, ekstrak poin-poin penting, atau jawab pertanyaan pengguna mengenai isi file tersebut secara akurat dan terstruktur.

KEMAMPUAN MENYIMPAN / MERUBAH JADWAL KULIAH OTOMATIS:
1. Jika pengguna memberikan daftar jadwal banyak hari sekaligus (atau dari file PDF/gambar jadwal):
Kamu HARUS menyertakan kode aksi persis di akhir jawabanmu dengan format:
[[ACTION:BATCH_SCHEDULE:{"kelas":"A","jadwal":{"senin":[{"jam":"07:50 - 10:20","matkul":"...","dosen":"-","ruang":"..."}],"selasa":[...],"rabu":[...],"kamis":[...],"jumat":[]}}]]

2. Jika pengguna hanya menambah/mengubah 1 matkul:
[[ACTION:ADD_SCHEDULE:{"kelas":"A","hari":"senin","jam":"08:00 - 09:40","matkul":"Nama Matkul","dosen":"-","ruang":"R. 101"}]]

3. Jika pengguna menyuruh menghapus:
[[ACTION:DELETE_SCHEDULE:{"kelas":"A","hari":"senin","matkul":"Nama Matkul"}]]

Pastikan nama hari ditulis huruf kecil (senin, selasa, rabu, kamis, jumat, sabtu). Jika ruang atau dosen tidak diketahui, isi "-".`;

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

        // Periksa apakah AI memicu aksi penyimpanan jadwal
        const actionMatch = replyText.match(/\[\[ACTION:(ADD_SCHEDULE|DELETE_SCHEDULE|BATCH_SCHEDULE):([\s\S]*?)\]\]/);
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
