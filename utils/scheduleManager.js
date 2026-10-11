const fs = require('fs');
const path = require('path');
const { getIndonesianDateTime } = require('./formatter');

const SCHEDULES_FILE = path.join(__dirname, '..', 'schedules.json');

/**
 * Data default jika schedules.json belum ada
 */
const DEFAULT_SCHEDULES = {
  "A": {
    "senin": [],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  },
  "B": {
    "senin": [],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  },
  "I": {
    "senin": [],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  }
};

let schedulesCache = null;

/**
 * Membaca data jadwal dari memory cache atau schedules.json
 */
function getSchedules() {
  if (schedulesCache) return schedulesCache;
  try {
    if (!fs.existsSync(SCHEDULES_FILE)) {
      saveSchedules(DEFAULT_SCHEDULES);
      schedulesCache = DEFAULT_SCHEDULES;
      return DEFAULT_SCHEDULES;
    }
    const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
    schedulesCache = JSON.parse(raw);
    return schedulesCache;
  } catch (err) {
    console.error('❌ Gagal membaca schedules.json:', err.message);
    return DEFAULT_SCHEDULES;
  }
}

/**
 * Menyimpan data jadwal ke memory cache dan file schedules.json
 */
function saveSchedules(schedules) {
  try {
    schedulesCache = schedules;
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('❌ Gagal menyimpan schedules.json:', err.message);
    return false;
  }
}

/**
 * Format tampilan jadwal untuk chat WhatsApp
 */
function formatSchedule(classKey, dayKeyOverride = null) {
  const schedules = getSchedules();
  const normalizedClass = (classKey || 'A').toUpperCase();
  const dt = getIndonesianDateTime();
  const dayKey = (dayKeyOverride || dt.dayKey).toLowerCase();

  const classData = schedules[normalizedClass];
  if (!classData) {
    const available = Object.keys(schedules).join(', ');
    return `❌ Kelas *${normalizedClass}* tidak ditemukan.\nKelas yang tersedia saat ini: *${available || 'Belum ada'}*.\n\nGunakan: *!jadwal a*, *!jadwal b*, atau *!jadwal i*.`;
  }

  const dayList = classData[dayKey] || [];
  const capitalizedDay = dayKey.charAt(0).toUpperCase() + dayKey.slice(1);

  let output = `╭───「 📅 *JADWAL KELAS ${normalizedClass}* 」\n`;
  output += `│ 📆 Hari: *${capitalizedDay}*\n`;
  output += `│ ⏰ Waktu Cek: ${dt.timeFormatted}\n`;
  output += `╰──────────────────────────────\n\n`;

  if (!dayList || dayList.length === 0) {
    output += `🎉 *Tidak ada jadwal kuliah untuk Kelas ${normalizedClass} hari ${capitalizedDay}! (Libur / Kosong)*\n\n`;
    output += `_Ketik *!jadwal ${normalizedClass.toLowerCase()} senin* untuk melihat hari lain._`;
    return output;
  }

  output += `📚 *Daftar Mata Kuliah:* \n\n`;
  dayList.forEach((item, idx) => {
    output += `▫️ *${idx + 1}. ${item.matkul || 'Mata Kuliah'}*\n`;
    if (item.jam) output += `   ⏰ Jam: ${item.jam}\n`;
    if (item.dosen) output += `   👨‍🏫 Dosen: ${item.dosen}\n`;
    if (item.ruang) output += `   🏛️ Ruang: ${item.ruang}\n`;
    output += `\n`;
  });

  output += `_Tip: Ketik *!jadwal ${normalizedClass.toLowerCase()} <hari>* untuk melihat hari lain._`;
  return output.trim();
}

/**
 * Menganalisis gambar tabel jadwal menggunakan Gemini Vision (gemini-3.8-flash)
 */
async function scanScheduleWithGemini(imageBuffer, mimeType = 'image/jpeg', apiKey) {
  if (!apiKey) {
    throw new Error('Gemini API Key belum disetel di config.json.');
  }

  const base64Data = imageBuffer.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

  const prompt = `Anda adalah asisten cerdas universitas yang ahli membaca dokumen jadwal perkuliahan.
Tugas Anda:
1. Analisis gambar tabel jadwal perkuliahan ini dengan sangat teliti.
2. Ekstrak seluruh jadwal untuk Kelas A, Kelas B, dan Kelas I (atau kelas lain yang tertera di tabel).
3. Kelompokkan berdasarkan hari (senin, selasa, rabu, kamis, jumat, sabtu).
4. Pastikan setiap mata kuliah memiliki informasi: jam (waktu mulai-selesai), matkul (nama mata kuliah), dosen (nama dosen/pengajar), dan ruang (kode/nama ruangan jika ada).
5. Hasilkan HANYA dalam format JSON murni yang valid tanpa teks pembuka atau penutup:
{
  "A": {
    "senin": [
      { "jam": "08:00 - 09:40", "matkul": "Nama Matkul", "dosen": "Nama Dosen", "ruang": "R. 101" }
    ],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  },
  "B": {
    "senin": [],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  },
  "I": {
    "senin": [],
    "selasa": [],
    "rabu": [],
    "kamis": [],
    "jumat": []
  }
}`;

  let detectedMime = mimeType || 'application/pdf';
  const bufHead = imageBuffer.slice(0, 8);
  if (bufHead.slice(0, 4).toString() === '%PDF') {
    detectedMime = 'application/pdf';
  } else if (bufHead[0] === 0xff && bufHead[1] === 0xd8 && bufHead[2] === 0xff) {
    detectedMime = 'image/jpeg';
  } else if (bufHead[0] === 0x89 && bufHead.slice(1, 4).toString() === 'PNG') {
    detectedMime = 'image/png';
  }

  const models = [
    'models/gemini-flash-lite-latest',
    'models/gemini-flash-latest',
    'models/gemini-3.5-flash',
    'models/gemini-3.8-flash'
  ];

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: detectedMime, data: base64Data } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  let rawJsonText = null;
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        const data = await response.json();
        rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJsonText) break;
      } else {
        const errText = await response.text();
        lastError = new Error(`Gemini ${model} Error (${response.status}): ${errText}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!rawJsonText) {
    throw (lastError || new Error('Semua model Gemini sedang sibuk atau tidak dapat membaca file jadwal.'));
  }

  const parsedSchedule = JSON.parse(rawJsonText);

  // Simpan hasil ke schedules.json
  const current = getSchedules();
  const updated = { ...current, ...parsedSchedule };
  saveSchedules(updated);

  const classesFound = Object.keys(parsedSchedule);
  return {
    success: true,
    classesFound,
    data: parsedSchedule
  };
}

/**
 * Menambahkan atau memperbarui item jadwal untuk kelas dan hari tertentu
 */
function addScheduleItem(classKey, dayKey, item) {
  const schedules = getSchedules();
  const cKey = (classKey || 'A').toUpperCase();
  const dKey = (dayKey || 'senin').toLowerCase();

  if (!schedules[cKey]) schedules[cKey] = {};
  if (!schedules[cKey][dKey]) schedules[cKey][dKey] = [];

  // Jika matkul sudah ada di hari itu, update
  const existingIdx = schedules[cKey][dKey].findIndex(
    s => (s.matkul || '').toLowerCase() === (item.matkul || '').toLowerCase()
  );

  if (existingIdx >= 0) {
    schedules[cKey][dKey][existingIdx] = { ...schedules[cKey][dKey][existingIdx], ...item };
  } else {
    schedules[cKey][dKey].push(item);
  }

  saveSchedules(schedules);
  return { success: true, cKey, dKey, total: schedules[cKey][dKey].length };
}

/**
 * Menghapus mata kuliah dari jadwal kelas dan hari tertentu
 */
function deleteScheduleItem(classKey, dayKey, matkulQuery) {
  const schedules = getSchedules();
  const cKey = (classKey || 'A').toUpperCase();
  const dKey = (dayKey || 'senin').toLowerCase();

  if (!schedules[cKey] || !schedules[cKey][dKey]) {
    return { success: false, message: 'Jadwal tidak ditemukan.' };
  }

  const queryLower = (matkulQuery || '').toLowerCase();
  const originalLen = schedules[cKey][dKey].length;
  schedules[cKey][dKey] = schedules[cKey][dKey].filter(
    s => !(s.matkul || '').toLowerCase().includes(queryLower)
  );

  const deletedCount = originalLen - schedules[cKey][dKey].length;
  saveSchedules(schedules);

  return { success: deletedCount > 0, deletedCount, cKey, dKey };
}

/**
 * Menyimpan jadwal satu minggu penuh sekaligus untuk satu kelas
 */
function saveBatchSchedule(classKey, weekScheduleObj) {
  const schedules = getSchedules();
  const cKey = (classKey || 'A').toUpperCase();
  if (!schedules[cKey]) schedules[cKey] = {};

  for (const [day, list] of Object.entries(weekScheduleObj)) {
    const dKey = day.toLowerCase();
    schedules[cKey][dKey] = Array.isArray(list) ? list : [];
  }

  saveSchedules(schedules);
  return { success: true, cKey, days: Object.keys(weekScheduleObj) };
}

module.exports = {
  getSchedules,
  saveSchedules,
  formatSchedule,
  scanScheduleWithGemini,
  addScheduleItem,
  deleteScheduleItem,
  saveBatchSchedule
};
