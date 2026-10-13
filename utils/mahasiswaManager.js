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

module.exports = {
  getMahasiswaList,
  searchMahasiswa,
  addMahasiswa,
  deleteMahasiswa
};
