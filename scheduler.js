const cron = require('node-cron');
const { loadConfig } = require('./configManager');
const { getIndonesianDateTime, getRenderedMessageForDay } = require('./utils/formatter');

let activeCronTask = null;

/**
 * Mengirim pesan harian ke semua target yang terdaftar di config
 */
async function sendDailyBroadcast(sock, dayKeyOverride = null) {
  const config = loadConfig();
  const targetJids = config.targetJids || [];

  if (targetJids.length === 0) {
    console.log('[Scheduler] Tidak ada target JID yang ditentukan di config.json (targetJids kosong).');
    return {
      success: false,
      message: 'Belum ada target saluran / grup yang didaftarkan. Gunakan perintah !addtarget <JID>.'
    };
  }

  const dt = getIndonesianDateTime();
  const dayKey = dayKeyOverride || dt.dayKey;
  const messageText = getRenderedMessageForDay(dayKey);

  console.log(`[Scheduler] Memulai pengiriman template harian '${dayKey}' ke ${targetJids.length} target...`);

  const results = [];
  for (const jid of targetJids) {
    try {
      await sock.sendMessage(jid, { text: messageText });
      console.log(`[Scheduler] Berhasil terkirim ke: ${jid}`);
      results.push({ jid, status: 'success' });
      // Jeda 1.5 detik antar target untuk keamanan anti-spam
      await new Promise(resolve => setTimeout(resolve, 1500));
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
 * Memulai cron scheduler berdasarkan config.json
 */
function startScheduler(sock) {
  const config = loadConfig();

  // Hentikan task sebelumnya jika ada
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }

  if (!config.autoSend || !config.autoSend.enabled) {
    console.log('[Scheduler] Auto-send harian dinonaktifkan di config.json.');
    return;
  }

  const cronPattern = config.autoSend.cronTime || '0 7 * * *';
  const timezone = config.autoSend.timezone || 'Asia/Jakarta';

  if (!cron.validate(cronPattern)) {
    console.error(`[Scheduler] Pola cron tidak valid: ${cronPattern}`);
    return;
  }

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

function stopScheduler() {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
    console.log('[Scheduler] Cron scheduler dihentikan.');
  }
}

module.exports = {
  sendDailyBroadcast,
  startScheduler,
  stopScheduler
};
