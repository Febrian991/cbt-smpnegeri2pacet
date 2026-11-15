// Main UI Controller & View Manager: Multi-Perangkat (Laptop, Chromebook, Tab, Ponsel)
// 13 Guru Mapel + 250 Siswa + Upload Gambar & Logo Kop + Titi Mangsa + Ekspor Excel & PDF + Cloud Supabase

document.addEventListener('DOMContentLoaded', () => {
  // Views
  const viewLogin = document.getElementById('viewLogin');
  const viewExamConfirm = document.getElementById('viewExamConfirm');
  const viewExamRoom = document.getElementById('viewExamRoom');
  const viewResult = document.getElementById('viewResult');
  const viewAdmin = document.getElementById('viewAdmin');

  // Modals
  const modalFinishConfirm = document.getElementById('modalFinishConfirm');
  const modalCheatWarning = document.getElementById('modalCheatWarning');
  const modalQuestionDrawer = document.getElementById('modalQuestionDrawer');
  const modalQuestionForm = document.getElementById('modalQuestionForm');
  const modalAdminPin = document.getElementById('modalAdminPin');

  // PWA Install Button
  const btnPwaInstall = document.getElementById('btnPwaInstall');
  let deferredPrompt = null;

  // Temp State
  let tempStudent = null;
  let currentUploadedImageBase64 = "";
  let currentLogoLeftBase64 = "";
  let currentLogoRightBase64 = "";
  let currentLogoCbtBase64 = "";

  function init() {
    renderConfigInfoOnLogin();
    setupPwaPrompt();
    setupKeyboardShortcuts();
    setupImageUploader();
    setupSchoolLogoUploaders();
    setupStudentNisnDetection();
    setupSubjectAndClassFilters();
    setupAdminLoginHelpers();
    updateCloudBadge();

    // 1. Jika ada sesi ujian siswa aktif saat refresh, langsung lanjutkan tanpa logout
    const active = window.examEngine.checkActiveSession();
    if (active) {
      window.examEngine.resumeSession(active);
      showView('examRoom');
      renderExamRoom();
      return;
    }

    // 2. Jika Proktor / Guru sedang login saat refresh, tetap pertahankan sesi & tab aktif
    if (window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher()) {
      showView('admin');
      const savedTab = localStorage.getItem('cbt_active_admin_tab');
      if (savedTab) {
        switchAdminTab(savedTab);
      }
      if (!window.cbtAdmin.isSuperAdminUser()) {
        syncFromCloud(false);
      }
      return;
    }

    // 3. Jika siswa sedang di layar konfirmasi saat refresh, pertahankan layar konfirmasi
    try {
      const savedConfirm = localStorage.getItem('cbt_confirm_student');
      if (savedConfirm) {
        tempStudent = JSON.parse(savedConfirm);
        populateConfirmView(tempStudent);
        showView('confirm');
        syncFromCloud(false);
        return;
      }
    } catch (e) {}

    showView('login');
    syncFromCloud(false);
  }

  function applyCloudState(stateMap) {
    if (!stateMap || typeof stateMap !== 'object') return false;
    let changed = false;

    if (stateMap.cbt_school_config && typeof stateMap.cbt_school_config === 'object' && window.cbtAdmin) {
      window.cbtAdmin.saveSchoolConfig(stateMap.cbt_school_config, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_teachers_list) && stateMap.cbt_teachers_list.length > 0 && window.cbtAdmin) {
      window.cbtAdmin.saveTeachers(stateMap.cbt_teachers_list, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_students_list) && stateMap.cbt_students_list.length > 0 && window.studentManager) {
      window.studentManager.saveStudents(stateMap.cbt_students_list, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_exam_schedules) && window.cbtAdmin) {
      window.cbtAdmin.saveSchedules(stateMap.cbt_exam_schedules, true);
      changed = true;
    }
    if (Array.isArray(stateMap.cbt_questions) && stateMap.cbt_questions.length > 0 && window.examEngine) {
      window.examEngine.saveQuestions(stateMap.cbt_questions, true);
      changed = true;
    }
    if (stateMap.cbt_config && typeof stateMap.cbt_config === 'object' && window.examEngine) {
      window.examEngine.saveConfig(stateMap.cbt_config, true);
      changed = true;
    }
    return changed;
  }

  let cloudSyncPromise = null;
  async function syncFromCloud(force = false) {
    if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) return false;
    if (cloudSyncPromise && !force) return cloudSyncPromise;

    cloudSyncPromise = (async () => {
      const res = await window.supabaseSync.pullAllSchoolState();
      if (res && res.success && res.state) {
        const hasCloudData = Object.keys(res.state).length > 0;
        if (hasCloudData) {
          applyCloudState(res.state);
          renderConfigInfoOnLogin();
          if (viewAdmin && !viewAdmin.classList.contains('hidden')) {
            renderAdminDashboard();
          }
          return true;
        }
      }
      return false;
    })();

    try {
      return await cloudSyncPromise;
    } finally {
      cloudSyncPromise = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && viewLogin && !viewLogin.classList.contains('hidden')) {
      syncFromCloud(true);
    }
  });

  // ===================== UPLOAD FILE GAMBAR SOAL =====================
  function setupImageUploader() {
    const fileInput = document.getElementById('qInputFileImage');
    const btnTrigger = document.getElementById('btnTriggerUploadImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (btnTrigger && fileInput) {
      btnTrigger.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          alert("File yang dipilih harus berupa gambar (JPG, PNG, atau WEBP)!");
          return;
        }
        compressImageFile(file, 800, 0.82, false, (dataUrl) => {
          currentUploadedImageBase64 = dataUrl;
          if (previewImg && previewContainer) {
            previewImg.src = dataUrl;
            previewContainer.classList.remove('hidden');
          }
          if (btnRemove) btnRemove.classList.remove('hidden');
        });
      });
    }

    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        currentUploadedImageBase64 = "";
        if (fileInput) fileInput.value = "";
        if (previewContainer) previewContainer.classList.add('hidden');
        btnRemove.classList.add('hidden');
      });
    }
  }

  function compressImageFile(file, maxSize, quality, preservePng, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const isTransparentType = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
        const mime = preservePng && isTransparentType ? 'image/png' : 'image/jpeg';
        callback(canvas.toDataURL(mime, quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function resetImageUploader() {
    currentUploadedImageBase64 = "";
    const fileInput = document.getElementById('qInputFileImage');
    const btnRemove = document.getElementById('btnRemoveImage');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImg = document.getElementById('imagePreviewImg');

    if (fileInput) fileInput.value = "";
    if (previewImg) previewImg.src = "";
    if (previewContainer) previewContainer.classList.add('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
  }

  // ===================== UPLOAD LOGO KOP KIRI, KANAN, & LOGO CBT =====================
  function persistQuickCbtLogo(dataUrl) {
    if (!window.cbtAdmin) return;
    const cfg = window.cbtAdmin.getSchoolConfig();
    cfg.logoCbt = dataUrl || "";
    window.cbtAdmin.saveSchoolConfig(cfg);
    applyCbtBrandLogo(cfg.logoCbt);
  }

  function setupSchoolLogoUploaders() {
    const leftFile = document.getElementById('cfgLogoLeftFile');
    const btnUploadLeft = document.getElementById('btnUploadLogoLeft');
    const btnRemoveLeft = document.getElementById('btnRemoveLogoLeft');

    const rightFile = document.getElementById('cfgLogoRightFile');
    const btnUploadRight = document.getElementById('btnUploadLogoRight');
    const btnRemoveRight = document.getElementById('btnRemoveLogoRight');

    const cbtFile = document.getElementById('cfgLogoCbtFile');
    const btnUploadCbt = document.getElementById('btnUploadLogoCbt');
    const btnRemoveCbt = document.getElementById('btnRemoveLogoCbt');

    if (btnUploadLeft && leftFile) {
      btnUploadLeft.addEventListener('click', () => leftFile.click());
      leftFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.85, true, (dataUrl) => {
          currentLogoLeftBase64 = dataUrl;
          renderLogoPreview('left', dataUrl);
        });
      });
    }

    if (btnRemoveLeft) {
      btnRemoveLeft.addEventListener('click', () => {
        currentLogoLeftBase64 = "";
        if (leftFile) leftFile.value = "";
        renderLogoPreview('left', "");
      });
    }

    if (btnUploadRight && rightFile) {
      btnUploadRight.addEventListener('click', () => rightFile.click());
      rightFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.85, true, (dataUrl) => {
          currentLogoRightBase64 = dataUrl;
          renderLogoPreview('right', dataUrl);
        });
      });
    }

    if (btnRemoveRight) {
      btnRemoveRight.addEventListener('click', () => {
        currentLogoRightBase64 = "";
        if (rightFile) rightFile.value = "";
        renderLogoPreview('right', "");
      });
    }

    if (btnUploadCbt && cbtFile) {
      btnUploadCbt.addEventListener('click', () => cbtFile.click());
      cbtFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        compressImageFile(file, 320, 0.9, true, (dataUrl) => {
          currentLogoCbtBase64 = dataUrl;
          renderLogoPreview('cbt', dataUrl);
          persistQuickCbtLogo(dataUrl);
        });
      });
    }

    if (btnRemoveCbt) {
      btnRemoveCbt.addEventListener('click', () => {
        currentLogoCbtBase64 = "";
        if (cbtFile) cbtFile.value = "";
        renderLogoPreview('cbt', "");
        persistQuickCbtLogo("");
      });
    }
  }

  function renderLogoPreview(side, dataUrl) {
    const boxId = side === 'left'
      ? 'previewLogoLeftBox'
      : side === 'right'
        ? 'previewLogoRightBox'
        : 'previewLogoCbtBox';
    const removeBtnId = side === 'left'
      ? 'btnRemoveLogoLeft'
      : side === 'right'
        ? 'btnRemoveLogoRight'
        : 'btnRemoveLogoCbt';

    const box = document.getElementById(boxId);
    const removeBtn = document.getElementById(removeBtnId);
    if (!box) return;

    if (dataUrl) {
      box.innerHTML = `<img src="${dataUrl}" alt="Logo ${side}" class="w-full h-full object-contain p-0.5">`;
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      if (side === 'cbt') {
        box.innerHTML = `<span class="text-[10px] font-black text-blue-700">CBT</span>`;
      } else {
        box.innerHTML = `<span class="text-[9px] font-bold text-slate-400">${side === 'left' ? 'DINAS' : 'SMP'}</span>`;
      }
      if (removeBtn) removeBtn.classList.add('hidden');
    }
  }

  function applyCbtBrandLogo(logoUrl) {
    const headerLogoEl = document.getElementById('headerLogoBox');
    const loginLogoEl = document.getElementById('loginLogoBox');

    if (headerLogoEl) {
      if (logoUrl) {
        headerLogoEl.className = "w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-xs flex-shrink-0 overflow-hidden p-0.5";
        headerLogoEl.innerHTML = `<img src="${logoUrl}" alt="Logo CBT" class="w-full h-full object-contain">`;
      } else {
        headerLogoEl.className = "w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-md flex-shrink-0 overflow-hidden";
        headerLogoEl.innerText = "CBT";
      }
    }

    if (loginLogoEl) {
      if (logoUrl) {
        loginLogoEl.className = "inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 p-1.5 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs mb-2.5 sm:mb-3 overflow-hidden";
        loginLogoEl.innerHTML = `<img src="${logoUrl}" alt="Logo CBT" class="w-full h-full object-contain">`;
      } else {
        loginLogoEl.className = "inline-flex items-center justify-center p-3 rounded-2xl bg-blue-50 text-blue-600 mb-2.5 sm:mb-3";
        loginLogoEl.innerHTML = `<svg class="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>`;
      }
    }

    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = logoUrl || 'icons/icon.svg';
    });
  }

  // ===================== PWA PROMPT =====================
  function setupPwaPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnPwaInstall) {
        btnPwaInstall.classList.remove('hidden');
        btnPwaInstall.classList.add('flex');
      }
    });

    if (btnPwaInstall) {
      btnPwaInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') {
            btnPwaInstall.classList.add('hidden');
          }
          deferredPrompt = null;
        } else {
          alert("Aplikasi ini dapat dipasang lewat menu browser Anda (Pilih 'Tambahkan ke Layar Utama' / 'Install App').");
        }
      });
    }
  }

  // ===================== SHORTCUT KEYBOARD =====================
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (!window.examEngine.isExamActive || viewExamRoom.classList.contains('hidden')) return;

      const q = window.examEngine.getCurrentQuestion();
      if (!q) return;

      const key = e.key.toUpperCase();
      const type = q.type || 'single';
      const keyMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E' };
      const selectedOptionKey = ['A', 'B', 'C', 'D', 'E'].includes(key) ? key : keyMap[e.key];

      if (selectedOptionKey) {
        if (type === 'single') {
          e.preventDefault();
          window.examEngine.selectSingleAnswer(selectedOptionKey);
          renderExamRoom();
          renderQuestionPalette();
        } else if (type === 'multiple') {
          e.preventDefault();
          window.examEngine.toggleMultipleAnswer(selectedOptionKey);
          renderExamRoom();
          renderQuestionPalette();
        }
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (window.examEngine.prevQuestion()) renderExamRoom();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        const isLast = window.examEngine.currentQuestionIndex === window.examEngine.getExamQuestions().length - 1;
        if (!isLast) {
          window.examEngine.nextQuestion();
          renderExamRoom();
        }
      }

      if (key === 'R') {
        e.preventDefault();
        window.examEngine.toggleDoubt();
        renderExamRoom();
        renderQuestionPalette();
      }
    });
  }

  function renderConfigInfoOnLogin() {
    const titleEl = document.getElementById('loginExamTitle');
    const subtitleEl = document.getElementById('loginExamSubtitle');
    const tokenHintEl = document.getElementById('loginTokenHint');
    const headerSchoolEl = document.getElementById('headerSchoolName');
    const loginSchoolEl = document.getElementById('loginSchoolName');
    const scheduleBadgeEl = document.getElementById('loginScheduleBadge');
    const scheduleTextEl = document.getElementById('loginScheduleText');

    const schoolCfg = window.cbtAdmin ? window.cbtAdmin.getSchoolConfig() : { schoolName: 'SMP NEGERI 2 PACET', logoCbt: '' };
    if (headerSchoolEl) headerSchoolEl.innerText = schoolCfg.schoolName || 'SMP NEGERI 2 PACET';
    if (loginSchoolEl) loginSchoolEl.innerText = schoolCfg.schoolName || 'SMP NEGERI 2 PACET';
    applyCbtBrandLogo(schoolCfg.logoCbt || '');

    const cfg = window.examEngine.config;
    const classPart = cfg.targetClass && cfg.targetClass !== 'Semua Kelas' ? ` (${cfg.targetClass})` : '';

    if (titleEl) titleEl.innerText = cfg.examTitle;
    if (subtitleEl) subtitleEl.innerText = `${cfg.subject}${classPart} • Alokasi Waktu: ${cfg.durationMinutes} Menit`;

    if (scheduleBadgeEl && scheduleTextEl) {
      if (cfg.scheduleDay || cfg.scheduleDate) {
        const datePart = [cfg.scheduleDay, cfg.scheduleDate].filter(Boolean).join(', ');
        const timePart = cfg.scheduleTime ? ` • Pukul ${cfg.scheduleTime}` : '';
        scheduleTextEl.innerText = `Jadwal Aktif: ${datePart}${timePart}`;
        scheduleBadgeEl.classList.remove('hidden');
      } else {
        scheduleBadgeEl.classList.add('hidden');
      }
    }

    if (tokenHintEl) {
      const span = tokenHintEl.querySelector('span');
      if (span) span.innerText = `Token Ujian Aktif: ${cfg.examToken}`;
      else tokenHintEl.innerText = `Token Ujian Aktif: ${cfg.examToken}`;
    }
  }

  function showView(viewName) {
    [viewLogin, viewExamConfirm, viewExamRoom, viewResult, viewAdmin].forEach(v => {
      if (v) v.classList.add('hidden');
    });

    if (viewName === 'login') {
      renderConfigInfoOnLogin();
      viewLogin.classList.remove('hidden');
    } else if (viewName === 'confirm') {
      viewExamConfirm.classList.remove('hidden');
    } else if (viewName === 'examRoom') {
      viewExamRoom.classList.remove('hidden');
    } else if (viewName === 'result') {
      viewResult.classList.remove('hidden');
    } else if (viewName === 'admin') {
      viewAdmin.classList.remove('hidden');
      renderAdminDashboard();
    }
  }

  // ===================== AUTODETEKSI NISN SISWA =====================
  function setupStudentNisnDetection() {
    const studentNisnInput = document.getElementById('studentNisn');
    const studentFoundHint = document.getElementById('studentFoundHint');
    const studentFoundName = document.getElementById('studentFoundName');
    const studentFoundClass = document.getElementById('studentFoundClass');

    if (studentNisnInput) {
      studentNisnInput.addEventListener('input', () => {
        const nisn = studentNisnInput.value.trim();
        if (nisn.length >= 3 && window.studentManager) {
          const student = window.studentManager.getStudentByNisn(nisn);
          if (student) {
            if (studentFoundName) studentFoundName.innerText = student.name;
            if (studentFoundClass) studentFoundClass.innerText = `Kelas ${student.class}`;
            if (studentFoundHint) studentFoundHint.classList.remove('hidden');
          } else {
            if (studentFoundHint) studentFoundHint.classList.add('hidden');
          }
        } else {
          if (studentFoundHint) studentFoundHint.classList.add('hidden');
        }
      });
    }
  }

  function populateConfirmView(student) {
    if (!student) return;
    const cfg = window.examEngine.config;
    const classPart = cfg.targetClass && cfg.targetClass !== 'Semua Kelas' ? ` (${cfg.targetClass})` : '';

    document.getElementById('confirmName').innerText = student.name;
    document.getElementById('confirmNisn').innerText = student.nisn;
    document.getElementById('confirmClass').innerText = `Kelas ${student.class}`;
    document.getElementById('confirmSubject').innerText = `${cfg.subject}${classPart}`;
    document.getElementById('confirmDuration').innerText = `${cfg.durationMinutes} Menit`;
    const confirmQs = window.examEngine.getQuestionsForExam(cfg.subject, student.class || cfg.targetClass);
    document.getElementById('confirmQuestionsCount').innerText = `${confirmQs.questions.length} Butir Soal`;

    const confirmScheduleRow = document.getElementById('confirmScheduleRow');
    const confirmScheduleEl = document.getElementById('confirmSchedule');
    if (confirmScheduleRow && confirmScheduleEl) {
      if (cfg.scheduleDay || cfg.scheduleDate) {
        const datePart = [cfg.scheduleDay, cfg.scheduleDate].filter(Boolean).join(', ');
        const timePart = cfg.scheduleTime ? ` (${cfg.scheduleTime})` : '';
        confirmScheduleEl.innerText = `${datePart}${timePart}`;
        confirmScheduleRow.classList.remove('hidden');
      } else {
        confirmScheduleRow.classList.add('hidden');
      }
    }
  }

  // ===================== LOGIN SISWA =====================
  const studentLoginForm = document.getElementById('studentLoginForm');
  if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nisn = document.getElementById('studentNisn').value.trim();
      const password = document.getElementById('studentPassword').value.trim();
      const token = document.getElementById('studentToken').value.trim().toUpperCase();

      if (!nisn || !password) {
        alert("Harap lengkapi semua kolom!");
        return;
      }

      if (window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
        const needsRefresh =
          (token && token !== String(window.examEngine.config.examToken || '').toUpperCase()) ||
          (window.studentManager && !window.studentManager.getStudentByNisn(nisn));
        if (cloudSyncPromise) {
          await cloudSyncPromise;
        } else if (needsRefresh) {
          await syncFromCloud(true, false);
        }
      }

      if (nisn.toLowerCase() === 'admin' || nisn.toLowerCase().includes('proktor')) {
        const adminRes = window.cbtAdmin.login('admin', password);
        if (adminRes && adminRes.success) {
          showView('admin');
          return;
        } else {
          modalAdminPin.classList.remove('hidden');
          const usernameInput = document.getElementById('adminUsernameInput');
          const pinInput = document.getElementById('adminPinInput');
          if (usernameInput) usernameInput.value = 'admin';
          if (pinInput) {
            pinInput.value = password;
            pinInput.focus();
          }
          alert("Silakan masukkan PIN Proktor Anda.");
          return;
        }
      }

      if (!token) {
        alert("Harap masukkan Token Ujian!");
        return;
      }

      const validToken = window.examEngine.config.examToken.toUpperCase();
      if (token !== validToken) {
        alert(`Token ujian salah! Masukkan token aktif: ${validToken}`);
        return;
      }

      let authenticatedStudent = null;
      if (window.studentManager) {
        const auth = window.studentManager.authenticateStudent(nisn, password);
        if (!auth.success) {
          alert(auth.message);
          return;
        }
        authenticatedStudent = auth.student;
      } else {
        authenticatedStudent = { nisn, name: "Siswa Peserta", class: "Umum" };
      }

      tempStudent = {
        name: authenticatedStudent.name,
        nisn: authenticatedStudent.nisn,
        class: authenticatedStudent.class,
        token: token
      };

      try {
        localStorage.setItem('cbt_confirm_student', JSON.stringify(tempStudent));
      } catch (err) {}

      populateConfirmView(tempStudent);
      showView('confirm');
    });
  }

  const btnCancelConfirm = document.getElementById('btnCancelConfirm');
  if (btnCancelConfirm) {
    btnCancelConfirm.addEventListener('click', () => {
      tempStudent = null;
      try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
      showView('login');
    });
  }

  const btnStartExam = document.getElementById('btnStartExam');
  if (btnStartExam) {
    btnStartExam.addEventListener('click', () => {
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } catch (err) {}

      try { localStorage.removeItem('cbt_confirm_student'); } catch (e) {}
      window.examEngine.startExam(tempStudent);
      showView('examRoom');
      renderExamRoom();
    });
  }

  // ===================== EXAM ROOM =====================
  function renderExamRoom() {
    const q = window.examEngine.getCurrentQuestion();
    if (!q) return;

    const type = q.type || 'single';

    const activeQs = window.examEngine.getExamQuestions();
    document.getElementById('examSubjectHeader').innerText = window.examEngine.config.subject;
    document.getElementById('examStudentNameHeader').innerText = window.examEngine.student?.name || 'Peserta';
    document.getElementById('currentQuestionNumberBadge').innerText = `Soal No. ${window.examEngine.currentQuestionIndex + 1} dari ${activeQs.length}`;

    const typeBadge = document.getElementById('questionTypeBadge');
    if (typeBadge) {
      if (type === 'multiple') {
        typeBadge.innerText = "PG Kompleks (Jawaban > 1)";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-700";
      } else if (type === 'true_false') {
        typeBadge.innerText = "Benar / Salah";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-amber-100 text-amber-800";
      } else {
        typeBadge.innerText = "Pilihan Ganda";
        typeBadge.className = "px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-blue-100 text-blue-700";
      }
    }

    document.getElementById('questionText').innerText = q.question;

    const qImageContainer = document.getElementById('questionImageContainer');
    const qImageEl = document.getElementById('questionImage');
    if (q.image && q.image.trim() !== "") {
      qImageEl.src = q.image;
      qImageContainer.classList.remove('hidden');
    } else {
      qImageContainer.classList.add('hidden');
    }

    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    const currentAnswerData = window.examEngine.answers[q.id]?.answer;

    if (type === 'single') {
      q.options.forEach(opt => {
        const isSelected = currentAnswerData === opt.key;
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-center p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isSelected
            ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
          }">${opt.key}</div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.selectSingleAnswer(opt.key);
          renderExamRoom();
          renderQuestionPalette();
        });
        optionsContainer.appendChild(optEl);
      });

    } else if (type === 'multiple') {
      const selectedArr = Array.isArray(currentAnswerData) ? currentAnswerData : [];

      const hintEl = document.createElement('div');
      hintEl.className = "text-[11px] sm:text-xs font-bold text-purple-700 bg-purple-50 p-2.5 rounded-xl border border-purple-200 mb-2 flex items-center gap-1.5";
      hintEl.innerHTML = `
        <svg class="w-3.5 h-3.5 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>Pilihlah satu atau lebih opsi yang benar!</span>
      `;
      optionsContainer.appendChild(hintEl);

      q.options.forEach(opt => {
        const isChecked = selectedArr.includes(opt.key);
        const optEl = document.createElement('div');
        optEl.className = `option-label cursor-pointer flex items-center p-3 sm:p-4 rounded-2xl border-2 transition-all ${
          isChecked
            ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs'
            : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50'
        }`;
        optEl.innerHTML = `
          <div class="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs sm:text-sm mr-3 transition-colors flex-shrink-0 ${
            isChecked ? 'bg-purple-600 text-white' : 'border-2 border-slate-300 text-slate-600 bg-white'
          }">
            ${isChecked ? '✓' : opt.key}
          </div>
          <div class="text-xs sm:text-base font-medium flex-1 text-slate-800">${opt.text}</div>
          <span class="hidden md:inline-flex kbd-hint ml-2">${opt.key}</span>
        `;
        optEl.addEventListener('click', () => {
          window.examEngine.toggleMultipleAnswer(opt.key);
          renderExamRoom();
          renderQuestionPalette();
        });
        optionsContainer.appendChild(optEl);
      });

    } else if (type === 'true_false') {
      const statements = q.statements || [];
      const answersMap = (typeof currentAnswerData === 'object' && currentAnswerData !== null) ? currentAnswerData : {};

      const tableWrapper = document.createElement('div');
      tableWrapper.className = "bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs";

      let rowsHtml = statements.map((stmt, sIdx) => {
        const val = answersMap[stmt.id];
        return `
          <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
            <td class="p-2.5 sm:p-3.5 text-xs sm:text-sm font-medium text-slate-800 leading-relaxed">
              <span class="font-bold mr-1 text-slate-500">${sIdx + 1}.</span> ${stmt.text}
            </td>
            <td class="p-2.5 sm:p-3.5 text-center w-20 sm:w-24">
              <button type="button" data-stmt="${stmt.id}" data-val="B" class="btn-tf w-full py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition cursor-pointer ${
                val === 'B'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-emerald-400'
              }">Benar</button>
            </td>
            <td class="p-2.5 sm:p-3.5 text-center w-20 sm:w-24">
              <button type="button" data-stmt="${stmt.id}" data-val="S" class="btn-tf w-full py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition cursor-pointer ${
                val === 'S'
                  ? 'bg-red-600 text-white border-red-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-red-400'
              }">Salah</button>
            </td>
          </tr>
        `;
      }).join('');

      tableWrapper.innerHTML = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] sm:text-xs uppercase font-bold">
              <th class="p-2.5 sm:p-3">Pernyataan</th>
              <th class="p-2.5 sm:p-3 text-center w-20 sm:w-24">Benar</th>
              <th class="p-2.5 sm:p-3 text-center w-20 sm:w-24">Salah</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;

      tableWrapper.querySelectorAll('.btn-tf').forEach(btn => {
        btn.addEventListener('click', () => {
          const stmtId = btn.getAttribute('data-stmt');
          const value = btn.getAttribute('data-val');
          window.examEngine.selectTrueFalseAnswer(stmtId, value);
          renderExamRoom();
          renderQuestionPalette();
        });
      });

      optionsContainer.appendChild(tableWrapper);
    }

    const doubtBtn = document.getElementById('btnToggleDoubt');
    const doubtCheckbox = document.getElementById('chkDoubt');
    const isDoubt = window.examEngine.answers[q.id]?.doubt || false;
    if (doubtCheckbox) doubtCheckbox.checked = isDoubt;
    if (doubtBtn) {
      if (isDoubt) {
        doubtBtn.classList.remove('bg-amber-50', 'text-amber-800', 'border-amber-300');
        doubtBtn.classList.add('bg-amber-500', 'text-white', 'border-amber-600');
      } else {
        doubtBtn.classList.add('bg-amber-50', 'text-amber-800', 'border-amber-300');
        doubtBtn.classList.remove('bg-amber-500', 'text-white', 'border-amber-600');
      }
    }

    const btnPrev = document.getElementById('btnPrevQuestion');
    const btnNext = document.getElementById('btnNextQuestion');
    const isFirst = window.examEngine.currentQuestionIndex === 0;
    const isLast = window.examEngine.currentQuestionIndex === activeQs.length - 1;

    if (btnPrev) btnPrev.disabled = isFirst;
    if (btnNext) {
      if (isLast) {
        btnNext.innerHTML = `<span>Selesai</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 shadow-sm transition cursor-pointer";
      } else {
        btnNext.innerHTML = `<span>Berikutnya</span> <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
        btnNext.className = "flex items-center px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition cursor-pointer";
      }
    }

    renderQuestionPalette();
  }

  function renderQuestionPalette() {
    const paletteContainers = [
      document.getElementById('questionPaletteDesktop'),
      document.getElementById('questionPaletteDrawer')
    ];

    paletteContainers.forEach(container => {
      if (!container) return;
      container.innerHTML = '';

      window.examEngine.getExamQuestions().forEach((q, idx) => {
        const ansData = window.examEngine.answers[q.id];
        const isCurrent = idx === window.examEngine.currentQuestionIndex;
        const isAnswered = window.examEngine.isQuestionAnswered(q);

        let statusClass = 'unanswered';
        if (ansData?.doubt) statusClass = 'doubt';
        else if (isAnswered) statusClass = 'answered';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `q-btn w-9 h-9 sm:w-11 sm:h-11 rounded-lg font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-xs cursor-pointer ${statusClass} ${isCurrent ? 'current ring-3 ring-blue-500' : ''}`;
        btn.innerHTML = `<span>${idx + 1}</span>${isAnswered ? `<span class="text-[8px] -mt-0.5 uppercase opacity-90">✓</span>` : ''}`;

        btn.addEventListener('click', () => {
          window.examEngine.goToQuestion(idx);
          renderExamRoom();
          if (modalQuestionDrawer && !modalQuestionDrawer.classList.contains('hidden')) {
            modalQuestionDrawer.classList.add('hidden');
          }
        });

        container.appendChild(btn);
      });
    });

    const summary = window.examEngine.getAnswerSummary();
    const statAnswered = document.getElementById('statAnswered');
    const statDoubt = document.getElementById('statDoubt');
    const statUnanswered = document.getElementById('statUnanswered');

    if (statAnswered) statAnswered.innerText = summary.answered;
    if (statDoubt) statDoubt.innerText = summary.doubt;
    if (statUnanswered) statUnanswered.innerText = summary.unanswered;
  }

  const btnPrev = document.getElementById('btnPrevQuestion');
  if (btnPrev) btnPrev.addEventListener('click', () => { if (window.examEngine.prevQuestion()) renderExamRoom(); });

  const btnNext = document.getElementById('btnNextQuestion');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const isLast = window.examEngine.currentQuestionIndex === window.examEngine.getExamQuestions().length - 1;
      if (isLast) openFinishConfirmModal();
      else { window.examEngine.nextQuestion(); renderExamRoom(); }
    });
  }

  const btnToggleDoubt = document.getElementById('btnToggleDoubt');
  if (btnToggleDoubt) {
    btnToggleDoubt.addEventListener('click', () => {
      window.examEngine.toggleDoubt();
      renderExamRoom();
      renderQuestionPalette();
    });
  }

  const btnTriggerFinish = document.getElementById('btnTriggerFinish');
  if (btnTriggerFinish) btnTriggerFinish.addEventListener('click', openFinishConfirmModal);

  function openFinishConfirmModal() {
    const summary = window.examEngine.getAnswerSummary();
    document.getElementById('modalSummaryAnswered').innerText = summary.answered;
    document.getElementById('modalSummaryDoubt').innerText = summary.doubt;
    document.getElementById('modalSummaryUnanswered').innerText = summary.unanswered;

    const warningBox = document.getElementById('modalFinishWarningNote');
    if (summary.unanswered > 0 || summary.doubt > 0) warningBox.classList.remove('hidden');
    else warningBox.classList.add('hidden');

    modalFinishConfirm.classList.remove('hidden');
  }

  const btnCancelFinish = document.getElementById('btnCancelFinish');
  if (btnCancelFinish) btnCancelFinish.addEventListener('click', () => modalFinishConfirm.classList.add('hidden'));

  const btnConfirmFinishFinal = document.getElementById('btnConfirmFinishFinal');
  if (btnConfirmFinishFinal) {
    btnConfirmFinishFinal.addEventListener('click', () => {
      modalFinishConfirm.classList.add('hidden');
      window.examEngine.finishExam('Selesai mandiri oleh peserta');
    });
  }

  const btnFontDec = document.getElementById('btnFontDecrease');
  const btnFontReset = document.getElementById('btnFontReset');
  const btnFontInc = document.getElementById('btnFontIncrease');
  if (btnFontDec) btnFontDec.addEventListener('click', () => window.examEngine.changeFontSize('decrease'));
  if (btnFontReset) btnFontReset.addEventListener('click', () => window.examEngine.changeFontSize('reset'));
  if (btnFontInc) btnFontInc.addEventListener('click', () => window.examEngine.changeFontSize('increase'));

  const btnOpenDrawer = document.getElementById('btnOpenQuestionDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseQuestionDrawer');
  if (btnOpenDrawer) btnOpenDrawer.addEventListener('click', () => { modalQuestionDrawer.classList.remove('hidden'); renderQuestionPalette(); });
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => modalQuestionDrawer.classList.add('hidden'));

  window.addEventListener('cbt-timer-tick', (e) => {
    const timerDisplay = document.getElementById('examTimerDisplay');
    if (!timerDisplay) return;
    const seconds = e.detail.remainingSeconds;
    timerDisplay.innerText = window.examEngine.formatTime(seconds);
    if (seconds <= 300) {
      timerDisplay.classList.add('text-red-600', 'font-black');
      timerDisplay.classList.remove('text-slate-800');
    } else {
      timerDisplay.classList.remove('text-red-600');
      timerDisplay.classList.add('text-slate-800');
    }
  });

  window.addEventListener('cbt-cheat-warning', (e) => {
    const { count, max, reason } = e.detail;
    const cheatCountBadge = document.getElementById('cheatCountBadge');
    if (cheatCountBadge) {
      cheatCountBadge.innerText = `Pelanggaran: ${count}/${max}`;
      cheatCountBadge.classList.remove('hidden');
    }
    const modalCount = document.getElementById('cheatWarningCount');
    const modalMax = document.getElementById('cheatWarningMax');
    const modalReason = document.getElementById('cheatWarningReason');
    if (modalCount) modalCount.innerText = count;
    if (modalMax) modalMax.innerText = max;
    if (modalReason) modalReason.innerText = reason;
    modalCheatWarning.classList.remove('hidden');
  });

  const btnAcknowledgeCheat = document.getElementById('btnAcknowledgeCheat');
  if (btnAcknowledgeCheat) btnAcknowledgeCheat.addEventListener('click', () => modalCheatWarning.classList.add('hidden'));

  window.addEventListener('cbt-exam-finished', (e) => {
    const { result } = e.detail;
    showView('result');
    document.getElementById('resStudentName').innerText = result.student?.name || '-';
    document.getElementById('resStudentNisn').innerText = result.student?.nisn || '-';
    document.getElementById('resStudentClass').innerText = result.student?.class ? `Kelas ${result.student.class}` : '-';
    document.getElementById('resSubject').innerText = result.subject;
    document.getElementById('resCompletedAt').innerText = result.completedAt;
    document.getElementById('resTotalQuestions').innerText = `${result.totalQuestions} Butir Soal`;
    document.getElementById('resCheatCount').innerText = `${result.cheatCount || 0} Kali Pelanggaran`;
  });

  const btnPrintResult = document.getElementById('btnPrintResult');
  if (btnPrintResult) btnPrintResult.addEventListener('click', () => window.print());

  const btnReturnHome = document.getElementById('btnReturnHome');
  if (btnReturnHome) btnReturnHome.addEventListener('click', () => showView('login'));

  // ===================== PANEL PROKTOR & GURU: LOGIN SECURE =====================
  function setupAdminLoginHelpers() {
    const btnTogglePin = document.getElementById('btnTogglePinVisibility');
    const pinInput = document.getElementById('adminPinInput');
    if (btnTogglePin && pinInput) {
      btnTogglePin.onclick = () => {
        if (pinInput.type === 'password') {
          pinInput.type = 'text';
          btnTogglePin.innerText = 'Sembunyikan';
        } else {
          pinInput.type = 'password';
          btnTogglePin.innerText = 'Lihat PIN';
        }
      };
    }
  }

  const btnOpenAdminLogin = document.getElementById('btnOpenAdminLogin');
  if (btnOpenAdminLogin) {
    btnOpenAdminLogin.addEventListener('click', () => {
      if (window.cbtAdmin && window.cbtAdmin.isAuthenticated && window.cbtAdmin.getCurrentTeacher()) {
        showView('admin');
        return;
      }
      modalAdminPin.classList.remove('hidden');
      const usernameInput = document.getElementById('adminUsernameInput');
      const pinInput = document.getElementById('adminPinInput');
      if (usernameInput) {
        usernameInput.value = '';
        usernameInput.focus();
      }
      if (pinInput) pinInput.value = '';
    });
  }

  const btnCloseAdminPin = document.getElementById('btnCloseAdminPin');
  if (btnCloseAdminPin) btnCloseAdminPin.addEventListener('click', () => modalAdminPin.classList.add('hidden'));

  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('adminUsernameInput');
      const pinInput = document.getElementById('adminPinInput');
      const identifier = usernameInput ? usernameInput.value.trim() : '';
      const pin = pinInput ? pinInput.value.trim() : '';

      if (!identifier || !pin) {
        alert("Harap masukkan Username/NIP dan PIN!");
        return;
      }

      let loginRes = window.cbtAdmin.login(identifier, pin);
      if ((!loginRes || !loginRes.success) && window.supabaseSync && window.supabaseSync.isCloudConfigured()) {
        await syncFromCloud(true, false);
        loginRes = window.cbtAdmin.login(identifier, pin);
      }

      if (loginRes && loginRes.success) {
        modalAdminPin.classList.add('hidden');
        if (usernameInput) usernameInput.value = '';
        if (pinInput) pinInput.value = '';
        showView('admin');
      } else {
        alert("Username / NIP atau PIN salah!");
      }
    });
  }

  const btnAdminLogout = document.getElementById('btnAdminLogout');
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      window.cbtAdmin.logout();
      showView('login');
    });
  }

  // ===================== 6 ADMIN TABS SWITCHER & RBAC =====================
  const adminTabButtons = document.querySelectorAll('.admin-tab-btn');

  function switchAdminTab(targetTab) {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    if (!isAdmin && (targetTab === 'tabSchedules' || targetTab === 'tabStudents' || targetTab === 'tabTeachers' || targetTab === 'tabSettings')) {
      targetTab = 'tabResults';
    }

    try { localStorage.setItem('cbt_active_admin_tab', targetTab); } catch (e) {}

    const allTabBtns = document.querySelectorAll('.admin-tab-btn');
    const allTabPanes = document.querySelectorAll('.admin-tab-pane');

    allTabBtns.forEach(b => {
      b.classList.remove('border-blue-600', 'text-blue-600', 'bg-blue-50');
      b.classList.add('border-transparent', 'text-slate-600', 'hover:text-slate-900');
      if (b.getAttribute('data-tab') === targetTab) {
        b.classList.add('border-blue-600', 'text-blue-600', 'bg-blue-50');
        b.classList.remove('border-transparent', 'text-slate-600');
      }
    });

    allTabPanes.forEach(pane => {
      if (pane.id === targetTab) pane.classList.remove('hidden');
      else pane.classList.add('hidden');
    });

    try {
      if (targetTab === 'tabResults') {
        renderAdminAnalyticsAndResults();
      } else if (targetTab === 'tabSchedules' && isAdmin) {
        renderAdminSchedulesList();
      } else if (targetTab === 'tabQuestions') {
        setupQuestionBankFilters();
        renderAdminQuestionList();
      } else if (targetTab === 'tabStudents' && isAdmin) {
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      } else if (targetTab === 'tabTeachers' && isAdmin) {
        renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
      } else if (targetTab === 'tabSettings' && isAdmin) {
        renderAdminConfigForm();
        renderSchoolConfigForm();
        renderSupabaseConfigForm();
      }
    } catch (err) {
      console.warn("Gagal render tab content:", err);
    }
  }

  adminTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchAdminTab(targetTab);
    });
  });

  function renderAdminDashboard() {
    const currentTeacher = window.cbtAdmin ? window.cbtAdmin.getCurrentTeacher() : null;
    const tabSchedulesBtn = document.getElementById('adminTabBtnSchedules');
    const tabStudentsBtn = document.getElementById('adminTabBtnStudents');
    const tabTeachersBtn = document.getElementById('adminTabBtnTeachers');
    const tabSettingsBtn = document.getElementById('adminTabBtnSettings');

    const tabSchedulesPane = document.getElementById('tabSchedules');
    const tabStudentsPane = document.getElementById('tabStudents');
    const tabTeachersPane = document.getElementById('tabTeachers');
    const tabSettingsPane = document.getElementById('tabSettings');

    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');

    if (currentTeacher) {
      const nameDisp = document.getElementById('adminTeacherNameDisplay');
      const roleBadge = document.getElementById('adminRoleBadge');
      const subjDisp = document.getElementById('adminSubjectDisplay');
      if (nameDisp) nameDisp.innerText = `Panel: ${currentTeacher.name}`;
      if (roleBadge) {
        roleBadge.innerText = isAdmin ? 'Proktor Utama / Admin' : 'Guru Mata Pelajaran';
        roleBadge.className = isAdmin
          ? 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200'
          : 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200';
      }
      if (subjDisp) {
        const parsedClasses = currentTeacher.classes && window.cbtAdmin ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes) : [];
        const classInfo = parsedClasses.length > 0 ? ` • Kelas: ${parsedClasses.join(', ')}` : '';
        subjDisp.innerText = isAdmin
          ? `Mata Pelajaran: Semua Mapel • Status: Hak Akses Penuh (Super Admin)`
          : `Mata Pelajaran: ${currentTeacher.subject}${classInfo} • NIP: ${currentTeacher.nip}`;
      }

      if (!isAdmin) {
        if (tabSchedulesBtn) tabSchedulesBtn.classList.add('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.add('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.add('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.add('hidden');
        if (tabSchedulesPane) tabSchedulesPane.classList.add('hidden');
        if (tabStudentsPane) tabStudentsPane.classList.add('hidden');
        if (tabTeachersPane) tabTeachersPane.classList.add('hidden');
        if (tabSettingsPane) tabSettingsPane.classList.add('hidden');
        switchAdminTab('tabResults');
      } else {
        if (tabSchedulesBtn) tabSchedulesBtn.classList.remove('hidden');
        if (tabStudentsBtn) tabStudentsBtn.classList.remove('hidden');
        if (tabTeachersBtn) tabTeachersBtn.classList.remove('hidden');
        if (tabSettingsBtn) tabSettingsBtn.classList.remove('hidden');
      }
    }
    const btnResetQs = document.getElementById('btnResetDefaultQuestions');
    if (btnResetQs) {
      if (isAdmin) btnResetQs.classList.remove('hidden');
      else btnResetQs.classList.add('hidden');
    }

    setupSubjectAndClassFilters();
    setupQuestionBankFilters();
    renderAdminAnalyticsAndResults();
    renderAdminQuestionList();

    if (isAdmin) {
      renderAdminSchedulesList();
      renderAdminStudentsList();
      renderAdminTeachersList();
      renderAdminConfigForm();
      renderSchoolConfigForm();
      renderSupabaseConfigForm();
    }
  }

  // ===================== TAB KHUSUS ADMIN: JADWAL UJIAN & AKTIFKAN MAPEL =====================
  const schInputDate = document.getElementById('schInputDate');
  const schInputDay = document.getElementById('schInputDay');
  const btnSchRandomToken = document.getElementById('btnSchRandomToken');
  const btnCancelEditSchedule = document.getElementById('btnCancelEditSchedule');
  const formScheduleItem = document.getElementById('formScheduleItem');

  function syncDayFromScheduleDate() {
    if (!schInputDate || !schInputDay || !window.cbtAdmin) return;
    const dayName = window.cbtAdmin.getIndonesianDayName(schInputDate.value);
    if (dayName) schInputDay.value = dayName;
  }

  if (schInputDate) {
    if (!schInputDate.value) {
      schInputDate.value = '2026-12-07';
      syncDayFromScheduleDate();
    }
    schInputDate.addEventListener('change', syncDayFromScheduleDate);
  }

  if (btnSchRandomToken) {
    btnSchRandomToken.addEventListener('click', () => {
      const tokenEl = document.getElementById('schInputToken');
      if (tokenEl && window.cbtAdmin) tokenEl.value = window.cbtAdmin.generateRandomToken();
    });
  }

  function populateScheduleSubjectDatalist() {
    const dl = document.getElementById('scheduleSubjectList');
    if (!dl || !window.cbtAdmin) return;
    const subjects = window.cbtAdmin.getAllSubjects();
    dl.innerHTML = subjects.map(s => `<option value="${s}">`).join('');
  }

  function resetScheduleForm() {
    if (!formScheduleItem) return;
    formScheduleItem.reset();
    const idEl = document.getElementById('editScheduleId');
    const titleEl = document.getElementById('scheduleFormTitle');
    const submitBtn = document.getElementById('btnSubmitSchedule');
    if (idEl) idEl.value = '';
    if (schInputDate) {
      schInputDate.value = '2026-12-07';
      syncDayFromScheduleDate();
    }
    const timeEl = document.getElementById('schInputTime');
    const durEl = document.getElementById('schInputDuration');
    if (timeEl) timeEl.value = '07:30 - 08:50';
    if (durEl) durEl.value = '80';
    if (titleEl) titleEl.innerText = '+ Tambah Jadwal Ujian';
    if (submitBtn) submitBtn.innerText = '💾 Simpan ke Daftar Jadwal';
    if (btnCancelEditSchedule) btnCancelEditSchedule.classList.add('hidden');
  }

  function openEditScheduleForm(sched) {
    if (!sched) return;
    document.getElementById('editScheduleId').value = sched.id || '';
    document.getElementById('schInputDate').value = sched.dateIso || '2026-12-07';
    document.getElementById('schInputDay').value = sched.day || 'Senin';
    document.getElementById('schInputSubject').value = sched.subject || '';
    document.getElementById('schInputClass').value = sched.classLevel || '';
    document.getElementById('schInputTime').value = sched.timeRange || '07:30 - 08:50';
    document.getElementById('schInputDuration').value = sched.durationMinutes || 80;
    document.getElementById('schInputToken').value = sched.token || '';

    const titleEl = document.getElementById('scheduleFormTitle');
    const submitBtn = document.getElementById('btnSubmitSchedule');
    if (titleEl) titleEl.innerText = '✏️ Edit Jadwal Ujian';
    if (submitBtn) submitBtn.innerText = '💾 Simpan Perubahan Jadwal';
    if (btnCancelEditSchedule) btnCancelEditSchedule.classList.remove('hidden');
  }

  if (btnCancelEditSchedule) {
    btnCancelEditSchedule.addEventListener('click', resetScheduleForm);
  }

  if (formScheduleItem) {
    formScheduleItem.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!window.cbtAdmin || !window.cbtAdmin.isSuperAdminUser()) {
        alert("Akses ditolak! Pengaturan jadwal ujian hanya tersedia di Panel Admin.");
        return;
      }

      const editId = document.getElementById('editScheduleId').value.trim();
      const payload = {
        dateIso: document.getElementById('schInputDate').value.trim(),
        day: document.getElementById('schInputDay').value,
        subject: document.getElementById('schInputSubject').value.trim(),
        classLevel: document.getElementById('schInputClass').value.trim(),
        timeRange: document.getElementById('schInputTime').value.trim(),
        durationMinutes: parseInt(document.getElementById('schInputDuration').value, 10) || 80,
        token: document.getElementById('schInputToken').value.trim().toUpperCase()
      };

      const res = editId
        ? window.cbtAdmin.updateSchedule(editId, payload)
        : window.cbtAdmin.addSchedule(payload);

      if (res.success) {
        resetScheduleForm();
        renderAdminSchedulesList();
        setupSubjectAndClassFilters();
        renderConfigInfoOnLogin();
        renderAdminConfigForm();
      } else {
        alert(res.message);
      }
    });
  }

  function renderAdminSchedulesList() {
    if (!window.cbtAdmin || !window.cbtAdmin.isSuperAdminUser()) return;

    const tbody = document.getElementById('adminSchedulesTbody');
    const bannerTextEl = document.getElementById('activeScheduleBannerText');
    const cfg = window.examEngine.config;

    populateScheduleSubjectDatalist();

    if (bannerTextEl) {
      if (cfg.scheduleDay || cfg.scheduleDate) {
        const classLabel = cfg.targetClass && cfg.targetClass !== 'Semua Kelas' ? ` (${cfg.targetClass})` : '';
        bannerTextEl.innerText = `Mapel Aktif: ${cfg.subject}${classLabel} • ${[cfg.scheduleDay, cfg.scheduleDate].filter(Boolean).join(', ')} • Token: ${cfg.examToken}`;
      } else {
        bannerTextEl.innerText = `Mapel Aktif: ${cfg.subject} (Mode Manual • Token: ${cfg.examToken})`;
      }
    }

    if (!tbody) return;
    tbody.innerHTML = '';

    const schedules = window.cbtAdmin.getAllSchedules();
    if (schedules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada jadwal ujian. Tambahkan jadwal di formulir sebelah kiri.</td></tr>`;
      return;
    }

    schedules.forEach((s, idx) => {
      const isActive = cfg.activeScheduleId === s.id;
      const tr = document.createElement('tr');
      tr.className = `border-b border-slate-100 transition ${isActive ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`;
      tr.innerHTML = `
        <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
        <td class="p-3 whitespace-nowrap">
          <div class="font-bold text-slate-900">${s.day}, ${s.dateFormatted || window.cbtAdmin.formatIndonesianDate(s.dateIso)}</div>
          <div class="text-[10px] font-mono text-slate-400">${s.dateIso}</div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${s.subject}</div>
          <div class="flex flex-wrap items-center gap-1 mt-0.5">
            <span class="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">${s.classLevel}</span>
            ${(() => {
              const qInfo = window.examEngine && window.examEngine.getQuestionsForExam
                ? window.examEngine.getQuestionsForExam(s.subject, s.classLevel)
                : { questions: [], isFallback: true };
              return qInfo.isFallback
                ? `<span class="inline-block px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-[10px]">0 Soal Khusus</span>`
                : `<span class="inline-block px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">${qInfo.questions.length} Soal Siap</span>`;
            })()}
          </div>
        </td>
        <td class="p-3 whitespace-nowrap text-slate-600">
          <div class="font-semibold">${s.timeRange || '-'}</div>
          <div class="text-[10px] text-slate-400">${s.durationMinutes} Menit</div>
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-blue-700 font-mono font-black text-xs">${s.token}</span>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          ${isActive
            ? `<div class="flex flex-col items-center gap-1">
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">✓ Sedang Aktif</span>
                <button type="button" class="btn-deactivate-schedule px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] cursor-pointer">Nonaktifkan</button>
              </div>`
            : `<button type="button" class="btn-activate-schedule px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition cursor-pointer">▶ Aktifkan Mapel</button>`
          }
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" class="btn-edit-schedule text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded text-xs cursor-pointer mr-1" title="Edit Jadwal">✏️</button>
          <button type="button" class="btn-delete-schedule text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded text-xs cursor-pointer" title="Hapus Jadwal">🗑️</button>
        </td>
      `;

      const activateBtn = tr.querySelector('.btn-activate-schedule');
      if (activateBtn) {
        activateBtn.addEventListener('click', () => {
          const res = window.cbtAdmin.activateSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
            setupSubjectAndClassFilters();
            alert(`Mapel "${s.subject}" (${s.classLevel}) untuk hari ${s.day}, ${s.dateFormatted} berhasil DIAKTIFKAN!\nToken Ujian Siswa: ${s.token}`);
          } else {
            alert(res.message);
          }
        });
      }

      const deactivateBtn = tr.querySelector('.btn-deactivate-schedule');
      if (deactivateBtn) {
        deactivateBtn.addEventListener('click', () => {
          const res = window.cbtAdmin.deactivateSchedule();
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
          } else {
            alert(res.message);
          }
        });
      }

      tr.querySelector('.btn-edit-schedule').addEventListener('click', () => openEditScheduleForm(s));
      tr.querySelector('.btn-delete-schedule').addEventListener('click', () => {
        if (confirm(`Hapus jadwal "${s.subject} (${s.classLevel})" tanggal ${s.day}, ${s.dateFormatted}?`)) {
          const res = window.cbtAdmin.deleteSchedule(s.id);
          if (res.success) {
            renderAdminSchedulesList();
            renderConfigInfoOnLogin();
            renderAdminConfigForm();
            setupSubjectAndClassFilters();
          } else {
            alert(res.message);
          }
        }
      });

      tbody.appendChild(tr);
    });
  }

  // ===================== FILTER MAPEL & KELAS =====================
  function setupSubjectAndClassFilters() {
    const subjSelect = document.getElementById('filterResultsSubject');
    const classSelect = document.getElementById('filterResultsClass');
    if (!subjSelect || !classSelect || !window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];

    const allSubjects = window.cbtAdmin.getAllSubjects();
    subjSelect.innerHTML = isAdmin
      ? '<option value="ALL">Semua Mata Pelajaran</option>'
      : `<option value="ALL">Mapel Diampu (${currentTeacher?.subject || 'Semua'})</option>`;
    allSubjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.innerText = s;
      if (window.cbtAdmin.selectedSubjectFilter === s) opt.selected = true;
      subjSelect.appendChild(opt);
    });

    const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];
    const classesToShow = assignedClasses.length > 0
      ? Array.from(new Set([...assignedClasses, ...studentClasses.filter(c => assignedClasses.some(ac => String(c).toUpperCase().startsWith(ac)))])).sort()
      : studentClasses;

    classSelect.innerHTML = assignedClasses.length > 0
      ? `<option value="ALL">Kelas Diampu (${assignedClasses.join(', ')})</option>`
      : '<option value="ALL">Semua Kelas</option>';
    classesToShow.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.innerText = `Kelas ${c}`;
      if (window.cbtAdmin.selectedClassFilter === c) opt.selected = true;
      classSelect.appendChild(opt);
    });

    subjSelect.onchange = (e) => {
      window.cbtAdmin.setSubjectFilter(e.target.value);
      renderAdminAnalyticsAndResults();
    };

    classSelect.onchange = (e) => {
      window.cbtAdmin.setClassFilter(e.target.value);
      renderAdminAnalyticsAndResults();
    };
  }

  // ===================== TAB 1: REKAP NILAI & EVALUASI JAWABAN PER NOMOR =====================
  function renderAdminAnalyticsAndResults() {
    const analytics = window.cbtAdmin.getExamAnalytics();
    const sortedResults = window.cbtAdmin.getAllResultsSorted();

    document.getElementById('kpiAvgScore').innerText = analytics.averageScore;
    document.getElementById('kpiHighestScore').innerText = analytics.highestScore;
    document.getElementById('kpiHighestStudent').innerText = analytics.highestStudent;
    document.getElementById('kpiLowestScore').innerText = analytics.lowestScore;
    document.getElementById('kpiLowestStudent').innerText = analytics.lowestStudent;
    document.getElementById('kpiTotalStudents').innerText = `${analytics.totalStudents} Siswa`;
    document.getElementById('kpiPassRate').innerText = `Ketuntasan (≥75): ${analytics.passRatePercentage}%`;

    const tbody = document.getElementById('adminResultsTbody');
    const emptyRow = document.getElementById('adminResultsEmpty');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (sortedResults.length === 0) {
      if (emptyRow) emptyRow.classList.remove('hidden');
      return;
    }

    if (emptyRow) emptyRow.classList.add('hidden');

    sortedResults.forEach((r, idx) => {
      const rank = idx + 1;
      let rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs inline-flex items-center justify-center">${rank}</span>`;
      if (rank === 1) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥇 1</span>`;
      } else if (rank === 2) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-black text-xs inline-flex items-center justify-center shadow-xs">🥈 2</span>`;
      } else if (rank === 3) {
        rankBadge = `<span class="w-6 h-6 rounded-full bg-amber-50 text-amber-900 border border-amber-300 font-black text-xs inline-flex items-center justify-center shadow-xs">🥉 3</span>`;
      }

      const items = window.cbtAdmin.getAnswerBreakdownItems(r);
      const answerChipsHtml = items.length > 0
        ? `<div class="flex flex-wrap gap-1">${items.map(it => {
            if (it.status === 'correct') {
              return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold font-mono" title="No.${it.num} Benar (Kunci: ${it.correctVal})">${it.num}:${it.studentVal}✓</span>`;
            }
            if (it.status === 'unattempted') {
              return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-bold font-mono" title="No.${it.num} Kosong (Kunci: ${it.correctVal})">${it.num}:-(K:${it.correctVal})</span>`;
            }
            return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold font-mono" title="No.${it.num} Salah (Jawaban: ${it.studentVal}, Kunci: ${it.correctVal})">${it.num}:${it.studentVal}✗(K:${it.correctVal})</span>`;
          }).join('')}</div>`
        : `<span class="text-[11px] text-slate-400">Belum ada rincian jawaban</span>`;

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-xs";
      tr.innerHTML = `
        <td class="p-3 text-center font-bold">${rankBadge}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${r.student?.name || '-'}</div>
          <div class="text-[10px] text-slate-400">${r.subject}</div>
        </td>
        <td class="p-3 font-mono font-semibold text-slate-700">${r.student?.nisn || '-'}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs">${r.student?.class ? 'Kelas ' + r.student.class : '-'}</span>
        </td>
        <td class="p-3 text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black ${
            r.finalScore >= 75
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }">
            ${r.finalScore}
          </span>
        </td>
        <td class="p-3">${answerChipsHtml}</td>
        <td class="p-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">${r.completedAt}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5 font-bold">
            <span class="text-emerald-600">✓${r.correctCount}</span>
            <span class="text-red-500">✗${r.incorrectCount}</span>
            <span class="text-slate-400">?${r.unattemptedCount}</span>
          </div>
        </td>
        <td class="p-3">
          ${(r.cheatCount || 0) > 0
            ? `<span class="text-[11px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded inline-block">${r.cheatCount}x Pindah Tab</span>`
            : `<span class="text-[11px] text-emerald-600 font-medium">Tertib (0)</span>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const btnExportExcel = document.getElementById('btnExportExcel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => window.cbtAdmin.exportResultsExcel());

  const btnExportPDF = document.getElementById('btnExportPDF');
  if (btnExportPDF) btnExportPDF.addEventListener('click', () => window.cbtAdmin.exportResultsPDF());

  const btnClearAllResults = document.getElementById('btnClearAllResults');
  if (btnClearAllResults) {
    btnClearAllResults.addEventListener('click', () => {
      if (confirm("Peringatan: Yakin ingin menghapus seluruh riwayat rekap nilai ujian?")) {
        window.cbtAdmin.clearAllResults();
        renderAdminAnalyticsAndResults();
      }
    });
  }

  // ===================== TAB 2: BANK SOAL UJIAN (PER MATA PELAJARAN & KELAS) =====================
  function setupQuestionBankFilters() {
    const subjFilterEl = document.getElementById('filterQuestionsSubject');
    const classFilterEl = document.getElementById('filterQuestionsClass');
    const modalSubjEl = document.getElementById('qInputSubject');
    const modalClassEl = document.getElementById('qInputClassLevel');
    if (!window.cbtAdmin) return;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    const isAdmin = currentTeacher && (currentTeacher.role === 'admin' || currentTeacher.id === 'admin');
    const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
    const assignedClasses = (!isAdmin && currentTeacher && currentTeacher.classes)
      ? window.cbtAdmin.parseTeacherClasses(currentTeacher.classes)
      : [];
    const allSubjects = window.cbtAdmin.getAllSubjects();
    const studentClasses = window.studentManager ? window.studentManager.getAllClasses() : [];

    if (subjFilterEl) {
      const prevVal = subjFilterEl.value;
      subjFilterEl.innerHTML = '';

      if (isAdmin) {
        const optAll = document.createElement('option');
        optAll.value = 'ALL';
        optAll.innerText = 'Semua Mata Pelajaran';
        subjFilterEl.appendChild(optAll);

        const optUmum = document.createElement('option');
        optUmum.value = 'UMUM';
        optUmum.innerText = 'Umum / Soal Demo Bawaan';
        subjFilterEl.appendChild(optUmum);

        allSubjects.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          subjFilterEl.appendChild(opt);
        });
      } else {
        const ownedList = teacherSubjects.length > 0
          ? teacherSubjects
          : (currentTeacher && currentTeacher.subject ? [currentTeacher.subject] : []);

        if (ownedList.length > 1) {
          const optOwnedAll = document.createElement('option');
          optOwnedAll.value = 'ALL';
          optOwnedAll.innerText = `Semua Mapel Diampu (${ownedList.join(' / ')})`;
          subjFilterEl.appendChild(optOwnedAll);
        }

        ownedList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          subjFilterEl.appendChild(opt);
        });
      }

      const availableValues = Array.from(subjFilterEl.options).map(o => o.value);
      if (prevVal && availableValues.includes(prevVal)) {
        subjFilterEl.value = prevVal;
      } else if (!isAdmin && teacherSubjects.length === 1) {
        subjFilterEl.value = teacherSubjects[0];
      } else if (subjFilterEl.options.length > 0) {
        subjFilterEl.selectedIndex = 0;
      }

      subjFilterEl.onchange = () => renderAdminQuestionList();
    }

    if (classFilterEl) {
      const prevCls = classFilterEl.value;
      classFilterEl.innerHTML = '';

      const optAllCls = document.createElement('option');
      optAllCls.value = 'ALL';
      optAllCls.innerText = assignedClasses.length > 0
        ? `Semua Kelas Diampu (${assignedClasses.join(', ')})`
        : 'Semua Kelas / Tingkat';
      classFilterEl.appendChild(optAllCls);

      if (assignedClasses.length > 0) {
        if (assignedClasses.length > 1) {
          const optGroup = document.createElement('option');
          optGroup.value = assignedClasses.join(', ');
          optGroup.innerText = `Gabungan Kelas Diampu (${assignedClasses.join(', ')})`;
          classFilterEl.appendChild(optGroup);
        }
        assignedClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          classFilterEl.appendChild(opt);
        });
      } else {
        ['Kelas 7', 'Kelas 8', 'Kelas 9'].forEach(g => {
          const opt = document.createElement('option');
          opt.value = g;
          opt.innerText = g;
          classFilterEl.appendChild(opt);
        });
        studentClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          classFilterEl.appendChild(opt);
        });
      }

      const clsValues = Array.from(classFilterEl.options).map(o => o.value);
      if (prevCls && clsValues.includes(prevCls)) {
        classFilterEl.value = prevCls;
      } else {
        classFilterEl.value = 'ALL';
      }

      classFilterEl.onchange = () => renderAdminQuestionList();
    }

    if (modalSubjEl) {
      const prevModalVal = modalSubjEl.value;
      modalSubjEl.innerHTML = '';

      if (isAdmin) {
        const optUmum = document.createElement('option');
        optUmum.value = 'Umum';
        optUmum.innerText = 'Umum (Semua Mapel)';
        modalSubjEl.appendChild(optUmum);

        allSubjects.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          modalSubjEl.appendChild(opt);
        });
      } else {
        const ownedList = teacherSubjects.length > 0
          ? teacherSubjects
          : (currentTeacher && currentTeacher.subject ? [currentTeacher.subject] : ['Umum']);

        ownedList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.innerText = s;
          modalSubjEl.appendChild(opt);
        });
      }

      const modalValues = Array.from(modalSubjEl.options).map(o => o.value);
      if (prevModalVal && modalValues.includes(prevModalVal)) {
        modalSubjEl.value = prevModalVal;
      }
    }

    if (modalClassEl) {
      const prevModalCls = modalClassEl.value;
      modalClassEl.innerHTML = '';

      if (assignedClasses.length > 0) {
        if (assignedClasses.length > 1) {
          const optAssignedGroup = document.createElement('option');
          optAssignedGroup.value = assignedClasses.join(', ');
          optAssignedGroup.innerText = `Semua Kelas Diampu (${assignedClasses.join(', ')})`;
          modalClassEl.appendChild(optAssignedGroup);
        }
        assignedClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          modalClassEl.appendChild(opt);
        });
      }

      const optSemua = document.createElement('option');
      optSemua.value = 'Semua Kelas';
      optSemua.innerText = 'Semua Kelas (7, 8, 9)';
      modalClassEl.appendChild(optSemua);

      ['Kelas 7', 'Kelas 8', 'Kelas 9'].forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.innerText = g;
        modalClassEl.appendChild(opt);
      });

      studentClasses.forEach(c => {
        if (!assignedClasses.includes(c)) {
          const opt = document.createElement('option');
          opt.value = c;
          opt.innerText = `Kelas ${c}`;
          modalClassEl.appendChild(opt);
        }
      });

      const modalClsValues = Array.from(modalClassEl.options).map(o => o.value);
      if (prevModalCls && modalClsValues.includes(prevModalCls)) {
        modalClassEl.value = prevModalCls;
      } else if (assignedClasses.length > 0) {
        modalClassEl.value = assignedClasses.join(', ');
      }
    }
  }

  function renderAdminQuestionList() {
    const listContainer = document.getElementById('adminQuestionList');
    const totalCountEl = document.getElementById('adminTotalQuestionsCount');
    const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
    const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';

    const questions = window.cbtAdmin.getQuestionsFiltered(subjFilter, classFilter);
    const totalAll = window.cbtAdmin.getAllQuestions().length;

    const subjLabel = subjFilter === 'ALL'
      ? 'Semua Mapel'
      : (subjFilter === 'UMUM' ? 'Umum / Demo' : subjFilter);
    const clsLabel = classFilter === 'ALL' ? '' : ` • ${classFilter}`;

    if (totalCountEl) {
      totalCountEl.innerText = `${questions.length} Soal (${subjLabel}${clsLabel}) — Total Bank: ${totalAll}`;
    }
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (questions.length === 0) {
      const activeSubName = subjFilter === 'ALL' ? 'mata pelajaran yang dipilih' : `"${subjLabel}"`;
      const activeClsName = classFilter === 'ALL' ? '' : ` untuk ${classFilter}`;
      listContainer.innerHTML = `
        <div class="text-center py-12 px-4 text-slate-500 bg-white rounded-3xl border border-slate-200">
          <p class="font-bold text-base text-slate-700">Belum ada soal untuk ${activeSubName}${activeClsName}.</p>
          <p class="text-xs sm:text-sm text-slate-400 mt-1">Klik tombol <strong class="text-blue-600">+ Tambah Soal</strong> atau <strong class="text-slate-600">📥 Impor JSON</strong> untuk menambahkan butir soal ${activeSubName}.</p>
        </div>
      `;
      return;
    }

    questions.forEach((q, index) => {
      const type = q.type || 'single';
      const qSubj = q.subject && String(q.subject).trim() !== '' ? q.subject : 'Umum / Demo';
      const qClass = q.classLevel && String(q.classLevel).trim() !== '' ? q.classLevel : 'Semua Kelas';
      const card = document.createElement('div');
      card.className = "bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs hover:border-slate-300 transition";

      let typeBadge = '';
      let answerDetailsHtml = '';

      if (type === 'single') {
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md">PG Tunggal (Kunci: ${q.correctAnswer})</span>`;
        answerDetailsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            ${(q.options || []).map(opt => `
              <div class="p-2 rounded-lg ${opt.key === q.correctAnswer ? 'bg-green-50 border border-green-200 font-semibold text-green-800' : 'bg-slate-50 text-slate-600'}">
                <span class="font-bold mr-1">${opt.key}.</span> ${opt.text}
              </div>
            `).join('')}
          </div>
        `;
      } else if (type === 'multiple') {
        const correctKeys = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-md">PG Kompleks (Kunci: ${correctKeys.join(', ')})</span>`;
        answerDetailsHtml = `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            ${(q.options || []).map(opt => `
              <div class="p-2 rounded-lg ${correctKeys.includes(opt.key) ? 'bg-purple-50 border border-purple-200 font-bold text-purple-900' : 'bg-slate-50 text-slate-600'}">
                <span class="font-bold mr-1">[${opt.key}]</span> ${opt.text}
              </div>
            `).join('')}
          </div>
        `;
      } else if (type === 'true_false') {
        typeBadge = `<span class="text-[11px] font-semibold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md">Benar / Salah</span>`;
        answerDetailsHtml = `
          <div class="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1.5">
            ${(q.statements || []).map(stmt => `
              <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span class="text-slate-700">${stmt.text}</span>
                <span class="font-bold px-2 py-0.5 rounded text-[10px] ${stmt.correct === 'B' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}">
                  ${stmt.correct === 'B' ? 'BENAR' : 'SALAH'}
                </span>
              </div>
            `).join('')}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center">
              ${index + 1}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
              📚 ${qSubj}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded-md">
              🏫 ${qClass}
            </span>
            ${q.createdBy ? `<span class="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">✍️ ${q.createdBy}</span>` : ''}
            ${typeBadge}
            <span class="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
              Bobot: ${q.weight || 10}
            </span>
          </div>
          <button class="btn-delete-q text-red-600 hover:text-red-800 p-1 rounded-lg hover:bg-red-50 text-xs font-medium cursor-pointer">
            🗑️ Hapus
          </button>
        </div>
        <p class="text-slate-800 text-xs sm:text-sm font-medium mt-2.5 whitespace-pre-line leading-relaxed">${q.question}</p>
        ${q.image ? `<div class="mt-2.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200 inline-block max-w-xs"><img src="${q.image}" alt="Gambar Soal" class="rounded-lg max-h-28 object-contain"></div>` : ''}
        ${answerDetailsHtml}
      `;

      card.querySelector('.btn-delete-q').addEventListener('click', () => {
        if (confirm(`Yakin ingin menghapus Soal No. ${index + 1} (${qSubj})?`)) {
          window.cbtAdmin.deleteQuestion(q.id);
          renderAdminQuestionList();
          renderAdminSchedulesList();
        }
      });

      listContainer.appendChild(card);
    });
  }

  const qInputType = document.getElementById('qInputType');
  const sectionOptionsAE = document.getElementById('sectionOptionsAE');
  const boxKeySingle = document.getElementById('boxKeySingle');
  const boxKeyMultiple = document.getElementById('boxKeyMultiple');
  const sectionTrueFalse = document.getElementById('sectionTrueFalse');

  if (qInputType) {
    qInputType.addEventListener('change', () => {
      const selectedType = qInputType.value;
      if (selectedType === 'single') {
        sectionOptionsAE.classList.remove('hidden');
        boxKeySingle.classList.remove('hidden');
        boxKeyMultiple.classList.add('hidden');
        sectionTrueFalse.classList.add('hidden');
      } else if (selectedType === 'multiple') {
        sectionOptionsAE.classList.remove('hidden');
        boxKeySingle.classList.add('hidden');
        boxKeyMultiple.classList.remove('hidden');
        sectionTrueFalse.classList.add('hidden');
      } else if (selectedType === 'true_false') {
        sectionOptionsAE.classList.add('hidden');
        sectionTrueFalse.classList.remove('hidden');
      }
    });
  }

  const btnOpenAddQuestion = document.getElementById('btnOpenAddQuestion');
  const btnCloseQuestionForm = document.getElementById('btnCloseQuestionForm');

  if (btnOpenAddQuestion) {
    btnOpenAddQuestion.addEventListener('click', () => {
      document.getElementById('formQuestionItem').reset();
      resetImageUploader();
      setupQuestionBankFilters();

      const subjFilterVal = document.getElementById('filterQuestionsSubject')?.value;
      const classFilterVal = document.getElementById('filterQuestionsClass')?.value;
      const modalSubjEl = document.getElementById('qInputSubject');
      const modalClassEl = document.getElementById('qInputClassLevel');

      if (modalSubjEl && subjFilterVal && subjFilterVal !== 'ALL') {
        const targetVal = subjFilterVal === 'UMUM' ? 'Umum' : subjFilterVal;
        if (Array.from(modalSubjEl.options).some(o => o.value === targetVal)) {
          modalSubjEl.value = targetVal;
        }
      }
      if (modalClassEl) {
        const curT = window.cbtAdmin.getCurrentTeacher();
        const isAdm = curT && (curT.role === 'admin' || curT.id === 'admin');
        const assignedCls = (!isAdm && curT && curT.classes) ? window.cbtAdmin.parseTeacherClasses(curT.classes) : [];
        const targetCls = (classFilterVal && classFilterVal !== 'ALL')
          ? classFilterVal
          : (assignedCls.length > 0 ? assignedCls.join(', ') : 'Semua Kelas');
        if (Array.from(modalClassEl.options).some(o => o.value === targetCls)) {
          modalClassEl.value = targetCls;
        }
      }

      if (qInputType) qInputType.dispatchEvent(new Event('change'));
      modalQuestionForm.classList.remove('hidden');
    });
  }

  if (btnCloseQuestionForm) {
    btnCloseQuestionForm.addEventListener('click', () => {
      modalQuestionForm.classList.add('hidden');
      resetImageUploader();
    });
  }

  const formQuestionItem = document.getElementById('formQuestionItem');
  if (formQuestionItem) {
    formQuestionItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const subject = document.getElementById('qInputSubject')?.value || 'Umum';
      const classLevel = document.getElementById('qInputClassLevel')?.value || 'Semua Kelas';
      const type = qInputType.value;
      const questionText = document.getElementById('qInputText').value.trim();
      const weight = parseInt(document.getElementById('qInputWeight').value) || 10;
      const image = currentUploadedImageBase64 || "";

      let qData = { subject, classLevel, type, question: questionText, image, weight };

      if (type === 'single') {
        qData.options = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() },
          { key: "E", text: document.getElementById('qInputOptE').value.trim() }
        ];
        qData.correctAnswer = document.getElementById('qInputCorrectSingle').value;
      } else if (type === 'multiple') {
        qData.options = [
          { key: "A", text: document.getElementById('qInputOptA').value.trim() },
          { key: "B", text: document.getElementById('qInputOptB').value.trim() },
          { key: "C", text: document.getElementById('qInputOptC').value.trim() },
          { key: "D", text: document.getElementById('qInputOptD').value.trim() },
          { key: "E", text: document.getElementById('qInputOptE').value.trim() }
        ];
        const checkedBoxes = Array.from(document.querySelectorAll('input[name="multiCorrect"]:checked')).map(el => el.value);
        if (checkedBoxes.length === 0) {
          alert("Pilih minimal 1 kunci jawaban untuk soal pilihan ganda kompleks!");
          return;
        }
        qData.correctAnswer = checkedBoxes;
      } else if (type === 'true_false') {
        const s1 = document.getElementById('tfStmt1').value.trim();
        const s2 = document.getElementById('tfStmt2').value.trim();
        const s3 = document.getElementById('tfStmt3').value.trim();

        if (!s1 || !s2) {
          alert("Harap isi minimal 2 pernyataan untuk soal Benar / Salah!");
          return;
        }

        const statements = [
          { id: "s1", text: s1, correct: document.getElementById('tfCorrect1').value },
          { id: "s2", text: s2, correct: document.getElementById('tfCorrect2').value }
        ];
        if (s3) {
          statements.push({ id: "s3", text: s3, correct: document.getElementById('tfCorrect3').value });
        }
        qData.statements = statements;
      }

      window.cbtAdmin.addQuestion(qData);
      modalQuestionForm.classList.add('hidden');
      resetImageUploader();
      setupQuestionBankFilters();

      const subjFilterEl = document.getElementById('filterQuestionsSubject');
      if (subjFilterEl && subject && subject !== 'Umum') {
        if (Array.from(subjFilterEl.options).some(o => o.value === subject)) {
          subjFilterEl.value = subject;
        }
      }

      renderAdminQuestionList();
      renderAdminSchedulesList();
    });
  }

  const btnExportQuestions = document.getElementById('btnExportQuestions');
  if (btnExportQuestions) {
    btnExportQuestions.addEventListener('click', () => {
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      window.cbtAdmin.exportQuestionsJSON(subjFilter, classFilter);
    });
  }

  const btnImportQuestions = document.getElementById('btnImportQuestions');
  const fileImportInput = document.getElementById('fileImportQuestions');
  if (btnImportQuestions && fileImportInput) {
    btnImportQuestions.addEventListener('click', () => fileImportInput.click());
    fileImportInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const subjFilter = document.getElementById('filterQuestionsSubject')?.value || 'ALL';
      const classFilter = document.getElementById('filterQuestionsClass')?.value || 'ALL';
      const currentTeacher = window.cbtAdmin.getCurrentTeacher();
      const teacherSubjects = window.cbtAdmin.getTeacherSubjectsList(currentTeacher);
      const defaultSub = (subjFilter !== 'ALL' && subjFilter !== 'UMUM')
        ? subjFilter
        : (teacherSubjects[0] || 'Umum');
      const defaultCls = classFilter !== 'ALL' ? classFilter : 'Semua Kelas';

      const reader = new FileReader();
      reader.onload = (event) => {
        const res = window.cbtAdmin.importQuestionsJSON(event.target.result, defaultSub, defaultCls);
        if (res.success) {
          alert(`Berhasil mengimpor ${res.count} butir soal ujian!`);
          setupQuestionBankFilters();
          renderAdminQuestionList();
          renderAdminSchedulesList();
        } else {
          alert(`Gagal impor: ${res.message}`);
        }
      };
      reader.readAsText(file);
      fileImportInput.value = '';
    });
  }

  const btnResetDefaultQuestions = document.getElementById('btnResetDefaultQuestions');
  if (btnResetDefaultQuestions) {
    btnResetDefaultQuestions.addEventListener('click', () => {
      if (confirm("Reset seluruh bank soal ke soal bawaan ujian demo? (Soal semua mata pelajaran akan diganti ke 8 soal demo)")) {
        window.cbtAdmin.resetToDefaultQuestions();
        setupQuestionBankFilters();
        renderAdminQuestionList();
        renderAdminSchedulesList();
      }
    });
  }

  // ===================== TAB 3: MANAJEMEN 250 SISWA & KARTU PESERTA =====================
  function renderAdminStudentsList(searchQuery = "") {
    const tbody = document.getElementById('adminStudentsTbody');
    const badge = document.getElementById('studentCountBadge');
    if (!tbody || !window.studentManager) return;

    const students = searchQuery
      ? window.studentManager.searchStudents(searchQuery)
      : window.studentManager.getAllStudents();

    if (badge) badge.innerText = `${window.studentManager.getStudentCount()} Siswa`;

    tbody.innerHTML = '';
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Tidak ada data siswa ditemukan.</td></tr>`;
      return;
    }

    students.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-blue-700">${s.nisn}</td>
        <td class="p-3 font-semibold text-slate-800">${s.name}</td>
        <td class="p-3 text-slate-600">${s.birthPlace || '-'}</td>
        <td class="p-3 text-slate-600 whitespace-nowrap">${s.birthDate || '-'}</td>
        <td class="p-3 text-slate-600">${s.gender || '-'}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">Kelas ${s.class}</span></td>
        <td class="p-3 text-slate-600 max-w-[180px] truncate" title="${s.address || ''}">${s.address || '-'}</td>
        <td class="p-3 font-mono text-slate-500">${s.password}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" class="btn-edit-student text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded text-xs cursor-pointer mr-1" title="Edit Siswa">✏️</button>
          <button type="button" class="btn-delete-student text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded text-xs cursor-pointer" title="Hapus Siswa">🗑️</button>
        </td>
      `;
      tr.querySelector('.btn-edit-student').addEventListener('click', () => openStudentModal(s));
      tr.querySelector('.btn-delete-student').addEventListener('click', () => {
        if (confirm(`Hapus data siswa: ${s.name} (${s.nisn})?`)) {
          window.studentManager.deleteStudent(s.nisn);
          renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
          setupSubjectAndClassFilters();
        }
      });
      tbody.appendChild(tr);
    });
  }

  // Modal Tambah / Edit Siswa
  const modalStudentForm = document.getElementById('modalStudentForm');
  const formStudentItem = document.getElementById('formStudentItem');
  const btnOpenAddStudent = document.getElementById('btnOpenAddStudent');
  const btnCloseStudentForm = document.getElementById('btnCloseStudentForm');
  const btnCancelStudentForm = document.getElementById('btnCancelStudentForm');

  function openStudentModal(student = null) {
    if (!modalStudentForm) return;
    const titleEl = document.getElementById('modalStudentFormTitle');
    if (student) {
      if (titleEl) titleEl.innerText = "Edit Data Siswa";
      document.getElementById('editStudentOriginalNisn').value = student.nisn;
      document.getElementById('stuInputNisn').value = student.nisn;
      document.getElementById('stuInputNisn').readOnly = true;
      document.getElementById('stuInputName').value = student.name || '';
      document.getElementById('stuInputClass').value = student.class || '9A';
      document.getElementById('stuInputBirthPlace').value = student.birthPlace || '';
      document.getElementById('stuInputBirthDate').value = student.birthDate || '';
      document.getElementById('stuInputGender').value = student.gender || 'Laki-laki';
      document.getElementById('stuInputPassword').value = student.password || '123';
      document.getElementById('stuInputAddress').value = student.address || '';
    } else {
      if (titleEl) titleEl.innerText = "Tambah Data Siswa Baru";
      document.getElementById('editStudentOriginalNisn').value = '';
      document.getElementById('stuInputNisn').value = '';
      document.getElementById('stuInputNisn').readOnly = false;
      document.getElementById('stuInputName').value = '';
      document.getElementById('stuInputClass').value = '9A';
      document.getElementById('stuInputBirthPlace').value = '';
      document.getElementById('stuInputBirthDate').value = '';
      document.getElementById('stuInputGender').value = 'Laki-laki';
      document.getElementById('stuInputPassword').value = '123';
      document.getElementById('stuInputAddress').value = '';
    }
    modalStudentForm.classList.remove('hidden');
  }

  if (btnOpenAddStudent) btnOpenAddStudent.addEventListener('click', () => openStudentModal(null));
  if (btnCloseStudentForm) btnCloseStudentForm.addEventListener('click', () => modalStudentForm.classList.add('hidden'));
  if (btnCancelStudentForm) btnCancelStudentForm.addEventListener('click', () => modalStudentForm.classList.add('hidden'));

  if (formStudentItem) {
    formStudentItem.addEventListener('submit', (e) => {
      e.preventDefault();
      const origNisn = document.getElementById('editStudentOriginalNisn').value;
      const payload = {
        nisn: document.getElementById('stuInputNisn').value.trim(),
        name: document.getElementById('stuInputName').value.trim(),
        class: document.getElementById('stuInputClass').value.trim(),
        birthPlace: document.getElementById('stuInputBirthPlace').value.trim(),
        birthDate: document.getElementById('stuInputBirthDate').value.trim(),
        gender: document.getElementById('stuInputGender').value,
        password: document.getElementById('stuInputPassword').value.trim() || '123',
        address: document.getElementById('stuInputAddress').value.trim()
      };

      const res = origNisn
        ? window.studentManager.updateStudentProfile(origNisn, payload)
        : window.studentManager.addStudent(payload);

      if (res.success) {
        modalStudentForm.classList.add('hidden');
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
        setupSubjectAndClassFilters();
      } else {
        alert(res.message);
      }
    });
  }

  const searchStudentInput = document.getElementById('searchStudentInput');
  if (searchStudentInput) {
    searchStudentInput.addEventListener('input', (e) => renderAdminStudentsList(e.target.value.trim()));
  }

  const btnDownloadStudentTemplate = document.getElementById('btnDownloadStudentTemplate');
  if (btnDownloadStudentTemplate) {
    btnDownloadStudentTemplate.addEventListener('click', () => window.studentManager.downloadExcelTemplate());
  }

  const btnTriggerImportStudents = document.getElementById('btnTriggerImportStudents');
  const fileImportStudentsExcel = document.getElementById('fileImportStudentsExcel');
  if (btnTriggerImportStudents && fileImportStudentsExcel) {
    btnTriggerImportStudents.addEventListener('click', () => fileImportStudentsExcel.click());
    fileImportStudentsExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = window.studentManager.importFromExcel(evt.target.result);
        if (result.success) {
          alert(`Sukses! Berhasil mengimpor ${result.count} data siswa dari file Excel.`);
          renderAdminStudentsList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal impor Excel: ${result.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
  }

  const btnGenerate250Demo = document.getElementById('btnGenerate250Demo');
  if (btnGenerate250Demo) {
    btnGenerate250Demo.addEventListener('click', () => {
      if (confirm("Buat otomatis 250 akun siswa demo lengkap dengan NISN, TTL, Jenis Kelamin, Alamat, dan Kelas?")) {
        const res = window.studentManager.generate250DemoStudents();
        alert(`Sukses! ${res.count} siswa demo berhasil dimuat ke pangkalan data sekolah.`);
        renderAdminStudentsList();
        setupSubjectAndClassFilters();
      }
    });
  }

  // Modal Preview, Download PDF, & Cetak Kartu Peserta (9,0 x 5,3 cm)
  const modalPrintCardsPreview = document.getElementById('modalPrintCardsPreview');
  const cardPreviewContainer = document.getElementById('cardPreviewContainer');
  const cardPreviewClassFilter = document.getElementById('cardPreviewClassFilter');
  const cardPreviewCountBadge = document.getElementById('cardPreviewCountBadge');
  const btnCloseCardPreview = document.getElementById('btnCloseCardPreview');
  const btnCancelCardPreview = document.getElementById('btnCancelCardPreview');
  const btnExecuteDirectPrintCards = document.getElementById('btnExecuteDirectPrintCards');
  const btnDownloadCardsPdf = document.getElementById('btnDownloadCardsPdf');

  function getFilteredPreviewCardStudents() {
    const selectedClass = cardPreviewClassFilter ? cardPreviewClassFilter.value : "ALL";
    let students = window.studentManager.getAllStudents();
    if (selectedClass !== "ALL") {
      students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
    }
    return students;
  }

  function openCardPreviewModal() {
    if (!modalPrintCardsPreview || !window.studentManager) return;
    const students = window.studentManager.getAllStudents();
    if (students.length === 0) {
      alert("Belum ada data siswa. Silakan klik '🎲 Isi 250 Siswa Demo' atau '📥 Impor dari Excel' terlebih dahulu.");
      return;
    }

    if (cardPreviewClassFilter) {
      const classes = window.studentManager.getAllClasses();
      cardPreviewClassFilter.innerHTML = '<option value="ALL">Semua Kelas (Semua Kartu)</option>';
      classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = `Kelas ${c}`;
        cardPreviewClassFilter.appendChild(opt);
      });
      cardPreviewClassFilter.value = "ALL";
    }

    renderCardPreviewContent("ALL");
    modalPrintCardsPreview.classList.remove('hidden');
  }

  function renderCardPreviewContent(selectedClass = "ALL") {
    if (!cardPreviewContainer || !window.studentManager) return;
    let students = window.studentManager.getAllStudents();
    if (selectedClass !== "ALL") {
      students = students.filter(s => String(s.class).trim().toUpperCase() === String(selectedClass).trim().toUpperCase());
    }

    if (cardPreviewCountBadge) {
      cardPreviewCountBadge.innerText = `${students.length} Kartu (${selectedClass === "ALL" ? "Semua Kelas" : "Kelas " + selectedClass})`;
    }

    const cardsHtml = window.studentManager.generateCardsHtml(students, window.examEngine.config.examTitle);
    cardPreviewContainer.innerHTML = `
      <div class="cards-grid grid grid-cols-1 md:grid-cols-2 gap-4 justify-items-center max-w-4xl mx-auto">
        ${cardsHtml}
      </div>
    `;
  }

  function closeCardPreviewModal() {
    if (modalPrintCardsPreview) modalPrintCardsPreview.classList.add('hidden');
  }

  if (cardPreviewClassFilter) {
    cardPreviewClassFilter.addEventListener('change', (e) => renderCardPreviewContent(e.target.value));
  }
  if (btnCloseCardPreview) btnCloseCardPreview.addEventListener('click', closeCardPreviewModal);
  if (btnCancelCardPreview) btnCancelCardPreview.addEventListener('click', closeCardPreviewModal);

  if (btnExecuteDirectPrintCards) {
    btnExecuteDirectPrintCards.addEventListener('click', () => {
      const students = getFilteredPreviewCardStudents();
      closeCardPreviewModal();
      window.studentManager.printExamCards(students, window.examEngine.config.examTitle);
    });
  }

  if (btnDownloadCardsPdf) {
    btnDownloadCardsPdf.addEventListener('click', () => {
      const students = getFilteredPreviewCardStudents();
      closeCardPreviewModal();
      window.studentManager.downloadCardsPdf(students, window.examEngine.config.examTitle);
    });
  }

  const btnPrintStudentCards = document.getElementById('btnPrintStudentCards');
  if (btnPrintStudentCards) btnPrintStudentCards.addEventListener('click', openCardPreviewModal);

  const btnResetAllStudentPasswords = document.getElementById('btnResetAllStudentPasswords');
  if (btnResetAllStudentPasswords) {
    btnResetAllStudentPasswords.addEventListener('click', () => {
      if (confirm("Yakin ingin mereset password SELURUH siswa ke default '123'?")) {
        const res = window.studentManager.resetAllStudentPasswords("123");
        alert(`Sukses! Password ${res.count} siswa berhasil direset ke '123'.`);
        renderAdminStudentsList(document.getElementById('searchStudentInput')?.value || '');
      }
    });
  }

  const btnClearStudents = document.getElementById('btnClearStudents');
  if (btnClearStudents) {
    btnClearStudents.addEventListener('click', () => {
      if (confirm("Peringatan: Yakin ingin mengosongkan seluruh data siswa peserta ujian?")) {
        window.studentManager.clearAllStudents();
        renderAdminStudentsList();
        setupSubjectAndClassFilters();
      }
    });
  }

  // ===================== TAB 4: MANAJEMEN GURU + EXCEL TEMPLATE & IMPORT =====================
  const btnDownloadTeacherTemplate = document.getElementById('btnDownloadTeacherTemplate');
  if (btnDownloadTeacherTemplate) {
    btnDownloadTeacherTemplate.addEventListener('click', () => {
      window.cbtAdmin.downloadTeacherExcelTemplate();
    });
  }

  const btnTriggerImportTeachers = document.getElementById('btnTriggerImportTeachers');
  const fileImportTeachersExcel = document.getElementById('fileImportTeachersExcel');
  if (btnTriggerImportTeachers && fileImportTeachersExcel) {
    btnTriggerImportTeachers.addEventListener('click', () => fileImportTeachersExcel.click());
    fileImportTeachersExcel.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = window.cbtAdmin.importTeachersFromExcel(evt.target.result);
        if (result.success) {
          alert(`Sukses! Berhasil mengimpor / memperbarui ${result.count} akun guru dari file Excel.`);
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal impor Excel guru: ${result.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    });
  }

  function renderAdminTeachersList(searchQuery = "") {
    const tbody = document.getElementById('adminTeachersTbody');
    const badge = document.getElementById('teacherCountBadge');
    if (!tbody || !window.cbtAdmin) return;
    tbody.innerHTML = '';

    const teachers = searchQuery
      ? window.cbtAdmin.searchTeachers(searchQuery)
      : window.cbtAdmin.getAllTeachers();

    if (badge) {
      const guruCount = window.cbtAdmin.getAllTeachers().filter(t => t.role !== 'admin').length;
      badge.innerText = `Total: ${guruCount} Guru (+ 1 Proktor)`;
    }

    if (teachers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tidak ada data guru ditemukan.</td></tr>`;
      return;
    }

    teachers.forEach((t, idx) => {
      const isSuperAdmin = t.role === 'admin' || t.id === 'admin';
      const parsedClasses = window.cbtAdmin.parseTeacherClasses(t.classes);
      const classBadgeHtml = isSuperAdmin
        ? `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[11px]">Semua Kelas</span>`
        : (parsedClasses.length > 0
          ? `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">${parsedClasses.join(', ')}</span>`
          : `<span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium text-[11px]">Semua Kelas</span>`);

      const tr = document.createElement('tr');
      tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
      tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="p-3 font-mono font-bold text-slate-700">${t.nip}</td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${t.name}</div>
          ${isSuperAdmin ? '<span class="text-[10px] font-black text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full inline-block mt-0.5">Proktor Utama / Admin</span>' : ''}
        </td>
        <td class="p-3"><span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs">${t.subject}</span></td>
        <td class="p-3 whitespace-nowrap">${classBadgeHtml}</td>
        <td class="p-3">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-slate-700 teacher-pin-val">••••••</span>
            <button type="button" class="btn-toggle-row-pin text-[11px] text-blue-600 hover:underline cursor-pointer" title="Lihat Password">👁️</button>
          </div>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" data-id="${t.id}" class="btn-edit-teacher px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition cursor-pointer mr-1">
            ✏️ Edit
          </button>
          ${!isSuperAdmin ? `
            <button type="button" data-id="${t.id}" class="btn-delete-teacher px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs transition cursor-pointer" title="Hapus Guru">
              🗑️
            </button>
          ` : `
            <span class="text-[10px] text-slate-400 italic">Akun Utama</span>
          `}
        </td>
      `;

      const pinValSpan = tr.querySelector('.teacher-pin-val');
      const btnToggleRowPin = tr.querySelector('.btn-toggle-row-pin');
      if (btnToggleRowPin && pinValSpan) {
        let visible = false;
        btnToggleRowPin.addEventListener('click', () => {
          visible = !visible;
          pinValSpan.innerText = visible ? t.pin : '••••••';
          pinValSpan.className = visible ? 'font-mono font-bold text-blue-700 teacher-pin-val' : 'font-mono font-bold text-slate-700 teacher-pin-val';
          btnToggleRowPin.innerText = visible ? '🔒' : '👁️';
        });
      }

      tr.querySelector('.btn-edit-teacher').addEventListener('click', () => openEditTeacherModal(t));

      const btnDelete = tr.querySelector('.btn-delete-teacher');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          if (confirm(`Yakin ingin menghapus guru "${t.name}" (${t.subject})?`)) {
            const delRes = window.cbtAdmin.deleteTeacher(t.id);
            if (delRes.success) {
              alert(delRes.message);
              renderAdminTeachersList(document.getElementById('searchTeacherInput')?.value || '');
              setupSubjectAndClassFilters();
            } else {
              alert(delRes.message);
            }
          }
        });
      }

      tbody.appendChild(tr);
    });
  }

  const searchTeacherInput = document.getElementById('searchTeacherInput');
  if (searchTeacherInput) {
    searchTeacherInput.addEventListener('input', (e) => renderAdminTeachersList(e.target.value.trim()));
  }

  const modalEditTeacher = document.getElementById('modalEditTeacher');
  const formEditTeacher = document.getElementById('formEditTeacher');
  const btnCloseEditTeacher = document.getElementById('btnCloseEditTeacher');
  const btnCancelEditTeacher = document.getElementById('btnCancelEditTeacher');
  const btnOpenAddTeacher = document.getElementById('btnOpenAddTeacher');

  if (btnOpenAddTeacher) btnOpenAddTeacher.addEventListener('click', openAddTeacherModal);

  function openAddTeacherModal() {
    if (!modalEditTeacher) return;
    document.getElementById('modalEditTeacherTitle').innerText = "Tambah Guru Baru";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Masukkan data guru pengampu mata pelajaran & password login";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Guru Baru";

    document.getElementById('editTeacherId').value = "";
    document.getElementById('editTeacherName').value = "";
    document.getElementById('editTeacherNip').value = "";
    document.getElementById('editTeacherSubject').value = "";
    document.getElementById('editTeacherClasses').value = "";
    document.getElementById('editTeacherPin').value = "guru123";

    modalEditTeacher.classList.remove('hidden');
    document.getElementById('editTeacherName').focus();
  }

  function openEditTeacherModal(teacher) {
    if (!modalEditTeacher) return;
    document.getElementById('modalEditTeacherTitle').innerText = "Edit Data & Password Guru";
    document.getElementById('modalEditTeacherSubtitle').innerText = "Perbarui identitas, mapel, kelas diampu, atau password/PIN akun guru";
    document.getElementById('btnSubmitEditTeacher').innerText = "Simpan Perubahan";

    document.getElementById('editTeacherId').value = teacher.id;
    document.getElementById('editTeacherName').value = teacher.name;
    document.getElementById('editTeacherNip').value = teacher.nip;
    document.getElementById('editTeacherSubject').value = teacher.subject;
    document.getElementById('editTeacherClasses').value = teacher.classes || "";
    document.getElementById('editTeacherPin').value = teacher.pin;

    modalEditTeacher.classList.remove('hidden');
  }

  function closeEditTeacherModal() {
    if (modalEditTeacher) modalEditTeacher.classList.add('hidden');
  }

  if (btnCloseEditTeacher) btnCloseEditTeacher.addEventListener('click', closeEditTeacherModal);
  if (btnCancelEditTeacher) btnCancelEditTeacher.addEventListener('click', closeEditTeacherModal);

  if (formEditTeacher) {
    formEditTeacher.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('editTeacherId').value;
      const name = document.getElementById('editTeacherName').value.trim();
      const nip = document.getElementById('editTeacherNip').value.trim();
      const subject = document.getElementById('editTeacherSubject').value.trim();
      const classes = document.getElementById('editTeacherClasses').value.trim().toUpperCase();
      const pin = document.getElementById('editTeacherPin').value.trim();

      if (!name || !nip || !subject || !pin) {
        alert("Semua kolom wajib harus diisi!");
        return;
      }

      if (!id) {
        const res = window.cbtAdmin.addTeacher({ name, nip, subject, classes, pin });
        if (res.success) {
          alert(`Sukses! Guru "${name}" berhasil ditambahkan ke pangkalan data.`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
        } else {
          alert(`Gagal menambah guru: ${res.message}`);
        }
      } else {
        const res = window.cbtAdmin.updateTeacherProfile(id, { name, nip, subject, classes, pin });
        if (res.success) {
          alert(`Data guru "${name}" berhasil diperbarui!`);
          closeEditTeacherModal();
          renderAdminTeachersList();
          setupSubjectAndClassFilters();
          const cur = window.cbtAdmin.getCurrentTeacher();
          if (cur && cur.id === id) renderAdminDashboard();
        } else {
          alert(`Gagal edit guru: ${res.message}`);
        }
      }
    });
  }

  const btnResetAllTeacherPasswords = document.getElementById('btnResetAllTeacherPasswords');
  if (btnResetAllTeacherPasswords) {
    btnResetAllTeacherPasswords.addEventListener('click', () => {
      if (confirm("Yakin ingin mereset password/PIN SELURUH guru ke default 'guru123'?")) {
        const res = window.cbtAdmin.resetAllTeacherPasswords("guru123");
        alert(`Sukses! Password ${res.count} guru telah direset ke 'guru123'.`);
        renderAdminTeachersList();
      }
    });
  }

  // ===================== TAB 5: PENGATURAN JADWAL, TITI MANGSA & LOGO, DAN CLOUD =====================
  function renderAdminConfigForm() {
    const config = window.examEngine.config;
    document.getElementById('cfgExamTitle').value = config.examTitle || '';
    document.getElementById('cfgSubject').value = config.subject || '';
    document.getElementById('cfgDurationMinutes').value = config.durationMinutes || 80;
    document.getElementById('cfgExamToken').value = config.examToken || 'CBT80M';
    document.getElementById('cfgMaxCheats').value = config.maxCheatViolations || 3;

    const currentTeacher = window.cbtAdmin.getCurrentTeacher();
    document.getElementById('cfgAdminPin').value = currentTeacher ? currentTeacher.pin : 'admin123';
  }

  const formExamConfig = document.getElementById('formExamConfig');
  if (formExamConfig) {
    formExamConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const updated = {
        examTitle: document.getElementById('cfgExamTitle').value.trim(),
        subject: document.getElementById('cfgSubject').value.trim(),
        durationMinutes: parseInt(document.getElementById('cfgDurationMinutes').value) || 80,
        examToken: document.getElementById('cfgExamToken').value.trim().toUpperCase(),
        showScoreToStudent: false,
        maxCheatViolations: parseInt(document.getElementById('cfgMaxCheats').value) || 3
      };

      const currentTeacher = window.cbtAdmin.getCurrentTeacher();
      const newPin = document.getElementById('cfgAdminPin').value.trim();
      if (currentTeacher && newPin) {
        window.cbtAdmin.updateTeacherPin(currentTeacher.id, newPin);
      }

      window.cbtAdmin.updateConfig(updated);
      alert("Pengaturan ujian berhasil disimpan!");
      renderConfigInfoOnLogin();
    });
  }

  const btnGenerateToken = document.getElementById('btnGenerateToken');
  if (btnGenerateToken) {
    btnGenerateToken.addEventListener('click', () => {
      document.getElementById('cfgExamToken').value = window.cbtAdmin.generateRandomToken();
    });
  }

  function renderSchoolConfigForm() {
    if (!window.cbtAdmin) return;
    const cfg = window.cbtAdmin.getSchoolConfig();
    const subEl = document.getElementById('cfgSchoolSubtitle');
    const nameEl = document.getElementById('cfgSchoolName');
    const addrEl = document.getElementById('cfgSchoolAddress');
    const cityEl = document.getElementById('cfgSchoolCity');
    const dateEl = document.getElementById('cfgSchoolDate');
    const hmNameEl = document.getElementById('cfgHeadmasterName');
    const hmNipEl = document.getElementById('cfgHeadmasterNip');

    if (subEl) subEl.value = cfg.schoolSubtitle || '';
    if (nameEl) nameEl.value = cfg.schoolName || 'SMP NEGERI 2 PACET';
    if (addrEl) addrEl.value = cfg.schoolAddress || '';
    if (cityEl) cityEl.value = cfg.city || 'Pacet';
    if (dateEl) dateEl.value = cfg.date || '';
    if (hmNameEl) hmNameEl.value = cfg.headmasterName || '';
    if (hmNipEl) hmNipEl.value = cfg.headmasterNip || '';

    currentLogoLeftBase64 = cfg.logoLeft || '';
    currentLogoRightBase64 = cfg.logoRight || '';
    currentLogoCbtBase64 = cfg.logoCbt || '';
    renderLogoPreview('left', currentLogoLeftBase64);
    renderLogoPreview('right', currentLogoRightBase64);
    renderLogoPreview('cbt', currentLogoCbtBase64);
  }

  const formSchoolConfig = document.getElementById('formSchoolConfig');
  if (formSchoolConfig) {
    formSchoolConfig.addEventListener('submit', (e) => {
      e.preventDefault();
      const payload = {
        schoolSubtitle: document.getElementById('cfgSchoolSubtitle').value.trim(),
        schoolName: document.getElementById('cfgSchoolName').value.trim(),
        schoolAddress: document.getElementById('cfgSchoolAddress').value.trim(),
        city: document.getElementById('cfgSchoolCity').value.trim(),
        date: document.getElementById('cfgSchoolDate').value.trim(),
        headmasterName: document.getElementById('cfgHeadmasterName').value.trim(),
        headmasterNip: document.getElementById('cfgHeadmasterNip').value.trim(),
        logoLeft: currentLogoLeftBase64,
        logoRight: currentLogoRightBase64,
        logoCbt: currentLogoCbtBase64
      };
      const res = window.cbtAdmin.saveSchoolConfig(payload);
      if (res.success) {
        renderConfigInfoOnLogin();
        alert("Identitas Sekolah, Logo Kop Surat, Logo CBT & Titi Mangsa Kepala Sekolah berhasil disimpan!");
      } else {
        alert("Gagal menyimpan konfigurasi sekolah: " + res.message);
      }
    });
  }

  function renderSupabaseConfigForm() {
    if (!window.supabaseSync) return;
    const cfg = window.supabaseSync.getConfig();
    const urlEl = document.getElementById('cfgSupabaseUrl');
    const keyEl = document.getElementById('cfgSupabaseKey');
    if (urlEl) urlEl.value = cfg.supabaseUrl || '';
    if (keyEl) keyEl.value = cfg.supabaseKey || '';
    updateCloudBadge();
  }

  function updateCloudBadge() {
    const badge = document.getElementById('cloudStatusBadge');
    const dot = document.getElementById('cloudStatusDot');
    const text = document.getElementById('cloudStatusText');
    if (!badge || !window.supabaseSync) return;

    if (window.supabaseSync.isCloudConfigured()) {
      badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
      if (text) text.innerText = "Cloud Online";
    } else {
      badge.className = "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200";
      if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-400";
      if (text) text.innerText = "Mode Lokal";
    }
  }

  const formSupabaseConfig = document.getElementById('formSupabaseConfig');
  if (formSupabaseConfig) {
    formSupabaseConfig.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('cfgSupabaseUrl').value.trim();
      const key = document.getElementById('cfgSupabaseKey').value.trim();
      window.supabaseSync.saveConfig(url, key);
      updateCloudBadge();
      const res = await window.supabaseSync.pushAllSchoolState();
      if (res.success) {
        alert("Konfigurasi Cloud disimpan & seluruh data sekolah (Token, Jadwal, Kop/Logo, Soal, Siswa, Guru) berhasil disinkronkan ke Cloud!");
      } else {
        alert("Konfigurasi Cloud Supabase berhasil disimpan! (Pastikan koneksi internet aktif untuk mengirim data ke Cloud).");
      }
    });
  }

  const btnPullFromCloud = document.getElementById('btnPullFromCloud');
  if (btnPullFromCloud) {
    btnPullFromCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif.");
        return;
      }
      btnPullFromCloud.disabled = true;
      btnPullFromCloud.innerText = "Mengambil dari Cloud...";
      const pulled = await syncFromCloud(true);
      btnPullFromCloud.disabled = false;
      btnPullFromCloud.innerText = "⬇️ Ambil Data dari Cloud";
      if (pulled) {
        alert("Sukses! Data terbaru (Pengaturan/Token, Kop/Logo, Jadwal, Soal, Siswa, Guru) berhasil diambil dari Cloud ke perangkat ini.");
      } else {
        alert("Belum ada data tersimpan di Cloud atau koneksi gagal. Silakan klik '☁️ Kirim Semua Data ke Cloud' dari laptop utama Anda terlebih dahulu.");
      }
    });
  }

  const btnPushAllToCloud = document.getElementById('btnPushAllToCloud');
  if (btnPushAllToCloud) {
    btnPushAllToCloud.addEventListener('click', async () => {
      if (!window.supabaseSync || !window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum aktif. Simpan URL dan Anon Key terlebih dahulu.");
        return;
      }
      btnPushAllToCloud.disabled = true;
      btnPushAllToCloud.innerText = "Mengirim ke Cloud...";
      const res = await window.supabaseSync.pushAllSchoolState();
      btnPushAllToCloud.disabled = false;
      btnPushAllToCloud.innerText = "☁️ Kirim Semua Data ke Cloud";
      if (res.success) {
        alert(`Sukses! ${res.count} kelompok data (Pengaturan/Token, Identitas/Logo, Jadwal, Bank Soal, Siswa, Guru) telah dikirim ke Cloud dan langsung terbaca di semua HP & Laptop.`);
      } else {
        alert("Gagal mengirim data ke Cloud: " + (res.message || "Periksa koneksi internet Anda."));
      }
    });
  }

  const btnTestSupabase = document.getElementById('btnTestSupabase');
  if (btnTestSupabase) {
    btnTestSupabase.addEventListener('click', async () => {
      const url = document.getElementById('cfgSupabaseUrl').value.trim();
      const key = document.getElementById('cfgSupabaseKey').value.trim();
      btnTestSupabase.disabled = true;
      btnTestSupabase.innerText = "Menguji koneksi...";
      const res = await window.supabaseSync.testConnection(url, key);
      btnTestSupabase.disabled = false;
      btnTestSupabase.innerText = "⚡ Uji Koneksi Cloud";
      alert(res.message);
      updateCloudBadge();
    });
  }

  const btnSyncCloudResults = document.getElementById('btnSyncCloudResults');
  if (btnSyncCloudResults) {
    btnSyncCloudResults.addEventListener('click', async () => {
      if (!window.supabaseSync.isCloudConfigured()) {
        alert("Supabase Cloud belum dikonfigurasi. Masukkan Project URL dan Anon Key di tab 'Pengaturan, Kop & Cloud'.");
        return;
      }
      btnSyncCloudResults.disabled = true;
      btnSyncCloudResults.innerText = "Menyinkronkan...";
      const res = await window.supabaseSync.fetchCloudResults();
      btnSyncCloudResults.disabled = false;
      btnSyncCloudResults.innerText = "🔄 Sinkron Cloud";
      if (res.success) {
        alert(`Sinkronisasi sukses! Mengambil ${res.count} data hasil ujian dari cloud.`);
        renderAdminAnalyticsAndResults();
      } else {
        alert(`Gagal sinkron cloud: ${res.message}`);
      }
    });
  }

  // Backup & Pulihkan Seluruh Data Sekolah (1 Klik)
  const btnExportFullBackup = document.getElementById('btnExportFullBackup');
  if (btnExportFullBackup) {
    btnExportFullBackup.addEventListener('click', () => {
      const res = window.cbtAdmin.exportAllAppData();
      if (!res.success) alert(res.message);
    });
  }

  const btnTriggerImportFullBackup = document.getElementById('btnTriggerImportFullBackup');
  const fileImportFullBackup = document.getElementById('fileImportFullBackup');
  if (btnTriggerImportFullBackup && fileImportFullBackup) {
    btnTriggerImportFullBackup.addEventListener('click', () => fileImportFullBackup.click());
    fileImportFullBackup.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const res = window.cbtAdmin.importAllAppData(evt.target.result);
        if (res.success) {
          alert(`Pemulihan Sukses!\n• Guru: ${res.teachersCount}\n• Siswa: ${res.studentsCount}\n• Jadwal: ${res.schedulesCount}\n• Soal: ${res.questionsCount}`);
          renderAdminDashboard();
          renderConfigInfoOnLogin();
          updateCloudBadge();
        } else {
          alert(res.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  init();
});
