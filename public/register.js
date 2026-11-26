const form = document.querySelector('#register-form');
const errorBox = document.querySelector('#auth-error');
const button = document.querySelector('#register-btn');
const defaultLabel = button.textContent;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.textContent = '';
  errorBox.hidden = true;
}

async function checkSession() {
  try {
    const response = await fetch('/api/me');
    if (response.ok) window.location.replace('/');
  } catch {
    // Sin conexión: se muestra el formulario.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const inviteCode = form.inviteCode.value.trim();
  const username = form.username.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (!inviteCode) {
    showError('Introduce el código de invitación');
    return;
  }
  if (username.length < 3) {
    showError('El usuario debe tener al menos 3 caracteres');
    return;
  }
  if (password.length < 8) {
    showError('La contraseña debe tener al menos 8 caracteres');
    return;
  }
  if (password !== confirmPassword) {
    showError('Las contraseñas no coinciden');
    return;
  }

  button.disabled = true;
  button.textContent = 'Creando…';

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode, username, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? 'No se pudo crear la cuenta');
    }

    window.location.replace('/');
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = defaultLabel;
  }
});

checkSession();
