// Supabase Cloud Client & Real-Time Sync Manager
// Menyinkronkan Hasil Ujian, Pengaturan/Token, Jadwal, Bank Soal, Data Siswa & Guru lintas perangkat (Laptop & HP)

const DEFAULT_SUPABASE_CONFIG = {
  supabaseUrl: "https://ibmsfedjcathditbedpt.supabase.co",
  supabaseKey: "sb_publishable_k_36nCyvisFcxpAN6okLHg_7076YXri",
  enabled: true
};

class SupabaseSyncManager {
  constructor() {
    this.config = this.loadConfig();
    this.client = null;
    this.isConnected = false;
    this.stateTableMissing = false;
    this.initClient();
  }

  loadConfig() {
    const saved = localStorage.getItem('cbt_supabase_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.supabaseUrl && parsed.supabaseKey) {
          return parsed;
        }
      } catch (e) {
        console.error("Gagal load supabase config", e);
      }
    }
    const defaults = { ...DEFAULT_SUPABASE_CONFIG };
    try {
      localStorage.setItem('cbt_supabase_config', JSON.stringify(defaults));
    } catch (e) {}
    return defaults;
  }

  isCloudConfigured() {
    return Boolean(this.config && this.config.supabaseUrl && this.config.supabaseKey && this.isConnected);
  }

  getConfig() {
    return this.config || { ...DEFAULT_SUPABASE_CONFIG };
  }

  saveConfig(urlOrConfig, key) {
    if (typeof urlOrConfig === 'string') {
      this.config = {
        ...this.config,
        supabaseUrl: urlOrConfig.trim(),
        supabaseKey: (key || '').trim(),
        enabled: Boolean(urlOrConfig && key)
      };
    } else if (typeof urlOrConfig === 'object' && urlOrConfig !== null) {
      this.config = { ...this.config, ...urlOrConfig };
    }
    this.stateTableMissing = false;
    localStorage.setItem('cbt_supabase_config', JSON.stringify(this.config));
    this.initClient();
  }

  initClient() {
    if (this.config.supabaseUrl && this.config.supabaseKey && typeof window.supabase !== 'undefined') {
      try {
        this.client = window.supabase.createClient(this.config.supabaseUrl, this.config.supabaseKey);
        this.isConnected = true;
      } catch (err) {
        console.error("Gagal inisialisasi Supabase:", err);
        this.client = null;
        this.isConnected = false;
      }
    } else {
      this.client = null;
      this.isConnected = false;
    }
  }

  async testConnection(url, key) {
    if (typeof window.supabase === 'undefined') {
      return { success: false, message: "Pustaka Supabase JS belum siap dimuat. Cek koneksi internet Anda." };
    }

    try {
      const testClient = window.supabase.createClient(url.trim(), key.trim());
      const { error } = await testClient.from('cbt_exam_results').select('count', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') {
        if (error.message && error.message.includes('relation "cbt_exam_results" does not exist')) {
          return {
            success: true,
            warning: true,
            message: "Koneksi berhasil! Namun tabel 'cbt_exam_results' belum dibuat di Supabase SQL Editor. Jalankan script supabase-schema.sql terlebih dahulu."
          };
        }
        return { success: false, message: "Gagal: " + error.message };
      }

      const stateCheck = await testClient.from('cbt_school_state').select('count', { count: 'exact', head: true });
      if (stateCheck.error) {
        return {
          success: true,
          message: "Koneksi ke Supabase Cloud Berhasil! Sinkronisasi otomatis lintas perangkat aktif (mode kompatibilitas)."
        };
      }

      return { success: true, message: "Koneksi ke Supabase Cloud Berhasil! Database online & sinkronisasi lintas perangkat siap digunakan." };
    } catch (err) {
      return { success: false, message: "Error: " + err.message };
    }
  }

  isMissingTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      msg.includes('cbt_school_state') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache'))
    );
  }

  // Simpan 1 bagian state aplikasi (config, jadwal, soal, siswa, guru) ke Supabase
  async pushStateKey(key, value) {
    if (!this.client || !this.isConnected || !key) return { success: false };

    try {
      if (!this.stateTableMissing) {
        const { error } = await this.client
          .from('cbt_school_state')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

        if (!error) return { success: true };
        if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        } else {
          console.warn(`Gagal upsert cbt_school_state[${key}]:`, error.message);
        }
      }

      // Fallback otomatis via tabel cbt_exam_results jika cbt_school_state belum dibuat
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', '__CBT_STATE__')
        .eq('student_name', key);

      const { error: fallbackErr } = await this.client
        .from('cbt_exam_results')
        .insert([{
          student_name: key,
          student_nisn: '__CBT_STATE__',
          student_class: 'STATE',
          exam_title: 'CBT_STATE_SYNC',
          subject: key,
          final_score: 0,
          correct_count: 0,
          incorrect_count: 0,
          unattempted_count: 0,
          total_questions: 0,
          cheat_count: 0,
          completed_at: new Date().toISOString(),
          finish_reason: 'STATE',
          raw_data: value
        }]);

      if (fallbackErr) {
        console.warn(`Gagal sinkron cloud state[${key}]:`, fallbackErr.message);
        return { success: false, message: fallbackErr.message };
      }
      return { success: true };
    } catch (err) {
      console.warn(`Error pushStateKey[${key}]:`, err);
      return { success: false, message: err.message };
    }
  }

  // Kirim seluruh data sekolah dari perangkat saat ini ke Cloud Supabase
  async pushAllSchoolState() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Supabase Cloud belum terhubung." };
    }

    const entries = [
      ['cbt_config', window.examEngine ? window.examEngine.config : null],
      ['cbt_school_config', window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : null],
      ['cbt_exam_schedules', window.cbtAdmin ? window.cbtAdmin.schedules : null],
      ['cbt_questions', window.examEngine ? window.examEngine.questions : null],
      ['cbt_students_list', window.studentManager ? window.studentManager.getAllStudents() : null],
      ['cbt_teachers_list', window.cbtAdmin ? window.cbtAdmin.getAllTeachers() : null]
    ].filter(([, val]) => val !== null && val !== undefined);

    let pushed = 0;
    for (const [k, v] of entries) {
      const res = await this.pushStateKey(k, v);
      if (res && res.success) pushed++;
    }
    return { success: pushed > 0, count: pushed };
  }

  // Ambil seluruh pengaturan, jadwal, soal, data siswa & guru terbaru dari Cloud Supabase
  async pullAllSchoolState() {
    if (!this.client || !this.isConnected) {
      return { success: false, state: {} };
    }

    const stateMap = {};

    try {
      if (!this.stateTableMissing) {
        const { data, error } = await this.client
          .from('cbt_school_state')
          .select('key, value');

        if (!error && Array.isArray(data)) {
          data.forEach(row => {
            if (row && row.key && row.value !== undefined && row.value !== null) {
              stateMap[row.key] = row.value;
            }
          });
          if (Object.keys(stateMap).length > 0) {
            return { success: true, state: stateMap };
          }
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      // Fallback otomatis dari tabel cbt_exam_results
      const { data: fbData, error: fbError } = await this.client
        .from('cbt_exam_results')
        .select('student_name, raw_data, id')
        .eq('student_nisn', '__CBT_STATE__')
        .order('id', { ascending: false });

      if (!fbError && Array.isArray(fbData)) {
        fbData.forEach(row => {
          if (row && row.student_name && row.raw_data !== undefined && stateMap[row.student_name] === undefined) {
            stateMap[row.student_name] = row.raw_data;
          }
        });
      }

      return { success: true, state: stateMap };
    } catch (err) {
      console.warn("Gagal pullAllSchoolState:", err);
      return { success: false, state: stateMap };
    }
  }

  // Kirim Hasil Ujian Siswa ke Supabase Cloud
  async submitExamResult(resultRecord) {
    if (this.client && this.isConnected) {
      try {
        const payload = {
          student_name: resultRecord.student?.name || '-',
          student_nisn: resultRecord.student?.nisn || '-',
          student_class: resultRecord.student?.class || 'Umum',
          exam_title: resultRecord.examTitle,
          subject: resultRecord.subject,
          final_score: resultRecord.finalScore,
          correct_count: resultRecord.correctCount,
          incorrect_count: resultRecord.incorrectCount,
          unattempted_count: resultRecord.unattemptedCount,
          total_questions: resultRecord.totalQuestions,
          cheat_count: resultRecord.cheatCount || 0,
          completed_at: resultRecord.completedAt,
          finish_reason: resultRecord.finishReason,
          raw_data: resultRecord
        };

        const { error } = await this.client.from('cbt_exam_results').insert([payload]);
        if (error) {
          console.warn("Gagal simpan ke Supabase cloud (data tetap aman di lokal):", error);
        }
      } catch (err) {
        console.warn("Error kirim ke Supabase:", err);
      }
    }
  }

  async fetchCloudResults() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Klien Supabase belum terhubung.", data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }

    try {
      const { data, error } = await this.client
        .from('cbt_exam_results')
        .select('*')
        .neq('student_nisn', '__CBT_STATE__')
        .order('final_score', { ascending: false });

      if (error) {
        return { success: false, message: error.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
      }

      const formatted = (data || [])
        .filter(row => row.student_nisn !== '__CBT_STATE__')
        .map(row => {
          if (row.raw_data) return row.raw_data;
          return {
            id: row.id,
            student: {
              name: row.student_name,
              nisn: row.student_nisn,
              class: row.student_class
            },
            examTitle: row.exam_title,
            subject: row.subject,
            finalScore: row.final_score,
            correctCount: row.correct_count,
            incorrectCount: row.incorrect_count,
            unattemptedCount: row.unattempted_count,
            totalQuestions: row.total_questions,
            cheatCount: row.cheat_count,
            completedAt: row.completed_at,
            finishReason: row.finish_reason,
            detailedAnswers: []
          };
        });

      localStorage.setItem('cbt_exam_results', JSON.stringify(formatted));
      return { success: true, count: formatted.length, data: formatted };
    } catch (err) {
      return { success: false, message: err.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
    }
  }
}

if (typeof window !== 'undefined') {
  window.supabaseSync = new SupabaseSyncManager();
}
