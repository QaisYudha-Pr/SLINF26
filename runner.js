const { spawn } = require('child_process');
const path = require('path');

console.log('\n==================================================');
console.log('🛡️  PENGAWAS AUTO-RESTART BOT WHATSAPP AKTIF');
console.log('==================================================\n');

function launchBot() {
  console.log('🚀 [Runner] Memulai proses bot (index.js)...');

  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    cwd: __dirname
  });

  child.on('exit', (code, signal) => {
    console.log(`\n⚠️  [Runner] Bot terhenti (Kode Keluar: ${code}, Signal: ${signal || 'none'}).`);
    console.log('🔄 [Auto-Restart] Me-restart bot secara otomatis dalam 3 detik...\n');
    setTimeout(() => {
      launchBot();
    }, 3000);
  });

  child.on('error', (err) => {
    console.error('❌ [Runner Error] Terjadi kendala saat meluncurkan bot:', err.message);
    setTimeout(() => {
      launchBot();
    }, 5000);
  });
}

launchBot();
