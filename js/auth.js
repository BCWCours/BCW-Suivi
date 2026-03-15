// =============================================
// BCW SUIVI — Authentication
// =============================================

const Auth = (() => {
  const loginView = document.getElementById('view-login');
  const appShell = document.getElementById('app-shell');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('btn-logout');
  const topbarName = document.getElementById('topbar-name');

  let currentUser = null;
  let currentProfile = null;

  async function init() {
    setupPasswordToggle();

    let session = null;
    try {
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch (e) {
      showLogin();
      return;
    }

    if (session) {
      await handleSession(session);
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await handleSession(session);
      } else {
        showLogin();
      }
    });

    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
  }

  async function handleLogin(e) {
    e.preventDefault();
    loginError.hidden = true;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span>';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        showLoginError(error);
        return;
      }
    } catch (e) {
      showError('Erreur réseau. Vérifiez votre connexion internet.');
      return;
    }
  }

  function showLoginError(error) {
    const code = error?.message?.toLowerCase() || '';
    let msg = 'Une erreur est survenue. Réessayez.';

    if (code.includes('invalid login') || code.includes('invalid credentials') || code.includes('email not confirmed') === false && code.includes('wrong')) {
      msg = 'Email ou mot de passe incorrect.';
    } else if (code.includes('email not confirmed')) {
      msg = 'Compte non confirmé. Vérifiez votre boîte mail.';
    } else if (code.includes('too many')) {
      msg = 'Trop de tentatives. Attendez quelques minutes.';
    } else if (code.includes('user not found') || code.includes('no user')) {
      msg = 'Aucun compte trouvé avec cet email.';
    } else if (code.includes('network') || code.includes('fetch')) {
      msg = 'Erreur réseau. Vérifiez votre connexion internet.';
    } else if (error.message) {
      msg = 'Email ou mot de passe incorrect.';
    }

    showError(msg);
  }

  function showError(msg) {
    loginError.textContent = msg;
    loginError.hidden = false;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
  }

  async function handleSession(session) {
    currentUser = session.user;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error || !profile) {
        const msg = error?.code === 'PGRST116'
          ? 'Profil introuvable. Vérifiez dans Supabase > Table profiles.'
          : `Erreur profil (${error?.code || 'inconnue'}). Réessayez.`;

        await supabase.auth.signOut();
        // showLogin() est appelé par onAuthStateChange → on retarde l'affichage
        setTimeout(() => showError(msg), 80);
        return;
      }

      currentProfile = profile;

      // Auto-lien au premier login (si inscription via register.html)
      if (profile.role === 'eleve') {
        await supabase.rpc('link_student_profile').catch(() => {});
      } else if (profile.role === 'parent') {
        const childEmail = currentUser.user_metadata?.child_email;
        if (childEmail) {
          await supabase.rpc('link_parent_to_child', { p_child_email: childEmail }).catch(() => {});
        }
      }

      showApp();
    } catch (e) {
      console.error('[BCW] handleSession exception:', e);
      await supabase.auth.signOut();
      setTimeout(() => showError('Erreur serveur. Réessayez.'), 80);
    }
  }

  function setupPasswordToggle() {
    const passwordInput = document.getElementById('login-password');
    const toggleBtn = document.getElementById('toggle-password');
    if (!toggleBtn || !passwordInput) return;

    toggleBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      toggleBtn.innerHTML = isHidden ? eyeOffIcon() : eyeIcon();
      toggleBtn.setAttribute('aria-label', isHidden ? 'Cacher le mot de passe' : 'Voir le mot de passe');
    });
  }

  function eyeIcon() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  }

  function eyeOffIcon() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  }

  function showLogin() {
    currentUser = null;
    currentProfile = null;
    loginView.classList.add('active');
    appShell.hidden = true;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
    loginForm.reset();
    loginError.hidden = true;
  }

  function showApp() {
    loginView.classList.remove('active');
    appShell.hidden = false;
    topbarName.textContent = currentProfile.full_name;
    App.init(currentProfile);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    showLogin();
  }

  function getProfile() { return currentProfile; }
  function getUser() { return currentUser; }

  return { init, getProfile, getUser };
})();

document.addEventListener('DOMContentLoaded', () => Auth.init());
