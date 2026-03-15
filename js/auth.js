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
    const { data: { session } } = await supabase.auth.getSession();
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

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginError.textContent = 'Email ou mot de passe incorrect.';
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'Se connecter';
      return;
    }
  }

  async function handleSession(session) {
    currentUser = session.user;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (error || !profile) {
      loginError.textContent = 'Profil introuvable. Contactez BCW.';
      loginError.hidden = false;
      loginBtn.disabled = false;
      loginBtn.textContent = 'Se connecter';
      await supabase.auth.signOut();
      return;
    }

    currentProfile = profile;
    showApp();
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
