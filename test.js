const { runDiagnostics, formatConsoleReport } = require('./utils/diagnostics');

(async () => {
  console.log('🚀 Menjalankan Self-Testing Komprehensif Alters Bot...');
  try {
    const report = await runDiagnostics(null);
    formatConsoleReport(report);
    if (report.overallStatus === 'FAIL') {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Terjadi kendala saat menjalankan diagnosa:', err);
    process.exitCode = 1;
  }
})();
