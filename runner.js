const { spawn } = require('child_process');
const path = require('path');

console.log('\n==================================================');
console.log('🛡️  PENGAWAS AUTO-RESTART BOT WHATSAPP AKTIF');
console.log('==================================================\n');

let crashHistory = [];
const CRASH_WINDOW_MS = 30000; // Jendela waktu 30 detik
const MAX_CONSECUTIVE_CRASHES = 5;

function launchBot() {
  console.log('🚀 [Runner] Memulai proses bot (index.js)...');

  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    cwd: __dirname
  });

  child.on('exit', (code, signal) => {
    if (code === 0) {
      // Keluar normal (misal restart via WA / update)
      console.log('\n🔄 [Runner] Bot restart normal. Memulai kembali dalam 2 detik...');
      crashHistory = [];
      setTimeout(launchBot, 2000);
      return;
    }

    const now = Date.now();
    crashHistory.push(now);
    crashHistory = crashHistory.filter(t => now - t < CRASH_WINDOW_MS);

    if (crashHistory.length >= MAX_CONSECUTIVE_CRASHES) {
      console.error('\n' + '='.repeat(60));
      console.error('🚨 [CRASH-LOOP TERDETEKSI] Bot crash berulang kali 5x dalam 30 detik!');
      console.error('🛑 [Pengawas Berhenti] Auto-restart DIMATIKAN agar terminal Termux kamu tidak terkunci.');
      console.error('============================================================');
      console.error('💡 PANDUAN PERBAIKAN:');
      console.error(' 1. Baca pesan error di atas (misal modul hilang atau syntax error).');
      console.error(' 2. Cek syntax kode dengan: node -c index.js');
      console.error(' 3. Jika sudah diperbaiki, ketik kembali: npm start\n');
      process.exit(1);
    }

    console.log(`\n⚠️  [Runner] Bot terhenti (Kode Keluar: ${code}, Signal: ${signal || 'none'}). [Crash ${crashHistory.length}/${MAX_CONSECUTIVE_CRASHES}]`);
    console.log('🔄 [Auto-Restart] Me-restart bot secara otomatis dalam 3 detik...\n');
    setTimeout(launchBot, 3000);
  });

  child.on('error', (err) => {
    console.error('❌ [Runner Error] Terjadi kendala saat meluncurkan bot:', err.message);
    setTimeout(launchBot, 5000);
  });
}

launchBot();

