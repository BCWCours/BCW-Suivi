// =============================================
// BCW SUIVI — Admin Panel (features U & V)
// Accès : rôle 'admin' OU email Bilal hardcodé
// =============================================

const ADMIN_EMAILS = ['bilal.zeamari@bcwcours.be', 'bilal@bcwcours.be', 'bilal.zeamari@gmail.com'];

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    document.getElementById('admin-loading').hidden = true;
    document.getElementById('admin-denied').hidden  = false;
    return;
  }

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single();

  const isAdmin = profile?.role === 'admin' || ADMIN_EMAILS.includes(session.user.email);
  if (!isAdmin) {
    document.getElementById('admin-loading').hidden = true;
    document.getElementById('admin-denied').hidden  = false;
    return;
  }

  document.getElementById('admin-name').textContent = profile?.full_name || session.user.email;
  document.getElementById('admin-loading').hidden  = true;
  document.getElementById('admin-content').hidden  = false;

  loadGlobalStats();
  loadUsers();
  setupCreateProf();
});

// ─────────────────────────────────────────
//  GLOBAL STATS (feature V)
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
    { label: 'Profs',          value: profRes.count    || 0, icon: '👨‍🏫' },
    { label: 'Élèves',         value: studentsRes.count || 0, icon: '🎓' },
    { label: 'Parents',        value: parentsRes.count  || 0, icon: '👪' },
    { label: 'Rapports publiés', value: reportsRes.count || 0, icon: '📄' },
    { label: 'Ce mois',        value: monthCount        || 0, icon: '📅' },
  ].map(s => `
    <div class="stat-item">
      <span style="font-size:1.5rem">${s.icon}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-label">${s.label}</span>
    </div>`).join('');

  // Bar chart: reports by prof this month
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
        <span class="bar-name">${p.full_name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / max * 100).toFixed(0)}%"></div></div>
        <span class="bar-count">${c}</span>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────
//  USERS LIST (feature U)
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
            <td>${p.full_name || '—'}</td>
            <td><span class="role-chip ${p.role}">${p.role}</span></td>
            <td>${new Date(p.created_at).toLocaleDateString('fr-BE')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─────────────────────────────────────────
//  CREATE PROF (feature U)
// ─────────────────────────────────────────
function setupCreateProf() {
  const btn   = document.getElementById('btn-create-prof');
  const msgEl = document.getElementById('create-prof-msg');

  btn.addEventListener('click', async () => {
    const name  = document.getElementById('prof-name').value.trim();
    const email = document.getElementById('prof-email').value.trim();
    if (!name || !email) {
      showMsg(msgEl, 'Nom et email requis.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';
    msgEl.hidden  = true;

    // Create account via Supabase admin API (using sign up)
    const { error: signupErr } = await supabase.auth.signUp({
      email,
      password: crypto.randomUUID(), // random password, they'll reset it
      options: {
        data: { role: 'prof', full_name: name },
      },
    });

    if (signupErr) {
      btn.disabled = false;
      btn.textContent = 'Créer & envoyer lien de connexion';
      showMsg(msgEl, 'Erreur : ' + signupErr.message, 'error');
      return;
    }

    // Send password reset email so they can set their own password
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html',
    });

    btn.disabled = false;
    btn.textContent = 'Créer & envoyer lien de connexion';
    document.getElementById('prof-name').value  = '';
    document.getElementById('prof-email').value = '';
    showMsg(msgEl, `✓ Compte créé pour ${name}. Un email a été envoyé à ${email}.`, 'success');
    loadUsers();
  });
}

function showMsg(el, msg, type) {
  el.textContent = msg;
  el.style.color = type === 'success' ? 'var(--success)' : 'var(--error)';
  el.hidden = false;
}
