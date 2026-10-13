/**
 * Helper untuk mengirim Polling WhatsApp:
 * Mendukung Saluran WhatsApp (@newsletter), Grup (@g.us), dan Chat Pribadi.
 * 
 * Fitur:
 * - Validasi batas WhatsApp (maksimal 12 opsi pilihan).
 * - Multi-choice (selectableCount = 0) dan Single-choice (selectableCount = 1).
 * - Penanganan khusus Saluran (@newsletter):
 *   Jika server WhatsApp menolak polling interaktif native di Saluran,
 *   otomatis beralih ke Fallback Polling Teks Interaktif dengan reaksi emoji
 *   sehingga pesan PASTI terkirim dan tidak error.
 * 
 * @param {object} sock - Baileys socket instance.
 * @param {string} jid - Target JID (chat, grup, atau saluran).
 * @param {string} pollTitle - Judul / pertanyaan polling.
 * @param {Array<string>} pollOptions - Daftar opsi pilihan.
 * @param {number} selectableCount - 0 = multi-choice, 1 = single-choice.
 */
async function sendNativePoll(sock, jid, pollTitle, pollOptions, selectableCount = 1) {
  if (!sock || !jid) return null;
  const isNewsletter = (jid || '').endsWith('@newsletter');
  const safeOptions = (pollOptions || []).slice(0, 12);

  const msgOptions = {};
  if (isNewsletter) {
    msgOptions.newsletter = true;
  }

  try {
    return await sock.sendMessage(jid, {
      poll: {
        name: pollTitle,
        values: safeOptions,
        selectableCount: selectableCount
      }
    }, msgOptions);
  } catch (errFirst) {
    if (isNewsletter) {
      try {
        // Coba kirim tanpa flag newsletter jika reject
        return await sock.sendMessage(jid, {
          poll: {
            name: pollTitle,
            values: safeOptions,
            selectableCount: selectableCount
          }
        });
      } catch (errSecond) {
        console.warn(`[Poll Saluran] Polling native tidak didukung di saluran (${errSecond.message}). Mengirim Polling Teks Interaktif...`);
        // Fallback format polling teks interaktif rapi untuk saluran WhatsApp
        const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣'];
        let textPoll = `📊 *${pollTitle}*\n`;
        textPoll += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        safeOptions.forEach((opt, idx) => {
          const badge = numEmojis[idx] || `[${idx + 1}]`;
          textPoll += `${badge} ${opt}\n`;
        });
        textPoll += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
        textPoll += `💡 _Beri reaksi emoji (reaction) pada pesan ini atau tinggalkan komentar sesuai nomor pilihanmu!_`;
        return await sock.sendMessage(jid, { text: textPoll });
      }
    }

    // Jika di grup / private dan mode multi-choice ditolak, coba single-choice
    if (selectableCount === 0) {
      try {
        return await sock.sendMessage(jid, {
          poll: {
            name: pollTitle,
            values: safeOptions,
            selectableCount: 1
          }
        });
      } catch (eRetry) {
        throw errFirst;
      }
    }
    throw errFirst;
  }
}

module.exports = { sendNativePoll };
