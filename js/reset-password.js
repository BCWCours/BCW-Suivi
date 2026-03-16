// =============================================
// BCW SUIVI — Reset Password (feature O)
// =============================================

document.addEventListener('DOMContentLoaded', async () => {

  // Detect if we're in reset mode (Supabase redirected here with token)
  const hash = window.location.hash;
  const isReset = hash.includes('type=recovery') || hash.includes('access_token');

  if (isReset) {
    // Supabase handles the token automatically via onAuthStateChange
    document.getElementById('step-request').hidden = true;
    document.getElementById('step-reset').hidden = false;
    setupPasswordToggle();
    setupResetForm();
  } else {
    setupRequestForm();
  }
});

function setupRequestForm() {
  const form   = document.getElementById('form-request');
  const msgEl  = document.getElementById('request-msg');
  const btn    = document.getElementById('btn-request');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    msgEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';

    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    btn.disabled = false;
    btn.textContent = 'Envoyer le lien';

    if (error) {
      msgEl.style.color = 'var(--error)';
      msgEl.textContent = 'Erreur : ' + (error.message || 'Réessayez.');
    } else {
      msgEl.style.color = 'var(--success)';
      msgEl.textContent = '✓ Email envoyé ! Vérifiez votre boîte mail.';
    }
    msgEl.hidden = false;
  });
}

function setupResetForm() {
  const form    = document.getElementById('form-reset');
  const msgEl   = document.getElementById('reset-msg');
  const btn     = document.getElementById('btn-reset');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const newPwd     = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;

    if (newPwd !== confirmPwd) {
      msgEl.style.color = 'var(--error)';
      msgEl.textContent = 'Les mots de passe ne correspondent pas.';
      msgEl.hidden = false;
      return;
    }
    if (newPwd.length < 6) {
      msgEl.style.color = 'var(--error)';
      msgEl.textContent = 'Le mot de passe doit faire au moins 6 caractères.';
      msgEl.hidden = false;
      return;
    }

    msgEl.hidden = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-top-color:#fff"></span>';

    const { error } = await supabase.auth.updateUser({ password: newPwd });

    btn.disabled = false;
    btn.textContent = 'Changer le mot de passe';

    if (error) {
      msgEl.style.color = 'var(--error)';
      msgEl.textContent = 'Erreur : ' + (error.message || 'Lien expiré, recommencez.');
      msgEl.hidden = false;
    } else {
      document.getElementById('step-reset').hidden = true;
      document.getElementById('step-done').hidden = false;
    }
  });
}

function setupPasswordToggle() {
  const input  = document.getElementById('new-password');
  const toggle = document.getElementById('toggle-new-password');
  if (!toggle || !input) return;
  toggle.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
  });
}
