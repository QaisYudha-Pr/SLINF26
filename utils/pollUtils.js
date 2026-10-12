/**
 * Helper to send a native poll using Baileys.
 * @param {object} sock - Baileys socket instance.
 * @param {string} jid - Target JID (chat, group or channel).
 * @param {string} pollTitle - Question/title of the poll.
 * @param {Array<string>} pollOptions - Array of option strings.
 * @param {number} selectableCount - 0 for multiple choice, 1 for single choice.
 */
async function sendNativePoll(sock, jid, pollTitle, pollOptions, selectableCount = 1) {
  await sock.sendMessage(jid, {
    poll: {
      name: pollTitle,
      values: pollOptions,
      selectableCount: selectableCount
    }
  });
}

module.exports = { sendNativePoll };
