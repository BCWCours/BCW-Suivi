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
      card.addEventListener('click', () => {
        selectedRole = card.dataset.role;
        document.getElementById('field-child').hidden = selectedRole !== 'parent';
        document.getElementById('reg-role-label').textContent =
          selectedRole === 'eleve' ? '👩‍🎓 Inscription élève' : '👨‍👧 Inscription parent';
        showStep('form');
      });
    });
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
    const btn = document.getElementById('toggle-reg-password');
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
    const childEmail = document.getElementById('reg-child-email').value.trim().toLowerCase();
    const password   = document.getElementById('reg-password').value;
    const confirm    = document.getElementById('reg-confirm').value;

    // Validation
    if (!name) { showError('Veuillez entrer votre nom complet.'); return; }
    if (password !== confirm) { showError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 6) { showError('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (selectedRole === 'parent' && !childEmail) {
      showError("Veuillez entrer l'email de votre enfant."); return;
    }

    setLoading(true);

    try {
      // Création du compte
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

      if (error) {
        showError(getSignupError(error));
        setLoading(false);
        return;
      }

      // Si session dispo (confirmation email désactivée) → lier immédiatement
      if (data.session) {
        await tryLink(selectedRole, childEmail);
      }
      // Sinon le lien se fera au premier login via auth.js

      // Message succès
      const msg = data.session
        ? 'Votre compte est actif. Vous pouvez vous connecter.'
        : 'Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.';

      document.getElementById('success-msg').textContent = msg;
      setLoading(false);
      showStep('success');

    } catch (err) {
      showError('Erreur réseau. Vérifiez votre connexion.');
      setLoading(false);
    }
  }

  async function tryLink(role, childEmail) {
    try {
      if (role === 'eleve') {
        await supabase.rpc('link_student_profile');
      } else if (role === 'parent' && childEmail) {
        await supabase.rpc('link_parent_to_child', { p_child_email: childEmail });
      }
    } catch (e) {
      // Non bloquant — le prof peut lier manuellement
    }
  }

  // ========== Helpers ==========
  function getSignupError(error) {
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('email')) {
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
