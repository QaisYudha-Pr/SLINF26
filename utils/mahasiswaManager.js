const { fetchSupabase } = require('./taskManager');

/**
 * Mengambil seluruh daftar mahasiswa dari Supabase Cloud
 */
async function getMahasiswaList() {
  try {
    const res = await fetchSupabase('mahasiswa?select=*&order=id.asc');
    if (res && res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Mahasiswa Error]:', err.message);
  }
  return [];
}

/**
 * Mencari data mahasiswa berdasarkan NIM atau Nama
 */
async function searchMahasiswa(query) {
  if (!query) return [];
  try {
    const isNum = /^\d+$/.test(query.trim());
    const filter = isNum
      ? `mahasiswa?nim=ilike.*${encodeURIComponent(query.trim())}*`
      : `mahasiswa?nama=ilike.*${encodeURIComponent(query.trim())}*`;
    const res = await fetchSupabase(`${filter}&select=*&limit=10`);
    if (res && res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('⚠️ [Search Mahasiswa Error]:', err.message);
  }
  return [];
}

/**
 * Menambahkan data mahasiswa baru
 */
async function addMahasiswa(nama, nim) {
  if (!nama || !nim) {
    return { success: false, message: 'Nama dan NIM wajib diisi.' };
  }
  try {
    const res = await fetchSupabase('mahasiswa', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({
        nama: String(nama).trim(),
        nim: String(nim).trim()
      })
    });
    if (res && (res.status === 201 || res.status === 200)) {
      const data = await res.json();
      return { success: true, mahasiswa: data[0] || { nama, nim } };
    }
    const errText = await res.text();
    if (errText.includes('duplicate key') || errText.includes('violates unique constraint')) {
      return { success: false, message: `Mahasiswa dengan NIM ${nim} sudah terdaftar.` };
    }
    return { success: false, message: errText };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Menghapus data mahasiswa berdasarkan ID atau NIM
 */
async function deleteMahasiswa(idOrNim) {
  if (!idOrNim) return { success: false, message: 'ID atau NIM diperlukan.' };
  try {
    const isNum = /^\d+$/.test(String(idOrNim).trim());
    const filter = isNum && String(idOrNim).length <= 4
      ? `mahasiswa?id=eq.${idOrNim}`
      : `mahasiswa?nim=eq.${idOrNim}`;
    const res = await fetchSupabase(filter, { method: 'DELETE' });
    if (res && (res.status === 200 || res.status === 204)) {
      return { success: true };
    }
    return { success: false, message: await res.text() };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Mengekstrak daftar nama dan NIM mahasiswa dari teks mentah (copy-paste Excel, CSV, list berurut)
 * @param {string} text - Teks mentah berisi daftar mahasiswa
 * @returns {Array<{nama: string, nim: string}>}
 */
function parseMahasiswaList(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  const seenNims = new Set();

  for (const line of lines) {
    // Cari NIM (deretan 5 sampai 20 digit angka)
    const nimMatch = line.match(/\b(\d{5,20})\b/);
    if (!nimMatch) continue;
    const nim = nimMatch[1];
    if (seenNims.has(nim)) continue;

    // Nama adalah sisa teks setelah menghapus NIM dan tanda baca/nomor urut
    let name = line
      .replace(nim, '')
      .replace(/^[\d]+[\.\)\-\s]+/, '') // Hapus nomor urut di awal: 1. atau 1) atau 1-
      .replace(/[\(\)\[\]\|\,\:\t\-]+/g, ' ') // Ganti tanda pemisah dengan spasi
      .replace(/\s+/g, ' ')
      .trim();

    if (name.length >= 2) {
      seenNims.add(nim);
      results.push({ nama: name, nim: nim });
    }
  }
  return results;
}

/**
 * Menambahkan banyak data mahasiswa sekaligus (Batch Insert / Bulk Import) ke Supabase Cloud
 * Otomatis menangani 100+ data sekaligus dan mengabaikan duplikasi NIM secara aman.
 * @param {Array<{nama: string, nim: string}>} mahasiswaArray
 */
async function batchAddMahasiswa(mahasiswaArray) {
  if (!Array.isArray(mahasiswaArray) || mahasiswaArray.length === 0) {
    return { success: false, message: 'Daftar mahasiswa kosong.', inserted: 0, total: 0 };
  }

  // Bersihkan data
  const validItems = [];
  const seenNims = new Set();
  for (const item of mahasiswaArray) {
    if (!item.nama || !item.nim) continue;
    const cleanNim = String(item.nim).trim();
    const cleanName = String(item.nama).trim();
    if (cleanNim.length >= 5 && cleanName.length >= 2 && !seenNims.has(cleanNim)) {
      seenNims.add(cleanNim);
      validItems.push({ nama: cleanName, nim: cleanNim });
    }
  }

  if (validItems.length === 0) {
    return { success: false, message: 'Tidak ada data nama dan NIM valid yang ditemukan.', inserted: 0, total: 0 };
  }

  // Pecah dalam batch 100 agar aman dari limit payload Cloudflare / Supabase
  const chunkSize = 100;
  let totalInserted = 0;
  const allInsertedData = [];

  try {
    for (let i = 0; i < validItems.length; i += chunkSize) {
      const chunk = validItems.slice(i, i + chunkSize);
      const res = await fetchSupabase('mahasiswa?on_conflict=nim', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=ignore-duplicates,return=representation'
        },
        body: JSON.stringify(chunk)
      });

      if (res && (res.status === 201 || res.status === 200)) {
        const rows = await res.json().catch(() => []);
        totalInserted += rows.length;
        allInsertedData.push(...rows);
      } else {
        const errText = await res.text();
        console.warn('⚠️ [Supabase Batch Insert Warning]:', errText);
      }
    }

    return {
      success: true,
      total: validItems.length,
      inserted: totalInserted,
      skipped: validItems.length - totalInserted,
      data: allInsertedData
    };
  } catch (err) {
    return { success: false, message: err.message, inserted: totalInserted, total: validItems.length };
  }
}

module.exports = {
  getMahasiswaList,
  searchMahasiswa,
  addMahasiswa,
  deleteMahasiswa,
  parseMahasiswaList,
  batchAddMahasiswa
};
