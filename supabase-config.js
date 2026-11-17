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
    this.sessionTableMissing = false;
    this.questionTableMissing = false;
    this.pendingQuestionsStorageKey = 'cbt_pending_question_sync';
    this.questionsMigrationStorageKey = 'cbt_questions_migrated_v1';
    this._migrationPromise = null;
    this._flushPromise = null;
    this.inflightUpserts = new Map();
    this.inflightDeletes = new Set();
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
    this.sessionTableMissing = false;
    this.questionTableMissing = false;
    this._migrationPromise = null;
    this._flushPromise = null;
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
      const qCheck = await testClient.from('cbt_questions').select('count', { count: 'exact', head: true });
      if (stateCheck.error || qCheck.error) {
        return {
          success: true,
          message: "Koneksi ke Supabase Cloud Berhasil! Sinkronisasi otomatis lintas perangkat & penyimpanan soal per-baris aktif (mode kompatibilitas)."
        };
      }

      return { success: true, message: "Koneksi ke Supabase Cloud Berhasil! Database online, tabel soal per-baris & sinkronisasi lintas perangkat siap digunakan." };
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

  isMissingQuestionsTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      (msg.includes('cbt_questions') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache')))
    );
  }

  // ================= ANTIAN OFFLINE & PENYIMPANAN SOAL PER-BARIS =================
  loadPendingQuestionOps() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.pendingQuestionsStorageKey) || '{}');
      return {
        upserts: raw && typeof raw.upserts === 'object' && raw.upserts ? raw.upserts : {},
        deletes: raw && typeof raw.deletes === 'object' && raw.deletes ? raw.deletes : {}
      };
    } catch (e) {
      return { upserts: {}, deletes: {} };
    }
  }

  savePendingQuestionOps(ops) {
    try {
      const upCount = Object.keys(ops.upserts || {}).length;
      const delCount = Object.keys(ops.deletes || {}).length;
      if (upCount === 0 && delCount === 0) {
        localStorage.removeItem(this.pendingQuestionsStorageKey);
      } else {
        localStorage.setItem(this.pendingQuestionsStorageKey, JSON.stringify(ops));
      }
    } catch (e) {}
  }

  markQuestionsPendingUpsert(questionsArray) {
    const ops = this.loadPendingQuestionOps();
    (questionsArray || []).forEach(q => {
      if (!q || q.id === undefined || q.id === null) return;
      const k = String(q.id);
      ops.upserts[k] = q;
      delete ops.deletes[k];
    });
    this.savePendingQuestionOps(ops);
  }

  markQuestionPendingDelete(questionId) {
    if (questionId === undefined || questionId === null) return;
    const k = String(questionId);
    const ops = this.loadPendingQuestionOps();
    delete ops.upserts[k];
    ops.deletes[k] = true;
    this.savePendingQuestionOps(ops);
  }

  clearQuestionsPendingKeys(keys, type = 'both') {
    const ops = this.loadPendingQuestionOps();
    (keys || []).forEach(k => {
      const sk = String(k);
      if (type === 'upsert' || type === 'both') delete ops.upserts[sk];
      if (type === 'delete' || type === 'both') delete ops.deletes[sk];
    });
    this.savePendingQuestionOps(ops);
  }

  buildQuestionRowPayload(q) {
    const key = String(q.id);
    const updatedAt = q.updatedAt || new Date().toISOString();
    const enriched = { ...q, updatedAt };
    return {
      question_key: key,
      subject: String(q.subject || 'Umum').trim() || 'Umum',
      class_level: String(q.classLevel || 'Semua Kelas').trim() || 'Semua Kelas',
      created_by: String(q.createdBy || ''),
      q_type: String(q.type || 'single'),
      updated_at: updatedAt,
      raw_data: enriched
    };
  }

  sortQuestionsList(list) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      const na = Number(a && a.id);
      const nb = Number(b && b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return na - nb;
      }
      return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
  }

  mergeQuestionListsById(baseList, overlayList) {
    const map = new Map();
    (Array.isArray(baseList) ? baseList : []).forEach(q => {
      if (q && q.id !== undefined && q.id !== null) {
        map.set(String(q.id), q);
      }
    });
    (Array.isArray(overlayList) ? overlayList : []).forEach(q => {
      if (!q || q.id === undefined || q.id === null) return;
      const key = String(q.id);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, q);
      } else {
        const prevTs = String(prev.updatedAt || '');
        const nextTs = String(q.updatedAt || '');
        if (!prevTs || (nextTs && nextTs >= prevTs)) {
          map.set(key, q);
        }
      }
    });
    return this.sortQuestionsList(Array.from(map.values()));
  }

  applyPendingQuestionOverlay(remoteQuestions) {
    const ops = this.loadPendingQuestionOps();
    const deleteSet = new Set([
      ...Object.keys(ops.deletes || {}),
      ...Array.from(this.inflightDeletes || [])
    ]);

    const baseFiltered = (Array.isArray(remoteQuestions) ? remoteQuestions : [])
      .filter(q => q && q.id !== undefined && q.id !== null && !deleteSet.has(String(q.id)));

    const overlayList = [
      ...Object.values(ops.upserts || {}),
      ...Array.from((this.inflightUpserts && this.inflightUpserts.values()) || [])
    ];

    return this.mergeQuestionListsById(baseFiltered, overlayList);
  }

  async hasAnyPerRowQuestionsRemote() {
    if (!this.client || !this.isConnected) return false;
    try {
      if (!this.questionTableMissing) {
        const { data, error } = await this.client
          .from('cbt_questions')
          .select('question_key')
          .limit(1);

        if (!error) {
          if (Array.isArray(data) && data.length > 0) return true;
        } else if (this.isMissingQuestionsTableError(error)) {
          this.questionTableMissing = true;
        }
      }

      const { data: fbData, error: fbErr } = await this.client
        .from('cbt_exam_results')
        .select('id')
        .eq('student_nisn', '__CBT_QUESTION_ROW__')
        .limit(1);

      return !fbErr && Array.isArray(fbData) && fbData.length > 0;
    } catch (e) {
      return false;
    }
  }

  markQuestionsMigrationDoneLocal() {
    try {
      localStorage.setItem(this.questionsMigrationStorageKey, '1');
    } catch (e) {}
  }

  async markQuestionsMigrationDoneRemote() {
    this.markQuestionsMigrationDoneLocal();
    if (!this.client || !this.isConnected) return false;
    try {
      await this.pushStateKey('cbt_questions_migrated_v1', {
        migrated: true,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async isQuestionsMigrationCompleted() {
    try {
      if (localStorage.getItem(this.questionsMigrationStorageKey) === '1') {
        return true;
      }
    } catch (e) {}

    if (!this.client || !this.isConnected) return false;

    const hasRows = await this.hasAnyPerRowQuestionsRemote();
    if (hasRows) {
      this.markQuestionsMigrationDoneLocal();
      return true;
    }

    try {
      if (!this.stateTableMissing) {
        const { data, error } = await this.client
          .from('cbt_school_state')
          .select('value')
          .eq('key', 'cbt_questions_migrated_v1')
          .limit(1);
        if (!error && Array.isArray(data) && data.length > 0 && data[0].value) {
          this.markQuestionsMigrationDoneLocal();
          return true;
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      const { data: fbMarker, error: fbErr } = await this.client
        .from('cbt_exam_results')
        .select('id')
        .eq('student_nisn', '__CBT_STATE__')
        .eq('student_name', 'cbt_questions_migrated_v1')
        .limit(1);
      if (!fbErr && Array.isArray(fbMarker) && fbMarker.length > 0) {
        this.markQuestionsMigrationDoneLocal();
        return true;
      }
    } catch (e) {}

    return false;
  }

  async ensureQuestionsMigratedToRows(fallbackLocalQuestions = []) {
    if (!this.client || !this.isConnected) return false;
    if (this._migrationPromise) return this._migrationPromise;

    this._migrationPromise = (async () => {
      try {
        const alreadyMigrated = await this.isQuestionsMigrationCompleted();
        if (alreadyMigrated) return true;

        let legacyQuestions = [];
        if (!this.stateTableMissing) {
          const { data, error } = await this.client
            .from('cbt_school_state')
            .select('value')
            .eq('key', 'cbt_questions')
            .limit(1);
          if (!error && Array.isArray(data) && data[0] && Array.isArray(data[0].value)) {
            legacyQuestions = data[0].value;
          } else if (this.isMissingTableError(error)) {
            this.stateTableMissing = true;
          }
        }

        if (legacyQuestions.length === 0) {
          const { data: fbState } = await this.client
            .from('cbt_exam_results')
            .select('raw_data, id')
            .eq('student_nisn', '__CBT_STATE__')
            .eq('student_name', 'cbt_questions')
            .order('id', { ascending: false })
            .limit(1);
          if (Array.isArray(fbState) && fbState[0] && Array.isArray(fbState[0].raw_data)) {
            legacyQuestions = fbState[0].raw_data;
          }
        }

        const seedList = legacyQuestions.length > 0
          ? legacyQuestions
          : (Array.isArray(fallbackLocalQuestions) ? fallbackLocalQuestions : []);

        if (seedList.length > 0) {
          await this.upsertQuestionRows(seedList, { skipMigrationCheck: true, skipPendingMark: true });
        }
        await this.markQuestionsMigrationDoneRemote();
        return true;
      } catch (e) {
        return false;
      } finally {
        this._migrationPromise = null;
      }
    })();

    return this._migrationPromise;
  }

  async upsertQuestionRow(questionObj, seedFallback = []) {
    if (!questionObj || questionObj.id === undefined || questionObj.id === null) {
      return { success: false, message: 'ID soal tidak valid.' };
    }
    return this.upsertQuestionRows([questionObj], { seedFallback });
  }

  async upsertQuestionRows(questionsArray, options = {}) {
    const validList = (Array.isArray(questionsArray) ? questionsArray : [])
      .filter(q => q && q.id !== undefined && q.id !== null);

    if (validList.length === 0) return { success: true, count: 0 };

    // Catat ke antrean pending SECARA SINKRON sebelum request jaringan agar tidak hilang jika browser direfresh/ditutup mendadak
    if (!options.skipPendingMark) {
      this.markQuestionsPendingUpsert(validList);
    }

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true, count: 0 };
    }

    const trackedKeys = [];
    if (!options.skipInflightTrack) {
      validList.forEach(q => {
        const k = String(q.id);
        trackedKeys.push(k);
        this.inflightDeletes.delete(k);
        this.inflightUpserts.set(k, q);
      });
    }

    try {
      if (!options.skipMigrationCheck) {
        await this.ensureQuestionsMigratedToRows(options.seedFallback || []);
      }

      const CHUNK_SIZE = 50;
      let syncedCount = 0;

      for (let i = 0; i < validList.length; i += CHUNK_SIZE) {
        const chunk = validList.slice(i, i + CHUNK_SIZE);
        const payloads = chunk.map(q => this.buildQuestionRowPayload(q));
        const chunkKeys = payloads.map(p => p.question_key);
        let chunkSaved = false;

        if (!this.questionTableMissing) {
          const { error } = await this.client
            .from('cbt_questions')
            .upsert(payloads, { onConflict: 'question_key' });

          if (!error) {
            chunkSaved = true;
          } else if (this.isMissingQuestionsTableError(error)) {
            this.questionTableMissing = true;
          } else {
            console.warn('Gagal upsert cbt_questions:', error.message);
          }
        }

        if (!chunkSaved) {
          await this.client
            .from('cbt_exam_results')
            .delete()
            .eq('student_nisn', '__CBT_QUESTION_ROW__')
            .in('exam_title', chunkKeys);

          const fbRows = payloads.map(p => ({
            student_name: p.created_by || 'Guru',
            student_nisn: '__CBT_QUESTION_ROW__',
            student_class: p.class_level,
            exam_title: p.question_key,
            subject: p.subject,
            final_score: 0,
            correct_count: 0,
            incorrect_count: 0,
            unattempted_count: 0,
            total_questions: 1,
            cheat_count: 0,
            completed_at: p.updated_at,
            finish_reason: p.q_type,
            raw_data: p.raw_data
          }));

          const { error: fbErr } = await this.client
            .from('cbt_exam_results')
            .insert(fbRows);

          if (fbErr) {
            this.markQuestionsPendingUpsert(validList.slice(i));
            return { success: false, queued: true, message: fbErr.message, count: syncedCount };
          }
          chunkSaved = true;
        }

        if (chunkSaved) {
          this.clearQuestionsPendingKeys(chunkKeys, 'upsert');
          syncedCount += chunk.length;
        }
      }

      if (syncedCount > 0) {
        this.markQuestionsMigrationDoneLocal();
      }

      return { success: true, count: syncedCount };
    } catch (err) {
      this.markQuestionsPendingUpsert(validList);
      return { success: false, queued: true, message: err.message };
    } finally {
      trackedKeys.forEach(k => this.inflightUpserts.delete(k));
    }
  }

  async deleteQuestionRow(questionId, seedFallback = []) {
    if (questionId === undefined || questionId === null) return { success: false };
    const key = String(questionId);

    // Catat penghapusan secara sinkron sebelum request jaringan agar tidak muncul kembali jika browser direfresh
    this.markQuestionPendingDelete(key);

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true };
    }

    this.inflightUpserts.delete(key);
    this.inflightDeletes.add(key);

    try {
      await this.ensureQuestionsMigratedToRows(seedFallback);

      let deletedOk = false;
      if (!this.questionTableMissing) {
        const { error } = await this.client
          .from('cbt_questions')
          .delete()
          .eq('question_key', key);

        if (!error) {
          deletedOk = true;
        } else if (this.isMissingQuestionsTableError(error)) {
          this.questionTableMissing = true;
        } else {
          console.warn(`Gagal hapus cbt_questions[${key}]:`, error.message);
        }
      }

      const { error: fbErr } = await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', '__CBT_QUESTION_ROW__')
        .eq('exam_title', key);

      if (deletedOk || !fbErr) {
        this.clearQuestionsPendingKeys([key], 'both');
        this.markQuestionsMigrationDoneLocal();
        return { success: true };
      }

      return { success: false, queued: true, message: fbErr ? fbErr.message : 'Gagal menghapus soal di cloud.' };
    } catch (err) {
      return { success: false, queued: true, message: err.message };
    } finally {
      this.inflightDeletes.delete(key);
    }
  }

  async replaceAllQuestionRows(questionsArray) {
    const validList = (Array.isArray(questionsArray) ? questionsArray : [])
      .filter(q => q && q.id !== undefined && q.id !== null);

    this.savePendingQuestionOps({ upserts: {}, deletes: {} });
    if (validList.length > 0) {
      this.markQuestionsPendingUpsert(validList);
    }

    if (!this.client || !this.isConnected) {
      return { success: false, queued: true };
    }

    try {
      if (!this.questionTableMissing) {
        const { error } = await this.client
          .from('cbt_questions')
          .delete()
          .neq('question_key', '__NEVER_MATCH__');
        if (error && this.isMissingQuestionsTableError(error)) {
          this.questionTableMissing = true;
        }
      }

      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', '__CBT_QUESTION_ROW__');

      const res = await this.upsertQuestionRows(validList, { skipMigrationCheck: true, skipPendingMark: true });
      await this.pushStateKey('cbt_questions', validList);
      await this.markQuestionsMigrationDoneRemote();
      return res;
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async flushPendingQuestionOps() {
    if (!this.client || !this.isConnected) return false;
    if (this._flushPromise) return this._flushPromise;

    this._flushPromise = (async () => {
      try {
        const ops = this.loadPendingQuestionOps();
        const pendingUpserts = Object.values(ops.upserts || {});
        const pendingDeletes = Object.keys(ops.deletes || {});

        if (pendingUpserts.length === 0 && pendingDeletes.length === 0) return true;

        if (pendingUpserts.length > 0) {
          await this.upsertQuestionRows(pendingUpserts, { skipPendingMark: true });
        }
        for (const delKey of pendingDeletes) {
          await this.deleteQuestionRow(delKey);
        }
        return true;
      } finally {
        this._flushPromise = null;
      }
    })();

    return this._flushPromise;
  }

  async fetchAllQuestionRows() {
    if (!this.client || !this.isConnected) {
      return { success: false, rows: [] };
    }

    const rowMap = new Map();
    const putRow = (qObj, updatedAtFallback = '') => {
      if (!qObj || typeof qObj !== 'object' || qObj.id === undefined || qObj.id === null) return false;
      const k = String(qObj.id);
      const prev = rowMap.get(k);
      const nextTs = String(qObj.updatedAt || updatedAtFallback || '');
      const prevTs = prev ? String(prev.updatedAt || '') : '';
      if (!prev || (!prevTs && nextTs) || (nextTs && nextTs >= prevTs)) {
        rowMap.set(k, updatedAtFallback && !qObj.updatedAt ? { ...qObj, updatedAt: updatedAtFallback } : qObj);
        return true;
      }
      return false;
    };

    try {
      let primaryOk = false;
      if (!this.questionTableMissing) {
        let from = 0;
        const PAGE = 1000;
        primaryOk = true;

        while (true) {
          const { data, error } = await this.client
            .from('cbt_questions')
            .select('question_key, updated_at, raw_data')
            .range(from, from + PAGE - 1);

          if (error) {
            if (this.isMissingQuestionsTableError(error)) {
              this.questionTableMissing = true;
            }
            primaryOk = false;
            break;
          }

          if (Array.isArray(data)) {
            data.forEach(r => {
              if (r && r.raw_data && typeof r.raw_data === 'object') {
                putRow(r.raw_data, r.updated_at || '');
              }
            });
          }
          if (!Array.isArray(data) || data.length < PAGE) break;
          from += PAGE;
        }
      }

      // Selalu cek baris cadangan __CBT_QUESTION_ROW__ agar tidak ada soal guru lain yang tertinggal saat masa transisi tabel
      const fallbackToPromote = [];
      let fbFrom = 0;
      const FB_PAGE = 1000;
      let fbOk = true;
      while (true) {
        const { data: fbData, error: fbErr } = await this.client
          .from('cbt_exam_results')
          .select('exam_title, completed_at, raw_data, id')
          .eq('student_nisn', '__CBT_QUESTION_ROW__')
          .order('id', { ascending: false })
          .range(fbFrom, fbFrom + FB_PAGE - 1);

        if (fbErr || !Array.isArray(fbData)) {
          if (fbErr) fbOk = false;
          break;
        }
        fbData.forEach(r => {
          if (r && r.raw_data && typeof r.raw_data === 'object') {
            const updated = putRow(r.raw_data, r.completed_at || '');
            if (primaryOk && updated) {
              fallbackToPromote.push(rowMap.get(String(r.raw_data.id)));
            }
          }
        });
        if (fbData.length < FB_PAGE) break;
        fbFrom += FB_PAGE;
      }

      if (!primaryOk && !fbOk) {
        return { success: false, rows: [] };
      }

      // Jika tabel cbt_questions sudah aktif dan ada sisa soal di fallback, promosikan otomatis ke cbt_questions
      if (primaryOk && !this.questionTableMissing && fallbackToPromote.length > 0) {
        try {
          const promotePayloads = fallbackToPromote.map(q => this.buildQuestionRowPayload(q));
          const { error: promErr } = await this.client
            .from('cbt_questions')
            .upsert(promotePayloads, { onConflict: 'question_key' });
          if (!promErr) {
            await this.client
              .from('cbt_exam_results')
              .delete()
              .eq('student_nisn', '__CBT_QUESTION_ROW__')
              .in('exam_title', promotePayloads.map(p => p.question_key));
          }
        } catch (e) {}
      }

      if (rowMap.size > 0) {
        this.markQuestionsMigrationDoneLocal();
      }

      return {
        success: true,
        rows: this.sortQuestionsList(Array.from(rowMap.values())),
        source: this.questionTableMissing ? 'fallback_rows' : 'cbt_questions'
      };
    } catch (err) {
      console.warn('Gagal fetchAllQuestionRows:', err);
      return { success: false, rows: [] };
    }
  }

  // Kirim seluruh data sekolah dari perangkat saat ini ke Cloud Supabase (tanpa menimpa soal guru lain atau menghidupkan soal yang sudah dihapus)
  async pushAllSchoolState() {
    if (!this.client || !this.isConnected) {
      return { success: false, message: "Supabase Cloud belum terhubung." };
    }

    await this.flushPendingQuestionOps();

    let mergedQuestions = window.examEngine ? [...window.examEngine.questions] : [];
    const remoteQ = await this.fetchAllQuestionRows();
    const alreadyMigrated = remoteQ && remoteQ.success && (remoteQ.rows.length > 0 || await this.isQuestionsMigrationCompleted());

    if (alreadyMigrated) {
      // Gunakan bank soal Cloud sebagai sumber kebenaran + overlay antrean lokal yang belum terkirim
      mergedQuestions = this.applyPendingQuestionOverlay(remoteQ.rows);
      if (window.examEngine) {
        const prevSig = JSON.stringify((window.examEngine.questions || []).map(q => [q.id, q.updatedAt || '']));
        const nextSig = JSON.stringify(mergedQuestions.map(q => [q.id, q.updatedAt || '']));
        if (prevSig !== nextSig) {
          window.examEngine.saveQuestions(mergedQuestions, true);
        }
      }
    }

    const entries = [
      ['cbt_config', window.examEngine ? window.examEngine.config : null],
      ['cbt_school_config', window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : null],
      ['cbt_exam_schedules', window.cbtAdmin ? window.cbtAdmin.schedules : null],
      ['cbt_students_list', window.studentManager ? window.studentManager.getAllStudents() : null],
      ['cbt_teachers_list', window.cbtAdmin ? window.cbtAdmin.getAllTeachers() : null]
    ].filter(([, val]) => val !== null && val !== undefined);

    let pushed = 0;
    if (mergedQuestions.length > 0) {
      const qPush = await this.upsertQuestionRows(mergedQuestions, { skipMigrationCheck: true, skipPendingMark: true });
      await this.pushStateKey('cbt_questions', mergedQuestions);
      await this.markQuestionsMigrationDoneRemote();
      if (qPush && qPush.success) pushed++;
    } else if (alreadyMigrated) {
      await this.pushStateKey('cbt_questions', []);
      await this.markQuestionsMigrationDoneRemote();
      pushed++;
    }

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
      await this.flushPendingQuestionOps();

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
        } else if (this.isMissingTableError(error)) {
          this.stateTableMissing = true;
        }
      }

      if (Object.keys(stateMap).length === 0) {
        // Fallback otomatis dari tabel cbt_exam_results
        const { data: fbData, error: fbError } = await this.client
          .from('cbt_exam_results')
          .select('student_name, raw_data, id')
          .eq('student_nisn', '__CBT_STATE__')
          .neq('exam_title', '__CBT_LIVE_SESSION__')
          .order('id', { ascending: false });

        if (!fbError && Array.isArray(fbData)) {
          fbData.forEach(row => {
            if (row && row.student_name && row.raw_data !== undefined && stateMap[row.student_name] === undefined) {
              stateMap[row.student_name] = row.raw_data;
            }
          });
        }
      }

      // Ambil soal per-baris dari cbt_questions (atau fallback __CBT_QUESTION_ROW__)
      const qRes = await this.fetchAllQuestionRows();
      const hasMigrated = qRes && qRes.success && (qRes.rows.length > 0 || await this.isQuestionsMigrationCompleted());

      if (hasMigrated) {
        stateMap.cbt_questions = qRes.rows;
        stateMap.cbt_questions_migrated = true;
      } else if (Array.isArray(stateMap.cbt_questions) && stateMap.cbt_questions.length > 0) {
        // Auto-migrasi dari penyimpanan lama 1-JSON ke per-baris
        await this.upsertQuestionRows(stateMap.cbt_questions, { skipMigrationCheck: true, skipPendingMark: true });
        await this.markQuestionsMigrationDoneRemote();
        stateMap.cbt_questions_migrated = true;
      }

      return { success: true, state: stateMap };
    } catch (err) {
      console.warn("Gagal pullAllSchoolState:", err);
      return { success: false, state: stateMap };
    }
  }

  isMissingSessionTableError(error) {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    return (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      (msg.includes('cbt_student_sessions') && (msg.includes('does not exist') || msg.includes('not find the table') || msg.includes('schema cache')))
    );
  }

  buildSessionKey(nisn, subject) {
    const n = String(nisn || '').trim().toUpperCase();
    const s = String(subject || '').trim().toLowerCase();
    return `${n}__${s}`;
  }

  saveLocalStudentSession(sessionObj) {
    if (!sessionObj || !sessionObj.nisn) return;
    try {
      const key = this.buildSessionKey(sessionObj.nisn, sessionObj.subject);
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      const filtered = Array.isArray(list) ? list.filter(x => this.buildSessionKey(x.nisn, x.subject) !== key) : [];
      filtered.unshift({ ...sessionObj, sessionKey: key });
      localStorage.setItem('cbt_local_student_sessions', JSON.stringify(filtered.slice(0, 500)));
    } catch (e) {}
  }

  removeLocalStudentSession(nisn, subject) {
    try {
      const key = this.buildSessionKey(nisn, subject);
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      const filtered = Array.isArray(list) ? list.filter(x => this.buildSessionKey(x.nisn, x.subject) !== key) : [];
      localStorage.setItem('cbt_local_student_sessions', JSON.stringify(filtered));
    } catch (e) {}
  }

  getLocalStudentSessions() {
    try {
      const list = JSON.parse(localStorage.getItem('cbt_local_student_sessions') || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  // Kirim status login / sedang mengerjakan / selesai siswa secara real-time
  async upsertStudentSession(sessionObj) {
    if (!sessionObj || !sessionObj.nisn) return { success: false };
    const sessionKey = this.buildSessionKey(sessionObj.nisn, sessionObj.subject);
    const enriched = {
      ...sessionObj,
      sessionKey,
      updatedAt: sessionObj.updatedAt || new Date().toISOString()
    };
    this.saveLocalStudentSession(enriched);

    if (!this.client || !this.isConnected) return { success: true, localOnly: true };

    try {
      if (!this.sessionTableMissing) {
        const { error } = await this.client
          .from('cbt_student_sessions')
          .upsert({
            session_key: sessionKey,
            student_nisn: String(enriched.nisn || ''),
            student_name: String(enriched.name || '-'),
            student_class: String(enriched.class || 'Umum'),
            subject: String(enriched.subject || ''),
            status: String(enriched.status || 'logged_in'),
            attempt_number: parseInt(enriched.attemptNumber, 10) || 1,
            answered_count: parseInt(enriched.answeredCount, 10) || 0,
            total_questions: parseInt(enriched.totalQuestions, 10) || 0,
            remaining_seconds: parseInt(enriched.remainingSeconds, 10) || 0,
            cheat_count: parseInt(enriched.cheatCount, 10) || 0,
            final_score: enriched.finalScore !== undefined ? enriched.finalScore : null,
            login_at: enriched.loginAt || enriched.updatedAt,
            started_at: enriched.startedAt || null,
            completed_at: enriched.completedAt || null,
            updated_at: enriched.updatedAt,
            raw_data: enriched
          }, { onConflict: 'session_key' });

        if (!error) return { success: true };
        if (this.isMissingSessionTableError(error)) {
          this.sessionTableMissing = true;
        }
      }

      // Fallback otomatis via cbt_exam_results (tidak perlu buat tabel tambahan)
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('exam_title', '__CBT_LIVE_SESSION__')
        .eq('student_nisn', String(enriched.nisn || ''))
        .eq('subject', String(enriched.subject || ''));

      const { error: fbErr } = await this.client
        .from('cbt_exam_results')
        .insert([{
          student_name: String(enriched.name || '-'),
          student_nisn: String(enriched.nisn || ''),
          student_class: String(enriched.class || 'Umum'),
          exam_title: '__CBT_LIVE_SESSION__',
          subject: String(enriched.subject || ''),
          final_score: enriched.finalScore !== undefined && enriched.finalScore !== null ? enriched.finalScore : 0,
          correct_count: parseInt(enriched.answeredCount, 10) || 0,
          incorrect_count: 0,
          unattempted_count: 0,
          total_questions: parseInt(enriched.totalQuestions, 10) || 0,
          cheat_count: parseInt(enriched.cheatCount, 10) || 0,
          completed_at: String(enriched.updatedAt || new Date().toISOString()),
          finish_reason: String(enriched.status || 'logged_in'),
          raw_data: enriched
        }]);

      return { success: !fbErr };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async removeStudentSession(nisn, subject) {
    if (!nisn) return { success: false };
    this.removeLocalStudentSession(nisn, subject);
    if (!this.client || !this.isConnected) return { success: true, localOnly: true };

    const sessionKey = this.buildSessionKey(nisn, subject);
    try {
      if (!this.sessionTableMissing) {
        await this.client
          .from('cbt_student_sessions')
          .delete()
          .eq('session_key', sessionKey);
      }
      await this.client
        .from('cbt_exam_results')
        .delete()
        .eq('exam_title', '__CBT_LIVE_SESSION__')
        .eq('student_nisn', String(nisn).trim())
        .eq('subject', String(subject || '').trim());
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async fetchStudentSessions() {
    const localList = this.getLocalStudentSessions();
    if (!this.client || !this.isConnected) {
      return { success: false, data: localList };
    }

    const sessionMap = new Map();
    const putSession = (item) => {
      if (!item || !item.nisn) return;
      const k = this.buildSessionKey(item.nisn, item.subject);
      const prev = sessionMap.get(k);
      if (!prev || String(item.updatedAt || '') >= String(prev.updatedAt || '')) {
        sessionMap.set(k, { ...item, sessionKey: k });
      }
    };

    try {
      let fetchedFromPrimary = false;
      if (!this.sessionTableMissing) {
        const { data, error } = await this.client
          .from('cbt_student_sessions')
          .select('*')
          .order('updated_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          fetchedFromPrimary = true;
          data.forEach(row => {
            const obj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.status,
              attemptNumber: row.attempt_number,
              answeredCount: row.answered_count,
              totalQuestions: row.total_questions,
              remainingSeconds: row.remaining_seconds,
              cheatCount: row.cheat_count,
              finalScore: row.final_score,
              loginAt: row.login_at,
              startedAt: row.started_at,
              completedAt: row.completed_at,
              updatedAt: row.updated_at
            };
            putSession(obj);
          });
        } else if (this.isMissingSessionTableError(error)) {
          this.sessionTableMissing = true;
        }
      }

      if (!fetchedFromPrimary) {
        const { data: fbData, error: fbErr } = await this.client
          .from('cbt_exam_results')
          .select('*')
          .eq('exam_title', '__CBT_LIVE_SESSION__')
          .order('id', { ascending: false });

        if (!fbErr && Array.isArray(fbData)) {
          fbData.forEach(row => {
            const obj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.finish_reason || 'logged_in',
              answeredCount: row.correct_count || 0,
              totalQuestions: row.total_questions || 0,
              cheatCount: row.cheat_count || 0,
              updatedAt: row.completed_at
            };
            putSession(obj);
          });
        }
      }

      localList.forEach(putSession);
      return { success: true, data: Array.from(sessionMap.values()) };
    } catch (err) {
      return { success: false, data: localList, message: err.message };
    }
  }

  async fetchStudentAttemptsFromCloud(nisn) {
    if (!this.client || !this.isConnected || !nisn) return [];
    try {
      const { data, error } = await this.client
        .from('cbt_exam_results')
        .select('*')
        .eq('student_nisn', String(nisn).trim())
        .neq('exam_title', '__CBT_LIVE_SESSION__');

      if (error || !Array.isArray(data)) return [];
      return data
        .filter(row => row.student_nisn !== '__CBT_STATE__' && row.student_nisn !== '__CBT_QUESTION_ROW__' && row.exam_title !== '__CBT_LIVE_SESSION__')
        .map(row => row.raw_data ? row.raw_data : {
          id: row.id,
          student: { name: row.student_name, nisn: row.student_nisn, class: row.student_class },
          subject: row.subject,
          completedAt: row.completed_at,
          finalScore: row.final_score
        });
    } catch (e) {
      return [];
    }
  }

  async deleteStudentResultsFromCloud(nisn, subject = null) {
    if (!this.client || !this.isConnected || !nisn) return { success: false };
    try {
      let query = this.client
        .from('cbt_exam_results')
        .delete()
        .eq('student_nisn', String(nisn).trim())
        .neq('exam_title', '__CBT_LIVE_SESSION__');
      if (subject) {
        query = query.eq('subject', String(subject).trim());
      }
      await query;
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
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
        .neq('student_nisn', '__CBT_QUESTION_ROW__')
        .neq('exam_title', '__CBT_LIVE_SESSION__')
        .order('final_score', { ascending: false });

      if (error) {
        return { success: false, message: error.message, data: JSON.parse(localStorage.getItem('cbt_exam_results') || '[]') };
      }

      const formatted = (data || [])
        .filter(row => row.student_nisn !== '__CBT_STATE__' && row.student_nisn !== '__CBT_QUESTION_ROW__' && row.exam_title !== '__CBT_LIVE_SESSION__')
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

  // Subscribe ke Supabase Realtime (postgres_changes) untuk notifikasi instan pelanggaran, selesai ujian & perubahan soal per-baris
  subscribeToRealtimeNotifications(onSessionEvent, onResultEvent, onQuestionEvent) {
    this.unsubscribeRealtimeNotifications();
    if (!this.client || !this.isConnected || typeof this.client.channel !== 'function') {
      return null;
    }

    try {
      const channel = this.client
        .channel('cbt-admin-realtime-alerts-' + Date.now())
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cbt_student_sessions' },
          (payload) => {
            const row = payload && (payload.new || payload.record);
            if (!row || !row.student_nisn) return;
            const sessionObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              nisn: row.student_nisn,
              name: row.student_name,
              class: row.student_class,
              subject: row.subject,
              status: row.status,
              attemptNumber: row.attempt_number,
              answeredCount: row.answered_count,
              totalQuestions: row.total_questions,
              remainingSeconds: row.remaining_seconds,
              cheatCount: row.cheat_count,
              finalScore: row.final_score,
              completedAt: row.completed_at,
              updatedAt: row.updated_at
            };
            if (typeof onSessionEvent === 'function') {
              onSessionEvent(sessionObj);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cbt_questions' },
          (payload) => {
            if (typeof onQuestionEvent === 'function') {
              onQuestionEvent(payload);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'cbt_exam_results' },
          (payload) => {
            const row = payload && payload.new;
            if (!row || row.student_nisn === '__CBT_STATE__') return;

            if (row.student_nisn === '__CBT_QUESTION_ROW__') {
              if (typeof onQuestionEvent === 'function') {
                onQuestionEvent(payload);
              }
              return;
            }

            if (row.exam_title === '__CBT_LIVE_SESSION__') {
              const sessionObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
                nisn: row.student_nisn,
                name: row.student_name,
                class: row.student_class,
                subject: row.subject,
                status: row.finish_reason || 'logged_in',
                answeredCount: row.correct_count || 0,
                totalQuestions: row.total_questions || 0,
                cheatCount: row.cheat_count || 0,
                finalScore: row.final_score,
                updatedAt: row.completed_at
              };
              if (typeof onSessionEvent === 'function') {
                onSessionEvent(sessionObj);
              }
              return;
            }

            const resultObj = row.raw_data && typeof row.raw_data === 'object' ? row.raw_data : {
              id: row.id,
              student: {
                name: row.student_name,
                nisn: row.student_nisn,
                class: row.student_class
              },
              examTitle: row.exam_title,
              subject: row.subject,
              finalScore: row.final_score,
              cheatCount: row.cheat_count || 0,
              completedAt: row.completed_at,
              finishReason: row.finish_reason
            };
            if (typeof onResultEvent === 'function') {
              onResultEvent(resultObj);
            }
          }
        );

      channel.subscribe();
      this.realtimeChannel = channel;
      return channel;
    } catch (err) {
      console.warn('Supabase Realtime channel tidak tersedia, menggunakan polling sinkronisasi:', err);
      return null;
    }
  }

  unsubscribeRealtimeNotifications() {
    if (this.realtimeChannel && this.client && typeof this.client.removeChannel === 'function') {
      try {
        this.client.removeChannel(this.realtimeChannel);
      } catch (e) {}
    }
    this.realtimeChannel = null;
  }
}

if (typeof window !== 'undefined') {
  window.supabaseSync = new SupabaseSyncManager();
}
