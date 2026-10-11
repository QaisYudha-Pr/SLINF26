# 🤖 Bot WhatsApp Template Pesan Harian Saluran & Grup

Bot WhatsApp otomatis menggunakan **Node.js** dan **@whiskeysockets/baileys** untuk mengirim template pesan list harian (agenda, update, checklist, pengumuman) ke **Saluran WhatsApp (Channel)** maupun **Grup WhatsApp**.

---

## ✨ Fitur Utama

- 📅 **Template List Harian Terstruktur**: Disediakan template untuk setiap hari (Senin s/d Minggu) dengan format rapi (judul, tanggal, jam, poin checklist/agenda, dan footer).
- 📢 **Dukungan Saluran (Channel / Newsletter) & Grup**: Bisa mengirim pesan ke Saluran WhatsApp resmi (`@newsletter`) dan Grup (`@g.us`).
- ⏰ **Penjadwal Otomatis (Cron)**: Mengirim pesan template harian otomatis pada jam tertentu (misal: setiap pukul 07:00 WIB).
- 🔍 **Deteksi Otomatis ID Saluran**: Cukup teruskan (forward) pesan dari Saluran ke bot, bot akan langsung mendeteksi ID Saluran Anda!
- 💬 **Kontrol Penuh via Chat**: Admin dapat mengontrol bot via pesan WhatsApp tanpa perlu restart server.
- 🔄 **Auto Reconnect & Multi-Session**: Sesi login tersimpan aman di folder `session_auth/`.

---

## 🚀 Cara Menjalankan Bot

### 1. Prasyarat
- **Node.js** versi 18 ke atas (Direkomendasikan v20+)

### 2. Jalankan Bot
Buka terminal di folder project ini:
```bash
npm start
```

### 3. Scan QR Code
1. Pada terminal akan muncul tampilan **QR Code**.
2. Buka aplikasi **WhatsApp** di smartphone Anda.
3. Masuk ke **Menu Titik Tiga** (Android) atau **Pengaturan** (iOS) > **Perangkat Tertaut** (Linked Devices) > **Tautkan Perangkat**.
4. Arahkan kamera HP ke QR Code yang muncul di terminal.
5. Setelah terhubung, status di terminal akan berubah menjadi:
   `✅ [WA] BERHASIL TERHUBUNG KE WHATSAPP!`

---

## 🎯 Cara Menemukan ID Saluran (Channel) atau ID Grup

### Cara 1: Menggunakan Saluran WhatsApp (Channel)
1. Buka Saluran WhatsApp Anda.
2. **Teruskan (Forward)** salah satu pesan dari saluran tersebut ke nomor bot.
3. Bot akan membalas otomatis:
   ```
   📢 Terdeteksi Pesan dari Saluran WhatsApp!
   • Nama Saluran: Info Saluran Kita
   • JID Saluran: 12036302xxxxxxxxx@newsletter
   ```
4. Salin ID tersebut dan jadikan target dengan perintah:
   `!addtarget 12036302xxxxxxxxx@newsletter`

### Cara 2: Menggunakan Grup WhatsApp
1. Masukkan bot ke dalam grup.
2. Di dalam grup, ketik:
   `!id`
3. Bot akan membalas ID grup (berakhiran `@g.us`).
4. Daftarkan dengan:
   `!addtarget <ID_GRUP>`

---

## 📋 Daftar Perintah (Commands) Bot

Semua perintah diawali dengan prefiks `!` (dapat diubah di `config.json`):

| Perintah | Deskripsi |
| :--- | :--- |
| `!menu` / `!help` | Menampilkan panduan dan daftar lengkap perintah bot |
| `!today` / `!hariini` | Melihat pratinjau (preview) template pesan hari ini |
| `!preview <hari>` | Melihat template untuk hari tertentu (contoh: `!preview senin`) |
| `!send` | Mengirim pesan template hari ini langsung ke semua target saluran/grup |
| `!send <hari>` | Mengirim pesan template hari tertentu ke semua target |
| `!sendto <jid> [hari]` | Mengirim template ke satu ID target tertentu |
| `!id` | Menampilkan ID / JID chat tempat perintah diketik |
| `!targets` | Melihat daftar semua saluran / grup yang sudah didaftarkan |
| `!addtarget <jid>` | Mendaftarkan saluran / grup baru ke daftar pengiriman |
| `!deltarget <jid>` | Menghapus saluran / grup dari daftar pengiriman |
| `!list` | Menampilkan daftar template hari yang tersedia |
| `!additem <hari> <teks>` | Menambahkan 1 baris item/tugas ke hari tertentu |
| `!delitem <hari> <nomor>` | Menghapus 1 baris item dari hari tertentu |
| `!autosend on [jam:menit]` | Mengaktifkan kirim otomatis (contoh: `!autosend on 07:00`) |
| `!autosend off` | Mematikan pengiriman otomatis |
| `!status` | Mengecek status bot, jam kirim, dan tujuan aktif |

---

## ⚙️ Konfigurasi (`config.json`)

Anda juga bisa mengatur konfigurasi secara langsung melalui file [config.json](file:///c:/WiraSBY/coding-bot-wa/config.json):

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
    "enabled": true,
    "cronTime": "0 7 * * *",
    "timezone": "Asia/Jakarta"
  }
}
```

- **`prefix`**: Simbol awal perintah (default `!`).
- **`ownerNumbers`**: Daftar nomor WhatsApp admin yang berhak mengeksekusi perintah.
- **`targetJids`**: Daftar ID Saluran (`@newsletter`) atau Grup (`@g.us`) tujuan pesan.
- **`autoSend.enabled`**: Set `true` untuk mengaktifkan pengiriman otomatis setiap hari.
- **`autoSend.cronTime`**: Jadwal cron (default `"0 7 * * *"` untuk setiap hari pukul 07:00 pagi WIB).
- **`autoSend.timezone`**: Zona waktu (default `"Asia/Jakarta"`).

---

## 📝 Kustomisasi Template List (`templates.json`)

Buka file [templates.json](file:///c:/WiraSBY/coding-bot-wa/templates.json) untuk mengubah template tiap hari.

Setiap template mendukung variabel otomatis:
- `{hari}` : Nama hari (misal: *Senin*)
- `{tanggal}` : Tanggal lengkap (misal: *11 Oktober 2026*)
- `{jam}` : Jam saat ini (misal: *07:00 WIB*)
- `{waktu}` : Tanggal dan jam lengkap
