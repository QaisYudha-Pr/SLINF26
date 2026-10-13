const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decryptPollVote, getKeyAuthor, jidNormalizedUser } = require('@whiskeysockets/baileys');

const POLL_SESSIONS_FILE = path.join(__dirname, '..', 'poll_sessions.json');
let pollSessionsCache = null;

/**
 * Memuat sesi polling aktif dari disk / memori cache
 */
function loadPollSessions() {
  if (pollSessionsCache) return pollSessionsCache;
  try {
    if (fs.existsSync(POLL_SESSIONS_FILE)) {
      pollSessionsCache = JSON.parse(fs.readFileSync(POLL_SESSIONS_FILE, 'utf-8'));
    } else {
      pollSessionsCache = {};
    }
  } catch (e) {
    pollSessionsCache = {};
  }
  return pollSessionsCache;
}

/**
 * Menyimpan sesi polling (termasuk messageSecret) agar dapat didekripsi saat diklik
 */
function savePollSession(pollId, sessionData) {
  if (!pollId) return;
  const sessions = loadPollSessions();
  sessions[pollId] = sessionData;

  // Pertahankan maksimal 150 poll terbaru agar file tetap ramping
  const keys = Object.keys(sessions);
  if (keys.length > 150) {
    const sortedKeys = keys.sort((a, b) => (sessions[a]?.createdAt || 0) - (sessions[b]?.createdAt || 0));
    const toRemove = sortedKeys.slice(0, keys.length - 150);
    toRemove.forEach(k => delete sessions[k]);
  }

  try {
    fs.writeFileSync(POLL_SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ Gagal menyimpan poll_sessions.json:', e.message);
  }
}

/**
 * Mengambil data sesi polling berdasarkan ID pesan poll
 */
function getPollSession(pollId) {
  if (!pollId) return null;
  const sessions = loadPollSessions();
  return sessions[pollId] || null;
}

/**
 * Helper untuk mengirim Polling WhatsApp:
 * Mendukung Saluran WhatsApp (@newsletter), Grup (@g.us), dan Chat Pribadi.
 * 
 * Fitur:
 * - Validasi batas WhatsApp (maksimal 12 opsi pilihan).
 * - Multi-choice (selectableCount = 0) dan Single-choice (selectableCount = 1).
 * - Meng-generate dan mengaitkan messageSecret 32-byte untuk dekripsi klik tombol realtime!
 * - Penanganan khusus Saluran (@newsletter) dengan format interaktif.
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

  // 📢 KHUSUS SALURAN WHATSAPP (@newsletter):
  if (isNewsletter) {
    const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '1️⃣1️⃣', '1️⃣2️⃣'];
    let textPoll = `📊 *${pollTitle}*\n`;
    textPoll += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    safeOptions.forEach((opt, idx) => {
      const badge = numEmojis[idx] || `[${idx + 1}]`;
      textPoll += `${badge} ${opt}\n`;
    });
    textPoll += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    textPoll += `💡 _Beri reaksi emoji (reaction) pada pesan ini atau tinggalkan komentar sesuai nomor pilihanmu!_`;
    console.log(`📢 [Poll Saluran Terkirim] Mengirim polling teks interaktif ke saluran ${jid}`);
    return await sock.sendMessage(jid, { text: textPoll });
  }

  // 👥 GRUP (@g.us) & CHAT PRIBADI:
  const messageSecret = crypto.randomBytes(32);

  try {
    const sent = await sock.sendMessage(jid, {
      poll: {
        name: pollTitle,
        values: safeOptions,
        selectableCount: selectableCount,
        messageSecret: messageSecret
      }
    });

    if (sent?.key?.id) {
      savePollSession(sent.key.id, {
        name: pollTitle,
        options: safeOptions,
        messageSecretHex: messageSecret.toString('hex'),
        targetJid: jid,
        createdAt: Date.now()
      });
    }
    return sent;
  } catch (errFirst) {
    // Jika di grup / private dan mode multi-choice ditolak, coba single-choice
    if (selectableCount === 0) {
      try {
        const sentRetry = await sock.sendMessage(jid, {
          poll: {
            name: pollTitle,
            values: safeOptions,
            selectableCount: 1,
            messageSecret: messageSecret
          }
        });
        if (sentRetry?.key?.id) {
          savePollSession(sentRetry.key.id, {
            name: pollTitle,
            options: safeOptions,
            messageSecretHex: messageSecret.toString('hex'),
            targetJid: jid,
            createdAt: Date.now()
          });
        }
        return sentRetry;
      } catch (eRetry) {
        throw errFirst;
      }
    }
    throw errFirst;
  }
}

/**
 * Mendekripsi event pesan masuk yang berisi vote polling (pollUpdateMessage)
 * Menghasilkan informasi opsi mana yang dipencet pengguna.
 * 
 * @param {object} sock - Baileys socket instance
 * @param {object} msg - Objek pesan dari messages.upsert
 * @returns {object|null} - Objek info vote atau null jika bukan pollUpdateMessage
 */
function decryptPollVoteMessage(sock, msg) {
  const pollUpdate = msg?.message?.pollUpdateMessage;
  if (!pollUpdate) return null;

  const creationKey = pollUpdate.pollCreationMessageKey;
  const pollId = creationKey?.id;
  if (!pollId) return null;

  const pollInfo = getPollSession(pollId);
  if (!pollInfo || !pollInfo.messageSecretHex || !pollUpdate.vote) {
    return null;
  }

  try {
    const meId = jidNormalizedUser(sock?.user?.id || '');
    const pollCreatorJid = getKeyAuthor(creationKey, meId);
    const voterJid = getKeyAuthor(msg.key, meId);
    const pollEncKey = Buffer.from(pollInfo.messageSecretHex, 'hex');

    let voteMsg = null;
    try {
      voteMsg = decryptPollVote(pollUpdate.vote, {
        pollEncKey,
        pollCreatorJid,
        pollMsgId: pollId,
        voterJid
      });
    } catch (eDec1) {
      // Fallback variasi JID jika ada perbedaan format peserta grup
      voteMsg = decryptPollVote(pollUpdate.vote, {
        pollEncKey,
        pollCreatorJid: creationKey.participant || sock?.user?.id || pollCreatorJid,
        pollMsgId: pollId,
        voterJid: msg.key.participant || msg.key.remoteJid || voterJid
      });
    }

    if (!voteMsg?.selectedOptions || voteMsg.selectedOptions.length === 0) {
      return {
        pollInfo,
        voterJid,
        unvoted: true
      };
    }

    // Cocokkan hash pilihan yang dipilih dengan opsi teks di pollInfo
    for (const selHash of voteMsg.selectedOptions) {
      for (let idx = 0; idx < pollInfo.options.length; idx++) {
        const optText = pollInfo.options[idx];
        const optHash = crypto.createHash('sha256').update(optText).digest();
        if (selHash.equals(optHash)) {
          return {
            pollInfo,
            voterJid,
            selectedOptionIndex: idx,
            selectedOptionText: optText,
            unvoted: false
          };
        }
      }
    }
  } catch (errDec) {
    console.warn('⚠️ [Gagal Dekripsi Vote Polling]:', errDec.message);
  }

  return null;
}

module.exports = {
  sendNativePoll,
  savePollSession,
  getPollSession,
  decryptPollVoteMessage
};
