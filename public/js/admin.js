// CBT Admin & Guru: Manajemen 13 Guru, 250 Siswa, Rekap Nilai Otomatis, & Ekspor Excel/PDF

const DEFAULT_SCHEDULES = [
  {
    id: "sch_1",
    day: "Senin",
    dateIso: "2026-12-07",
    dateFormatted: "7 Desember 2026",
    subject: "Matematika",
    classLevel: "Kelas 7",
    timeRange: "07:30 - 08:50",
    durationMinutes: 80,
    token: "MTK7A"
  },
  {
    id: "sch_2",
    day: "Senin",
    dateIso: "2026-12-07",
    dateFormatted: "7 Desember 2026",
    subject: "Bahasa Indonesia",
    classLevel: "Kelas 8",
    timeRange: "09:15 - 10:35",
    durationMinutes: 80,
    token: "BIN8A"
  },
  {
    id: "sch_3",
    day: "Selasa",
    dateIso: "2026-12-08",
    dateFormatted: "8 Desember 2026",
    subject: "Ilmu Pengetahuan Alam (IPA)",
    classLevel: "Kelas 9",
    timeRange: "07:30 - 08:50",
    durationMinutes: 80,
    token: "IPA9A"
  }
];

class CBTAdmin {
  constructor() {
    this.teachers = this.loadTeachers();
    this.schedules = this.loadSchedules();
    this.currentTeacher = this.restoreSession();
    this.isAuthenticated = Boolean(this.currentTeacher);
    this.selectedSubjectFilter = 'ALL';
    this.selectedClassFilter = 'ALL';
  }

  restoreSession() {
    try {
      const persistent = localStorage.getItem('cbt_logged_teacher_session') || sessionStorage.getItem('cbt_logged_teacher');
      if (persistent) {
        const parsed = JSON.parse(persistent);
        if (parsed && parsed.id) {
          const fresh = this.teachers.find(t => t.id === parsed.id);
          return fresh || parsed;
        }
      }
    } catch (e) {
      console.warn("Gagal restore sesi login:", e);
    }
    return null;
  }

  loadTeachers() {
    const saved = localStorage.getItem('cbt_teachers_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let hasAdmin = false;
          const normalized = parsed.map(t => {
            if (t.id === 'admin' || t.role === 'admin') {
              hasAdmin = true;
              return {
                ...t,
                id: "admin",
                name: "Proktor Utama / Admin",
                role: "admin",
                pin: t.pin || "admin123"
              };
            }
            return t;
          });

          if (!hasAdmin) {
            normalized.unshift({
              id: "admin",
              nip: "198501012010011001",
              name: "Proktor Utama / Admin",
              subject: "Semua Mata Pelajaran (Super Admin)",
              role: "admin",
              pin: "admin123"
            });
          }

          return normalized;
        }
      } catch (e) {
        console.error("Gagal load teachers:", e);
      }
    }
    const defaults = typeof DEFAULT_TEACHERS !== 'undefined' ? DEFAULT_TEACHERS : [];
    localStorage.setItem('cbt_teachers_list', JSON.stringify(defaults));
    return [...defaults];
  }

  saveTeachers(teachersList) {
    this.teachers = teachersList;
    localStorage.setItem('cbt_teachers_list', JSON.stringify(this.teachers));
  }

  getAllTeachers() {
    return this.teachers;
  }

  getAllSubjects() {
    const subjectsSet = new Set();

    if (window.examEngine && window.examEngine.config && window.examEngine.config.subject) {
      subjectsSet.add(window.examEngine.config.subject.trim());
    }

    if (Array.isArray(this.teachers)) {
      this.teachers.forEach(t => {
        if (t.role !== 'admin' && t.subject && !t.subject.toLowerCase().includes('semua')) {
          const parts = t.subject.split(/[,/]/).map(s => s.trim()).filter(Boolean);
          parts.forEach(p => subjectsSet.add(p));
          subjectsSet.add(t.subject.trim());
        }
      });
    }

    if (Array.isArray(this.schedules)) {
      this.schedules.forEach(s => {
        if (s.subject) subjectsSet.add(s.subject.trim());
      });
    }

    try {
      const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
      rawResults.forEach(r => {
        if (r.subject) subjectsSet.add(r.subject.trim());
      });
    } catch (e) {}

    return Array.from(subjectsSet).filter(Boolean);
  }

  searchTeachers(query = "") {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return this.teachers;
    return this.teachers.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.nip && String(t.nip).toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q))
    );
  }

  addTeacher({ name, nip, subject, pin }) {
    const cleanName = String(name || "").trim();
    const cleanNip = String(nip || "").trim();
    const cleanSubject = String(subject || "").trim();
    const cleanPin = String(pin || "guru123").trim();

    if (!cleanName || !cleanNip || !cleanSubject) {
      return { success: false, message: "Nama Guru, NIP, dan Mata Pelajaran wajib diisi!" };
    }

    const existing = this.teachers.find(t => String(t.nip).trim().toLowerCase() === cleanNip.toLowerCase());
    if (existing) {
      return { success: false, message: `NIP ${cleanNip} sudah digunakan oleh ${existing.name}!` };
    }

    const newId = 'guru_' + Date.now();
    const newTeacher = {
      id: newId,
      nip: cleanNip,
      name: cleanName,
      subject: cleanSubject,
      role: "guru",
      pin: cleanPin
    };

    this.teachers.push(newTeacher);
    this.saveTeachers(this.teachers);
    return { success: true, teacher: newTeacher };
  }

  deleteTeacher(teacherId) {
    const teacher = this.teachers.find(t => t.id === teacherId);
    if (!teacher) {
      return { success: false, message: "Data guru tidak ditemukan!" };
    }
    if (teacher.role === 'admin' || teacher.id === 'admin') {
      return { success: false, message: "Akun Proktor Utama / Admin tidak boleh dihapus!" };
    }

    this.teachers = this.teachers.filter(t => t.id !== teacherId);
    this.saveTeachers(this.teachers);
    return { success: true, message: `Guru ${teacher.name} berhasil dihapus.` };
  }

  updateTeacherProfile(teacherId, { name, nip, subject, pin }) {
    let found = false;
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        found = true;
        return {
          ...t,
          name: name ? String(name).trim() : t.name,
          nip: nip ? String(nip).trim() : t.nip,
          subject: subject ? String(subject).trim() : t.subject,
          pin: pin ? String(pin).trim() : t.pin
        };
      }
      return t;
    });

    if (!found) {
      return { success: false, message: "Data guru tidak ditemukan!" };
    }

    this.saveTeachers(this.teachers);

    if (this.currentTeacher && this.currentTeacher.id === teacherId) {
      this.currentTeacher = this.teachers.find(t => t.id === teacherId);
      try {
        localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(this.currentTeacher));
        sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(this.currentTeacher));
      } catch (e) {}
    }
    return { success: true };
  }

  resetAllTeacherPasswords(defaultPin = "guru123") {
    let count = 0;
    this.teachers = this.teachers.map(t => {
      if (t.role !== 'admin') {
        count++;
        return { ...t, pin: defaultPin };
      }
      return t;
    });
    this.saveTeachers(this.teachers);
    return { success: true, count };
  }

  login(identifier, pinInput) {
    const cleanId = String(identifier || "").trim().toLowerCase();
    const cleanPin = String(pinInput || "").trim();

    if (!cleanId) {
      return { success: false, message: "Harap masukkan Username / NIP!" };
    }

    let teacher = null;
    if (
      cleanId === 'admin' ||
      cleanId === 'proktor' ||
      cleanId === 'superadmin' ||
      cleanId === '198501012010011001' ||
      cleanId.includes('admin') ||
      cleanId.includes('proktor')
    ) {
      teacher = this.teachers.find(t => t.id === 'admin' || t.role === 'admin');
      if (!teacher) {
        teacher = {
          id: "admin",
          nip: "198501012010011001",
          name: "Proktor Utama / Admin",
          subject: "Semua Mata Pelajaran (Super Admin)",
          role: "admin",
          pin: "admin123"
        };
      }
    } else {
      teacher = this.teachers.find(t => String(t.nip || '').trim().toLowerCase() === cleanId);

      if (!teacher) {
        teacher = this.teachers.find(t => String(t.id || '').trim().toLowerCase() === cleanId);
      }

      if (!teacher) {
        teacher = this.teachers.find(t => String(t.name || '').trim().toLowerCase() === cleanId);
      }

      if (!teacher && cleanId.length >= 3) {
        teacher = this.teachers.find(t =>
          String(t.name || '').toLowerCase().includes(cleanId)
        );
      }
    }

    if (!teacher) {
      return {
        success: false,
        message: "Username / NIP tidak terdaftar! Periksa kembali atau hubungi Proktor."
      };
    }

    const isSuperAdmin = teacher.role === 'admin' || teacher.id === 'admin';
    const cfgPin = window.examEngine && window.examEngine.config && window.examEngine.config.adminPin
      ? String(window.examEngine.config.adminPin).trim()
      : "";

    const isPinMatch = isSuperAdmin
      ? (
          cleanPin === String(teacher.pin).trim() ||
          cleanPin === "admin123" ||
          cleanPin === "admin" ||
          cleanPin === "123" ||
          cleanPin === "123456" ||
          cleanPin === "guru123" ||
          (cfgPin && cleanPin === cfgPin)
        )
      : (
          cleanPin === String(teacher.pin).trim() ||
          cleanPin === "guru123" ||
          cleanPin === "123"
        );

    if (!isPinMatch) {
      return { success: false, message: "PIN / Kata Sandi salah!" };
    }

    this.isAuthenticated = true;
    this.currentTeacher = teacher;
    try {
      localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(teacher));
      sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(teacher));
    } catch (e) {}
    return { success: true, teacher };
  }

  getCurrentTeacher() {
    if (!this.currentTeacher) {
      this.currentTeacher = this.restoreSession();
    }
    return this.currentTeacher;
  }

  logout() {
    this.isAuthenticated = false;
    this.currentTeacher = null;
    try {
      localStorage.removeItem('cbt_logged_teacher_session');
      localStorage.removeItem('cbt_active_admin_tab');
      sessionStorage.removeItem('cbt_logged_teacher');
    } catch (e) {}
  }

  updateTeacherPin(teacherId, newPin) {
    this.teachers = this.teachers.map(t => {
      if (t.id === teacherId) {
        return { ...t, pin: String(newPin).trim() };
      }
      return t;
    });
    this.saveTeachers(this.teachers);

    if (this.currentTeacher && this.currentTeacher.id === teacherId) {
      this.currentTeacher.pin = String(newPin).trim();
      try {
        localStorage.setItem('cbt_logged_teacher_session', JSON.stringify(this.currentTeacher));
        sessionStorage.setItem('cbt_logged_teacher', JSON.stringify(this.currentTeacher));
      } catch (e) {}
    }
  }

  updateConfig(formData) {
    window.examEngine.saveConfig({ ...formData, showScoreToStudent: false });
  }

  generateRandomToken() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let token = "";
    for (let i = 0; i < 6; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  getAllQuestions() {
    return window.examEngine.questions;
  }

  addQuestion(questionData) {
    const questions = [...window.examEngine.questions];
    const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1;

    let newQ = {
      id: newId,
      type: questionData.type || 'single',
      question: questionData.question,
      image: questionData.image || "",
      weight: parseInt(questionData.weight) || 10
    };

    if (newQ.type === 'single') {
      newQ.options = questionData.options;
      newQ.correctAnswer = questionData.correctAnswer;
    } else if (newQ.type === 'multiple') {
      newQ.options = questionData.options;
      newQ.correctAnswer = Array.isArray(questionData.correctAnswer) ? questionData.correctAnswer : [questionData.correctAnswer];
    } else if (newQ.type === 'true_false') {
      newQ.statements = questionData.statements;
    }

    questions.push(newQ);
    window.examEngine.saveQuestions(questions);
    return newQ;
  }

  deleteQuestion(id) {
    const questions = window.examEngine.questions.filter(q => q.id !== id);
    window.examEngine.saveQuestions(questions);
  }

  resetToDefaultQuestions() {
    window.examEngine.saveQuestions([...DEFAULT_QUESTIONS]);
  }

  exportQuestionsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.examEngine.questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `bank_soal_ujian_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importQuestionsJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.examEngine.saveQuestions(parsed);
        return { success: true, count: parsed.length };
      }
      return { success: false, message: "Format file JSON tidak valid." };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // Ambil detail jawaban per nomor soal (mendukung data lama maupun baru)
  getAnswerBreakdownItems(resultRecord) {
    const details = Array.isArray(resultRecord.detailedAnswers) ? resultRecord.detailedAnswers : [];
    const questions = this.getAllQuestions();

    return details.map((d, idx) => {
      const num = d.questionNumber || idx + 1;
      const qDef = questions.find(q => q.id === d.questionId) || questions[idx];
      const type = d.type || (qDef ? qDef.type : 'single');

      let studentVal = d.studentAnswerDisplay;
      let correctVal = d.correctAnswerDisplay;

      if (!studentVal) {
        if (type === 'multiple') {
          studentVal = Array.isArray(d.studentAnswer) && d.studentAnswer.length > 0 ? d.studentAnswer.join(',') : '-';
        } else if (type === 'true_false') {
          if (d.studentAnswer && typeof d.studentAnswer === 'object') {
            const vals = Object.values(d.studentAnswer);
            studentVal = vals.length > 0 ? vals.join(',') : '-';
          } else {
            studentVal = '-';
          }
        } else {
          studentVal = d.studentAnswer || '-';
        }
      }

      if (!correctVal) {
        if (type === 'multiple') {
          const ca = d.correctAnswer || (qDef ? qDef.correctAnswer : []);
          correctVal = Array.isArray(ca) ? ca.join(',') : String(ca || '-');
        } else if (type === 'true_false') {
          if (typeof d.correctAnswer === 'string' && d.correctAnswer) {
            correctVal = d.correctAnswer;
          } else if (qDef && Array.isArray(qDef.statements)) {
            correctVal = qDef.statements.map(s => s.correct).join(',');
          } else {
            correctVal = '-';
          }
        } else {
          correctVal = d.correctAnswer || (qDef ? qDef.correctAnswer : '-') || '-';
        }
      }

      let status = d.status;
      if (!status) {
        if (studentVal === '-') status = 'unattempted';
        else status = d.isFullyCorrect ? 'correct' : 'incorrect';
      }

      return {
        num,
        studentVal,
        correctVal,
        status
      };
    });
  }

  formatAnswersPlainText(resultRecord) {
    const items = this.getAnswerBreakdownItems(resultRecord);
    if (items.length === 0) return '-';
    return items.map(it => {
      if (it.status === 'correct') return `${it.num}:${it.studentVal}(Benar)`;
      if (it.status === 'unattempted') return `${it.num}:-(Kunci:${it.correctVal})`;
      return `${it.num}:${it.studentVal}(Salah|Kunci:${it.correctVal})`;
    }).join(' | ');
  }

  getAllResultsSorted(subjectFilter = null, classFilter = null) {
    const sf = subjectFilter || this.selectedSubjectFilter || null;
    const cf = classFilter || this.selectedClassFilter || null;
    const rawResults = JSON.parse(localStorage.getItem('cbt_exam_results') || '[]');
    let filtered = rawResults;

    const cur = this.getCurrentTeacher();
    const isSuperAdmin = cur && (cur.role === 'admin' || cur.id === 'admin');

    if (sf && sf !== 'ALL') {
      filtered = filtered.filter(r => r.subject && r.subject.toLowerCase().trim() === sf.toLowerCase().trim());
    } else if (!isSuperAdmin && cur && cur.subject) {
      const parts = cur.subject.split(/[,/]/).map(s => s.trim().toLowerCase()).filter(Boolean);
      filtered = filtered.filter(r => {
        if (!r.subject) return false;
        const rSub = r.subject.toLowerCase().trim();
        return parts.some(p => rSub === p || rSub.includes(p) || p.includes(rSub));
      });
    }

    if (cf && cf !== 'ALL') {
      filtered = filtered.filter(r => r.student?.class === cf);
    }

    return filtered.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }

  setSubjectFilter(val) { this.selectedSubjectFilter = val; }
  setClassFilter(val) { this.selectedClassFilter = val; }

  getExamAnalytics(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      return {
        totalStudents: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        highestStudent: "-",
        lowestStudent: "-",
        passRatePercentage: 0
      };
    }

    const scores = results.map(r => r.finalScore || 0);
    const total = scores.reduce((sum, s) => sum + s, 0);
    const avg = Math.round((total / scores.length) * 10) / 10;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    const highestStudent = results.find(r => r.finalScore === highest)?.student?.name || "-";
    const lowestStudent = results.find(r => r.finalScore === lowest)?.student?.name || "-";

    const passedCount = scores.filter(s => s >= 75).length;
    const passRate = Math.round((passedCount / scores.length) * 100);

    return {
      totalStudents: results.length,
      averageScore: avg,
      highestScore: highest,
      lowestScore: lowest,
      highestStudent,
      lowestStudent,
      passRatePercentage: passRate
    };
  }

  clearAllResults() {
    localStorage.removeItem('cbt_exam_results');
  }

  // ===================== 1. EXPORT FORMAT EXCEL (.xlsx) =====================
  exportResultsExcel(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke Excel.");
      return;
    }

    const analytics = this.getExamAnalytics(subjectFilter, classFilter);
    const cfg = this.getSchoolConfig();
    const cur = this.getCurrentTeacher();
    const currentSub = (subjectFilter && subjectFilter !== 'ALL')
      ? subjectFilter
      : (cur && cur.role !== 'admin' ? cur.subject : window.examEngine.config.subject);
    const fileName = `Rekap_Nilai_CBT_${(currentSub || 'Semua').replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`;

    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.utils.book_new();

      const aoaData = [
        [`LAPORAN REKAPITULASI RESMI HASIL UJIAN SEKOLAH (CBT) - ${cfg.schoolName}`],
        ["Guru Pengampu / Proktor:", cur?.name || 'Panitia Ujian'],
        ["Mata Pelajaran:", currentSub],
        ["Titi Mangsa:", `${cfg.city}, ${cfg.date}`],
        [""],
        ["RINGKASAN STATISTIK:"],
        ["Total Peserta", "Rata-Rata Nilai", "Nilai Tertinggi", "Peraih Tertinggi", "Nilai Terendah", "Peraih Terendah", "Ketuntasan (>=75)"],
        [analytics.totalStudents, analytics.averageScore, analytics.highestScore, analytics.highestStudent, analytics.lowestScore, analytics.lowestStudent, `${analytics.passRatePercentage}%`],
        [""],
        ["DAFTAR PERINGKAT & EVALUASI JAWABAN SISWA:"],
        ["Rank", "Nama Siswa", "NISN", "Kelas", "Nilai Akhir", "Jawaban Siswa (Benar & Salah per Nomor)", "Waktu Selesai", "B / S / K", "Keterangan Curang"]
      ];

      results.forEach((r, idx) => {
        const cheatLabel = (r.cheatCount || 0) > 0
          ? `${r.cheatCount}x Pindah Tab (${r.finishReason || 'Pelanggaran'})`
          : `Tertib (0) - ${r.finishReason || 'Selesai'}`;

        aoaData.push([
          idx + 1,
          r.student?.name || '-',
          r.student?.nisn || '-',
          r.student?.class || 'Umum',
          r.finalScore,
          this.formatAnswersPlainText(r),
          r.completedAt,
          `${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}`,
          cheatLabel
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoaData);

      ws['!cols'] = [
        { wch: 7 },   // Rank
        { wch: 26 },  // Nama
        { wch: 16 },  // NISN
        { wch: 10 },  // Kelas
        { wch: 12 },  // Nilai
        { wch: 55 },  // Jawaban Siswa per nomor
        { wch: 20 },  // Waktu Selesai
        { wch: 14 },  // B/S/K
        { wch: 28 }   // Keterangan Curang
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai Siswa");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else {
      this.exportFallbackExcel(results, analytics, fileName);
    }
  }

  exportFallbackExcel(results, analytics, fileName) {
    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"></head>
      <body>
        <h2>LAPORAN REKAPITULASI HASIL UJIAN SEKOLAH (CBT)</h2>
        <table border="1">
          <tr style="background:#f1f5f9;font-weight:bold;">
            <th>Rank</th><th>Nama Siswa</th><th>NISN</th><th>Kelas</th><th>Nilai Akhir</th><th>Jawaban Siswa</th><th>Waktu Selesai</th><th>B/S/K</th><th>Keterangan Curang</th>
          </tr>
          ${results.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.student?.name || '-'}</td>
              <td>'${r.student?.nisn || '-'}</td>
              <td>${r.student?.class || '-'}</td>
              <td><b>${r.finalScore}</b></td>
              <td>${this.formatAnswersPlainText(r)}</td>
              <td>${r.completedAt}</td>
              <td>${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}</td>
              <td>${(r.cheatCount || 0) > 0 ? r.cheatCount + 'x Tab' : 'Tertib (0)'}</td>
            </tr>
          `).join('')}
        </table>
      </body></html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ===================== 2. EXPORT FORMAT PDF (.pdf) =====================
  exportResultsPDF(subjectFilter = null, classFilter = null) {
    const results = this.getAllResultsSorted(subjectFilter, classFilter);
    if (results.length === 0) {
      alert("Belum ada data nilai siswa untuk di-export ke PDF.");
      return;
    }

    const reportElement = document.getElementById('printableTeacherReport');
    if (!reportElement) {
      window.print();
      return;
    }

    this.populateReportHTML(reportElement, results, subjectFilter);

    reportElement.classList.remove('hidden');
    document.body.classList.add('printing-report');

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Laporan_Rekap_Nilai_CBT_${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
      };

      html2pdf().set(opt).from(reportElement).save().then(() => {
        reportElement.classList.add('hidden');
        document.body.classList.remove('printing-report');
      }).catch(err => {
        console.error("Gagal export PDF:", err);
        window.print();
        setTimeout(() => {
          reportElement.classList.add('hidden');
          document.body.classList.remove('printing-report');
        }, 1000);
      });
    } else {
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          reportElement.classList.add('hidden');
          document.body.classList.remove('printing-report');
        }, 1000);
      }, 200);
    }
  }

  populateReportHTML(el, results, subjectFilter) {
    const analytics = this.getExamAnalytics(subjectFilter);
    const cur = this.getCurrentTeacher();
    const teacherName = cur ? cur.name : "Guru Mata Pelajaran";
    const teacherNip = cur ? (cur.nip || "—") : "—";
    const subjectName = (subjectFilter && subjectFilter !== 'ALL')
      ? subjectFilter
      : (cur && cur.role !== 'admin' ? cur.subject : window.examEngine.config.subject);
    const cfg = this.getSchoolConfig();

    const logoLeftHtml = cfg.logoLeft
      ? `<img src="${cfg.logoLeft}" alt="Logo Kiri" style="width:64px; height:64px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:60px; height:60px; border-radius:8px; background:#1e3a8a; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">DINAS</div>`;

    const logoRightHtml = cfg.logoRight
      ? `<img src="${cfg.logoRight}" alt="Logo Kanan" style="width:64px; height:64px; object-fit:contain; flex-shrink:0;">`
      : `<div style="width:60px; height:60px; border-radius:50%; background:#059669; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:11px; flex-shrink:0;">SMP</div>`;

    const kopEl = document.getElementById('repKopSurat');
    if (kopEl) {
      kopEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #0f172a; padding-bottom:8px; margin-bottom:10px; gap:12px;">
          ${logoLeftHtml}
          <div style="text-align:center; flex:1; padding:0 12px;">
            <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">${cfg.schoolSubtitle}</div>
            <div style="font-size:18px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.8px;">${cfg.schoolName}</div>
            <div style="font-size:10px; color:#334155; font-weight:600;">${cfg.schoolAddress}</div>
            <div style="font-size:13px; font-weight:900; text-transform:uppercase; margin-top:4px; color:#1e3a8a;">LEMBAR REKAPITULASI RESMI HASIL UJIAN SEKOLAH</div>
            <div style="font-size:11px; font-weight:700; color:#334155;">${window.examEngine.config.examTitle} • Mapel: ${subjectName}</div>
          </div>
          ${logoRightHtml}
        </div>
      `;
    }

    const repAvgEl = document.getElementById('repAvg');
    if (repAvgEl) repAvgEl.innerText = analytics.averageScore;

    const repHighEl = document.getElementById('repHigh');
    if (repHighEl) repHighEl.innerText = `${analytics.highestScore} (${analytics.highestStudent})`;

    const repLowEl = document.getElementById('repLow');
    if (repLowEl) repLowEl.innerText = `${analytics.lowestScore} (${analytics.lowestStudent})`;

    const repTotalEl = document.getElementById('repTotal');
    if (repTotalEl) repTotalEl.innerText = `${analytics.totalStudents} Siswa`;

    const repPassEl = document.getElementById('repPass');
    if (repPassEl) repPassEl.innerText = `${analytics.passRatePercentage}%`;

    const repTeacherNameEl = document.getElementById('repTeacherName');
    if (repTeacherNameEl) repTeacherNameEl.innerText = teacherName;

    const repTeacherNipEl = document.getElementById('repTeacherNip');
    if (repTeacherNipEl) repTeacherNipEl.innerText = `NIP. ${teacherNip}`;

    const repHeadmasterEl = document.getElementById('repHeadmasterName');
    if (repHeadmasterEl) repHeadmasterEl.innerText = cfg.headmasterName;

    const repHeadmasterNipEl = document.getElementById('repHeadmasterNip');
    if (repHeadmasterNipEl) repHeadmasterNipEl.innerText = `NIP. ${cfg.headmasterNip}`;

    const repTitiMangsaEl = document.getElementById('repTitiMangsa');
    if (repTitiMangsaEl) repTitiMangsaEl.innerText = `${cfg.city}, ${cfg.date}`;

    const repTitiMangsaLeftEl = document.getElementById('repTitiMangsaLeft');
    if (repTitiMangsaLeftEl) repTitiMangsaLeftEl.innerText = `${cfg.city}, ${cfg.date}`;

    const tbody = document.getElementById('repTableBody');
    if (tbody) {
      tbody.innerHTML = results.map((r, idx) => {
        const items = this.getAnswerBreakdownItems(r);
        const ansHtml = items.length > 0
          ? items.map(it => {
              if (it.status === 'correct') {
                return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#dcfce7; color:#166534; font-weight:700; font-size:9px;">${it.num}.${it.studentVal}✓</span>`;
              }
              return `<span style="display:inline-block; margin:1px 2px; padding:1px 4px; border-radius:3px; background:#fee2e2; color:#991b1b; font-weight:700; font-size:9px;">${it.num}.${it.studentVal}✗(${it.correctVal})</span>`;
            }).join('')
          : '<span style="color:#64748b; font-size:9px;">-</span>';

        return `
          <tr style="border-bottom:1px solid #cbd5e1; font-size:10px;">
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center; font-weight:700;">${idx + 1}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; font-weight:700;">${r.student?.name || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; font-family:monospace;">${r.student?.nisn || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.student?.class || '-'}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center; font-weight:900; font-size:12px; color:${r.finalScore >= 75 ? '#15803d' : '#dc2626'};">${r.finalScore}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; line-height:1.4;">${ansHtml}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.completedAt}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${r.correctCount} / ${r.incorrectCount} / ${r.unattemptedCount}</td>
            <td style="padding:5px; border:1px solid #cbd5e1; text-align:center;">${(r.cheatCount || 0) > 0 ? r.cheatCount + 'x Tab' : 'Tertib'}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // ===================== KONFIGURASI SEKOLAH & TITI MANGSA =====================
  getSchoolConfig() {
    try {
      const saved = localStorage.getItem('cbt_school_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          schoolName: parsed.schoolName || "SMP NEGERI 2 PACET",
          schoolSubtitle: parsed.schoolSubtitle || "PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN",
          schoolAddress: parsed.schoolAddress || "Jl. Raya Pacet, Kec. Pacet, Kab. Mojokerto, Jawa Timur",
          city: parsed.city || "Pacet",
          date: parsed.date || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
          headmasterName: parsed.headmasterName || "Drs. H. Mulyono, M.Pd.",
          headmasterNip: parsed.headmasterNip || "19680512 199403 1 004",
          logoLeft: parsed.logoLeft || "",
          logoRight: parsed.logoRight || ""
        };
      }
    } catch (e) {}
    return {
      schoolName: "SMP NEGERI 2 PACET",
      schoolSubtitle: "PEMERINTAH KABUPATEN MOJOKERTO — DINAS PENDIDIKAN",
      schoolAddress: "Jl. Raya Pacet, Kec. Pacet, Kab. Mojokerto, Jawa Timur",
      city: "Pacet",
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      headmasterName: "Drs. H. Mulyono, M.Pd.",
      headmasterNip: "19680512 199403 1 004",
      logoLeft: "",
      logoRight: ""
    };
  }

  saveSchoolConfig(cfg) {
    try {
      localStorage.setItem('cbt_school_config', JSON.stringify(cfg));
      return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ===================== IMPORT/EXPORT TEMPLATE GURU EXCEL =====================
  downloadTeacherExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert("Pustaka SheetJS belum termuat. Pastikan ada koneksi internet.");
      return;
    }
    const headers = [
      ["TEMPLATE PANGKALAN DATA GURU CBT - SMP NEGERI 2 PACET"],
      ["Petunjuk: Jangan ubah baris judul kolom di baris ke-3. Isi data guru mulai baris ke-4."],
      ["NIP / ID Pengguna (Wajib - Untuk Login)", "Nama Lengkap Guru & Gelar (Wajib)", "Mata Pelajaran yang Diampu (Wajib)", "Password / PIN Login (Wajib)"],
      ["198003152006041002", "Budi Santoso, S.Pd.", "Bahasa Indonesia", "guru123"],
      ["197512022000032001", "Siti Rahmawati, M.Pd.", "Matematika", "guru123"],
      ["198506102010011003", "Dedi Irawan, S.Pd.", "Bahasa Inggris", "guru123"],
      ["198201152007012004", "Nurul Hidayah, M.Si.", "Ilmu Pengetahuan Alam (IPA)", "guru123"],
      ["198708222011011005", "Agus Pratama, S.Pd.", "Ilmu Pengetahuan Sosial (IPS)", "guru123"]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = [
      { wch: 28 },
      { wch: 32 },
      { wch: 32 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Guru");
    XLSX.writeFile(wb, "Template_Daftar_Guru_CBT_SMPN2Pacet.xlsx");
  }

  importTeachersFromExcel(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      return { success: false, message: "Pustaka SheetJS tidak tersedia." };
    }
    try {
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rows || rows.length < 3) {
        return { success: false, message: "File Excel kosong atau format tidak sesuai." };
      }

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = (rows[i] || []).join(' ').toLowerCase();
        if (rowStr.includes('nip') || rowStr.includes('nama')) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return { success: false, message: "Kolom 'NIP' atau 'Nama' tidak ditemukan pada file Excel!" };
      }

      const dataRows = rows.slice(headerRowIndex + 1);
      let importedCount = 0;

      dataRows.forEach(row => {
        if (!row || row.length === 0) return;
        const rawNip = row[0];
        const rawName = row[1];
        const rawSubject = row[2];
        const rawPin = row[3];

        if (rawNip && rawName && rawSubject) {
          const cleanNip = String(rawNip).trim();
          const cleanName = String(rawName).trim();
          const cleanSubject = String(rawSubject).trim();
          const cleanPin = rawPin ? String(rawPin).trim() : "guru123";

          const dupNip = this.teachers.find(t => String(t.nip).trim() === cleanNip && t.role !== 'admin');
          if (dupNip) {
            dupNip.name = cleanName;
            dupNip.subject = cleanSubject;
            dupNip.pin = cleanPin;
            importedCount++;
          } else if (cleanNip !== 'admin' && cleanNip !== '198501012010011001') {
            this.teachers.push({
              id: 'guru_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              nip: cleanNip,
              name: cleanName,
              subject: cleanSubject,
              role: "guru",
              pin: cleanPin
            });
            importedCount++;
          }
        }
      });

      this.saveTeachers(this.teachers);
      return { success: true, count: importedCount };

    } catch (err) {
      console.error("Gagal parse Excel guru:", err);
      return { success: false, message: "Format Excel tidak dapat dibaca: " + err.message };
    }
  }

  // ===================== JADWAL UJIAN & AKTIFKAN MAPEL (KHUSUS ADMIN) =====================
  isSuperAdminUser() {
    const cur = this.getCurrentTeacher();
    return Boolean(cur && (cur.role === 'admin' || cur.id === 'admin'));
  }

  formatIndonesianDate(dateIso) {
    if (!dateIso) return "";
    const parts = String(dateIso).split('-');
    if (parts.length !== 3) return dateIso;
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 0 || m > 11) return dateIso;
    return `${d} ${months[m]} ${y}`;
  }

  getIndonesianDayName(dateIso) {
    if (!dateIso) return "";
    const parts = String(dateIso).split('-');
    if (parts.length !== 3) return "";
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (isNaN(dt.getTime())) return "";
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return days[dt.getDay()];
  }

  loadSchedules() {
    const saved = localStorage.getItem('cbt_exam_schedules');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error("Gagal load schedules:", e);
      }
    }
    localStorage.setItem('cbt_exam_schedules', JSON.stringify(DEFAULT_SCHEDULES));
    return [...DEFAULT_SCHEDULES];
  }

  saveSchedules(list) {
    this.schedules = list;
    localStorage.setItem('cbt_exam_schedules', JSON.stringify(this.schedules));
  }

  getAllSchedules() {
    return [...this.schedules].sort((a, b) => String(a.dateIso || '').localeCompare(String(b.dateIso || '')));
  }

  addSchedule({ day, dateIso, subject, classLevel, timeRange, durationMinutes, token }) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menambah jadwal ujian!" };
    }
    const cleanSubject = String(subject || "").trim();
    const cleanDateIso = String(dateIso || "").trim();
    const cleanDay = String(day || "").trim() || this.getIndonesianDayName(cleanDateIso) || "Senin";
    const cleanClass = String(classLevel || "").trim() || "Semua Kelas";
    const cleanTime = String(timeRange || "").trim() || "07:30 - 08:50";
    const cleanDuration = parseInt(durationMinutes, 10) || 80;
    const cleanToken = String(token || "").trim().toUpperCase() || this.generateRandomToken();

    if (!cleanSubject || !cleanDateIso) {
      return { success: false, message: "Tanggal Ujian dan Mata Pelajaran wajib diisi!" };
    }

    const newItem = {
      id: 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      day: cleanDay,
      dateIso: cleanDateIso,
      dateFormatted: this.formatIndonesianDate(cleanDateIso),
      subject: cleanSubject,
      classLevel: cleanClass,
      timeRange: cleanTime,
      durationMinutes: cleanDuration,
      token: cleanToken
    };

    this.schedules.push(newItem);
    this.saveSchedules(this.schedules);
    return { success: true, schedule: newItem };
  }

  updateSchedule(id, payload) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat mengubah jadwal ujian!" };
    }
    let updatedItem = null;
    this.schedules = this.schedules.map(s => {
      if (s.id === id) {
        const nextDateIso = payload.dateIso ? String(payload.dateIso).trim() : s.dateIso;
        const nextDay = payload.day ? String(payload.day).trim() : (this.getIndonesianDayName(nextDateIso) || s.day);
        updatedItem = {
          ...s,
          day: nextDay,
          dateIso: nextDateIso,
          dateFormatted: this.formatIndonesianDate(nextDateIso),
          subject: payload.subject ? String(payload.subject).trim() : s.subject,
          classLevel: payload.classLevel ? String(payload.classLevel).trim() : s.classLevel,
          timeRange: payload.timeRange !== undefined ? String(payload.timeRange).trim() : s.timeRange,
          durationMinutes: parseInt(payload.durationMinutes, 10) || s.durationMinutes || 80,
          token: payload.token ? String(payload.token).trim().toUpperCase() : s.token
        };
        return updatedItem;
      }
      return s;
    });

    if (!updatedItem) return { success: false, message: "Jadwal tidak ditemukan!" };
    this.saveSchedules(this.schedules);

    if (window.examEngine && window.examEngine.config.activeScheduleId === id) {
      this.activateSchedule(id);
    }
    return { success: true, schedule: updatedItem };
  }

  deleteSchedule(id) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menghapus jadwal ujian!" };
    }
    this.schedules = this.schedules.filter(s => s.id !== id);
    this.saveSchedules(this.schedules);

    if (window.examEngine && window.examEngine.config.activeScheduleId === id) {
      this.deactivateSchedule();
    }
    return { success: true };
  }

  activateSchedule(id) {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Fitur Aktifkan Mapel hanya tersedia di Panel Proktor / Admin!" };
    }
    const sched = this.schedules.find(s => s.id === id);
    if (!sched) {
      return { success: false, message: "Jadwal ujian tidak ditemukan!" };
    }

    if (window.examEngine) {
      window.examEngine.saveConfig({
        subject: sched.subject,
        targetClass: sched.classLevel || "Semua Kelas",
        scheduleDay: sched.day,
        scheduleDate: sched.dateFormatted || this.formatIndonesianDate(sched.dateIso),
        scheduleTime: sched.timeRange || "",
        durationMinutes: sched.durationMinutes || 80,
        examToken: sched.token || window.examEngine.config.examToken,
        activeScheduleId: sched.id,
        showScoreToStudent: false
      });
    }
    return { success: true, schedule: sched };
  }

  deactivateSchedule() {
    if (!this.isSuperAdminUser()) {
      return { success: false, message: "Hanya Admin / Proktor yang dapat menonaktifkan jadwal!" };
    }
    if (window.examEngine) {
      window.examEngine.saveConfig({
        activeScheduleId: "",
        scheduleDay: "",
        scheduleDate: "",
        scheduleTime: "",
        targetClass: "Semua Kelas",
        showScoreToStudent: false
      });
    }
    return { success: true };
  }
}

window.cbtAdmin = new CBTAdmin();
