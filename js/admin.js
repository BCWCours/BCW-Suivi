// =============================================
// BCW SUIVI — Admin Panel
// Invite-only provisioning for prof/eleve/parent
// =============================================

const ADMIN_EMAILS = ['bilal.zeamari@bcwcours.be', 'bilal@bcwcours.be', 'bilal.zeamari@gmail.com'];
const STUDENT_LEVELS = new Set(['secondaire', 'superieur']);

let currentSession = null;
let currentProfile = null;
let teacherOptions = [];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;

  if (!currentSession) {
    document.getElementById('admin-loading').hidden = true;
    document.getElementById('admin-denied').hidden = false;
    return;
  }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', currentSession.user.id).single();

  currentProfile = profile || null;
  const role = normalizeRole(currentProfile?.role);
  const isAdmin = role === 'admin' || ADMIN_EMAILS.includes((currentSession.user.email || '').toLowerCase());

  if (!isAdmin) {
    document.getElementById('admin-loading').hidden = true;
    document.getElementById('admin-denied').hidden = false;
    return;
  }

  document.getElementById('admin-name').textContent = currentProfile?.full_name || currentSession.user.email;
  document.getElementById('admin-loading').hidden = true;
  document.getElementById('admin-content').hidden = false;

  await loadTeacherOptions();
  setupCreateAccount();
  loadGlobalStats();
  loadUsers();
});

function normalizeRole(role) {
  const raw = String(role || '').trim().toLowerCase();
  if (raw === 'teacher' || raw === 'professeur') return 'prof';
  if (raw === 'élève' || raw === 'student') return 'eleve';
  if (raw === 'administrator') return 'admin';
  return raw;
}

// ─────────────────────────────────────────
//  GLOBAL STATS
// ─────────────────────────────────────────
async function loadGlobalStats() {
  const [studentsRes, reportsRes, parentsRes, profRes] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }),
    supabase.from('session_reports').select('id', { count: 'exact', head: true }).not('published_at', 'is', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'parent'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'prof'),
  ]);

  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);

  const { count: monthCount } = await supabase
    .from('session_reports')
    .select('id', { count: 'exact', head: true })
    .not('published_at', 'is', null)
    .gte('created_at', firstDayOfMonth.toISOString());

  document.getElementById('global-stats').innerHTML = [
    { label: 'Profs', value: profRes.count || 0, icon: '👨‍🏫' },
    { label: 'Élèves', value: studentsRes.count || 0, icon: '🎓' },
    { label: 'Parents', value: parentsRes.count || 0, icon: '👪' },
    { label: 'Rapports publiés', value: reportsRes.count || 0, icon: '📄' },
    { label: 'Ce mois', value: monthCount || 0, icon: '📅' },
  ].map(s => `
    <div class="stat-item">
      <span style="font-size:1.5rem">${s.icon}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-label">${s.label}</span>
    </div>`).join('');

  const { data: profs } = await supabase.from('profiles').select('id, full_name').eq('role', 'prof');
  const { data: monthReports } = await supabase
    .from('session_reports')
    .select('teacher_id')
    .not('published_at', 'is', null)
    .gte('created_at', firstDayOfMonth.toISOString());

  const counts = {};
  (monthReports || []).forEach(r => { counts[r.teacher_id] = (counts[r.teacher_id] || 0) + 1; });
  const max = Math.max(...Object.values(counts), 1);

  const barchart = document.getElementById('barchart');
  if (!profs || profs.length === 0) {
    barchart.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem">Aucun prof enregistré.</p>';
    return;
  }

  barchart.innerHTML = profs.map(p => {
    const c = counts[p.id] || 0;
    return `
      <div class="bar-row">
        <span class="bar-name">${escapeHtml(p.full_name || 'Prof')}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / max * 100).toFixed(0)}%"></div></div>
        <span class="bar-count">${c}</span>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  USERS LIST
// ─────────────────────────────────────────
async function loadUsers() {
  const container = document.getElementById('users-container');
  container.innerHTML = '<div class="loading-center"><span class="spinner" style="border-color:rgba(9,82,154,0.15);border-top-color:var(--navy)"></span></div>';

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !profiles) {
    container.innerHTML = '<p style="color:var(--error)">Erreur de chargement.</p>';
    return;
  }

  container.innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Rôle</th>
          <th>Créé le</th>
        </tr>
      </thead>
      <tbody>
        ${profiles.map(p => `
          <tr>
            <td>${escapeHtml(p.full_name || '—')}</td>
            <td><span class="role-chip ${normalizeRole(p.role)}">${escapeHtml(normalizeRole(p.role) || '—')}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString('fr-BE')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function loadTeacherOptions() {
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'prof')
    .order('full_name', { ascending: true });

  teacherOptions = teachers || [];
  renderTeacherSelect();
}

function renderTeacherSelect() {
  const select = document.getElementById('create-teacher-id');
  if (!select) return;

  if (!teacherOptions.length) {
    select.innerHTML = '<option value="">Aucun prof disponible</option>';
    return;
  }

  select.innerHTML = '<option value="">Choisir un prof...</option>' +
    teacherOptions.map(t => `<option value="${t.id}">${escapeHtml(t.full_name || 'Prof')}</option>`).join('');
}

// ─────────────────────────────────────────
//  CREATE ACCOUNT (invite-only)
// ─────────────────────────────────────────
function setupCreateAccount() {
  const roleSelect = document.getElementById('create-role');
  const btn = document.getElementById('btn-create-account');
  const msgEl = document.getElementById('create-account-msg');

  roleSelect.addEventListener('change', refreshRoleFields);
  refreshRoleFields();

  btn.addEventListener('click', async () => {
    const name = document.getElementById('create-name').value.trim();
    const email = document.getElementById('create-email').value.trim().toLowerCase();
    const role = normalizeRole(roleSelect.value);
    const level = document.getElementById('create-level').value;
    const teacherId = document.getElementById('create-teacher-id').value;
    const childEmail = document.getElementById('create-child-email').value.trim().toLowerCase();

    if (!name || !email) {
      showMsg(msgEl, 'Nom et email requis.', 'error');
      return;
    }
    if (!['prof', 'eleve', 'parent'].includes(role)) {
      showMsg(msgEl, 'Rôle invalide.', 'error');
      return;
    }
    if (role === 'eleve' && !STUDENT_LEVELS.has(level)) {
      showMsg(msgEl, 'Niveau élève invalide.', 'error');
      return;
    }
    if (role === 'eleve' && !teacherId) {
      showMsg(msgEl, 'Veuillez assigner un prof à cet élève.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';
    msgEl.hidden = true;

    try {
      const randomPassword = crypto.randomUUID() + '_A1!';

      const { data, error: signupErr } = await supabase.auth.signUp({
        email,
        password: randomPassword,
        options: {
          data: {
            role,
            full_name: name,
            child_email: role === 'parent' ? (childEmail || null) : null,
          },
        },
      });

      if (signupErr) {
        throw new Error(signupErr.message || 'Erreur signup');
      }

      const newUserId = data?.user?.id || null;
      if (!newUserId) {
        throw new Error('Compte créé sans ID utilisateur.');
      }

      if (role === 'eleve') {
        await createStudentRecord({
          userId: newUserId,
          fullName: name,
          email,
          level,
          teacherId,
        });
      } else if (role === 'parent' && childEmail) {
        await linkParentToChildByEmail({
          parentId: newUserId,
          childEmail,
        });
      }

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html',
      });

      clearCreateForm();
      showMsg(msgEl, `✓ Compte ${role} créé pour ${name}. Email envoyé à ${email}.`, 'success');
      await loadTeacherOptions();
      await loadUsers();
      await loadGlobalStats();
    } catch (err) {
      showMsg(msgEl, 'Erreur : ' + (err?.message || 'Réessayez.'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Créer & envoyer lien de connexion';
    }
  });
}

function refreshRoleFields() {
  const role = normalizeRole(document.getElementById('create-role').value);
  document.getElementById('field-create-level').hidden = role !== 'eleve';
  document.getElementById('field-create-teacher').hidden = role !== 'eleve';
  document.getElementById('field-create-child-email').hidden = role !== 'parent';
}

async function createStudentRecord({ userId, fullName, email, level, teacherId }) {
  const { error: studentErr } = await supabase
    .from('students')
    .insert({
      full_name: fullName,
      level,
      email,
      profile_id: userId,
    });

  if (studentErr && !String(studentErr.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(studentErr.message || 'Impossible de créer la fiche élève');
  }

  let studentId = null;
  const { data: existingStudent } = await supabase
    .from('students')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();

  studentId = existingStudent?.id || null;
  if (!studentId) {
    throw new Error('Fiche élève introuvable après création.');
  }

  const { error: linkErr } = await supabase
    .from('teacher_students')
    .insert({
      teacher_id: teacherId,
      student_id: studentId,
      subjects: null,
    });

  if (linkErr && !String(linkErr.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(linkErr.message || 'Impossible d’assigner le prof');
  }
}

async function linkParentToChildByEmail({ parentId, childEmail }) {
  const child = await findStudentByEmail(childEmail);
  if (!child?.id) return;

  const { error: linkErr } = await supabase
    .from('parent_students')
    .insert({
      parent_id: parentId,
      student_id: child.id,
    });

  if (linkErr && !String(linkErr.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(linkErr.message || 'Impossible de lier le parent à l’élève');
  }
}

async function findStudentByEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return null;

  const { data: byStudentEmail } = await supabase
    .from('students')
    .select('id')
    .eq('email', clean)
    .limit(1);

  if (byStudentEmail && byStudentEmail.length > 0) {
    return byStudentEmail[0];
  }

  const { data: authUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'eleve')
    .limit(1000);

  if (!authUser || !authUser.length) return null;

  const candidateIds = authUser.map(u => u.id);
  const { data: students } = await supabase
    .from('students')
    .select('id, profile_id, email')
    .in('profile_id', candidateIds);

  return (students || []).find(s => String(s.email || '').toLowerCase() === clean) || null;
}

function clearCreateForm() {
  document.getElementById('create-name').value = '';
  document.getElementById('create-email').value = '';
  document.getElementById('create-level').value = 'secondaire';
  document.getElementById('create-teacher-id').value = '';
  document.getElementById('create-child-email').value = '';
}

function showMsg(el, msg, type) {
  el.textContent = msg;
  el.style.color = type === 'success' ? 'var(--success)' : 'var(--error)';
  el.hidden = false;
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
