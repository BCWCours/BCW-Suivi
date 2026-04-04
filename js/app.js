// =============================================
// BCW SUIVI — Application Logic (v2)
// =============================================

const App = (() => {
  let profile = null;
  let currentStudentId = null;
  let currentStudentName = null;
  let editingReportId = null;
  let allReports = [];        // cache pour filtres
  let allStudents = [];       // cache liste élèves prof
  let allReportsFull = [];    // cache vue globale
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth();
  let calendarEvents = {};    // { 'YYYY-MM-DD': [...] }
  let currentChatRecipient = null;
  let currentChatStudentId = null;
  let realtimeChannel = null;
  let seenReports = new Set();
  let currentDetailReport = null;
  let currentFeedStudentId = null;

  function getRole() {
    return String(profile?.role || '').trim().toLowerCase();
  }

  function isProfLike() {
    const role = getRole();
    return role === 'prof' || role === 'admin';
  }

  const views = {
    profDashboard: document.getElementById('view-prof-dashboard'),
    reportEditor:  document.getElementById('view-report-editor'),
    feed:          document.getElementById('view-feed'),
    reportDetail:  document.getElementById('view-report-detail'),
    allReports:    document.getElementById('view-all-reports'),
    calendar:      document.getElementById('view-calendar'),
    sessions:      document.getElementById('view-sessions'),
    groups:        document.getElementById('view-groups'),
    messages:      document.getElementById('view-messages'),
  };

  // ─────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────
  function init(userProfile) {
    profile = userProfile;
    loadSeenReports();
    setupNav();
    setupEventListeners();
    setupModals();

    const role = getRole();

    if (isProfLike()) {
      showView('profDashboard');
      loadProfDashboard();
    } else if (role === 'eleve') {
      showView('feed');
      loadStudentFeed();
    } else if (role === 'parent') {
      showView('feed');
      loadParentFeed();
    } else {
      // Fallback to avoid blank screen when role is unexpected.
      showView('profDashboard');
      loadProfDashboard();
    }
    loadUnreadCount();
  }

  // ─────────────────────────────────────────
  //  SEEN REPORTS (localStorage — feature C)
  // ─────────────────────────────────────────
  function loadSeenReports() {
    try {
      const raw = localStorage.getItem('bcw_seen_' + profile.id);
      seenReports = new Set(raw ? JSON.parse(raw) : []);
    } catch { seenReports = new Set(); }
  }
  function markReportSeen(id) {
    seenReports.add(id);
    try {
      localStorage.setItem('bcw_seen_' + profile.id, JSON.stringify([...seenReports]));
    } catch {}
  }
  function isNew(report) {
    if (isProfLike()) return false;
    return !seenReports.has(report.id);
  }

  // ─────────────────────────────────────────
  //  NAV TABS (feature nav)
  // ─────────────────────────────────────────
  function setupNav() {
    const nav = document.getElementById('app-nav');
    nav.hidden = false;
    nav.querySelectorAll('.nav-tab').forEach(tab => {
      const roles = tab.dataset.roles?.split(' ') || [];
      const role = getRole();
      const canSeeTab = roles.includes(role) || (role === 'admin' && roles.includes('prof'));
      if (canSeeTab) {
        tab.hidden = false;
        tab.addEventListener('click', () => {
          const v = tab.dataset.view;
          showView(v);
          if (v === 'profDashboard') loadProfDashboard();
          else if (v === 'allReports') loadAllReports();
          else if (v === 'calendar') renderCalendar();
          else if (v === 'sessions') loadSessionsView();
          else if (v === 'groups') loadGroupsView();
          else if (v === 'feed') {
            if (role === 'eleve') loadStudentFeed();
            else if (role === 'parent') loadParentFeed();
          }
          else if (v === 'messages') loadMessages();
        });
      }
    });
    // Messages icon topbar
    const msgIcon = document.getElementById('btn-messages-icon');
    msgIcon.hidden = false;
    msgIcon.addEventListener('click', () => { showView('messages'); loadMessages(); });
  }

  // ─────────────────────────────────────────
  //  VIEW SWITCHER
  // ─────────────────────────────────────────
  function showView(name) {
    Object.values(views).forEach(v => { if (v) { v.hidden = true; v.classList.remove('active'); } });
    if (views[name]) {
      views[name].hidden = false;
      views[name].classList.add('active');
    }
    // Highlight nav tab
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === name);
    });
    window.scrollTo(0, 0);
  }

  // ─────────────────────────────────────────
  //  EVENT LISTENERS
  // ─────────────────────────────────────────
  function setupEventListeners() {
    // Back buttons
    document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
      showView('profDashboard');
    });
    document.getElementById('btn-back-feed')?.addEventListener('click', () => {
      if (isProfLike()) showView('profDashboard');
      else showView('feed');
    });
    document.getElementById('btn-back-conversations')?.addEventListener('click', () => {
      document.getElementById('chat-panel').hidden = true;
      document.getElementById('conversations-list').style.display = '';
    });

    // Score buttons
    document.querySelectorAll('.score-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('report-score').value = btn.dataset.score;
      });
    });

    // Report form
    document.getElementById('report-form')?.addEventListener('submit', e => {
      e.preventDefault();
      publishReport();
    });
    document.getElementById('btn-save-draft')?.addEventListener('click', saveDraft);

    // Child selector (parents)
    document.getElementById('child-select')?.addEventListener('change', e => {
      currentFeedStudentId = e.target.value;
      const name = e.target.options[e.target.selectedIndex].text;
      document.getElementById('feed-subtitle').textContent = name;
      loadReportsForStudent(e.target.value);
    });

    // Prof dashboard buttons
    document.getElementById('btn-add-student')?.addEventListener('click', () => openModal('modal-add-student'));
    document.getElementById('btn-schedule-session')?.addEventListener('click', () => {
      openScheduleModal('', '');
    });
    document.getElementById('btn-schedule-session-2')?.addEventListener('click', () => {
      openScheduleModal('', '');
    });

    // Calendar nav
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      calendarMonth--;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
      renderCalendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      calendarMonth++;
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
      renderCalendar();
    });

    // Filters — all-reports
    document.getElementById('all-filter-student')?.addEventListener('change', applyAllReportsFilters);
    document.getElementById('all-filter-subject')?.addEventListener('input',  applyAllReportsFilters);
    document.getElementById('all-filter-month')?.addEventListener('change',   applyAllReportsFilters);

    // Filters — feed
    document.getElementById('filter-subject')?.addEventListener('input',  applyFeedFilters);
    document.getElementById('filter-month')?.addEventListener('change',   applyFeedFilters);

    // Comments
    document.getElementById('comment-form')?.addEventListener('submit', e => {
      e.preventDefault();
      submitComment();
    });

    // Chat form
    document.getElementById('chat-form')?.addEventListener('submit', e => {
      e.preventDefault();
      sendMessage();
    });

    // Groups
    document.getElementById('group-create-form')?.addEventListener('submit', e => {
      e.preventDefault();
      submitCreateGroup();
    });
  }

  // ─────────────────────────────────────────
  //  MODALS
  // ─────────────────────────────────────────
  function setupModals() {
    const overlay = document.getElementById('modal-overlay');
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeAllModals();
    });
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });
    document.getElementById('add-student-form')?.addEventListener('submit', e => {
      e.preventDefault();
      submitAddStudent();
    });
    document.getElementById('schedule-form')?.addEventListener('submit', e => {
      e.preventDefault();
      submitScheduleSession();
    });
  }
  function openModal(id) {
    document.getElementById('modal-overlay').hidden = false;
    document.getElementById(id).hidden = false;
  }
  function closeAllModals() {
    document.getElementById('modal-overlay').hidden = true;
    document.querySelectorAll('.modal').forEach(m => m.hidden = true);
  }

  // ─────────────────────────────────────────
  //  PROF DASHBOARD (feature E — stats)
  // ─────────────────────────────────────────
  async function ensureTeacherStudentsLoaded() {
    if (allStudents.length) return allStudents;
    const { data, error } = await supabase
      .from('teacher_students')
      .select('students(id, full_name, level)')
      .eq('teacher_id', profile.id);
    if (error) return [];
    allStudents = (data || []).map((row) => row.students).filter(Boolean);
    return allStudents;
  }

  async function loadProfDashboard() {
    const myContainer = document.getElementById('prof-students-list');
    const allContainer = document.getElementById('prof-all-students-list');
    const allMeta = document.getElementById('prof-all-students-meta');
    const claimFeedback = document.getElementById('prof-claim-feedback');

    myContainer.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    allContainer.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    allMeta.textContent = '';
    claimFeedback.hidden = true;
    claimFeedback.textContent = '';
    claimFeedback.classList.remove('is-success', 'is-error');

    const [
      linksRes,
      monthReportsRes,
      monthScheduledRes,
      studentsRes,
      allLinksRes,
    ] = await Promise.all([
      supabase
        .from('teacher_students')
        .select('student_id, subjects, students(id, full_name, level)')
        .eq('teacher_id', profile.id),
      supabase
        .from('session_reports')
        .select('score, student_id, published_at')
        .eq('teacher_id', profile.id)
        .not('published_at', 'is', null)
        .gte('session_date', firstDayOfMonth()),
      supabase
        .from('scheduled_sessions')
        .select('id, student_id, scheduled_at')
        .eq('teacher_id', profile.id)
        .gte('scheduled_at', monthStartIso())
        .lt('scheduled_at', nextMonthStartIso()),
      supabase
        .from('students')
        .select('id, full_name, level')
        .order('full_name', { ascending: true }),
      supabase
        .from('teacher_students')
        .select('student_id, teacher_id, profiles:teacher_id(full_name)')
    ]);

    const links = linksRes.data || [];
    const monthReports = monthReportsRes.data || [];
    const monthScheduled = monthScheduledRes.data || [];
    const students = studentsRes.data || [];
    const allLinks = allLinksRes.data || [];

    if (linksRes.error) {
      console.error('[BCW] loadProfDashboard.linksRes', linksRes.error);
      myContainer.innerHTML = `<p class="form-error">Erreur chargement élèves: ${escapeHtml(linksRes.error.message || linksRes.error.code || 'inconnue')}</p>`;
      document.getElementById('prof-stats').hidden = true;
    } else if (!links.length) {
      myContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👩‍🎓</div>
          <p>Aucun élève assigné.</p>
          <p class="empty-sub">Prends un élève dans la section "Tous les élèves".</p>
        </div>`;
      document.getElementById('prof-stats').hidden = true;
      allStudents = [];
    } else {
      allStudents = links.map(l => l.students).filter(Boolean);

      const statsEl = document.getElementById('prof-stats');
      statsEl.hidden = false;
      document.getElementById('stat-students').textContent = links.length;
      document.getElementById('stat-sessions').textContent = monthScheduled.length || 0;
      const scores = monthReports.filter(r => r.score).map(r => r.score);
      document.getElementById('stat-avg').textContent =
        scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) + '/5' : '—';

      myContainer.innerHTML = links.map(link => {
        const s = link.students;
        if (!s) return '';
        const monthCount = monthReports.filter(r => r.student_id === s.id).length;
        return `
          <div class="student-card" data-student-id="${s.id}" data-student-name="${escapeHtml(s.full_name)}">
            <div class="student-card-info">
              <h3>${escapeHtml(s.full_name)}</h3>
              <span>${s.level === 'secondaire' ? 'Secondaire' : 'Supérieur'}${link.subjects ? ' · ' + escapeHtml(link.subjects) : ''}</span>
              ${monthCount > 0 ? `<span class="badge-month">${monthCount} séance${monthCount > 1 ? 's' : ''} ce mois</span>` : ''}
            </div>
            <div class="student-card-actions">
              <button class="btn btn-sm btn-outline" data-action="schedule" data-student-id="${s.id}" data-student-name="${escapeHtml(s.full_name)}" title="Planifier">📅</button>
              <button class="btn btn-sm btn-primary" data-action="write" data-student-id="${s.id}" data-student-name="${escapeHtml(s.full_name)}" data-subjects="${escapeHtml(link.subjects || '')}">Rédiger</button>
            </div>
          </div>`;
      }).join('');

      myContainer.querySelectorAll('.student-card').forEach(card => {
        card.addEventListener('click', e => {
          if (e.target.closest('[data-action]')) return;
          showStudentReports(card.dataset.studentId, card.dataset.studentName);
        });
      });
      myContainer.querySelectorAll('[data-action="write"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          openReportEditor(btn.dataset.studentId, btn.dataset.studentName, btn.dataset.subjects);
        });
      });
      myContainer.querySelectorAll('[data-action="schedule"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          openScheduleModal(btn.dataset.studentId, btn.dataset.studentName);
        });
      });
    }

    if (studentsRes.error || allLinksRes.error) {
      console.error('[BCW] loadProfDashboard.studentsRes', studentsRes.error);
      console.error('[BCW] loadProfDashboard.allLinksRes', allLinksRes.error);
      const details = [studentsRes.error?.message, allLinksRes.error?.message]
        .filter(Boolean)
        .join(' | ');
      allContainer.innerHTML = `<p class="form-error">Impossible de charger la liste globale des élèves${details ? `: ${escapeHtml(details)}` : ''}.</p>`;
      allMeta.textContent = '';
      return;
    }

    const linksByStudent = new Map();
    for (const link of allLinks) {
      if (!link?.student_id) continue;
      if (!linksByStudent.has(link.student_id)) linksByStudent.set(link.student_id, []);
      linksByStudent.get(link.student_id).push({
        teacherId: link.teacher_id,
        teacherName: link.profiles?.full_name || 'Prof',
      });
    }

    const unassignedCount = students.filter(s => !linksByStudent.has(s.id)).length;
    allMeta.textContent = `${students.length} élèves au total · ${unassignedCount} non assigné(s)`;

    if (!students.length) {
      allContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <p>Aucun élève dans la base.</p>
        </div>`;
      return;
    }

    allContainer.innerHTML = students.map((student) => {
      const assigned = linksByStudent.get(student.id) || [];
      const mine = assigned.some(a => a.teacherId === profile.id);
      const teacherNames = [...new Set(assigned.map(a => a.teacherName).filter(Boolean))];
      const label = assigned.length ? 'Prendre aussi' : 'Prendre';

      return `
        <div class="student-card">
          <div class="student-card-info">
            <h3>${escapeHtml(student.full_name || 'Élève')}</h3>
            <span>${student.level === 'secondaire' ? 'Secondaire' : 'Supérieur'}</span>
            <span class="teacher-chip">${teacherNames.length ? 'Assigné: ' + escapeHtml(teacherNames.join(', ')) : 'Non assigné'}</span>
          </div>
          <div class="student-card-actions">
            ${mine
              ? '<span class="teacher-chip">Déjà à toi</span>'
              : `<button class="btn btn-sm btn-outline" data-action="claim" data-student-id="${student.id}" data-student-name="${escapeHtml(student.full_name || 'Élève')}">${label}</button>`}
          </div>
        </div>
      `;
    }).join('');

    allContainer.querySelectorAll('[data-action="claim"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await claimStudentForCurrentTeacher(btn.dataset.studentId, btn.dataset.studentName);
      });
    });
  }

  async function claimStudentForCurrentTeacher(studentId, studentName) {
    const feedback = document.getElementById('prof-claim-feedback');
    const cleanName = studentName || 'Élève';
    feedback.hidden = false;
    feedback.classList.remove('is-success', 'is-error');
    feedback.textContent = `Attribution de ${cleanName}...`;

    const { error } = await supabase
      .from('teacher_students')
      .insert({
        teacher_id: profile.id,
        student_id: studentId,
        subjects: null,
      });

    if (error) {
      feedback.classList.add('is-error');
      feedback.textContent = `Impossible d'attribuer ${cleanName}: ${error.message || 'réessaie.'}`;
      return;
    }

    feedback.classList.add('is-success');
    feedback.textContent = `${cleanName} est maintenant assigné à toi.`;
    await loadProfDashboard();
  }

  // ─────────────────────────────────────────
  //  PROF: Student reports feed
  // ─────────────────────────────────────────
  async function showStudentReports(studentId, studentName) {
    currentFeedStudentId = studentId;
    document.getElementById('feed-title').textContent = studentName;
    document.getElementById('feed-subtitle').textContent = '';
    document.getElementById('parent-child-selector').hidden = true;
    document.getElementById('feed-filters').hidden = false;
    showView('feed');

    const container = document.getElementById('reports-feed');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    document.getElementById('feed-empty').hidden = true;

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*')
      .eq('student_id', studentId)
      .eq('teacher_id', profile.id)
      .order('session_date', { ascending: false });

    allReports = reports || [];
    buildMonthFilter('filter-month', allReports);
    renderMonthlySummary(allReports, studentName);
    renderReportsFeed(allReports, error, true);

    document.getElementById('btn-back-feed').onclick = () => showView('profDashboard');
  }

  // ─────────────────────────────────────────
  //  PROF: All reports view (feature J)
  // ─────────────────────────────────────────
  async function loadAllReports() {
    const container = document.getElementById('all-reports-feed');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    document.getElementById('all-reports-empty').hidden = true;

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*, students(full_name)')
      .eq('teacher_id', profile.id)
      .order('session_date', { ascending: false });

    allReportsFull = reports || [];

    // Populate student filter
    const studentSel = document.getElementById('all-filter-student');
    const seen = new Set();
    studentSel.innerHTML = '<option value="">Tous les élèves</option>';
    (reports || []).forEach(r => {
      if (r.students && !seen.has(r.student_id)) {
        seen.add(r.student_id);
        const opt = document.createElement('option');
        opt.value = r.student_id;
        opt.textContent = r.students.full_name;
        studentSel.appendChild(opt);
      }
    });
    buildMonthFilter('all-filter-month', reports || []);
    renderAllReportsFeed(allReportsFull, error);
  }

  function applyAllReportsFilters() {
    const student = document.getElementById('all-filter-student').value;
    const subject = document.getElementById('all-filter-subject').value.toLowerCase();
    const month   = document.getElementById('all-filter-month').value;
    let filtered = allReportsFull;
    if (student) filtered = filtered.filter(r => r.student_id === student);
    if (subject) filtered = filtered.filter(r => r.subjects_covered?.toLowerCase().includes(subject));
    if (month)   filtered = filtered.filter(r => r.session_date?.startsWith(month));
    renderAllReportsFeed(filtered, null);
  }

  function renderAllReportsFeed(reports, error) {
    const container = document.getElementById('all-reports-feed');
    const empty     = document.getElementById('all-reports-empty');
    if (error || !reports || reports.length === 0) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    container.innerHTML = reports.map(r => {
      const isDraft = !r.published_at;
      const studentName = r.students?.full_name || '';
      return `
        <div class="report-card ${isDraft ? 'is-draft' : ''}" data-report-id="${r.id}">
          <div class="report-card-header">
            <span class="report-card-date">${formatDate(r.session_date)}${studentName ? ' · ' + studentName : ''}</span>
            ${r.score ? `<span class="report-card-score">${r.score}/5</span>` : ''}
          </div>
          <div class="report-card-subjects">${r.subjects_covered}</div>
          <div class="report-card-footer">
            <span class="report-card-badge ${isDraft ? 'badge-draft' : 'badge-published'}">${isDraft ? 'Brouillon' : 'Publié'}</span>
            <div class="report-card-btns">
              <button class="btn btn-sm btn-outline" data-action="edit" data-id="${r.id}">✏️</button>
              ${isDraft ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">🗑️</button>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
    attachReportCardListeners(container, allReportsFull, true);
  }

  // ─────────────────────────────────────────
  //  PROF: Open report editor (new or edit)
  // ─────────────────────────────────────────
  function openReportEditor(studentId, studentName, subjects, existingReport = null) {
    currentStudentId = studentId;
    currentStudentName = studentName;
    editingReportId = existingReport?.id || null;
    showView('reportEditor');

    document.getElementById('editor-title').textContent = existingReport ? 'Modifier le rapport' : 'Rédiger un rapport';
    document.getElementById('report-student-info').textContent = studentName;
    document.getElementById('report-edit-id').value = editingReportId || '';
    document.getElementById('report-date').value     = existingReport?.session_date || new Date().toISOString().split('T')[0];
    document.getElementById('report-subjects').value  = existingReport?.subjects_covered || subjects || '';
    document.getElementById('report-strengths').value = existingReport?.strengths || '';
    document.getElementById('report-improvements').value = existingReport?.improvements || '';
    document.getElementById('report-resources').value = existingReport?.resources_text || '';
    document.getElementById('report-score').value     = existingReport?.score || '';

    document.querySelectorAll('.score-btn').forEach(b => {
      b.classList.toggle('active', String(b.dataset.score) === String(existingReport?.score));
    });

    const publishBtn = document.getElementById('btn-publish');
    publishBtn.textContent = existingReport?.published_at ? 'Republier' : 'Publier';

    document.getElementById('report-status').hidden = true;
  }

  // ─────────────────────────────────────────
  //  PROF: Save / Publish report (G — edit)
  // ─────────────────────────────────────────
  async function saveDraft()    { await saveReport(false); }
  async function publishReport(){ await saveReport(true); }

  async function saveReport(publish) {
    const btn = publish
      ? document.getElementById('btn-publish')
      : document.getElementById('btn-save-draft');
    const statusEl = document.getElementById('report-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    statusEl.hidden = true;

    const reportData = {
      teacher_id: profile.id,
      student_id: currentStudentId,
      session_date:      document.getElementById('report-date').value,
      subjects_covered:  document.getElementById('report-subjects').value,
      strengths:         document.getElementById('report-strengths').value,
      improvements:      document.getElementById('report-improvements').value,
      resources_text:    document.getElementById('report-resources').value || null,
      score: document.getElementById('report-score').value
        ? parseInt(document.getElementById('report-score').value) : null,
    };
    if (publish) reportData.published_at = new Date().toISOString();

    let error;
    if (editingReportId) {
      // UPDATE (feature G)
      const res = await supabase
        .from('session_reports')
        .update(reportData)
        .eq('id', editingReportId)
        .eq('teacher_id', profile.id);
      error = res.error;
    } else {
      // INSERT
      const res = await supabase.from('session_reports').insert(reportData);
      error = res.error;
    }

    btn.disabled = false;
    btn.textContent = publish
      ? (editingReportId ? 'Republier' : 'Publier')
      : 'Brouillon';

    if (error) {
      statusEl.textContent = 'Erreur lors de la sauvegarde. Réessayez.';
      statusEl.className = 'form-status is-error';
      statusEl.hidden = false;
      return;
    }
    statusEl.textContent = publish ? 'Rapport publié !' : 'Brouillon sauvegardé.';
    statusEl.className = publish ? 'form-status is-success' : 'form-status';
    statusEl.hidden = false;
    if (publish) setTimeout(() => { editingReportId = null; showView('profDashboard'); }, 1200);
  }

  // ─────────────────────────────────────────
  //  PROF: Delete draft (feature H)
  // ─────────────────────────────────────────
  async function deleteReport(reportId, btnEl) {
    if (btnEl.dataset.confirm !== '1') {
      btnEl.textContent = '✓ Confirmer';
      btnEl.dataset.confirm = '1';
      btnEl.classList.add('btn-danger');
      setTimeout(() => { btnEl.textContent = '🗑️'; btnEl.dataset.confirm = '0'; btnEl.classList.remove('btn-danger'); }, 3000);
      return;
    }
    btnEl.disabled = true;
    btnEl.innerHTML = '<span class="spinner"></span>';
    const { error } = await supabase
      .from('session_reports')
      .delete()
      .eq('id', reportId)
      .eq('teacher_id', profile.id);
    if (!error) {
      const card = document.querySelector(`[data-report-id="${reportId}"]`);
      card?.remove();
      allReports     = allReports.filter(r => r.id !== reportId);
      allReportsFull = allReportsFull.filter(r => r.id !== reportId);
    } else {
      btnEl.disabled = false;
      btnEl.textContent = '🗑️';
    }
  }

  // ─────────────────────────────────────────
  //  FEED FILTERS (feature K)
  // ─────────────────────────────────────────
  function applyFeedFilters() {
    const subject = document.getElementById('filter-subject').value.toLowerCase();
    const month   = document.getElementById('filter-month').value;
    let filtered  = allReports;
    if (subject) filtered = filtered.filter(r => r.subjects_covered?.toLowerCase().includes(subject));
    if (month)   filtered = filtered.filter(r => r.session_date?.startsWith(month));
    renderReportsFeed(filtered, null, isProfLike());
  }

  function buildMonthFilter(selectId, reports) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const months = new Set();
    (reports || []).forEach(r => { if (r.session_date) months.add(r.session_date.slice(0, 7)); });
    sel.innerHTML = '<option value="">Tous les mois</option>';
    [...months].sort().reverse().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      const [y, mo] = m.split('-');
      opt.textContent = new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
      sel.appendChild(opt);
    });
  }

  // ─────────────────────────────────────────
  //  MONTHLY SUMMARY (feature F)
  // ─────────────────────────────────────────
  function renderMonthlySummary(reports, studentName) {
    const el = document.getElementById('monthly-summary');
    if (!reports || reports.length === 0) { el.hidden = true; return; }
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthReports = reports.filter(r => r.session_date?.startsWith(thisMonth) && r.published_at);
    if (monthReports.length === 0) { el.hidden = true; return; }
    const scores = monthReports.filter(r => r.score).map(r => r.score);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
    const monthName = new Date().toLocaleDateString('fr-BE', { month: 'long' });
    el.hidden = false;
    el.innerHTML = `
      <div class="summary-card">
        <strong>Ce mois (${monthName}) :</strong>
        ${monthReports.length} séance${monthReports.length > 1 ? 's' : ''}
        ${avg ? ` · moy. ${avg}/5` : ''}
      </div>`;
  }

  // ─────────────────────────────────────────
  //  ÉLÈVE: Feed
  // ─────────────────────────────────────────
  async function loadStudentFeed() {
    document.getElementById('feed-title').textContent = 'Mes rapports';
    document.getElementById('feed-subtitle').textContent = '';
    document.getElementById('parent-child-selector').hidden = true;
    document.getElementById('feed-filters').hidden = false;
    const container = document.getElementById('reports-feed');
    const empty     = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    const { data: student } = await supabase
      .from('students').select('id').eq('profile_id', profile.id).single();

    if (!student) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    currentFeedStudentId = student.id;

    // Prochaine séance
    loadNextSession(student.id);

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*, profiles!session_reports_teacher_id_fkey(full_name)')
      .eq('student_id', student.id)
      .not('published_at', 'is', null)
      .order('session_date', { ascending: false });

    allReports = reports || [];
    buildMonthFilter('filter-month', allReports);
    renderReportsFeed(allReports, error, false);
  }

  // ─────────────────────────────────────────
  //  PARENT: Feed
  // ─────────────────────────────────────────
  async function loadParentFeed() {
    document.getElementById('feed-title').textContent = 'Suivi de votre enfant';
    document.getElementById('parent-child-selector').hidden = true;
    document.getElementById('feed-filters').hidden = false;
    const container = document.getElementById('reports-feed');
    const empty     = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    const { data: links } = await supabase
      .from('parent_students')
      .select('student_id, students(id, full_name)')
      .eq('parent_id', profile.id);

    if (!links || links.length === 0) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }

    if (links.length > 1) {
      const selector = document.getElementById('parent-child-selector');
      const select   = document.getElementById('child-select');
      selector.hidden = false;
      select.innerHTML = links.map(l =>
        `<option value="${l.students.id}">${l.students.full_name}</option>`
      ).join('');
    }

    const first = links[0].students;
    currentFeedStudentId = first.id;
    document.getElementById('feed-subtitle').textContent = first.full_name;
    loadNextSession(first.id);
    loadReportsForStudent(first.id);
  }

  async function loadReportsForStudent(studentId) {
    const container = document.getElementById('reports-feed');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    document.getElementById('feed-empty').hidden = true;

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*, profiles!session_reports_teacher_id_fkey(full_name)')
      .eq('student_id', studentId)
      .not('published_at', 'is', null)
      .order('session_date', { ascending: false });

    allReports = reports || [];
    buildMonthFilter('filter-month', allReports);
    renderReportsFeed(allReports, error, false);
  }

  // ─────────────────────────────────────────
  //  NEXT SESSION (feature Q — view)
  // ─────────────────────────────────────────
  async function loadNextSession(studentId) {
    const { data } = await supabase
      .from('scheduled_sessions')
      .select('*')
      .eq('student_id', studentId)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const summaryEl = document.getElementById('monthly-summary');
    if (data) {
      const dt = new Date(data.scheduled_at);
      const when = dt.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
      const time = dt.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      summaryEl.hidden = false;
      summaryEl.innerHTML = `
        <div class="summary-card next-session">
          <span class="summary-icon">📅</span>
          <div>
            <strong>Prochaine séance</strong>
            <span>${when} à ${time}${data.subject ? ' · ' + data.subject : ''}</span>
          </div>
        </div>`;
    } else {
      summaryEl.hidden = true;
    }
  }

  // ─────────────────────────────────────────
  //  RENDER REPORTS FEED (feature C — badges)
  // ─────────────────────────────────────────
  function renderReportsFeed(reports, error, showDrafts) {
    const container = document.getElementById('reports-feed');
    const empty     = document.getElementById('feed-empty');

    if (error || !reports || reports.length === 0) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    container.innerHTML = reports.map(r => {
      const isDraft     = !r.published_at;
      if (isDraft && !showDrafts) return '';
      const teacherName = r.profiles?.full_name || '';
      const newBadge    = isNew(r) ? '<span class="badge-new">Nouveau</span>' : '';

      return `
        <div class="report-card ${isDraft ? 'is-draft' : ''} ${isNew(r) ? 'is-new' : ''}" data-report-id="${r.id}">
          <div class="report-card-header">
            <span class="report-card-date">${formatDate(r.session_date)}${teacherName ? ' · ' + teacherName : ''}</span>
            ${r.score ? `<span class="report-card-score">${r.score}/5</span>` : ''}
          </div>
          <div class="report-card-subjects">${r.subjects_covered}</div>
          <div class="report-card-footer">
            <span class="report-card-badge ${isDraft ? 'badge-draft' : 'badge-published'}">
              ${isDraft ? 'Brouillon' : 'Publié'}
            </span>${newBadge}
            ${showDrafts ? `
              <div class="report-card-btns">
                <button class="btn btn-sm btn-outline" data-action="edit" data-id="${r.id}">✏️</button>
                ${isDraft ? `<button class="btn btn-sm btn-outline" data-action="delete" data-id="${r.id}" data-confirm="0">🗑️</button>` : ''}
              </div>` : ''}
          </div>
        </div>`;
    }).join('');

    attachReportCardListeners(container, reports, showDrafts);
  }

  function attachReportCardListeners(container, reports, showDrafts) {
    container.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-action]')) return;
        const r = reports.find(x => x.id === card.dataset.reportId);
        if (r) { markReportSeen(r.id); openReportDetail(r); }
      });
    });
    if (!showDrafts) return;
    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const r = reports.find(x => x.id === btn.dataset.id);
        if (r) openReportEditor(r.student_id, currentStudentName || r.students?.full_name || '', '', r);
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteReport(btn.dataset.id, btn);
      });
    });
  }

  // ─────────────────────────────────────────
  //  REPORT DETAIL
  // ─────────────────────────────────────────
  function openReportDetail(report) {
    currentDetailReport = report;
    showView('reportDetail');
    const container  = document.getElementById('report-detail');
    const teacherName = report.profiles?.full_name || '';

    container.innerHTML = `
      <div class="report-detail-header">
        <h2>${report.subjects_covered}</h2>
        <p class="report-detail-meta">
          ${formatDate(report.session_date)}${teacherName ? ' · Prof. ' + teacherName : ''}
        </p>
        ${report.score ? `<div class="report-detail-score">Appréciation : ${report.score}/5</div>` : ''}
      </div>
      <div class="report-section strengths">
        <h3>Points forts</h3>
        <p>${report.strengths}</p>
      </div>
      <div class="report-section improvements">
        <h3>À travailler</h3>
        <p>${report.improvements}</p>
      </div>
      ${report.resources_text ? `
        <div class="report-section resources">
          <h3>Ressources</h3>
          <p>${linkify(report.resources_text)}</p>
        </div>` : ''}
    `;
    loadComments(report.id);
  }

  // ─────────────────────────────────────────
  //  COMMENTS (feature S)
  // ─────────────────────────────────────────
  async function loadComments(reportId) {
    const list = document.getElementById('comments-list');
    list.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    const { data, error } = await supabase
      .from('report_comments')
      .select('*, profiles(full_name, role)')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      list.innerHTML = '<p class="no-comments">Aucun commentaire pour le moment.</p>';
      return;
    }
    list.innerHTML = data.map(c => `
      <div class="comment-item">
        <div class="comment-meta">
          <strong>${c.profiles?.full_name || 'Inconnu'}</strong>
          <span class="comment-role">${roleLabel(c.profiles?.role)}</span>
          <span class="comment-date">${formatDate(c.created_at.split('T')[0])}</span>
        </div>
        <p class="comment-text">${escapeHtml(c.content)}</p>
      </div>`).join('');
  }

  async function submitComment() {
    if (!currentDetailReport) return;
    const input   = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) return;
    const btn = document.querySelector('#comment-form button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const { error } = await supabase.from('report_comments').insert({
      report_id: currentDetailReport.id,
      author_id: profile.id,
      content,
    });

    btn.disabled = false;
    btn.textContent = 'Envoyer';
    if (!error) {
      input.value = '';
      loadComments(currentDetailReport.id);
    }
  }

  // ─────────────────────────────────────────
  //  ADD STUDENT (feature I)
  // ─────────────────────────────────────────
  async function submitAddStudent() {
    const btn     = document.getElementById('btn-add-student-submit');
    const errEl   = document.getElementById('add-student-error');
    const name    = document.getElementById('as-name').value.trim();
    const level   = document.querySelector('input[name="as-level"]:checked')?.value;
    const email   = document.getElementById('as-email').value.trim();

    if (!name || !level) {
      errEl.textContent = 'Nom et niveau requis.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const { error } = await supabase.rpc('add_student_by_prof', {
      p_name:  name,
      p_level: level,
      p_email: email || null,
    });

    btn.disabled = false;
    btn.textContent = 'Ajouter';
    if (error) {
      errEl.textContent = 'Erreur : ' + (error.message || 'Réessayez.');
      errEl.hidden = false;
      return;
    }
    closeAllModals();
    document.getElementById('add-student-form').reset();
    loadProfDashboard();
  }

  // ─────────────────────────────────────────
  //  SCHEDULE SESSION (feature Q)
  // ─────────────────────────────────────────
  function populateScheduleStudentSelect(preselectedId = '') {
    const select = document.getElementById('sched-student-select');
    if (!select) return;

    const sorted = [...allStudents].sort((a, b) => (a?.full_name || '').localeCompare(b?.full_name || '', 'fr'));
    select.innerHTML = '<option value="">Choisir un élève</option>' + sorted
      .map((s) => `<option value="${s.id}">${escapeHtml(s.full_name || 'Élève')}</option>`)
      .join('');

    if (preselectedId) {
      select.value = preselectedId;
    }
  }

  async function openScheduleModal(studentId, studentName) {
    await ensureTeacherStudentsLoaded();
    populateScheduleStudentSelect(studentId || '');
    document.getElementById('sched-student-id').value = studentId;
    document.getElementById('sched-student-name').textContent = studentId
      ? 'Élève : ' + studentName
      : 'Choisissez un élève puis la date/heure.';
    const errEl = document.getElementById('schedule-error');
    errEl.hidden = true;
    errEl.textContent = '';
    document.getElementById('schedule-form').reset();
    document.getElementById('sched-student-id').value = studentId;
    if (studentId) {
      const select = document.getElementById('sched-student-select');
      if (select) select.value = studentId;
    }
    openModal('modal-schedule');
  }

  async function submitScheduleSession() {
    const btn       = document.getElementById('btn-schedule-submit');
    const errEl     = document.getElementById('schedule-error');
    const selectedStudentId = document.getElementById('sched-student-select')?.value || '';
    const studentId = selectedStudentId || document.getElementById('sched-student-id').value;
    const date      = document.getElementById('sched-date').value;
    const time      = document.getElementById('sched-time').value;
    const subject   = document.getElementById('sched-subject').value.trim();
    const notes     = document.getElementById('sched-notes').value.trim();

    if (!studentId) {
      errEl.textContent = 'Choisissez un élève.';
      errEl.hidden = false;
      return;
    }

    if (!date || !time) {
      errEl.textContent = 'Date et heure requises.';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      const scheduled_at = new Date(date + 'T' + time).toISOString();
      const { error } = await supabase.from('scheduled_sessions').insert({
        teacher_id:   profile.id,
        student_id:   studentId,
        scheduled_at,
        subject:      subject || null,
        notes:        notes   || null,
      });

      btn.disabled = false;
      btn.textContent = 'Planifier';
      if (error) {
        errEl.textContent = 'Erreur : ' + (error.message || 'Réessayez.');
        errEl.hidden = false;
        return;
      }

      closeAllModals();
      showView('sessions');
      await Promise.all([
        loadSessionsView(),
        renderCalendar(),
        loadProfDashboard(),
      ]);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Planifier';
      errEl.textContent = 'Erreur : ' + (e?.message || 'réseau');
      errEl.hidden = false;
    }
  }

  // ─────────────────────────────────────────
  //  SESSIONS VIEW (prof)
  // ─────────────────────────────────────────
  async function loadSessionsView() {
    const listEl = document.getElementById('sessions-list');
    const emptyEl = document.getElementById('sessions-empty');
    const metaEl = document.getElementById('sessions-meta');
    const errEl = document.getElementById('sessions-error');

    listEl.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    emptyEl.hidden = true;
    errEl.hidden = true;
    errEl.textContent = '';
    metaEl.textContent = '';

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('scheduled_sessions')
      .select('id, scheduled_at, subject, notes, student_id, students(full_name)')
      .eq('teacher_id', profile.id)
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true });

    if (error) {
      listEl.innerHTML = '';
      errEl.hidden = false;
      errEl.textContent = `Erreur chargement séances: ${error.message || error.code || 'inconnue'}`;
      return;
    }

    const sessions = data || [];
    metaEl.textContent = `${sessions.length} séance${sessions.length > 1 ? 's' : ''} à venir`;

    if (!sessions.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    listEl.innerHTML = sessions.map((s) => {
      const dt = new Date(s.scheduled_at);
      const date = dt.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
      const time = dt.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      return `
        <article class="session-item">
          <div>
            <h3>${escapeHtml(s.subject || 'Séance')}</h3>
            <p class="session-meta">${escapeHtml((s.students && s.students.full_name) || 'Élève')} · ${date} · ${time}</p>
            ${s.notes ? `<p class="session-notes">${escapeHtml(s.notes)}</p>` : ''}
          </div>
          <div class="session-actions">
            <button class="btn btn-sm btn-outline" data-action="open-day" data-date="${s.scheduled_at.split('T')[0]}">Voir agenda</button>
          </div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('[data-action="open-day"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const date = btn.dataset.date || '';
        if (!date) return;
        const [y, m] = date.split('-').map((n) => Number(n));
        if (!y || !m) return;
        calendarYear = y;
        calendarMonth = m - 1;
        showView('calendar');
        await renderCalendar();
        showDayEvents(date);
      });
    });
  }

  // ─────────────────────────────────────────
  //  CALENDAR (feature R)
  // ─────────────────────────────────────────
  async function renderCalendar() {
    const label = document.getElementById('cal-month-label');
    const grid  = document.getElementById('calendar-grid');
    const errEl = document.getElementById('calendar-error');
    document.getElementById('calendar-day-events').hidden = true;
    errEl.hidden = true;
    errEl.textContent = '';

    const monthName = new Date(calendarYear, calendarMonth).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
    label.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Load events for this month
    const start = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
    const end   = new Date(calendarYear, calendarMonth + 1, 0).toISOString().split('T')[0];

    const [reportsRes, schedRes] = await Promise.all([
      supabase.from('session_reports')
        .select('session_date, subjects_covered, student_id, students(full_name)')
        .eq('teacher_id', profile.id)
        .gte('session_date', start)
        .lte('session_date', end),
      supabase.from('scheduled_sessions')
        .select('scheduled_at, subject, student_id, students(full_name)')
        .eq('teacher_id', profile.id)
        .gte('scheduled_at', monthStartIsoFor(calendarYear, calendarMonth))
        .lt('scheduled_at', nextMonthStartIsoFor(calendarYear, calendarMonth)),
    ]);

    if (reportsRes.error || schedRes.error) {
      grid.innerHTML = '';
      errEl.hidden = false;
      const details = [reportsRes.error?.message, schedRes.error?.message].filter(Boolean).join(' | ');
      errEl.textContent = `Impossible de charger l'agenda${details ? `: ${details}` : ''}.`;
      return;
    }

    calendarEvents = {};
    (reportsRes.data || []).forEach(r => {
      const key = r.session_date;
      if (!calendarEvents[key]) calendarEvents[key] = [];
      calendarEvents[key].push({ type: 'report', label: r.subjects_covered, student: r.students?.full_name });
    });
    (schedRes.data || []).forEach(s => {
      const key = s.scheduled_at.split('T')[0];
      if (!calendarEvents[key]) calendarEvents[key] = [];
      const time = new Date(s.scheduled_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      calendarEvents[key].push({ type: 'session', label: (s.subject || 'Séance') + ' ' + time, student: s.students?.full_name });
    });

    // Build grid
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday first
    const today = new Date().toISOString().split('T')[0];

    let html = '<div class="cal-weekdays">';
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(d => {
      html += `<div class="cal-wd">${d}</div>`;
    });
    html += '</div><div class="cal-days">';

    for (let i = 0; i < startOffset; i++) html += '<div class="cal-day cal-day-empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const events  = calendarEvents[dateStr] || [];
      const isToday = dateStr === today;
      html += `
        <div class="cal-day ${isToday ? 'cal-today' : ''} ${events.length ? 'cal-has-events' : ''}" data-date="${dateStr}">
          <span class="cal-day-num">${d}</span>
          <div class="cal-dots">
            ${events.map(e => `<span class="cal-dot cal-dot-${e.type}"></span>`).join('')}
          </div>
        </div>`;
    }
    html += '</div>';
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day[data-date]').forEach(dayEl => {
      dayEl.addEventListener('click', () => showDayEvents(dayEl.dataset.date));
    });
  }

  function showDayEvents(dateStr) {
    const events = calendarEvents[dateStr] || [];
    const panel  = document.getElementById('calendar-day-events');
    const title  = document.getElementById('cal-day-title');
    const list   = document.getElementById('cal-day-list');

    const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);

    if (events.length === 0) {
      list.innerHTML = '<p class="no-events">Aucun événement ce jour.</p>';
    } else {
      list.innerHTML = events.map(e => `
        <div class="cal-event cal-event-${e.type}">
          <span class="cal-event-icon">${e.type === 'report' ? '📄' : '📅'}</span>
          <div>
            <strong>${e.label}</strong>
            ${e.student ? `<span class="cal-event-student">${e.student}</span>` : ''}
          </div>
        </div>`).join('');
    }
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ─────────────────────────────────────────
  //  GROUPS VIEW (prof)
  // ─────────────────────────────────────────
  async function loadGroupsView() {
    const listEl = document.getElementById('groups-list');
    const emptyEl = document.getElementById('groups-empty');
    const errEl = document.getElementById('groups-error');

    listEl.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    emptyEl.hidden = true;
    errEl.hidden = true;
    errEl.textContent = '';

    await ensureTeacherStudentsLoaded();

    const { data, error } = await supabase
      .from('groups')
      .select('*, group_students(student_id, students(id, full_name))')
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = '';
      errEl.hidden = false;
      errEl.textContent = `Erreur chargement groupes: ${error.message || error.code || 'inconnue'}`;
      return;
    }

    const groups = data || [];
    if (!groups.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    listEl.innerHTML = groups.map((g) => {
      const members = (g.group_students || [])
        .map((gs) => gs.students)
        .filter(Boolean);
      const memberNames = members.map((m) => m.full_name).filter(Boolean);
      const memberIds = new Set(members.map((m) => m.id));
      const available = allStudents.filter((s) => !memberIds.has(s.id));

      return `
        <article class="group-card">
          <div class="group-card-head">
            <h3>${escapeHtml(g.name || 'Groupe')}</h3>
            <span class="teacher-chip">${escapeHtml((g.group_type || 'group') === 'one_to_one' ? '1v1' : 'Groupe')}</span>
          </div>
          <p class="group-meta">${escapeHtml((g.level || 'Niveau libre'))}${g.subject ? ` · ${escapeHtml(g.subject)}` : ''}</p>
          <p class="group-members">${memberNames.length ? `Élèves: ${escapeHtml(memberNames.join(', '))}` : 'Aucun élève dans ce groupe.'}</p>
          <div class="group-actions">
            <select data-group-student-select="${g.id}">
              <option value="">Ajouter un élève</option>
              ${available.map((s) => `<option value="${s.id}">${escapeHtml(s.full_name || 'Élève')}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline" data-action="add-group-student" data-group-id="${g.id}">Ajouter</button>
          </div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('[data-action="add-group-student"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const groupId = btn.dataset.groupId;
        const select = document.querySelector(`[data-group-student-select="${groupId}"]`);
        const studentId = select?.value || '';
        if (!groupId || !studentId) return;
        await addStudentToGroup(groupId, studentId);
      });
    });
  }

  async function submitCreateGroup() {
    const name = document.getElementById('group-name').value.trim();
    const type = document.getElementById('group-type').value;
    const level = document.getElementById('group-level').value;
    const subject = document.getElementById('group-subject').value.trim();
    const btn = document.getElementById('btn-group-create');
    const errEl = document.getElementById('group-create-error');

    if (!name) {
      errEl.hidden = false;
      errEl.textContent = 'Le nom du groupe est requis.';
      return;
    }

    errEl.hidden = true;
    errEl.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const payload = {
      name,
      group_type: type || 'group',
      level: level || null,
      subject: subject || null,
      teacher_id: profile.id,
      is_active: true,
    };

    let res = await supabase.from('groups').insert(payload);
    if (res.error && String(res.error.message || '').toLowerCase().includes('group_type')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.group_type;
      res = await supabase.from('groups').insert(fallbackPayload);
    }

    btn.disabled = false;
    btn.textContent = 'Créer le groupe';

    if (res.error) {
      errEl.hidden = false;
      errEl.textContent = `Erreur création groupe: ${res.error.message || 'Réessaie.'}`;
      return;
    }

    document.getElementById('group-create-form').reset();
    await loadGroupsView();
  }

  async function addStudentToGroup(groupId, studentId) {
    const errEl = document.getElementById('groups-error');
    errEl.hidden = true;
    errEl.textContent = '';

    const { error } = await supabase
      .from('group_students')
      .insert({ group_id: groupId, student_id: studentId });

    if (error) {
      errEl.hidden = false;
      errEl.textContent = `Erreur ajout élève: ${error.message || 'Réessaie.'}`;
      return;
    }

    await loadGroupsView();
  }

  // ─────────────────────────────────────────
  //  MESSAGES (feature T)
  // ─────────────────────────────────────────
  async function loadUnreadCount() {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profile.id)
      .is('read_at', null);

    const badge    = document.getElementById('msg-badge');
    const navBadge = document.getElementById('nav-msg-badge');
    if (count > 0) {
      badge.textContent    = count > 9 ? '9+' : count;
      navBadge.textContent = count > 9 ? '9+' : count;
      badge.hidden    = false;
      navBadge.hidden = false;
    } else {
      badge.hidden    = true;
      navBadge.hidden = true;
    }
  }

  async function loadMessages() {
    const convList = document.getElementById('conversations-list');
    convList.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    document.getElementById('chat-panel').hidden = true;
    convList.style.display = '';

    // Get all contacts based on role
    let contacts = [];
    if (isProfLike()) {
      // Parents of my students
      const { data: links } = await supabase
        .from('teacher_students')
        .select('student_id, students(id, full_name, parent_students(parent_id, profiles(id, full_name)))')
        .eq('teacher_id', profile.id);
      (links || []).forEach(l => {
        (l.students?.parent_students || []).forEach(ps => {
          if (ps.profiles) contacts.push({ id: ps.profiles.id, name: ps.profiles.full_name, studentId: l.student_id, studentName: l.students.full_name });
        });
      });
      // Also students themselves
      const { data: sLinks } = await supabase
        .from('teacher_students')
        .select('student_id, students(id, full_name, profile_id, profiles:profile_id(id, full_name))')
        .eq('teacher_id', profile.id);
      (sLinks || []).forEach(l => {
        if (l.students?.profiles) contacts.push({ id: l.students.profiles.id, name: l.students.profiles.full_name, studentId: l.student_id, studentName: l.students.full_name });
      });
    } else if (profile.role === 'eleve') {
      // My teacher(s)
      const { data: myStudent } = await supabase.from('students').select('id').eq('profile_id', profile.id).single();
      if (myStudent) {
        const { data: teachers } = await supabase
          .from('teacher_students')
          .select('teacher_id, profiles:teacher_id(id, full_name)')
          .eq('student_id', myStudent.id);
        (teachers || []).forEach(t => {
          if (t.profiles) contacts.push({ id: t.profiles.id, name: t.profiles.full_name, studentId: myStudent.id, studentName: profile.full_name });
        });
      }
    } else if (profile.role === 'parent') {
      // My children's teachers
      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id, students(id, full_name, teacher_students(teacher_id, profiles:teacher_id(id, full_name)))')
        .eq('parent_id', profile.id);
      (links || []).forEach(l => {
        (l.students?.teacher_students || []).forEach(ts => {
          if (ts.profiles) contacts.push({ id: ts.profiles.id, name: ts.profiles.full_name, studentId: l.student_id, studentName: l.students.full_name });
        });
      });
    }

    if (contacts.length === 0) {
      convList.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>Aucune conversation disponible.</p></div>';
      return;
    }

    // Load last message for each contact
    convList.innerHTML = contacts.map(c => `
      <div class="conversation-item" data-contact-id="${c.id}" data-contact-name="${c.name}" data-student-id="${c.studentId}" data-student-name="${c.studentName || ''}">
        <div class="conv-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="conv-info">
          <strong>${c.name}</strong>
          ${c.studentName ? `<span class="conv-student">re: ${c.studentName}</span>` : ''}
        </div>
      </div>`).join('');

    convList.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        openChat(item.dataset.contactId, item.dataset.contactName, item.dataset.studentId || null);
      });
    });
  }

  async function openChat(contactId, contactName, studentId) {
    currentChatRecipient  = contactId;
    currentChatStudentId  = studentId;
    document.getElementById('chat-with-name').textContent = contactName;
    document.getElementById('conversations-list').style.display = 'none';
    document.getElementById('chat-panel').hidden = false;

    await loadChatMessages();
    markMessagesRead(contactId);
    subscribeToMessages();
    document.getElementById('chat-input').focus();
  }

  async function loadChatMessages() {
    const chatEl = document.getElementById('chat-messages');
    chatEl.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${currentChatRecipient}),and(sender_id.eq.${currentChatRecipient},recipient_id.eq.${profile.id})`)
      .order('created_at', { ascending: true });

    if (error || !data) { chatEl.innerHTML = '<p class="no-messages">Aucun message.</p>'; return; }
    renderChatMessages(data);
  }

  function renderChatMessages(messages) {
    const chatEl = document.getElementById('chat-messages');
    if (!messages.length) { chatEl.innerHTML = '<p class="no-messages">Aucun message. Envoyez le premier !</p>'; return; }
    chatEl.innerHTML = messages.map(m => {
      const isMine = m.sender_id === profile.id;
      const time   = new Date(m.created_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-theirs'}">
          <div class="chat-bubble">${escapeHtml(m.content)}</div>
          <span class="chat-time">${time}</span>
        </div>`;
    }).join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function sendMessage() {
    const input   = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !currentChatRecipient) return;
    input.value = '';

    const { error } = await supabase.from('messages').insert({
      sender_id:    profile.id,
      recipient_id: currentChatRecipient,
      student_id:   currentChatStudentId || null,
      content,
    });
    if (!error) loadChatMessages();
  }

  async function markMessagesRead(senderId) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', senderId)
      .eq('recipient_id', profile.id)
      .is('read_at', null);
    loadUnreadCount();
  }

  function subscribeToMessages() {
    if (realtimeChannel) realtimeChannel.unsubscribe();
    realtimeChannel = supabase
      .channel('messages-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${profile.id}`,
      }, () => {
        loadChatMessages();
        loadUnreadCount();
      })
      .subscribe();
  }

  // ─────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────
  function firstDayOfMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function monthStartIso() {
    const now = new Date();
    return monthStartIsoFor(now.getFullYear(), now.getMonth());
  }

  function nextMonthStartIso() {
    const now = new Date();
    return nextMonthStartIsoFor(now.getFullYear(), now.getMonth());
  }

  function monthStartIsoFor(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0)).toISOString();
  }

  function nextMonthStartIsoFor(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)).toISOString();
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function linkify(text) {
    return text.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function roleLabel(role) {
    return { prof: 'Prof', eleve: 'Élève', parent: 'Parent' }[role] || '';
  }

  return { init };
})();
