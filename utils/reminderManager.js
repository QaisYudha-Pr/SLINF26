const fs = require('fs');
const path = require('path');
const { getIndonesianDateTime } = require('./formatter');

const REMINDERS_FILE = path.join(__dirname, '..', 'custom_reminders.json');

/**
 * Membaca data pengingat kustom dari custom_reminders.json
 */
function getCustomReminders() {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('❌ Gagal membaca custom_reminders.json:', e.message);
  }
  return [];
}

/**
 * Menyimpan data pengingat kustom ke custom_reminders.json
 */
function saveCustomReminders(reminders) {
  try {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ Gagal menulis custom_reminders.json:', e.message);
  }
}

/**
 * Menambahkan pengingat deadline / agenda baru
 * @param {object} param0 
 * { text, timeStr, dayStr, targetJid, creatorJid }
 */
function addCustomReminder({ text, timeStr = '19:00', dayStr = '', targetJid = null, creatorJid = null }) {
  const current = getCustomReminders();
  const newId = current.length > 0 ? Math.max(...current.map(r => r.id || 0)) + 1 : 1;

  // Normalisasi waktu (HH:mm)
  let cleanTime = timeStr.replace('.', ':').trim();
  if (/^\d{1,2}$/.test(cleanTime)) cleanTime = `${cleanTime.padStart(2, '0')}:00`;
  if (/^\d{1,2}:\d{1,2}$/.test(cleanTime)) {
    const [h, m] = cleanTime.split(':');
    cleanTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  const cleanCreator = creatorJid
    ? (String(creatorJid).split('@')[0].split(':')[0] + '@s.whatsapp.net')
    : null;

  let cleanTarget = targetJid;
  if (cleanTarget) {
    const tLower = String(cleanTarget).toLowerCase().trim();
    if (['gw', 'me', 'saya', 'pc', 'dm', 'pribadi'].includes(tLower)) {
      cleanTarget = cleanCreator;
    }
  }

  const reminder = {
    id: newId,
    text: text || 'Pengingat Deadline / Tugas',
    time: cleanTime,
    day: dayStr ? dayStr.toLowerCase().trim() : '',
    targetJid: cleanTarget || null,
    creatorJid: cleanCreator || null,
    createdAt: new Date().toISOString(),
    fired: false
  };

  current.push(reminder);
  saveCustomReminders(current);
  return reminder;
}

/**
 * Menghapus pengingat berdasarkan ID
 */
function deleteCustomReminder(id) {
  const numId = parseInt(id, 10);
  const current = getCustomReminders();
  const filtered = current.filter(r => r.id !== numId);
  const deleted = current.length !== filtered.length;
  if (deleted) saveCustomReminders(filtered);
  return deleted;
}

/**
 * Mengecek pengingat yang jatuh tempo pada menit saat ini
 */
function checkDueReminders() {
  const dt = getIndonesianDateTime();
  const currentHM = dt.timeFormatted; // misal "19:00"
  const currentDay = (dt.dayKey || dt.hari || '').toLowerCase(); // misal "selasa"

  const list = getCustomReminders();
  const due = [];

  list.forEach(r => {
    if (r.fired) return;
    
    // Cek kecocokan jam
    const timeMatch = r.time === currentHM;
    if (!timeMatch) return;

    // Cek kecocokan hari jika disetel
    let dayMatch = true;
    if (r.day) {
      if (r.day === 'besok') {
        // 'besok' ditangani saat pembuatan atau langsung dicocokkan
        dayMatch = true;
      } else {
        dayMatch = r.day.includes(currentDay) || currentDay.includes(r.day);
      }
    }

    if (timeMatch && dayMatch) {
      r.fired = true;
      due.push(r);
    }
  });

  if (due.length > 0) {
    saveCustomReminders(list);
  }

  return due;
}

/**
 * Format teks daftar pengingat untuk ditampilkan ke pengguna
 */
function formatRemindersList() {
  const list = getCustomReminders().filter(r => !r.fired);
  if (list.length === 0) {
    return '🎉 *Tidak ada pengingat deadline kustom yang aktif.*';
  }

  let text = `⏰ *DAFTAR PENGINGAT DEADLINE KUSTOM (${list.length}):*\n━━━━━━━━━━━━━━━━━━━━━\n\n`;
  list.forEach(r => {
    const dayLabel = r.day ? ` (Hari: *${r.day}*)` : '';
    let targetLabel = 'Semua Target';
    if (r.targetJid) {
      if (r.targetJid.includes('@s.whatsapp.net')) targetLabel = 'DM Pribadi';
      else if (r.targetJid.includes('@g.us')) targetLabel = 'Grup';
      else if (r.targetJid.includes('@newsletter')) targetLabel = 'Saluran';
      else targetLabel = r.targetJid;
    }
    text += `▫️ *[ID: ${r.id}]* ${r.text}\n   ⏰ Jam: *${r.time} WIB*${dayLabel} | 🎯 Target: *${targetLabel}*\n`;
  });
  text += `\n━━━━━━━━━━━━━━━━━━━━━\n💡 _Ketik !delreminder <ID> untuk menghapus pengingat._`;
  return text;
}

module.exports = {
  getCustomReminders,
  addCustomReminder,
  deleteCustomReminder,
  checkDueReminders,
  formatRemindersList
};
