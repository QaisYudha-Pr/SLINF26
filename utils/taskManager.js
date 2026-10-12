const fs = require('fs');
const path = require('path');
const { loadConfig, saveConfig } = require('../configManager');

const TASKS_CACHE_FILE = path.join(__dirname, '..', 'tasks.json');
let tasksCache = null;

/**
 * Membaca cache lokal tasks.json
 */
function getLocalTasks() {
  if (tasksCache) return tasksCache;
  try {
    if (fs.existsSync(TASKS_CACHE_FILE)) {
      tasksCache = JSON.parse(fs.readFileSync(TASKS_CACHE_FILE, 'utf-8'));
      return tasksCache;
    }
  } catch (e) {}
  tasksCache = [];
  return tasksCache;
}

/**
 * Menyimpan cache lokal tasks.json
 */
function saveLocalTasks(tasks) {
  try {
    tasksCache = tasks;
    fs.writeFileSync(TASKS_CACHE_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  } catch (e) {
    console.error('❌ Gagal menyimpan tasks.json:', e.message);
  }
}

/**
 * Helper untuk request ke Supabase REST API
 */
async function fetchSupabase(endpoint, options = {}) {
  const config = loadConfig();
  let sb = config.supabase;
  if (!sb || !sb.url || !sb.anonKey) {
    sb = {
      url: 'https://kopdtjpjlhncngzrtflz.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvcGR0anBqbGhuY25nenJ0Zmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDg5NjcsImV4cCI6MjEwNzMyNDk2N30.trrAhx23Sa6arVZ_nquUB0jYNXcUxumvxckVyw8WAGI'
    };
    try {
      config.supabase = sb;
      saveConfig(config);
    } catch (e) {}
  }

  const url = `${sb.url}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': sb.anonKey,
    'Authorization': `Bearer ${sb.anonKey}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(8000)
  });

  return res;
}

/**
 * Mengambil daftar tugas (aktif / pending)
 */
async function getTasks(classKey = 'A', status = 'pending') {
  const cKey = (classKey || 'A').toUpperCase();

  try {
    const res = await fetchSupabase(`tasks?kelas=eq.${cKey}&status=eq.${status}&order=id.asc`);
    if (res && res.ok) {
      const data = await res.json();
      // Update cache lokal
      saveLocalTasks(data);
      return data;
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Offline] Membaca data tugas dari cache lokal...');
  }

  // Fallback lokal jika offline
  const local = getLocalTasks();
  return local.filter(t => (t.kelas || 'A').toUpperCase() === cKey && t.status === status);
}

/**
 * Menambahkan tugas baru
 */
async function addTask({ kelas = 'A', matkul, judul, deadline_text = '-', created_by = null }) {
  const cKey = (kelas || 'A').toUpperCase();
  const newTask = {
    kelas: cKey,
    matkul: matkul || 'Mata Kuliah',
    judul: judul || 'Tugas Baru',
    deadline_text: deadline_text || '-',
    status: 'pending',
    created_by: created_by || null
  };

  try {
    const res = await fetchSupabase('tasks', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(newTask)
    });

    if (res && res.ok) {
      const inserted = await res.json();
      const savedTask = inserted[0] || newTask;
      const current = getLocalTasks();
      current.push(savedTask);
      saveLocalTasks(current);
      return { success: true, task: savedTask };
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Add Error]:', err.message);
  }

  // Fallback simpan lokal
  const current = getLocalTasks();
  newTask.id = Date.now();
  current.push(newTask);
  saveLocalTasks(current);
  return { success: true, task: newTask, isLocal: true };
}

/**
 * Menandai tugas selesai
 */
async function markTaskDone(taskId) {
  const tId = parseInt(taskId, 10);
  if (isNaN(tId)) return { success: false, message: 'ID tugas tidak valid.' };

  try {
    const res = await fetchSupabase(`tasks?id=eq.${tId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ status: 'done' })
    });

    if (res && res.ok) {
      const updated = await res.json();
      const current = getLocalTasks();
      const idx = current.findIndex(t => t.id === tId);
      if (idx >= 0) current[idx].status = 'done';
      saveLocalTasks(current);
      return { success: true, task: updated[0] };
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Patch Error]:', err.message);
  }

  // Fallback lokal
  const current = getLocalTasks();
  const idx = current.findIndex(t => t.id === tId);
  if (idx >= 0) {
    current[idx].status = 'done';
    saveLocalTasks(current);
    return { success: true, task: current[idx] };
  }

  return { success: false, message: 'Tugas tidak ditemukan.' };
}

/**
 * Menghapus tugas
 */
async function deleteTask(taskId) {
  const tId = parseInt(taskId, 10);
  if (isNaN(tId)) return { success: false, message: 'ID tugas tidak valid.' };

  try {
    const res = await fetchSupabase(`tasks?id=eq.${tId}`, {
      method: 'DELETE'
    });

    if (res && res.ok) {
      const current = getLocalTasks();
      const filtered = current.filter(t => t.id !== tId);
      saveLocalTasks(filtered);
      return { success: true };
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Delete Error]:', err.message);
  }

  const current = getLocalTasks();
  const filtered = current.filter(t => t.id !== tId);
  saveLocalTasks(filtered);
  return { success: true };
}

/**
 * Format teks tampilan WhatsApp untuk daftar tugas
 */
async function formatTaskList(classKey = 'A') {
  const cKey = (classKey || 'A').toUpperCase();
  const tasks = await getTasks(cKey, 'pending');

  let output = `╭───「 📝 *TRACKER TUGAS KELAS ${cKey}* 」\n`;
  output += `│ Cloud DB: *Supabase PostgreSQL* 🟢\n`;
  output += `╰──────────────────────────────\n\n`;

  if (!tasks || tasks.length === 0) {
    output += `🎉 *Tidak ada tugas aktif untuk Kelas ${cKey}! (Semua tugas beres)*\n\n`;
    output += `_Tambah tugas: *!tugas tambah <matkul> | <judul> | <deadline>*\natau lewat AI: */ai catat tugas...*_`;
    return output;
  }

  output += `📌 *Daftar Tugas Belum Selesai (${tasks.length} tugas):*\n\n`;
  tasks.forEach((t, idx) => {
    output += `▫️ *[ID: ${t.id}] ${t.matkul}*\n`;
    output += `   📋 *Tugas:* ${t.judul}\n`;
    if (t.deadline_text && t.deadline_text !== '-') {
      output += `   ⏰ *Batas:* ${t.deadline_text}\n`;
    }
    output += `\n`;
  });

  output += `_Tandai tugas selesai: *!tugas done <ID>*_\n`;
  output += `_Hapus tugas: *!tugas hapus <ID>*_`;
  return output.trim();
}

/**
 * Memeriksa status koneksi langsung ke Supabase Cloud Database
 */
async function checkDatabaseStatus() {
  const start = Date.now();
  try {
    const res = await fetchSupabase('tasks?select=id&limit=1');
    const latency = Date.now() - start;
    if (res && res.ok) {
      return {
        connected: true,
        type: 'Supabase Cloud (PostgreSQL)',
        latencyMs: latency,
        message: `🟢 Terhubung (Supabase Cloud ${latency}ms)`
      };
    } else {
      return {
        connected: false,
        type: 'Local Cache (tasks.json)',
        latencyMs: latency,
        message: `🟡 Offline / HTTP ${res.status} (Fallback Cache Lokal)`
      };
    }
  } catch (err) {
    return {
      connected: false,
      type: 'Local Cache (tasks.json)',
      latencyMs: Date.now() - start,
      message: `🔴 Terputus (Fallback Cache Lokal)`
    };
  }
}

module.exports = {
  getTasks,
  addTask,
  markTaskDone,
  deleteTask,
  formatTaskList,
  checkDatabaseStatus
};

