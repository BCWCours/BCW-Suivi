// =============================================
// BCW SUIVI — Application Logic
// =============================================

const App = (() => {
  let profile = null;
  let currentStudentId = null;

  // View references
  const views = {
    profDashboard: document.getElementById('view-prof-dashboard'),
    reportEditor: document.getElementById('view-report-editor'),
    feed: document.getElementById('view-feed'),
    reportDetail: document.getElementById('view-report-detail'),
  };

  function init(userProfile) {
    profile = userProfile;
    setupEventListeners();

    if (profile.role === 'prof') {
      showView('profDashboard');
      loadProfStudents();
    } else if (profile.role === 'eleve') {
      showView('feed');
      loadStudentFeed();
    } else if (profile.role === 'parent') {
      showView('feed');
      loadParentFeed();
    }
  }

  function showView(name) {
    Object.values(views).forEach(v => {
      v.hidden = true;
      v.classList.remove('active');
    });
    views[name].hidden = false;
    views[name].classList.add('active');
    window.scrollTo(0, 0);
  }

  function setupEventListeners() {
    // Back buttons
    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
      showView('profDashboard');
    });
    document.getElementById('btn-back-feed').addEventListener('click', () => {
      if (profile.role === 'prof') {
        showView('profDashboard');
      } else {
        showView('feed');
      }
    });

    // Score selector
    document.querySelectorAll('.score-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('report-score').value = btn.dataset.score;
      });
    });

    // Report form
    document.getElementById('report-form').addEventListener('submit', (e) => {
      e.preventDefault();
      publishReport();
    });
    document.getElementById('btn-save-draft').addEventListener('click', saveDraft);

    // Child selector for parents
    document.getElementById('child-select')?.addEventListener('change', (e) => {
      loadReportsForStudent(e.target.value);
    });
  }

  // ========== PROF: Load students ==========
  async function loadProfStudents() {
    const container = document.getElementById('prof-students-list');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    const { data: links, error } = await supabase
      .from('teacher_students')
      .select('student_id, subjects, students(id, full_name, level)')
      .eq('teacher_id', profile.id);

    if (error || !links || links.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👩‍🎓</div>
          <p>Aucun élève assigné.</p>
          <p class="empty-sub">Ajoutez des élèves depuis Supabase Dashboard.</p>
        </div>`;
      return;
    }

    container.innerHTML = links.map(link => {
      const student = link.students;
      return `
        <div class="student-card" data-student-id="${student.id}" data-student-name="${student.full_name}">
          <div class="student-card-info">
            <h3>${student.full_name}</h3>
            <span>${student.level === 'secondaire' ? 'Secondaire' : 'Supérieur'}${link.subjects ? ' · ' + link.subjects : ''}</span>
          </div>
          <button class="student-card-action" data-action="write" data-student-id="${student.id}" data-student-name="${student.full_name}" data-subjects="${link.subjects || ''}">
            Rédiger
          </button>
        </div>`;
    }).join('');

    // Click on card = view reports for this student
    container.querySelectorAll('.student-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="write"]')) return;
        const sid = card.dataset.studentId;
        const sname = card.dataset.studentName;
        showStudentReportsForProf(sid, sname);
      });
    });

    // Click write button = open editor
    container.querySelectorAll('[data-action="write"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReportEditor(btn.dataset.studentId, btn.dataset.studentName, btn.dataset.subjects);
      });
    });
  }

  // ========== PROF: Student reports list ==========
  async function showStudentReportsForProf(studentId, studentName) {
    document.getElementById('feed-title').textContent = `Rapports — ${studentName}`;
    document.getElementById('feed-subtitle').textContent = '';
    document.getElementById('parent-child-selector').hidden = true;
    showView('feed');

    const container = document.getElementById('reports-feed');
    const empty = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*')
      .eq('student_id', studentId)
      .eq('teacher_id', profile.id)
      .order('session_date', { ascending: false });

    renderReportsFeed(reports, error, true);

    // Override back button to go back to dashboard
    document.getElementById('btn-back-feed').onclick = () => showView('profDashboard');
  }

  // ========== PROF: Open report editor ==========
  function openReportEditor(studentId, studentName, subjects) {
    currentStudentId = studentId;
    showView('reportEditor');

    document.getElementById('report-student-info').textContent = studentName;
    document.getElementById('report-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('report-subjects').value = subjects || '';
    document.getElementById('report-strengths').value = '';
    document.getElementById('report-improvements').value = '';
    document.getElementById('report-resources').value = '';
    document.getElementById('report-score').value = '';
    document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('active'));

    const statusEl = document.getElementById('report-status');
    statusEl.hidden = true;
  }

  // ========== PROF: Save draft ==========
  async function saveDraft() {
    await saveReport(false);
  }

  // ========== PROF: Publish report ==========
  async function publishReport() {
    await saveReport(true);
  }

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
      session_date: document.getElementById('report-date').value,
      subjects_covered: document.getElementById('report-subjects').value,
      strengths: document.getElementById('report-strengths').value,
      improvements: document.getElementById('report-improvements').value,
      resources_text: document.getElementById('report-resources').value || null,
      score: document.getElementById('report-score').value
        ? parseInt(document.getElementById('report-score').value)
        : null,
    };

    if (publish) {
      reportData.published_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('session_reports')
      .insert(reportData);

    btn.disabled = false;
    btn.textContent = publish ? 'Publier & notifier' : 'Sauvegarder brouillon';

    if (error) {
      statusEl.textContent = 'Erreur lors de la sauvegarde. Réessayez.';
      statusEl.className = 'form-status is-error';
      statusEl.hidden = false;
      return;
    }

    statusEl.textContent = publish
      ? 'Rapport publié avec succès !'
      : 'Brouillon sauvegardé.';
    statusEl.className = publish ? 'form-status is-success' : 'form-status';
    statusEl.hidden = false;

    if (publish) {
      setTimeout(() => showView('profDashboard'), 1200);
    }
  }

  // ========== ELEVE: Load feed ==========
  async function loadStudentFeed() {
    document.getElementById('feed-title').textContent = 'Mes rapports';
    document.getElementById('feed-subtitle').textContent = '';
    document.getElementById('parent-child-selector').hidden = true;

    const container = document.getElementById('reports-feed');
    const empty = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    // Find student record linked to this profile
    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('profile_id', profile.id)
      .single();

    if (!student) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*, profiles!session_reports_teacher_id_fkey(full_name)')
      .eq('student_id', student.id)
      .not('published_at', 'is', null)
      .order('session_date', { ascending: false });

    renderReportsFeed(reports, error, false);
  }

  // ========== PARENT: Load feed ==========
  async function loadParentFeed() {
    document.getElementById('feed-title').textContent = 'Suivi de votre enfant';
    document.getElementById('parent-child-selector').hidden = true;

    const container = document.getElementById('reports-feed');
    const empty = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    // Get linked children
    const { data: links } = await supabase
      .from('parent_students')
      .select('student_id, students(id, full_name)')
      .eq('parent_id', profile.id);

    if (!links || links.length === 0) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }

    // If multiple children, show selector
    if (links.length > 1) {
      const selector = document.getElementById('parent-child-selector');
      const select = document.getElementById('child-select');
      selector.hidden = false;
      select.innerHTML = links.map(l =>
        `<option value="${l.students.id}">${l.students.full_name}</option>`
      ).join('');
    }

    const firstStudentId = links[0].students.id;
    document.getElementById('feed-subtitle').textContent = links[0].students.full_name;
    loadReportsForStudent(firstStudentId);
  }

  async function loadReportsForStudent(studentId) {
    const container = document.getElementById('reports-feed');
    const empty = document.getElementById('feed-empty');
    container.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
    empty.hidden = true;

    const { data: reports, error } = await supabase
      .from('session_reports')
      .select('*, profiles!session_reports_teacher_id_fkey(full_name)')
      .eq('student_id', studentId)
      .not('published_at', 'is', null)
      .order('session_date', { ascending: false });

    renderReportsFeed(reports, error, false);
  }

  // ========== Render reports feed ==========
  function renderReportsFeed(reports, error, showDrafts) {
    const container = document.getElementById('reports-feed');
    const empty = document.getElementById('feed-empty');

    if (error || !reports || reports.length === 0) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    container.innerHTML = reports.map(r => {
      const isDraft = !r.published_at;
      if (isDraft && !showDrafts) return '';
      const date = formatDate(r.session_date);
      const teacherName = r.profiles?.full_name || '';

      return `
        <div class="report-card ${isDraft ? 'is-draft' : ''}" data-report-id="${r.id}">
          <div class="report-card-header">
            <span class="report-card-date">${date}${teacherName ? ' · ' + teacherName : ''}</span>
            ${r.score ? `<span class="report-card-score">${r.score}/5</span>` : ''}
          </div>
          <div class="report-card-subjects">${r.subjects_covered}</div>
          <span class="report-card-badge ${isDraft ? 'badge-draft' : 'badge-published'}">
            ${isDraft ? 'Brouillon' : 'Publié'}
          </span>
        </div>`;
    }).join('');

    // Click to open detail
    container.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', () => {
        const rid = card.dataset.reportId;
        const report = reports.find(r => r.id === rid);
        if (report) openReportDetail(report);
      });
    });
  }

  // ========== Report detail ==========
  function openReportDetail(report) {
    showView('reportDetail');
    const container = document.getElementById('report-detail');
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
        </div>
      ` : ''}
    `;
  }

  // ========== Helpers ==========
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-BE', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function linkify(text) {
    return text.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  return { init };
})();
