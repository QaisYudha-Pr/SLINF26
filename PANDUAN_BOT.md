# 📖 PANDUAN LENGKAP PENGGUNAAN & PENGATURAN BOT ALTERS (SLINF26)

Selamat datang di dokumentasi resmi **Alters Academic Bot**!  
Bot ini dirancang khusus untuk mendampingi kegiatan perkuliahan, pencatatan tugas di Cloud Database Supabase, manajemen jadwal kuliah, siaran otomatis ke saluran/grup WhatsApp, serta asisten AI super cepat bertenaga **Groq LPU (Llama & Qwen)** dengan cadangan **Google Gemini AI**.

---

## 🚀 1. CARA UPDATE DI TERMUX (ANDROID)

File konfigurasi (`config.json`) dan folder sesi login WhatsApp (`session_auth/`) tersimpan aman di HP kamu dan tidak akan tertimpa atau hilang saat melakukan update dari GitHub.

### Langkah-langkah Update di Termux:
1. **Matikan bot** yang sedang berjalan:
   Tekan **`CTRL + C`** di layar Termux.
2. **Masuk ke folder bot**:
   ```bash
   cd SLINF26
   ```
3. **Tarik pembaruan terbaru dari GitHub**:
   ```bash
   git pull origin main
   ```
   *(Jika ada notifikasi konflik file lokal, ketik: `git stash` lalu `git pull origin main`)*
4. **Jalankan kembali bot**:
   ```bash
   node index.js
   ```
   Bot akan langsung aktif tanpa perlu scan QR ulang! 🎉

---

## ⚙️ 2. PENGATURAN KONFIGURASI LANGSUNG DARI WHATSAPP (TANPA BUKA TERMINAL)

Kamu **tidak perlu lagi membuka Termux atau mengedit file manual** untuk memasukkan API Key atau mengubah setelan bot! Cukup kirim pesan dari nomor Owner:

### A. Auto-Detect API Key (Paling Cepat):
Cukup **paste langsung** kunci kamu di chat pribadi dengan bot:
- Kirim: `gsk_xxxxxxxxx...` ➔ Bot otomatis menyimpannya sebagai **Groq API Key**.
- Kirim: `AIzaSyxxxxxx...` ➔ Bot otomatis menyimpannya sebagai **Gemini API Key**.

### B. Perintah Shortcut Khusus:
- **Atur Kunci Groq:**
  ```text
  !setgroq gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```
- **Atur Kunci Gemini:**
  ```text
  !setgemini AIzaSy...
  ```
- **Atur Kunci Apapun Bebas:**
  ```text
  !setconfig <nama_key> <nilai>
  ```
  *Contoh:* `!setconfig prefix !` atau `!setconfig groqModel qwen/qwen3.8-27b`

---

## 🔘 3. CARA PENGGUNAAN MENU & TOMBOL INTERAKTIF

Tersedia **3 cara mudah** berinteraksi dengan menu bot:

### Cara 1: Menu Pilihan Cepat Angka [1 - 7] ⚡
Ketik `!menu`. Bot akan menampilkan ringkasan hari ini dan opsi nomor:
- Balas/Quote pesan menu dengan angka **`1`** ➔ Langsung memunculkan **Jadwal Kuliah Hari Ini**.
- Balas dengan angka **`2`** ➔ Langsung memunculkan **Daftar Tugas Aktif**.
- Balas dengan angka **`3`** ➔ Langsung memunculkan **Data Mahasiswa Supabase**.
- Balas dengan angka **`4`** ➔ Langsung membuat **Polling Kehadiran Dosen**.
- Balas dengan angka **`5`** ➔ Langsung memunculkan **Pengingat Aktif**.
- Balas dengan angka **`6`** ➔ Cek **Status Bot, Server Host, & RAM**.
- Balas dengan angka **`7`** ➔ Panduan **Tanya Alters AI**.

### Cara 2: Tombol Klik Polling Interaktif 📊
Ketik:
```text
!tombol
```
Bot akan mengirim kotak polling native WhatsApp yang bisa langsung diklik opsi pilihannya di HP.

### Cara 3: Ngomong Santai ke AI (Alters Copilot) 🤖
Kamu bisa langsung menggunakan bahasa sehari-hari tanpa perlu menghafal format perintah!

---

## 📚 4. DAFTAR MENU & CARA PENGISIAN PALING PRAKTIS

### 🎓 A. Database Mahasiswa (Supabase Cloud)
| Kebutuhan | Format Manual (`!`) | Lewat Chat AI (Bahasa Gaul) |
| :--- | :--- | :--- |
| **Impor Massal (10 - 100+ Data Sekaligus)** | `!importmhs <paste dari Excel/teks>` *(atau kirim file .txt / .csv dengan caption `!importmhs`)* | *"Alters tolong masukkan data mahasiswa ini ke database: (paste daftar nama & NIM)"* |
| **Tambah 1 Mahasiswa** | `!tambahmhs Nama Mahasiswa \| NIM` | *"Alters catat mahasiswa baru namanya Dani NIM 22051204001"* |
| **Cek Daftar Mahasiswa** | `!mhs` atau `!mhs <nama/NIM>` | *"Alters siapa aja mahasiswa yang terdaftar?"* / *"Cari mahasiswa Ahmad"* |
| **Hapus Mahasiswa** | `!hapusmhs <NIM>` | *"Alters hapus mahasiswa NIM 22051204001"* |

*Tips Impor Massal:*
Format penulisan sangat fleksibel, sistem otomatis mengenali:
- Copy-paste dari **Excel / Google Sheets** (Tab-separated)
- Nomor urut: `1. Dani Pratama - 22051204001`
- Format kurung: `Dani Pratama (22051204001)`
- Format koma/CSV: `Dani Pratama, 22051204001`
- Format garis: `Dani Pratama | 22051204001`
*(NIM yang sudah terdaftar sebelumnya otomatis dilewati agar tidak terjadi duplikasi error).*

---

### 📝 B. Manajemen Tugas Kuliah
| Kebutuhan | Format Manual (`!`) | Lewat Chat AI (Bahasa Gaul) |
| :--- | :--- | :--- |
| **Tambah Tugas Baru** | `!tugas tambah <matkul> \| <judul> \| <deadline>` *(contoh: `!tugas tambah Basdat \| ERD Toko \| Jumat 23:59`)* | *"Alters ada tugas Alpro bikin kalkulator deadline senin depan kelas B"* |
| **Cek Tugas Tertunda** | `!tugas` atau `!tugas b` | *"Alters ada tugas apa aja yang belum selesai?"* |
| **Tandai Tugas Selesai** | `!tugas done <ID>` atau `!tugas done <matkul>` | *"Alters tugas basdat erd udah kelar"* |
| **Hapus Tugas** | `!tugas hapus <ID>` | *"Alters tolong hapus tugas ID 3"* |

---

### 📅 C. Jadwal Kuliah & Polling Dosen
| Kebutuhan | Format Manual (`!`) | Lewat Chat AI (Bahasa Gaul) |
| :--- | :--- | :--- |
| **Jadwal Hari Ini** | `!today` atau `!hariini` atau `!jadwal b` | *"Hari ini ada kuliah apa aja Alters?"* |
| **Jadwal Hari Tertentu** | `!jadwal b senin` | *"Besok kelas B kuliah jam berapa?"* |
| **Polling Kehadiran Dosen** | `!all` *(Kirim di chat saat ini)*<br>`!all target` *(Kirim ke semua target saluran & grup)* | *"Alters bikin polling dosen hari ini dong"* |
| **Ubah Jam Kuliah Cepat** | `!gantijam Basdat \| 09.30 - 11.10` | *"Alters jam kuliah Basdat hari ini geser ke jam 09.30"* |
| **Kuliah Kosong / Batal** | `!batal Basdat` | *"Alters kuliah Basdat hari ini batal ya"* |

---

### 📢 D. Target Siaran & Broadcast (Saluran & Grup)
| Kebutuhan | Format Manual (`!`) | Lewat Chat AI (Bahasa Gaul) |
| :--- | :--- | :--- |
| **Daftarkan Target Saluran/Grup** | `!addtarget <link atau JID>`<br>*(contoh: `!addtarget https://whatsapp.com/channel/...`)* | Cukup kirim di grup: *"Alters tolong targetin grup ini"* atau sertakan link saluran |
| **Cek Target Terdaftar** | `!targets` | *"Alters target siaran kita ada berapa aja?"* |
| **Hapus Target** | `!deltarget <nomor_indeks>` | *"Alters hapus target siaran nomor 2"* |
| **Siaran Bebas (Broadcast)** | `!bc [target] <pesan>` | *"Alters siarkan pengumuman ini ke semua saluran: ..."* |

---

### ⏰ E. Pengingat Deadline & Jadwal (Reminder)
| Kebutuhan | Format Manual (`!`) | Lewat Chat AI (Bahasa Gaul) |
| :--- | :--- | :--- |
| **Pasang Pengingat** | `!remind 20:00 Kumpul meet kelompok di Google Meet` | *"Alters tolong ingetin jam 8 malam ada meet kelompok"* |
| **Lihat Pengingat Aktif** | `!reminders` | *"Alters ada pengingat apa aja yang aktif?"* |
| **Hapus Pengingat** | `!delreminder <ID>` | *"Alters hapus pengingat ID 1"* |
| **Saklar Pengingat Tugas Otomatis** | `!reminder on 19:00` / `!reminder off` | *"Alters ubah jam pengingat tugas malam jadi jam 20:00"* |

---

## ⚡ 5. KEUNGGULAN ENGINE AI GROQ LPU
1. **0% Beban di Laptop / HP Termux:** Semua komputasi diproses di cloud, RAM tetap lega, HP tidak panas, baterai awet.
2. **Kecepatan Instan (~300 Token/Detik):** Respon chat selesai dalam kurun waktu 1 - 2 detik.
3. **Kapasitas Besar:** Kuota harian bebas limit ribuan request/hari tanpa terkena error 503 Overloaded.
4. **Multi-Model Auto Fallback:** Jika salah satu model sibuk, bot otomatis beralih antar model (`qwen/qwen3.8-27b` ➔ `openai/gpt-oss-120b` ➔ `openai/gpt-oss-20b` ➔ `allam-2-7b`) hingga Google Gemini Cloud.
