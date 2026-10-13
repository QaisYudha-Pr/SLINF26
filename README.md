# 🤖 SLINF26 - WhatsApp Smart Academic & Channel Bot

Bot WhatsApp asisten akademik dan manajemen saluran/grup berbasis **Node.js** dan **@whiskeysockets/baileys**, ditenagai oleh **Google Gemini AI (3.8 Flash)** dengan memori kontekstual cerdas, sistem polling kehadiran otomatis, integrasi tugas kuliah, serta penjadwalan siaran harian.

---

## ✨ Fitur Utama

### 🧠 1. Asisten AI Edukasi & Copilot Percakapan
- **Gemini 3.8 Flash Engine**: Cepat, responsif, dan hemat sumber daya untuk dijalankan di Termux maupun VPS.
- **Kamus Slang & Bahasa Mahasiswa**: Paham bahasa gaul kampus, istilah kehadiran (*cancel*, *kosong*, *diundur*, *ngaret*, *dimajuin*), dan singkatan matkul (*Basdat*, *Matdis*, *Jarkom*, *Alpro*, *RPL*, *DFA*, *KRS*).
- **Memori Sesi 10 Menit**: Mengingat topik percakapan selama 10 menit jeda obrolan, lalu otomatis di-reset agar topik antar pengguna tidak saling tumpang tindih.
- **Memori Jangka Panjang Permanen**: AI dapat mengingat nama panggilan, kelas, atau preferensi pengguna secara permanen (`memory_facts.json`).
- **Analisis Multimodal (Foto & Dokumen)**: Kirim foto jadwal kuliah, PDF pengumuman, atau materi latihan, bot akan membaca dan merangkumnya secara terstruktur.

### 📊 2. Polling Kehadiran Dosen & Polling Bebas
- **Saluran (`@newsletter`) & Grup (`@g.us`) Ready**:
  - Di grup: Mengirim polling interaktif native Baileys.
  - Di Saluran WhatsApp: Mengirim polling native, dan secara otomatis beralih ke *Fallback Polling Teks Interaktif* berformat rapi jika server WhatsApp membatasi polling native di saluran.
- **Mode All-in-One**: Menggabungkan seluruh daftar dosen dalam satu polling ringkas agar tidak membanjiri ruang obrolan.
- **Perintah Cepat**: `!all`, `!pollall`, `!dosen <nama>`, atau `!poll Pertanyaan | Opsi 1 | Opsi 2`.

### 👥 3. Interaksi Grup & Hak Admin
- **Trigger Bebas (@mention & Quote Reply)**: Cukup mention bot `@bot` atau lakukan swipe-reply ke pesan bot di dalam grup untuk langsung berinteraksi tanpa harus mengetik prefiks.
- **Pemanggilan Anggota (Admin Feature)**:
  - `!tagall [pesan]` / `@bot tagall`: Memanggil seluruh anggota grup dengan daftar mention.
  - `!hidetag [pesan]` / `@bot hidetag`: Mengirim pengumuman penting (*silent tag*) ke semua anggota tanpa membebani teks obrolan.

### 📅 4. Manajemen Jadwal Kuliah & Database Tugas
- **Multi-Kelas**: Mendukung jadwal perkuliahan Kelas A, B, dan Internasional.
- **Database Tugas Terpusat**: Sinkronisasi tugas deadline kuliah berbasis Supabase Cloud.
- **OCR Scan Jadwal**: Cukup kirim foto jadwal perkuliahan dengan perintah `!scanjadwal`, bot akan otomatis mengekstrak jam, mata kuliah, ruangan, dan menyimpannya.

### ⏰ 5. Penjadwalan Siaran Otomatis (Cron Broadcast)
- Mengirim rekap agenda, jadwal kuliah hari ini, dan reminder tugas setiap pagi secara otomatis ke seluruh target saluran dan grup terdaftar.

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Prasyarat
- **Node.js** v20 atau v22+
- **Git**

### 2. Clone & Install Dependensi
```bash
git clone https://github.com/QaisYudha-Pr/SLINF26.git
cd SLINF26
npm install
```

### 3. Konfigurasi (`config.json`)
Atur nomor Owner dan API Key Gemini Anda di file `config.json`:
```json
{
  "prefix": "!",
  "ownerNumbers": [
    "6281234567890"
  ],
  "geminiApiKey": "AIzaSy...",
  "targetJids": [
    "12036302xxxxxxxxx@newsletter",
    "12036304xxxxxxxxx@g.us"
  ],
  "autoSend": {
    "enabled": true,
    "cronTime": "0 7 * * *",
    "timezone": "Asia/Jakarta"
  }
}
```

### 4. Menjalankan Bot
```bash
npm start
```
Scan kode QR yang muncul di terminal menggunakan menu **Perangkat Tertaut (Linked Devices)** di aplikasi WhatsApp Anda.

---

## 📋 Daftar Perintah Utama (Cheat Sheet)

### 🤖 AI & Memori
| Perintah | Deskripsi |
| :--- | :--- |
| `!ai <pertanyaan>` | Tanya jawab materi kuliah, tugas, atau bahasa santai |
| `!ingat` | Menampilkan apa saja yang diingat AI tentangmu |
| `!lupakan [topik]` | Menghapus catatan memori jangka panjang tertentu |
| `!reset` | Me-reset sesi percakapan 10 menit saat ini |

### 📊 Polling & Presensi
| Perintah | Deskripsi |
| :--- | :--- |
| `!all` / `!pollall` | Buat polling kehadiran seluruh dosen hari ini |
| `!dosen <nama>` | Buat polling kehadiran untuk satu dosen spesifik |
| `!poll Judul \| Opsi 1 \| Opsi 2` | Buat polling kustom pilihan ganda / tunggal |
| `!listdosen` | Melihat daftar nama dosen perkuliahan |

### 👥 Grup & Komunitas
| Perintah | Deskripsi |
| :--- | :--- |
| `@bot [tanya/perintah]` | Panggil bot langsung di grup tanpa prefiks |
| `!tagall [pesan]` | Mention seluruh anggota grup dengan daftar nomor |
| `!hidetag [pesan]` | Notifikasi seluruh anggota grup secara tersembunyi |

### 📚 Akademik & Jadwal
| Perintah | Deskripsi |
| :--- | :--- |
| `!today` / `!hariini` | Jadwal perkuliahan hari ini |
| `!jadwal [hari] [kelas]` | Cek jadwal (contoh: `!jadwal senin a`) |
| `!tugas` | Cek daftar tugas dan deadline aktif |
| `!scanjadwal` (kirim foto) | Ekstrak jadwal dari foto/dokumen |

### 👑 Pengaturan Cepat Jadwal & Pembaruan (Admin)
| Perintah | Deskripsi |
| :--- | :--- |
| `!gantijam <matkul> \| <jam>` | Ubah jam perkuliahan & langsung tampilkan kartu jadwal baru |
| `!gantiruang <matkul> \| <ruang>` | Pindah ruangan perkuliahan & auto preview jadwal |
| `!batal <matkul>` / `!kosong` | Tandai mata kuliah batal/kosong hari ini |
| `!checkupdate` | Cek commit pembaruan dari GitHub tanpa me-restart bot |
| `!update` | Unduh pembaruan lengkap dari GitHub & auto-restart |

### ⚙️ Sistem & Target Saluran
| Perintah | Deskripsi |
| :--- | :--- |
| `!id` | Melihat JID obrolan saat ini (grup/saluran/chat) |
| `!targets` | Menampilkan seluruh target broadcast aktif |
| `!addtarget <JID>` | Mendaftarkan saluran/grup ke daftar siaran |
| `!deltarget <JID>` | Menghapus saluran/grup dari daftar siaran |
| `!status` | Cek status bot, koneksi database, dan cron |
| `!restart` | Me-restart bot secara aman (Khusus Owner) |

---

## 🛡️ Stabilitas & Self-Healing
Proyek ini dilengkapi mekanisme:
- **Crash-Loop Guard**: Mencegah terminal Termux terkunci jika terjadi crash berulang.
- **Self-Healing Bootstrap**: Otomatis merekonstruksi modul esensial jika ada file yang hilang saat transfer direktori.
- **Debounced Storage**: Menyimpan memori dan riwayat percakapan secara efisien tanpa membebani I/O disk.
