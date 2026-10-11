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

## BAB 3: Menghubungkan Saluran (Channel) atau Grup

Sebelum bot bisa mengirim pesan harian, Anda harus memberi tahu bot ke mana pesan harus dikirim.

### A. Untuk Saluran WhatsApp (WhatsApp Channel):

Ada **2 cara mudah** menghubungkan saluran Anda:

#### Cara 1: Menggunakan Tautan / Link Saluran (Paling Praktis & Pasti Nyaut ⭐)
1. Buka Saluran WhatsApp Anda di HP.
2. Tekan nama saluran di bagian atas > pilih **Salin Tautan** (*Copy Link*).
3. Kirim perintah ini di chat WhatsApp bot:
   ```text
   !addlink https://whatsapp.com/channel/0029Vbxxxxxxxxxxxx
   ```
   *(Atau cukup kirimkan saja link saluran Anda ke chat bot, bot akan mendeteksi otomatis)*.
4. Bot akan otomatis memeriksa saluran tersebut dan membalas:
   ```text
   ✅ Berhasil mendaftarkan saluran baru!
   • Nama Saluran: Info Saluran Kita
   • JID Saluran: 12036302987654321@newsletter
   ```

#### Cara 2: Meneruskan (Forward) Pesan dari Saluran
1. Buka Saluran WhatsApp Anda di HP.
2. Cari salah satu pesan/postingan di saluran tersebut, lalu **Teruskan (Forward)** ke chat bot.
3. Bot akan otomatis mendeteksi ID Saluran Anda (`12036302987654321@newsletter`).
4. Balas chat tersebut dengan perintah:
   ```text
   !addtarget 12036302987654321@newsletter
   ```

---

### B. Untuk Grup WhatsApp:
1. Masukkan nomor bot ke dalam grup WhatsApp Anda.
2. Di dalam grup, ketik perintah:
   ```text
   !id
   ```
3. Bot akan membalas dengan ID grup (contoh: `12036304123456789@g.us`).
4. Daftarkan grup tersebut dengan mengetik:
   ```text
   !addtarget 12036304123456789@g.us
   ```

---

### C. Mengecek Target yang Sudah Terdaftar:
Ketik perintah ini di chat WhatsApp:
```text
!targets
```
Bot akan menampilkan daftar semua Saluran dan Grup yang sudah Anda daftarkan.

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
| `!menu` | `!menu` | Menampilkan menu bantuan dan semua perintah |
| `!today` | `!today` | Melihat pratinjau (preview) template hari ini |
| `!preview <hari>` | `!preview selasa` | Melihat pratinjau template hari tertentu |
| `!send` | `!send` | Langsung kirim template hari ini ke semua target |
| `!send <hari>` | `!send senin` | Langsung kirim template hari tertentu ke semua target |
| `!sendto <JID> [hari]` | `!sendto 12036302xx@newsletter` | Kirim template ke satu target spesifik |
| `!id` | `!id` | Cek ID chat / grup tempat Anda mengetik |
| `!targets` | `!targets` | Melihat semua saluran & grup tujuan yang terdaftar |
| `!addtarget <JID>` | `!addtarget 12036302xx@newsletter` | Mendaftarkan saluran / grup baru |
| `!deltarget <JID>` | `!deltarget 12036302xx@newsletter` | Menghapus saluran / grup dari target |
| `!list` | `!list` | Melihat daftar hari/template yang tersedia |
| `!additem <hari> <teks>` | `!additem senin ▫️ Pengumuman baru` | Menambah baris list ke template hari itu |
| `!delitem <hari> <nomor>` | `!delitem senin 1` | Menghapus baris item dari template hari itu |
| `!all` | `!all` | Membuat polling semua dosen sekaligus (Frau Woro, Frau Wisma, Frau Lita, Herr Agus) |
| `!all <dosen 1, 2...>` | `!all Frau Woro, Frau Wisma` | Membuat polling daftar dosen yang ditentukan |
| `!dosen <Nama>` | `!dosen Frau Woro` | Membuat polling kehadiran 1 dosen (Hadir / Tidak / Belum Diketahui) |
| `!dosen all <Nama>` | `!dosen all Frau Woro` | Mengirim polling 1 dosen ke semua target saluran/grup |
| `!listdosen` | `!listdosen` | Melihat daftar dosen default yang tersimpan |
| `!setdosen <dosen 1, 2...>` | `!setdosen Frau Woro, Herr Agus` | Mengubah daftar dosen default polling |
| `!ai <pertanyaan>` | `!ai tambahkan jadwal kelas A hari senin...` | Tanya AI Gemini & **Auto-Save Jadwal Otomatis** |
| `@Bot <pertanyaan>` | `@Bot apa jadwal kelas A besok?` | Tag/mention bot di grup untuk berinteraksi dengan AI |
| `!jadwal <kelas> [hari]` | `!jadwal a senin` | Melihat jadwal kuliah Kelas A, B, atau I |
| `!scanjadwal` | `!scanjadwal` *(caption/reply foto)* | Pindai tabel foto jadwal kuliah otomatis dengan AI Gemini |
| `!poll <Tanya> \| <Opsi1> \| ...` | `!poll Rapat? \| Masuk \| Cancel` | Membuat polling interaktif WhatsApp kustom bebas |
| `!PRAWIRA` | `!PRAWIRA` | **KODE RAHASIA:** Mengaktifkan akses Pemilik (Owner) untuk nomor Anda |
| `!tambahkan <No>` | `!tambahkan 08123456789` | Mendaftarkan nomor admin/owner baru yang diizinkan |
| `!hapusnomor <No>` | `!hapusnomor 08123456789` | Menghapus nomor dari daftar admin/owner |
| `!listowner` | `!listowner` | Melihat semua nomor yang memiliki akses owner |
| `!autosend on [jam:menit]` | `!autosend on 07:00` | Mengaktifkan kirim otomatis setiap hari |
| `!autosend off` | `!autosend off` | Mematikan kirim otomatis |
| `!repair` | `!repair` | **Self-Repair:** Cek kesehatan memori, file sistem & auto-heal |
| `!restart` | `!restart` | Me-restart proses bot secara halus |
| `!status` | `!status` | Melihat status koneksi, jadwal, dan target bot |

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
