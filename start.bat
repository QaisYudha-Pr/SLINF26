@echo off
title Bot WhatsApp Saluran (Auto-Restart Active)
cd /d "%~dp0"

:main_loop
echo ==================================================
echo [Runner] Menjalankan Bot WhatsApp...
echo ==================================================
node runner.js
echo.
echo ==================================================
echo ⚠️ [Auto-Restart] Proses runner keluar.
echo 🔄 Me-restart kembali dalam 3 detik...
echo ==================================================
timeout /t 3 /nobreak >nul
goto main_loop
