const fs = require('fs');
const path = require('path');

const DAYS_ID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Mendapatkan info tanggal dan waktu saat ini (WIB)
 */
function getIndonesianDateTime(date = new Date()) {
  const dayName = DAYS_ID[date.getDay()];
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const dayNumber = date.getDate();
  const monthName = MONTHS_ID[date.getMonth()];
  const year = date.getFullYear();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const dateFormatted = `${dayNumber} ${monthName} ${year}`;
  const timeFormatted = `${hours}:${minutes} WIB`;
  const fullFormatted = `${capitalizedDay}, ${dayNumber} ${monthName} ${year} - ${hours}:${minutes} WIB`;

  return {
    dayKey: dayName,
    dayName: capitalizedDay,
    hari: capitalizedDay,
    tanggal: dayNumber,
    bulan: monthName,
    tahun: year,
    jam: hours,
    menit: minutes,
    dateFormatted,
    timeFormatted,
    formattedDate: dateFormatted,
    formattedTime: timeFormatted,
    fullFormatted
  };
}

let templatesCache = null;

/**
 * Membaca file templates.json dengan in-memory cache
 */
function getTemplates() {
  if (templatesCache) return templatesCache;
  const filePath = path.join(__dirname, '..', 'templates.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    templatesCache = JSON.parse(raw);
    return templatesCache;
  } catch (err) {
    console.error('Gagal membaca templates.json:', err.message);
    return {};
  }
}

/**
 * Menyimpan data templates.json
 */
function saveTemplates(templates) {
  templatesCache = templates;
  const filePath = path.join(__dirname, '..', 'templates.json');
  fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
}

/**
 * Mengubah object template menjadi string pesan WhatsApp siap kirim
 */
function renderTemplate(templateObj, customDate = new Date()) {
  const dt = getIndonesianDateTime(customDate);

  if (typeof templateObj === 'string') {
    // Jika template disimpan berupa teks polos
    return templateObj
      .replace(/{hari}/gi, dt.dayName)
      .replace(/{tanggal}/gi, dt.dateFormatted)
      .replace(/{jam}/gi, dt.timeFormatted)
      .replace(/{waktu}/gi, dt.fullFormatted);
  }

  // Jika berupa object { title, header, items, footer }
  const parts = [];

  if (templateObj.title) {
    parts.push(templateObj.title);
    parts.push('');
  }

  if (templateObj.header) {
    const formattedHeader = templateObj.header
      .replace(/{hari}/gi, dt.dayName)
      .replace(/{tanggal}/gi, dt.dateFormatted)
      .replace(/{jam}/gi, dt.timeFormatted)
      .replace(/{waktu}/gi, dt.fullFormatted);
    parts.push(formattedHeader);
    parts.push('');
  }

  if (Array.isArray(templateObj.items) && templateObj.items.length > 0) {
    templateObj.items.forEach((item, idx) => {
      const formattedItem = item
        .replace(/{hari}/gi, dt.dayName)
        .replace(/{tanggal}/gi, dt.dateFormatted)
        .replace(/{jam}/gi, dt.timeFormatted)
        .replace(/{waktu}/gi, dt.fullFormatted);
      parts.push(formattedItem);
    });
    parts.push('');
  }

  if (templateObj.footer) {
    const formattedFooter = templateObj.footer
      .replace(/{hari}/gi, dt.dayName)
      .replace(/{tanggal}/gi, dt.dateFormatted)
      .replace(/{jam}/gi, dt.timeFormatted)
      .replace(/{waktu}/gi, dt.fullFormatted);
    parts.push(formattedFooter);
  }

  return parts.join('\n').trim();
}

/**
 * Mengambil dan merender template berdasarkan nama hari / key
 */
function getRenderedMessageForDay(dayKey, customDate = new Date()) {
  const templates = getTemplates();
  const normalizedKey = (dayKey || '').toLowerCase();

  const templateObj = templates[normalizedKey] || templates['default'];
  if (!templateObj) {
    return `[Pemberitahuan] Belum ada template yang disetel untuk hari '${normalizedKey}'.`;
  }

  return renderTemplate(templateObj, customDate);
}

module.exports = {
  getIndonesianDateTime,
  getTemplates,
  saveTemplates,
  renderTemplate,
  getRenderedMessageForDay
};
