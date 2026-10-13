const cron = require('node-cron');
const { loadConfig } = require('./configManager');
const { getIndonesianDateTime, getRenderedMessageForDay } = require('./utils/formatter');

let activeCronTask = null;
let activeReminderCronTask = null;

let taskManagerModule = {
  getTasks: async () => []
};
try {
  taskManagerModule = require('./utils/taskManager');
} catch (e) {}
const { getTasks } = taskManagerModule;

/**
 * Mengirim pesan harian atau pengumuman ke target tertentu atau semua target
 * @param {object} sock - Baileys socket instance
 * @param {string} [dayKeyOverride] - Hari template (senin, selasa, dst)
 * @param {Array<string>} [customTargets] - Target spesifik pilihan (jika null, ambil dari config.targetJids)
 * @param {string} [customText] - Teks pesan kustom (jika null, gunakan template harian)
 */
async function sendDailyBroadcast(sock, dayKeyOverride = null, customTargets = null, customText = null) {
  const config = loadConfig();
  const allConfigTargets = config.targetJids || [];
  const targetJids = (Array.isArray(customTargets) && customTargets.length > 0)
    ? customTargets
    : allConfigTargets;

  if (targetJids.length === 0) {
    console.log('[Scheduler] Tidak ada target JID yang ditentukan (targetJids kosong).');
    return {
      success: false,
      message: 'Belum ada target saluran / grup yang didaftarkan. Gunakan perintah !addtarget <JID>.'
    };
  }

  const dt = getIndonesianDateTime();
  const dayKey = dayKeyOverride || dt.dayKey;
  const messageText = customText || getRenderedMessageForDay(dayKey);

  console.log(`[Scheduler] Memulai pengiriman siaran ke ${targetJids.length} target...`);

  const results = [];
  for (const jid of targetJids) {
    try {
      await sock.sendMessage(jid, { text: messageText });
      console.log(`[Scheduler] Berhasil terkirim ke: ${jid}`);
      results.push({ jid, status: 'success' });
      // Jeda 1 detik antar target untuk keamanan anti-spam
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`[Scheduler] Gagal mengirim ke: ${jid} -> ${err.message}`);
      results.push({ jid, status: 'failed', error: err.message });
    }
  }

  return {
    success: true,
    dayKey,
    sentCount: results.filter(r => r.status === 'success').length,
    totalCount: results.length,
    results,
    messageText
  };
}

/**
 * Mengirim pesan pengingat tugas kuliah aktif (Malam Hari / Sesuai Jadwal)
 */
async function sendTaskReminder(sock, customTargets = null) {
  const config = loadConfig();
  const allTargets = config.targetJids || [];
  const targetJids = (Array.isArray(customTargets) && customTargets.length > 0)
    ? customTargets
    : allTargets;

  if (targetJids.length === 0) {
    return { success: false, message: 'Belum ada target saluran / grup yang didaftarkan.' };
  }

  let tasksA = [];
  let tasksB = [];
  try {
    tasksA = await getTasks('A', 'pending').catch(() => []);
    tasksB = await getTasks('B', 'pending').catch(() => []);
  } catch (e) {}

  const totalTasks = tasksA.length + tasksB.length;
  const dt = getIndonesianDateTime();

  let reminderText = `⏰ *[PENGINGAT TUGAS KULIAH]*\n`;
  reminderText += `📅 *${dt.fullFormatted}*\n`;
  reminderText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (totalTasks === 0) {
    reminderText += `🎉 *Tidak ada tugas aktif tertunda!* Semua tugas telah selesai dikerjakan.\nSelamat beristirahat rek! 💤`;
  } else {
    reminderText += `Halo rek! Jangan lupa ada *${totalTasks} tugas kuliah* yang masih berjalan:\n\n`;
    if (tasksA.length > 0) {
      reminderText += `📌 *Kelas A (${tasksA.length} tugas):*\n`;
      tasksA.forEach(t => {
        reminderText += `• [ID: ${t.id}] *${t.matkul}* — ${t.judul} (Batas: _${t.deadline_text || '-'}_)\n`;
      });
      reminderText += '\n';
    }
    if (tasksB.length > 0) {
      reminderText += `📌 *Kelas B (${tasksB.length} tugas):*\n`;
      tasksB.forEach(t => {
        reminderText += `• [ID: ${t.id}] *${t.matkul}* — ${t.judul} (Batas: _${t.deadline_text || '-'}_)\n`;
      });
      reminderText += '\n';
    }
    reminderText += `━━━━━━━━━━━━━━━━━━━━━\n`;
    reminderText += `💡 _Yuk cicil tugasmu malam ini biar gak keteteran pas deadline!_\nKetik *!tugas* untuk info detail atau *!tugas done <ID>* jika sudah selesai.`;
  }

  console.log(`[Reminder] Mengirim pengingat tugas ke ${targetJids.length} target...`);
  const results = [];
  for (const jid of targetJids) {
    try {
      await sock.sendMessage(jid, { text: reminderText });
      results.push({ jid, status: 'success' });
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      results.push({ jid, status: 'failed', error: err.message });
    }
  }

  return {
    success: true,
    sentCount: results.filter(r => r.status === 'success').length,
    totalCount: results.length,
    reminderText
  };
}

/**
 * Memulai cron scheduler berdasarkan config.json
 */
function startScheduler(sock) {
  const config = loadConfig();

  // Hentikan task sebelumnya jika ada
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }
  if (activeReminderCronTask) {
    activeReminderCronTask.stop();
    activeReminderCronTask = null;
  }

  const timezone = config.autoSend?.timezone || config.reminder?.timezone || 'Asia/Jakarta';

  // 1. Cron Siaran Harian Otomatis
  if (config.autoSend && config.autoSend.enabled) {
    const cronPattern = config.autoSend.cronTime || '0 7 * * *';
    if (cron.validate(cronPattern)) {
      console.log(`[Scheduler] Auto-send AKTIF! Jadwal cron: '${cronPattern}' (${timezone})`);
      activeCronTask = cron.schedule(
        cronPattern,
        async () => {
          console.log(`[Scheduler] Menjalankan jadwal pengiriman harian otomatis...`);
          try {
            const broadcastRes = await sendDailyBroadcast(sock);
            
            // 📢 Kirim laporan otomatis ke DM Owner
            const currentConfig = loadConfig();
            const owners = currentConfig.ownerNumbers || ['6281336721331'];
            const dt = getIndonesianDateTime();

            const isFullSuccess = broadcastRes.sentCount === broadcastRes.totalCount && broadcastRes.totalCount > 0;
            const reportText = 
`📢 *[LAPORAN SIARAN OTOMATIS]*
📅 Tanggal: ${dt.dateFormatted}
⏰ Waktu: ${dt.timeFormatted}
🎯 Hari: *${(broadcastRes.dayKey || dt.dayName).toUpperCase()}*
📊 Status Pengiriman:
• Berhasil: *${broadcastRes.sentCount || 0}* target
• Total Target: *${broadcastRes.totalCount || 0}* target

${isFullSuccess ? '✅ Semua saluran & grup berhasil menerima siaran harian tepat waktu.' : '⚠️ Ada kendala pada sebagian target atau target masih kosong.'}`;

            for (const ownerNo of owners) {
              try {
                const cleanNo = String(ownerNo).replace(/[^0-9]/g, '');
                if (cleanNo && cleanNo.length >= 8) {
                  await sock.sendMessage(`${cleanNo}@s.whatsapp.net`, { text: reportText });
                  console.log(`📢 [Scheduler] Laporan siaran terkirim ke DM Owner: ${cleanNo}`);
                }
              } catch (errOwner) {
                console.error(`[Scheduler] Gagal kirim laporan ke owner (${ownerNo}):`, errOwner.message);
              }
            }
          } catch (err) {
            console.error('[Scheduler] Terjadi kesalahan saat pengiriman otomatis:', err);
          }
        },
        {
          scheduled: true,
          timezone
        }
      );
    }
  }

  // 2. Cron Pengingat Tugas Kuliah Otomatis
  if (config.reminder && config.reminder.enabled) {
    const remPattern = config.reminder.cronTime || '0 19 * * *';
    if (cron.validate(remPattern)) {
      console.log(`[Scheduler] Pengingat Tugas Otomatis AKTIF! Jadwal: '${remPattern}' (${timezone})`);
      activeReminderCronTask = cron.schedule(
        remPattern,
        async () => {
          console.log('[Scheduler] Menjalankan pengingat tugas malam hari...');
          try {
            await sendTaskReminder(sock);
          } catch (errRem) {
            console.error('[Scheduler] Gagal mengirim pengingat tugas:', errRem.message);
          }
        },
        {
          scheduled: true,
          timezone
        }
      );
    }
  }
}

function stopScheduler() {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }
  if (activeReminderCronTask) {
    activeReminderCronTask.stop();
    activeReminderCronTask = null;
  }
  console.log('[Scheduler] Semua cron scheduler dihentikan.');
}

module.exports = {
  sendDailyBroadcast,
  sendTaskReminder,
  startScheduler,
  stopScheduler
};
