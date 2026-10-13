# 📖 BUKU PANDUAN LENGKAP PENGGUNAAN
## BOT WHATSAPP TEMPLATE PESAN LIST HARIAN (SALURAN & GRUP)

Selamat datang di buku panduan penggunaan Bot WhatsApp Saluran & Grup. Panduan ini dirancang langkah demi langkah agar Anda dapat dengan mudah mengoperasikan bot dari awal hingga berjalan otomatis setiap hari.

---

## 📑 DAFTAR ISI
1. [BAB 1: Pengenalan Singkat](#bab-1-pengenalan-singkat)
2. [BAB 2: Menghubungkan Bot ke WhatsApp (Scan QR)](#bab-2-menghubungkan-bot-ke-whatsapp-scan-qr)
3. [BAB 3: Menghubungkan Saluran (Channel) atau Grup](#bab-3-menghubungkan-saluran-channel-atau-grup)
4. [BAB 4: Mengatur Jadwal Kirim Otomatis (Auto-Send)](#bab-4-mengatur-jadwal-kirim-otomatis-auto-send)
5. [BAB 5: Menyesuaikan Template Pesan Harian](#bab-5-menyesuaikan-template-pesan-harian)
6. [BAB 6: Ringkasan Lengkap Perintah Chat (Cheat Sheet)](#bab-6-ringkasan-lengkap-perintah-chat-cheat-sheet)
7. [BAB 7: Menjalankan Bot Otomatis Tanpa Terminal](#bab-7-menjalankan-bot-otomatis-tanpa-terminal)
8. [BAB 8: Tanya Jawab & Solusi Kendala (FAQ)](#bab-8-tanya-jawab--solusi-kendala-faq)

---

## BAB 1: Pengenalan Singkat

### Apa Fungsi Bot Ini?
Bot ini bertugas mengirimkan pesan berformat **list/daftar** (seperti agenda kerja, checklist harian, pengumuman, to-do list, atau menu) ke **Saluran WhatsApp (WhatsApp Channel)** atau **Grup WhatsApp**.

### Keunggulan Bot Ini:
- 🗓️ **Template Berbeda Setiap Hari**: Otomatis mengenali hari Senin s/d Minggu beserta tanggal & jam saat pesan dikirim.
- 📢 **Mendukung Saluran Resmi WhatsApp**: Bisa mengirim ke Saluran (Channel/Newsletter) maupun Grup.
- ⏰ **Otomatis Tanpa Ribet**: Bisa dijadwalkan kirim tiap jam tertentu (misal jam 07:00 pagi setiap hari).
- 💬 **Bisa Diatur Lewat Chat**: Anda tidak perlu coding untuk mengubah jadwal atau menambah item list.

---

## BAB 2: Menghubungkan Bot ke WhatsApp (Scan QR)

Agar bot bisa mengirim pesan, Anda perlu menautkan akun WhatsApp Anda ke bot.

### Langkah-langkah:
1. Buka terminal di folder project (`C:\WiraSBY\coding-bot-wa`), lalu jalankan:
   ```bash
   npm start
   ```
2. Di layar terminal akan muncul **gambar QR Code**.
3. Buka aplikasi **WhatsApp di HP Anda**:
   - **Android**: Tekan titik tiga di pojok kanan atas > pilih **Perangkat Tertaut** (*Linked Devices*).
   - **iPhone**: Tekan tab **Pengaturan** (*Settings*) di pojok kanan bawah > pilih **Perangkat Tertaut**.
4. Tekan tombol **Tautkan Perangkat** (*Link a Device*).
5. Arahkan kamera HP ke QR Code yang muncul di layar terminal.
6. Tunggu beberapa detik sampai terminal menampilkan pesan:
   ```text
   ✅ [WA] BERHASIL TERHUBUNG KE WHATSAPP!
   ```

> 🔒 **Catatan Penting:** Anda **hanya perlu scan 1 kali saja**. Kredensial login Anda otomatis tersimpan di folder `session_auth/`, sehingga jika bot dimatikan lalu dinyalakan lagi, bot langsung terhubung tanpa minta scan lagi.

---

## BAB 3: Menghubungkan Saluran (Channel) atau Grup Target

Sebelum bot bisa mengirim siaran atau polling, Anda harus mendaftarkan targetnya. Sekarang sistem pendaftaran sudah **serba otomatis, praktis, dan mengenali nama asli grup/saluran**:

### A. Cara Paling Praktis (Ketik Langsung di Grup / Saluran) ⭐
1. Masukkan bot ke dalam Grup atau jadikan bot Admin di Saluran Anda.
2. Di dalam ruang obrolan grup/saluran tersebut, cukup ketik:
   ```text
   !addtarget
   ```
3. Bot akan otomatis membaca nama asli obrolan dan langsung mendaftarkannya sebagai target siaran resmi!

---

### B. Menggunakan Tautan / Link Undangan:

#### 1. Untuk Grup WhatsApp (Auto-Join & Auto-Daftar) 👥
Anda tidak perlu repot memasukkan nomor bot manual ke kontak. Cukup kirim perintah ini di chat pribadi bot:
```text
!addtarget https://chat.whatsapp.com/AbCdEf123456789
```
*Bot akan memeriksa tautan, otomatis bergabung (join) ke dalam grup, dan mendaftarkannya ke database target!*

#### 2. Untuk Saluran WhatsApp (Channel) 📢
Salin tautan saluran Anda, lalu kirimkan ke bot:
```text
!addtarget https://whatsapp.com/channel/0029Vbxxxxxxxxxxxx
```
*Bot akan memverifikasi nama saluran dan mendaftarkannya.*

---

### C. Mengecek Target yang Sudah Terdaftar (`!targets`)
Ketik perintah ini di WhatsApp:
```text
!targets
```
Bot akan menampilkan daftar target lengkap dengan **nama aslinya dan tipe target**:
```text
╭───「 📋 DAFTAR TARGET SIARAN AKTIF (2) 」
╰──────────────────────────

*1.* 👥 Grup *SLINF 26 KELAS B*
   └ 120363401569038234@g.us

*2.* 📢 Saluran *Papan Informasi Mahasiswa*
   └ 120363414885615982@newsletter
```

---

### D. Menghapus Target Siaran (`!deltarget`)
Gak perlu lagi menyalin ID angka panjang. Cukup sebutkan nomor urutnya dari daftar `!targets`:
```text
!deltarget 1
```
*(Perintah di atas akan menghapus target nomor 1).* Anda juga tetap bisa menghapus dengan JID jika diinginkan: `!deltarget 120363...@newsletter`.

---

## BAB 4: Mengatur Jadwal Kirim Otomatis (Auto-Send)

Anda bisa menyetel agar pesan list terkirim otomatis setiap hari pada jam tertentu.

### Cara Mengaktifkan:
Kirim perintah ini di WhatsApp:
```text
!autosend on 07:00
```
*(Ganti `07:00` dengan jam yang Anda inginkan, misal `08:00`, `06:30`, dll. Format jam:menit).*

Bot akan membalas konfirmasi bahwa jadwal harian sudah aktif. Mulai hari itu, bot akan otomatis mengirimkan template hari tersebut ke semua saluran/grup target tepat waktu.

### Cara Mematikan:
Jika ingin mematikan kirim otomatis:
```text
!autosend off
```

### Cara Cek Status:
Ketik:
```text
!status
```
Bot akan menampilkan waktu sistem saat ini, status kirim otomatis (aktif/nonaktif), dan jumlah saluran tujuan.

---

## BAB 5: Menyesuaikan Template Pesan Harian

Setiap hari dalam seminggu (Senin s/d Minggu) sudah memiliki template masing-masing di dalam file `templates.json`.

### Cara 1: Mengedit Lewat File `templates.json` (Paling Leluasa)
Buka file `templates.json` di editor Anda. Contoh struktur hari Senin:

```json
"senin": {
  "title": "📋 AGENDA & UPDATE HARIAN - SENIN",
  "header": "Semangat mengawali pekan baru! Berikut ringkasan agenda hari ini:\n📅 Tanggal: {tanggal}\n⏰ Waktu Rilis: {jam}",
  "items": [
    "📌 *Koordinasi:* Review target minggu ini",
    "▫️ *Tugas 1:* Follow up pesan tertunda",
    "▫️ *Tugas 2:* Cek update status pekerjaan",
    "💡 *Catatan:* Fokus pada hal prioritas!"
  ],
  "footer": "━━━━━━━━━━━━━━━━━━━\n📢 Saluran Informasi Resmi"
}
```

**Keterangan:**
- `"title"` : Judul utama pesan.
- `"header"` : Kalimat pembuka.
- `"items"` : Daftar poin list (bisa Anda tambah, kurangi, atau ubah kata-katanya).
- `"footer"` : Kalimat penutup di bagian bawah.

**Variabel Otomatis yang Tersedia:**
- `{hari}` : Otomatis diganti dengan nama hari (misal: *Senin*).
- `{tanggal}` : Otomatis diganti dengan tanggal (misal: *12 Oktober 2026*).
- `{jam}` : Otomatis diganti jam saat rilis (misal: *07:00 WIB*).

---

### Cara 2: Mengedit Lewat Chat WhatsApp (Cepat)
Anda juga bisa mengubah list langsung via chat:
- **Menambah Poin List:**
  ```text
  !additem senin ▫️ *Tugas 3:* Cek stok gudang hari ini
  ```
- **Menghapus Poin List:**
  ```text
  !delitem senin 2
  ```
  *(Angka 2 artinya menghapus baris item nomor 2)*.

---

## BAB 6: Ringkasan Lengkap Perintah Chat (Cheat Sheet)

Ketik perintah-perintah ini di chat WhatsApp dengan awalan tanda seru `!`:

| Perintah | Contoh | Fungsi |
| :--- | :--- | :--- |
| `!menu` | `!menu` | Menampilkan menu bantuan dan daftar panduan |
| `!today` / `!hariini` | `!today` | Melihat jadwal kuliah dan agenda hari ini |
| `!jadwal <kelas> [hari]` | `!jadwal a senin` | Melihat jadwal kuliah Kelas A, B, atau I |
| `!scanjadwal` | `!scanjadwal` *(caption/reply foto)* | Pindai foto jadwal kuliah otomatis dengan AI Vision |
| `!tugas` | `!tugas` atau `!tugas b` | Menampilkan daftar tugas aktif di Cloud Supabase & Lokal |
| `!tugas tambah ...` | `!tugas tambah B \| Alpro \| Latihan \| Jumat` | Menambahkan tugas kuliah baru secara manual |
| `!tugas done <ID/Matkul>` | `!tugas done 8` atau `!tugas done Phonetik` | Menandai tugas telah selesai tanpa harus ingat ID |
| `!tugas hapus <ID>` | `!tugas hapus 3` | Menghapus tugas dari database |
| `!ingatkan ...` | `!ingatkan 2026-10-14 20:00 \| Kuis \| ke gw` | Pasang alarm pengingat (Target: `ke gw`, `grup`, `saluran`) |
| `!listpengingat` | `!listpengingat` | Melihat daftar pengingat yang sedang aktif terjadwal |
| `!hapuspengingat <ID>` | `!hapuspengingat 1` | Membatalkan pengingat terjadwal |
| `!ai <pertanyaan>` | `/ai catat tugas...` atau `!ai jelasin materi...` | Tanya AI Alters (Model Gemini 3.5 Flash-Lite gratis) |
| `@Bot <pertanyaan>` | `@Bot apa jadwal kelas B besok?` | Panggil bot di grup langsung tanpa prefiks |
| `!all` / `!pollall` | `!all` | Polling kehadiran seluruh dosen hari ini (Grup & Saluran) |
| `!dosen <Nama>` | `!dosen Frau Woro` | Polling kehadiran 1 dosen spesifik |
| `!poll <Tanya> \| <Opsi1>...` | `!poll Rapat? \| Masuk \| Cancel` | Membuat polling kustom pilihan ganda / tunggal |
| `!targets` | `!targets` | Melihat semua saluran & grup terdaftar dengan NAMA ASLI |
| `!addtarget` | `!addtarget` *(di dalam grup/saluran)* | Daftarkan grup/saluran ini langsung tanpa perlu link |
| `!addtarget <link/JID>` | `!addtarget https://chat.whatsapp.com/...` | Daftarkan grup (auto-join) atau saluran via tautan |
| `!deltarget <nomor/JID>` | `!deltarget 1` | Menghapus target siaran berdasarkan nomor urut / JID |
| `!send` | `!send` | Kirim template harian ke seluruh target terdaftar |
| `!send <1/2/nomor>` | `!send 1` | Kirim template hanya ke nomor indeks target tertentu |
| `!send saluran` / `grup` | `!send saluran` | Kirim template hanya ke semua Saluran atau semua Grup |
| `!bc <target> <pesan>` | `!bc saluran Kuliah jam 10 kosong` | Siarkan pesan bebas kustom ke target tertentu |
| `!autosend on [jam:menit]` | `!autosend on 07:00` | Mengaktifkan kirim otomatis setiap hari |
| `!autosend off` | `!autosend off` | Mematikan kirim otomatis |
| `!test` / `!status` | `!test` | **Self-Testing:** Uji otomatis seluruh subsistem & solusi |
| `!checkupdate` | `!checkupdate` | Cek commit pembaruan baru dari GitHub |
| `!update` | `!update` | Unduh pembaruan dari GitHub & restart otomatis |
| `!restart` | `!restart` | Me-restart proses bot secara bersih |

---

## BAB 7: Menjalankan Bot Otomatis Tanpa Terminal

Agar Anda **tidak perlu repot membuka terminal dan mengetik `npm start` setiap hari**, ikuti langkah berikut:

### Cara Otomatis Nyala Sendiri Saat Laptop/PC Dinyalakan:
1. Tekan tombol **`Windows + R`** di keyboard.
2. Ketik **`shell:startup`** lalu tekan **Enter**.
3. Di dalam folder yang terbuka, klik kanan > **New** > **Shortcut**.
4. Di kolom isian, masukkan lokasi file ini:
   ```text
   C:\WiraSBY\coding-bot-wa\start-background.vbs
   ```
5. Klik **Next** lalu **Finish**.

> ✨ **Hasilnya:** Setiap kali Anda menyalakan komputer/laptop, bot akan langsung otomatis aktif di latar belakang tanpa memunculkan jendela hitam apa pun.

### Cara Mematikan Bot:
Jika suatu saat Anda ingin mematikan bot, cukup klik dua kali file:
`C:\WiraSBY\coding-bot-wa\stop.bat`

---

## BAB 8: Tanya Jawab & Solusi Kendala (FAQ)

**Q: Apakah nomor saya harus selalu terhubung ke internet?**  
A: Komputer/laptop tempat bot berjalan harus terhubung ke internet. HP Anda tidak harus terus-menerus online setelah scan QR awal berhasil (WhatsApp multi-device tetap berjalan).

**Q: Apa yang terjadi jika komputer mati saat jam jadwal kirim tiba?**  
A: Jika komputer mati pada jam tersebut, pesan tidak dapat terkirim. Begitu komputer dinyalakan kembali, Anda bisa mengetik `!send` di WhatsApp untuk mengirimkannya secara manual.

**Q: Bisakah saya ganti nomor WhatsApp bot?**  
A: Sangat mudah! Cukup hapus folder `session_auth/`, lalu jalankan `npm start`. Bot akan mengeluarkan QR Code baru untuk nomor yang baru.

**Q: Bisakah saya kirim pesan ke lebih dari satu saluran?**  
A: Ya, bisa! Anda bisa menambahkan sebanyak mungkin saluran atau grup dengan perintah `!addtarget <JID>`. Saat jadwal tiba atau Anda ketik `!send`, pesan akan dikirim ke semua saluran yang terdaftar.

---

*Selamat menggunakan Bot Saluran WhatsApp Anda! Jika ada pertanyaan atau penyesuaian fitur tambahan, jangan ragu untuk bertanya.*
