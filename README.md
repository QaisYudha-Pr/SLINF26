# 🤖 ALTERS (SLINF26) - WhatsApp Smart Academic AI Co-Pilot & Channel Bot

[![Node.js Version](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Baileys Engine](https://img.shields.io/badge/Baileys-WhatsApp%20Web%20API-blue.svg)](https://github.com/WhiskeySockets/Baileys)
[![Gemini Engine](https://img.shields.io/badge/Google%20Gemini-3.8--Flash-orange.svg)](https://aistudio.google.com/)
[![Database](https://img.shields.io/badge/Database-Supabase%20Cloud%20PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)]()

**Alters** adalah asisten AI akademik dan bot manajemen saluran/grup WhatsApp modern berbasis **Node.js** dan **@whiskeysockets/baileys**. Ditenagai oleh **Google Gemini 3.8 Flash**, bot ini dirancang untuk mendampingi mahasiswa dan pengurus kelas dalam mengelola perkuliahan: mulai dari tanya jawab materi cerdas, pencatatan tugas berbasis bahasa alami, pengingat deadline otomatis (DM/Grup/Saluran), polling presensi dosen, OCR jadwal kuliah, hingga siaran harian otomatis.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Panduan Cepat untuk Kolaborator (Quickstart)](#-panduan-cepat-untuk-kolaborator-quickstart)
3. [Keamanan & Variabel Lingkungan (Security Guide)](#-keamanan--variabel-lingkungan-security-guide)
4. [Struktur Konfigurasi (`config.json`)](#-struktur-konfigurasi-configjson)
5. [Skema Database Supabase (Opsional)](#-skema-database-supabase-opsional)
6. [Daftar Perintah Lengkap (Command Manual)](#-daftar-perintah-lengkap-command-manual)
7. [Contoh Interaksi Natural Alters AI](#-contoh-interaksi-natural-alters-ai)
8. [Menjalankan di Latar Belakang (Background Service)](#-menjalankan-di-latar-belakang-background-service)
9. [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## ✨ Fitur Utama

### 🧠 1. Asisten AI Edukasi "Alters" & Copilot Percakapan
- **Gemini 3.8 Flash Engine**: Pemrosesan ultra-cepat tanpa artificial delay, hemat kuota token, dan ramah resource (cocok untuk VPS maupun Termux).
- **Pemahaman Konteks & Slang Mahasiswa**: Paham bahasa santai, istilah akademik (*basdat, matdis, alpro, jarkom, rpl*), dan kondisi kelas (*dosen kosong, diundur, cancel, ngaret, dimajuin*).
- **Autonomous Action Execution**: AI tidak hanya membalas teks, tetapi bisa langsung mengeksekusi aksi database (mencatat tugas, menandai tugas selesai tanpa perlu ID, atau membuat pengingat custom) cukup dari obrolan santai!
- **Sistem Memori Ganda**:
  - *Short-Term Session (10 menit)*: Menyimpan alur percakapan per pengguna agar obrolan tetap nyambung.
  - *Long-Term Facts (`memory_facts.json`)*: Mengingat fakta permanen tentang pengguna (nama panggilan, kelas, preferensi belajar).
- **Multimodal Vision & Dokumen**: Kirim foto pengumuman, modul kuliah, atau PDF, Alters akan membaca dan merangkumnya secara rapi.

### 📝 2. Manajemen Tugas & Deadline Fleksibel
- **Cloud Database (Supabase PostgreSQL)** dengan *automatic local fallback* (`tasks.json`) jika internet terganggu.
- **Multi-Class Support**: Mendukung pemisahan tugas Kelas A, Kelas B, maupun Kelas Internasional.
- **Penyelesaian Fleksibel (ID-Free)**: Bisa menandai tugas selesai memakai ID (`!tugas done 5`) maupun langsung menyebut nama mata kuliah/tugas ke AI (`/ai tugas phonetik udah kelar ya`).
- **Batch Processing**: Mampu memproses banyak tugas sekaligus dari satu pengumuman panjang tanpa format yang kaku.

### ⏰ 3. Custom Reminder Engine (DM / Grup / Saluran)
- Buat pengingat kustom untuk deadline tugas atau kegiatan organisasi kapan saja.
- **Target Pengiriman Fleksibel**:
  - `ke gw` / `me` / `dm`: Notifikasi dikirimkan langsung ke nomor pribadi Anda via pesan pribadi (DM).
  - `grup`: Notifikasi dikirimkan ke grup obrolan terkait.
  - `saluran`: Notifikasi disiarkan ke saluran WhatsApp (`@newsletter`).
- Didukung juga oleh pembuat jadwal otomatis via AI (`/ai ingatkan gw besok jam 8 malam kumpul kuis`).

### 📊 4. Polling Kehadiran Dosen & Polling Bebas
- **Saluran (`@newsletter`) & Grup (`@g.us`) Dual-Mode**:
  - Polling native interaktif untuk obrolan grup.
  - *Smart Fallback*: Jika server Saluran WhatsApp menolak polling native, bot otomatis mengonversinya menjadi *Fallback Polling Teks Interaktif* berformat rapi.
- **All-in-One Mode (`!all` / `!pollall`)**: Menggabungkan seluruh daftar dosen hari ini dalam 1 polling ringkas.

### 📅 5. OCR Scanner & Manajemen Jadwal Kuliah
- `!scanjadwal`: Kirim foto tabel jadwal kuliah, AI akan langsung mengekstrak jam, mata kuliah, dan ruangan secara otomatis.
- Editor jadwal dinamis: `!gantijam`, `!gantiruang`, dan `!kosong` / `!batal`.

### 📢 6. Multi-Channel Broadcast & Cron Otomatis
- Kirim rekap agenda harian otomatis setiap pagi (pukul 07:00 WIB) ke seluruh saluran dan grup terdaftar.
- Dukungan kirim siaran terarah (`!send 1`, `!send saluran`, `!send grup`, `!send sini`, atau `!bc <target> <pesan>`).

### 🛡️ 7. Keamanan Grup & Anti-Spam
- Pembatasan perintah pengelolaan tugas/jadwal khusus Admin grup (`groupSecurity.adminOnlyManagement`).
- Cooldown anti-spam untuk mencegah bot di-*flood*.

---

## 🚀 Panduan Cepat untuk Kolaborator (Quickstart)

Bagi kolaborator yang baru saja diundang ke repositori ini, ikuti langkah berikut untuk menjalankan bot di komputer/server lokal Anda:

### 1. Prasyarat Sistem
- **Node.js**: Versi `20.x` atau `22.x` ([Unduh di nodejs.org](https://nodejs.org/))
- **Git**: Terpasang di sistem ([Unduh di git-scm.com](https://git-scm.com/))

### 2. Clone Repositori
```bash
git clone https://github.com/QaisYudha-Pr/SLINF26.git
cd SLINF26
```

### 3. Install Dependensi
```bash
npm install
```

### 4. Buat File Konfigurasi (`config.json`)
Duplikasi file contoh konfigurasi `config.example.json` menjadi `config.json`:
```bash
# Di Windows PowerShell:
Copy-Item config.example.json config.json

# Di Linux / macOS / Git Bash:
cp config.example.json config.json
```

Buka `config.json` di text editor (VS Code, Notepad, dll.) dan lengkapi pengaturannya:
1. Masukkan nomor WhatsApp Anda pada `ownerNumbers` (format: `"628xxxxxxxxxx"`).
2. Masukkan API Key Gemini Anda pada `geminiApiKey` (lihat bagian cara mendapatkan API Key di bawah).

### 5. Dapatkan API Key Gemini (Gratis)
1. Buka [Google AI Studio](https://aistudio.google.com/).
2. Login menggunakan akun Google Anda.
3. Klik tombol **Get API key** lalu klik **Create API key in new project**.
4. Salin kunci API yang didapat dan tempelkan ke `geminiApiKey` di file `config.json`.

### 6. Jalankan Bot
```bash
npm start
# atau
node index.js
```
Terminal akan menampilkan **QR Code WhatsApp**. Buka aplikasi WhatsApp di HP Anda:
> **Setelan / Titik Tiga (kanan atas)** ➡️ **Perangkat Tertaut (Linked Devices)** ➡️ **Tautkan Perangkat** ➡️ **Scan QR Code di terminal**.

Setelah tersambung, bot akan membuat sesi login di folder `session_auth/` dan siap digunakan!

---

## 🔒 Keamanan & Variabel Lingkungan (Security Guide)

> [!CAUTION]
> **JANGAN PERNAH MENGUNGGAH / MELAKUKAN COMMIT PADA FILE YANG BERISI KREDENSIAL ATAU API KEY KE GITHUB!**

Untuk menjaga keamanan proyek:
1. **File `config.json` dan `.env` sudah masuk ke `.gitignore`** dan **TIDAK AKAN** terunggah ke repositori GitHub publik/privat.
2. **Jangan pernah meng-hardcode** token API Gemini, JWT Supabase, atau nomor pribadi Anda langsung di dalam kode program JavaScript (`.js`). Selalu gunakan `configManager` atau variabel lingkungan `process.env`.
3. File `custom_reminders.json`, riwayat sesi `memory_sessions.json`, dan kredensial WhatsApp `session_auth/` juga diabaikan oleh Git agar data pribadi tidak bocor saat Anda push commit baru.
4. Jika ingin membagikan format konfigurasi baru, perbarui file template **`config.example.json`** hanya dengan nilai placeholder dummy (`YOUR_API_KEY_HERE`).

---

## ⚙️ Struktur Konfigurasi (`config.json`)

Berikut adalah penjelasan setiap baris konfigurasi yang tersedia:

```json
{
  "prefix": "!",
  "ownerNumbers": [
    "6281234567890"
  ],
  "targetJids": [
    "12036302xxxxxxxxx@newsletter",
    "12036304xxxxxxxxx@g.us"
  ],
  "autoSend": {
    "enabled": false,
    "cronTime": "0 7 * * *",
    "timezone": "Asia/Jakarta"
  },
  "defaultLecturers": [
    "Frau Woro",
    "Frau Wisma",
    "Frau Lita",
    "Herr Agus"
  ],
  "geminiApiKey": "YOUR_GEMINI_API_KEY_HERE",
  "geminiModel": "models/gemini-3.8-flash",
  "supabase": {
    "url": "https://YOUR_PROJECT_ID.supabase.co",
    "anonKey": "YOUR_SUPABASE_ANON_KEY"
  },
  "reminder": {
    "enabled": true,
    "cronTime": "0 19 * * *",
    "timezone": "Asia/Jakarta"
  },
  "groupSecurity": {
    "adminOnlyManagement": true,
    "cooldownSeconds": 3
  }
}
```

| Parameter | Deskripsi |
| :--- | :--- |
| `prefix` | Awalan perintah teks bot (default: `!`). |
| `ownerNumbers` | Array nomor WhatsApp pemilik bot berhak penuh (format: `628...`). |
| `targetJids` | Daftar ID Saluran (`@newsletter`) dan Grup (`@g.us`) tujuan siaran harian. |
| `autoSend` | Pengaturan cron siaran otomatis rekap pagi (07:00 WIB). |
| `defaultLecturers` | Daftar dosen default untuk polling presensi harian `!all`. |
| `geminiApiKey` | Kunci API Google Gemini (AI Studio). |
| `geminiModel` | Model AI yang digunakan (Rekomendasi: `models/gemini-3.8-flash`). |
| `supabase` | Kredensial URL & Anon Key Supabase untuk sinkronisasi database cloud tugas (opsional). |
| `reminder` | Pengingat rekap tugas otomatis harian (default: 19:00 WIB). |
| `groupSecurity.adminOnlyManagement` | Jika `true`, hanya admin grup yang bisa menambah/menghapus tugas dan mengubah jadwal di grup. |
| `groupSecurity.cooldownSeconds` | Jeda anti-spam per pengguna (dalam detik). |

---

## 🗄️ Skema Database Supabase (Opsional)

Jika Anda ingin mengaktifkan sinkronisasi database cloud PostgreSQL Supabase untuk fitur tugas kuliah:
1. Buat project gratis di [supabase.com](https://supabase.com/).
2. Buka **SQL Editor** di Dashboard Supabase Anda, lalu jalankan query berikut:

```sql
CREATE TABLE IF NOT EXISTS public.tasks (
    id BIGSERIAL PRIMARY KEY,
    kelas VARCHAR(10) NOT NULL DEFAULT 'B',
    matkul VARCHAR(100) NOT NULL,
    judul TEXT NOT NULL,
    deadline VARCHAR(100) NOT NULL,
    selesai BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_tasks_kelas_selesai ON public.tasks (kelas, selesai);
```

3. Masukkan `Project URL` dan `anon/public key` ke bagian `supabase` di file `config.json`.
4. *Catatan*: Jika Supabase tidak diatur, bot akan secara otomatis menyimpan seluruh tugas ke file lokal `tasks.json`.

---

## 📋 Daftar Perintah Lengkap (Command Manual)

### 🤖 1. AI Alters & Obrolan Pintar
| Perintah / Format | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!ai <pertanyaan>` atau `/ai <pesan>` | `/ai jelasin perbedaan Fonem dan Alofon` | Mengajukan pertanyaan akademik/santai ke Alters. |
| `@bot [pesan]` | `@bot bantuin cari ide judul artikel dong` | Memanggil AI langsung di grup tanpa prefiks. |
| *Reply pesan bot* | *Swipe reply:* `bisa kasih contohnya?` | Melanjutkan konteks obrolan sebelumnya secara langsung. |
| `!ingat` | `!ingat` | Melihat daftar hal yang diingat Alters tentang Anda. |
| `!lupakan [topik]` | `!lupakan hobi main game` | Menghapus catatan fakta memori jangka panjang tertentu. |
| `!reset` | `!reset` | Me-reset sesi percakapan 10 menit saat ini. |

### 📝 2. Manajemen Tugas Kuliah
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!tugas` | `!tugas` atau `!tugas b` | Menampilkan seluruh tugas aktif belum selesai. |
| `!tugas tambah <kelas> \| <matkul> \| <judul> \| <deadline>` | `!tugas tambah B \| Statistik \| Latihan Uji T \| Sabtu, 17 Okt` | Menambahkan tugas baru secara manual. |
| `!tugas done <id atau nama matkul>` | `!tugas done 5` atau `!tugas done Statistik` | Menandai tugas sebagai selesai. |
| `!tugas hapus <id>` | `!tugas hapus 3` | Menghapus tugas dari database. |
| `/ai catat tugas ...` *(Bahasa Alami)* | `/ai catat tugas pancasila artikel deadline minggu depan kelas B` | Alters akan mendeteksi dan menyimpan tugas otomatis! |
| `/ai tugas ... kelar` *(Bahasa Alami)* | `/ai tugas literasi digital udah selesai` | Alters langsung mencari dan menandai tugas selesai! |

### ⏰ 3. Custom Reminder (Pengingat Deadline & Acara)
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!ingatkan <YYYY-MM-DD HH:mm> \| <pesan> [\| target]` | `!ingatkan 2026-10-14 20:00 \| Kumpul kuis Phonetik \| ke gw` | Membuat alarm pengingat. Target: `ke gw` / `grup` / `saluran`. |
| `/ai ingatkan gw ...` *(Bahasa Alami)* | `/ai ingatkan gw besok jam 7 pagi bawa laptop` | Alters otomatis menghitung tanggal/jam dan menyetel alarm. |
| `!listpengingat` | `!listpengingat` | Melihat seluruh daftar pengingat yang sedang aktif dan terjadwal. |
| `!hapuspengingat <ID>` | `!hapuspengingat 1` | Membatalkan pengingat terjadwal. |

### 📊 4. Polling & Presensi
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!all` / `!pollall` | `!all` | Membuat polling presensi kehadiran dosen hari ini. |
| `!dosen <nama>` | `!dosen Frau Woro` | Membuat polling kehadiran untuk dosen tertentu. |
| `!poll Judul \| Opsi 1 \| Opsi 2` | `!poll Tempat Makrab? \| Batu \| Trawas \| Pacet` | Membuat polling kustom pilihan ganda. |
| `!listdosen` | `!listdosen` | Menampilkan daftar nama dosen default. |

### 📅 5. Jadwal Perkuliahan & OCR
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!today` / `!hariini` | `!hariini` | Melihat jadwal kuliah hari ini. |
| `!jadwal [hari] [kelas]` | `!jadwal senin b` | Melihat jadwal spesifik hari dan kelas tertentu. |
| `!scanjadwal` *(Kirim/Reply Foto)* | Kirim foto jadwal dengan caption `!scanjadwal` | Mengekstrak jadwal dari foto menggunakan Vision AI. |
| `!gantijam <matkul> \| <jam>` | `!gantijam Basdat \| 10.00 - 12.30` | Mengubah jam kuliah hari ini. |
| `!gantiruang <matkul> \| <ruang>` | `!gantiruang Alpro \| Lab Komputer 2` | Mengubah ruangan kuliah hari ini. |
| `!batal <matkul>` / `!kosong` | `!batal Pancasila` | Menandai kuliah ditiadakan/kosong. |

### 📢 6. Siaran & Manajemen Saluran (Broadcast)
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!send` | `!send` | Mengirim pesan template harian ke seluruh target terdaftar. |
| `!send <nomor>` | `!send 1` atau `!send 1,2` | Mengirim template hanya ke nomor indeks target tertentu. |
| `!send saluran` / `!send grup` | `!send saluran` | Mengirim template ke seluruh saluran atau seluruh grup saja. |
| `!send sini` | `!send sini` | Mengirim template langsung ke ruang chat saat ini. |
| `!bc <target> <pesan>` | `!bc saluran Pengumuman: Kuliah jam 10 kosong` | Siaran teks bebas ke target tertentu. |
| `!targets` | `!targets` | Menampilkan daftar nomor indeks dan nama target terdaftar. |
| `!id` | `!id` | Melihat JID ruang obrolan saat ini (grup/saluran). |
| `!addtarget <JID>` | `!addtarget 12036302xxxxxxxxx@newsletter` | Mendaftarkan target siaran baru. |
| `!addlink <link>` | `!addlink https://whatsapp.com/channel/xxx` | Mendaftarkan saluran via tautan invite WhatsApp. |
| `!deltarget <JID>` | `!deltarget 12036302xxxxxxxxx@newsletter` | Menghapus saluran/grup dari daftar siaran. |
| `!autosend <on/off>` | `!autosend on` | Mengaktifkan/mematikan siaran harian otomatis (07:00 WIB). |

### 👥 7. Fitur Admin Grup
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!tagall [pesan]` | `!tagall Tolong kumpul sekarang ya!` | Memanggil seluruh anggota grup dengan daftar mention. |
| `!hidetag [pesan]` | `!hidetag Link zoom ujian sudah dikirim` | Mengirim notifikasi senyap (*silent mention*) ke semua anggota. |

### ⚙️ 8. Diagnostik, Pemeliharaan & Status Sistem
| Perintah | Contoh Penggunaan | Penjelasan |
| :--- | :--- | :--- |
| `!test` / `!selftest` / `!diag` / `!status` | `!test` | Menjalankan uji mandiri seluruh subsistem bot & menampilkan saran solusi otomatis. |
| `!checkupdate` | `!checkupdate` | Memeriksa apakah ada commit pembaruan baru di GitHub. |
| `!update` | `!update` | Melakukan `git pull` dan me-restart bot secara otomatis. |
| `!restart` | `!restart` | Me-restart proses bot secara bersih. |

---

## 🩺 Sistem Self-Testing & Auto-Diagnostic

Bot dilengkapi dengan modul pengujian mandiri (*self-healing & diagnostics*) untuk mendeteksi subsistem yang bermasalah secara dini:

1. **Pengujian Mandiri via Terminal (Sebelum Scan QR)**:
   ```bash
   npm test
   # atau
   node test.js
   ```
   Fitur ini sangat berguna untuk **kolaborator yang baru clone repo**: langsung ketahuan apakah API Key Gemini aktif, tabel Supabase terbaca, dan izin disk aman.

2. **Pengujian Langsung via WhatsApp**:
   Ketik `!test` atau `!status` di chat pribadi maupun grup. Bot akan mengirimkan kartu laporan komprehensif:
   - 🟢 Status Google Gemini AI (Model & Latency ms)
   - 🟢 Status Cloud Database Supabase & jumlah tugas aktif
   - 🟢 Status Disk I/O & Memori Jangka Panjang
   - 🟢 Status Custom Reminders Engine
   - 🟢 Status Koneksi WhatsApp & Target Siaran
   - 🛠️ **Saran Solusi Otomatis** jika ada modul yang berstatus 🟡 *WARNING* atau 🔴 *FAIL*.

3. **Startup Health Check**:
   Setiap kali bot menyala, bot secara otomatis memverifikasi semua subsistem di latar belakang. Jika ada masalah kritis (misalnya API Key salah), terminal akan menampilkan banner peringatan instan.

---

## 💬 Contoh Interaksi Natural Alters AI

Alters dirancang untuk mengenali maksud percakapan tanpa harus terikat perintah kaku:

### 1. Mencatat Banyak Tugas Sekaligus (Batch)
> **User:** `/ai Alters, tolong catatin tugas kelas B ya: Pancasila bikin artikel deadline minggu depan, terus Literasi Digital infografis deadline 22 Oktober, sama Statistik tugas & UTS deadline Sabtu 17 Oktober.`  
> **Alters:** `Siap, udah Alters catat dan masukin semua tugas Kelas B ke database ya! 🫡📝 Berikut daftarnya...` *(Semua tugas otomatis tersimpan di Supabase)*

### 2. Menandai Tugas Selesai Tanpa ID
> **User:** `/ai Alters, tugas literasi digital yang infografis udah kelar nih.`  
> **Alters:** `Mantap! Tugas Literasi Digital: Infografis UTS (Kelas B) udah Alters tandai selesai ya. Good job! 🎉`

### 3. Menyetel Pengingat Pribadi (DM)
> **User:** `/ai ingatkan gw besok jam 7 malam kuis phonetik ya`  
> **Alters:** `Siap! Pengingat berhasil dibuat: "Kuis phonetik" dijadwalkan pada 2026-10-14 19:00:00 dan akan Alters kirimkan via chat pribadi (DM). ⏰✨`

---

## 🖥️ Menjalankan di Latar Belakang (Background Service)

### Di Windows (Tanpa Jendela Terminal Terbuka)
Gunakan skrip VBScript yang telah disediakan:
1. Klik ganda pada file [`start-background.vbs`](file:///c:/WiraSBY/coding-bot-wa/start-background.vbs).
2. Bot akan berjalan di latar belakang secara hening (*silent background process*).
3. Log output dapat dicek di file `bot.log`.
4. Untuk menghentikan proses, buka **Task Manager** dan akhiri proses `Node.js`.

### Di Linux / VPS (Menggunakan PM2)
```bash
npm install -g pm2
pm2 start index.js --name "alters-bot"
pm2 save
pm2 startup
```

---

## ❓ Troubleshooting & FAQ

**Q: Mengapa bot tidak merespon saat di-mention di grup?**  
> Pastikan nomor WhatsApp bot sudah tersambung dan Anda melakukan mention pada bot (`@bot`) atau menggunakan prefiks yang sesuai (`!ai`). Pastikan juga bot bukan dalam masa cooldown anti-spam.

**Q: Bagaimana jika polling di Saluran WhatsApp gagal dikirim?**  
> Alters memiliki sistem cerdas: jika server Saluran membatasi pembuatan polling native, bot akan otomatis mengirimkan *Fallback Polling Teks Interaktif* berformat rapi yang tetap mudah dibaca oleh anggota saluran.

**Q: Apakah API Key saya aman jika saya berkontribusi di GitHub?**  
> **Sangat aman**, asalkan Anda menyimpan API Key di `config.json` (atau `.env`). File tersebut sudah terdaftar di `.gitignore` dan tidak akan pernah ter-commit atau terdorong ke GitHub.

---

## 👨‍💻 Kontribusi & Kolaborasi

Tarik *pull request* (PR) atau buat *issue* baru jika Anda menemukan kendala atau memiliki ide fitur baru!  
Pastikan selalu menguji kode secara lokal dengan `node index.js` sebelum melakukan commit.

*Dikelola dengan ❤️ untuk kemudahan akademik bersama.*
