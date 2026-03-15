// =============================================
// BCW SUIVI — Inscription élève / parent
// =============================================

const Register = (() => {
  let selectedRole = null;

  function init() {
    setupRoleCards();
    setupBackBtn();
    setupPasswordToggle();
    setupForm();
  }

  // ========== Étape 1 : choix du rôle ==========
  function setupRoleCards() {
    document.querySelectorAll('.role-card').forEach(card => {
      card.addEventListener('click', async () => {
        selectedRole = card.dataset.role;

        // Afficher/cacher les champs selon le rôle
        document.getElementById('fields-eleve').hidden = selectedRole !== 'eleve';
        document.getElementById('field-child').hidden  = selectedRole !== 'parent';

        document.getElementById('reg-role-label').textContent =
          selectedRole === 'eleve' ? '👩‍🎓 Inscription élève' : '👨‍👧 Inscription parent';

        // Charger la liste des profs pour les élèves
        if (selectedRole === 'eleve') {
          await loadProfs();
        }

        showStep('form');
      });
    });
  }

  async function loadProfs() {
    const select = document.getElementById('reg-prof');
    select.innerHTML = '<option value="">Chargement…</option>';

    try {
      const { data, error } = await supabase.rpc('get_profs');
      if (error || !data || data.length === 0) {
        select.innerHTML = '<option value="">Aucun prof disponible</option>';
        return;
      }
      select.innerHTML = '<option value="">Choisissez votre prof…</option>' +
        data.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('');
    } catch {
      select.innerHTML = '<option value="">Erreur de chargement</option>';
    }
  }

  function setupBackBtn() {
    document.getElementById('btn-back-role')?.addEventListener('click', () => {
      selectedRole = null;
      showStep('role');
    });
  }

  function showStep(name) {
    document.querySelectorAll('.reg-step').forEach(s => { s.hidden = true; });
    document.getElementById(`step-${name}`).hidden = false;
  }

  // ========== Toggle mot de passe ==========
  function setupPasswordToggle() {
    const input = document.getElementById('reg-password');
    const btn   = document.getElementById('toggle-reg-password');
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? eyeOffIcon() : eyeIcon();
    });
  }

  function eyeIcon() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }
  function eyeOffIcon() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  }

  // ========== Formulaire ==========
  function setupForm() {
    document.getElementById('register-form').addEventListener('submit', handleSubmit);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const name       = document.getElementById('reg-name').value.trim();
    const email      = document.getElementById('reg-email').value.trim().toLowerCase();
    const password   = document.getElementById('reg-password').value;
    const confirm    = document.getElementById('reg-confirm').value;
    const childEmail = document.getElementById('reg-child-email').value.trim().toLowerCase();
    const level      = document.querySelector('input[name="level"]:checked')?.value || null;
    const teacherId  = document.getElementById('reg-prof')?.value || null;

    // Validation
    if (!name)                          { showError('Veuillez entrer votre nom complet.'); return; }
    if (password !== confirm)           { showError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 6)            { showError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (selectedRole === 'eleve' && !level)     { showError('Veuillez choisir votre niveau.'); return; }
    if (selectedRole === 'eleve' && !teacherId) { showError('Veuillez choisir votre professeur.'); return; }
    if (selectedRole === 'parent' && !childEmail) { showError("Veuillez entrer l'email de votre enfant."); return; }

    setLoading(true);

    try {
      // Création du compte Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: selectedRole,
            full_name: name,
            child_email: childEmail || null,
          }
        }
      });

      if (error) { showError(getSignupError(error)); setLoading(false); return; }

      // Si session active (confirmation email désactivée) → actions immédiates
      if (data.session) {
        if (selectedRole === 'eleve') {
          await supabase.rpc('register_student', {
            p_level: level,
            p_teacher_id: teacherId,
          }).catch(() => {});
        } else if (selectedRole === 'parent' && childEmail) {
          await supabase.rpc('link_parent_to_child', { p_child_email: childEmail }).catch(() => {});
        }
      }
      // Sinon : le lien se fait au premier login via auth.js

      const msg = data.session
        ? 'Votre compte est actif. Vous pouvez vous connecter.'
        : 'Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.';

      document.getElementById('success-msg').textContent = msg;
      setLoading(false);
      showStep('success');

    } catch {
      showError('Erreur réseau. Vérifiez votre connexion.');
      setLoading(false);
    }
  }

  // ========== Helpers ==========
  function getSignupError(error) {
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
      return 'Un compte existe déjà avec cet email.';
    }
    if (msg.includes('password')) {
      return 'Mot de passe trop faible. Minimum 6 caractères.';
    }
    return 'Une erreur est survenue. Réessayez.';
  }

  function showError(msg) {
    const el = document.getElementById('reg-error');
    el.textContent = msg;
    el.hidden = false;
  }

  function clearError() {
    const el = document.getElementById('reg-error');
    el.hidden = true;
    el.textContent = '';
  }

  function setLoading(loading) {
    const btn = document.getElementById('reg-btn');
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner"></span>' : 'Créer mon compte';
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Register.init());
