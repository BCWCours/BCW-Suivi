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
  let pendingLoginError = '';
  let listenersBound = false;

  function normalizeRole(role) {
    const raw = String(role || '').trim().toLowerCase();
    if (raw === 'prof' || raw === 'teacher' || raw === 'professeur') return 'prof';
    if (raw === 'eleve' || raw === 'élève' || raw === 'student') return 'eleve';
    if (raw === 'parent') return 'parent';
    if (raw === 'admin' || raw === 'administrator') return 'admin';
    return raw;
  }

  function normalizePhone(raw) {
    const str = String(raw || '').trim();
    if (!str) return '';

    const compact = str.replace(/[\s().-]/g, '');
    if (!compact) return '';

    if (compact.startsWith('+')) return compact;
    if (compact.startsWith('00')) return `+${compact.slice(2)}`;
    if (compact.startsWith('32')) return `+${compact}`;
    if (compact.startsWith('0')) return `+32${compact.slice(1)}`;

    return compact;
  }

  function toPhoneLoginEmail(raw) {
    const normalized = normalizePhone(raw);
    if (!normalized) return '';
    const digits = normalized.replace(/\D/g, '');
    if (!digits) return '';
    return `tel_${digits}@bcwcours.be`;
  }

  function resolveLoginEmail(identifierRaw) {
    const identifier = String(identifierRaw || '').trim().toLowerCase();
    if (!identifier) return '';
    if (identifier.includes('@')) return identifier;

    const phoneEmail = toPhoneLoginEmail(identifier);
    if (phoneEmail) return phoneEmail;

    return identifier;
  }

  async function init() {
    setupPasswordToggle();
    bindListenersOnce();

    let session = null;
    if (typeof supabase === 'undefined' || !supabase?.auth) {
      showLogin();
      showError('Configuration auth manquante. Recharge la page (Ctrl/Cmd+Shift+R).');
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch (e) {
      showLogin();
      showError('Impossible de vérifier la session. Vérifie la connexion puis réessaie.');
    }

    if (session) {
      await handleSession(session);
    }

    try {
      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          await handleSession(session);
        } else {
          showLogin();
        }
      });
    } catch (e) {
      // Keep manual login usable even if realtime auth listener fails.
      console.warn('[BCW] onAuthStateChange unavailable:', e);
    }
  }

  function bindListenersOnce() {
    if (listenersBound) return;
    loginForm?.addEventListener('submit', handleLogin);
    logoutBtn?.addEventListener('click', handleLogout);
    listenersBound = true;
  }

  async function withTimeout(promise, timeoutMs, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`timeout:${label}`)), timeoutMs);
      }),
    ]);
  }

  async function safeSignOutAndShowLogin(message) {
    if (message) pendingLoginError = message;
    try {
      await withTimeout(supabase.auth.signOut(), 3000, 'signout');
    } catch (_e) {
      // keep going even if signOut call hangs
    }
    showLogin();
  }

  async function handleLogin(e) {
    e.preventDefault();
    loginError.hidden = true;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span>';

    // Absolute UI watchdog: never leave the login button spinning forever.
    const uiWatchdog = setTimeout(() => {
      if (loginView.classList.contains('active')) {
        showError('Connexion bloquée. Recharge la page puis réessaie.');
      }
    }, 20000);

    const identifier = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const email = resolveLoginEmail(identifier);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        15000,
        'signin'
      );

      if (error) {
        showLoginError(error);
        return;
      }

      // Defensive path: some environments delay/skip auth state callback.
      if (data?.session) {
        await withTimeout(handleSession(data.session), 15000, 'handleSession');
        return;
      }

      showError('Connexion établie mais session introuvable. Réessaie.');
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('timeout')) {
        showError('Connexion trop longue. Vérifie internet puis réessaie.');
      } else {
        showError(`Erreur connexion: ${e?.message || 'réseau'}`);
      }
      return;
    } finally {
      clearTimeout(uiWatchdog);
    }
  }

  function showLoginError(error) {
    const code = error?.message?.toLowerCase() || '';
    let msg = 'Une erreur est survenue. Réessayez.';

    if (code.includes('invalid login') || code.includes('invalid credentials') || code.includes('email not confirmed') === false && code.includes('wrong')) {
      msg = 'Identifiant ou mot de passe incorrect.';
    } else if (code.includes('email not confirmed')) {
      msg = 'Compte non confirmé. Vérifiez votre boîte mail.';
    } else if (code.includes('too many')) {
      msg = 'Trop de tentatives. Attendez quelques minutes.';
    } else if (code.includes('user not found') || code.includes('no user')) {
      msg = 'Aucun compte trouvé avec cet identifiant.';
    } else if (code.includes('network') || code.includes('fetch')) {
      msg = 'Erreur réseau. Vérifiez votre connexion internet.';
    } else if (error.message) {
      msg = 'Identifiant ou mot de passe incorrect.';
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

    // ── Étape 1 : lecture du profil ──────────────────────────────
    let profile;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (error || !data) {
        const msg = error?.code === 'PGRST116'
          ? 'Profil introuvable. Contactez Bilal.'
          : `Erreur profil (${error?.code || 'inconnue'}) : ${error?.message || ''}`;
        await safeSignOutAndShowLogin(msg);
        return;
      }
      profile = data;
      profile.role = normalizeRole(profile.role);
    } catch (e) {
      console.error('[BCW] étape 1 exception:', e);
      await safeSignOutAndShowLogin(`Étape 1 – ${e?.message || 'Erreur réseau'}`);
      return;
    }

    currentProfile = profile;

    // ── Étape 2 : lien auto (silencieux) ────────────────────────
    try {
      if (profile.role === 'eleve') {
        await supabase.rpc('link_student_profile').catch(() => {});
      } else if (profile.role === 'parent') {
        const childEmail = currentUser.user_metadata?.child_email;
        if (childEmail) {
          await supabase.rpc('link_parent_to_child', { p_child_email: childEmail }).catch(() => {});
        }
      }
    } catch (e) {
      // non bloquant
      console.warn('[BCW] étape 2 (lien auto) :', e);
    }

    // ── Étape 3 : affichage de l'app ────────────────────────────
    try {
      showApp();
    } catch (e) {
      console.error('[BCW] étape 3 (showApp) exception:', e);
      await safeSignOutAndShowLogin(`Étape 3 – ${e?.message || 'Erreur affichage'}`);
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
    const hadVisibleError = !loginError.hidden && String(loginError.textContent || '').trim().length > 0;
    currentUser = null;
    currentProfile = null;
    loginView.classList.add('active');
    appShell.hidden = true;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Se connecter';
    // Keep form values when an error is visible so the user can correct quickly.
    if (!hadVisibleError) loginForm.reset();
    if (pendingLoginError) {
      const msg = pendingLoginError;
      pendingLoginError = '';
      showError(msg);
    } else if (!hadVisibleError) {
      loginError.hidden = true;
      loginError.textContent = '';
    }
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
