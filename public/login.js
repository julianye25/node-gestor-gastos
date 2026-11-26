const form = document.querySelector('#login-form');
const errorBox = document.querySelector('#auth-error');
const button = document.querySelector('#login-btn');
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

  const username = form.username.value.trim();
  const password = form.password.value;

  if (!username || !password) {
    showError('Rellena el usuario y la contraseña');
    return;
  }

  button.disabled = true;
  button.textContent = 'Entrando…';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error ?? 'No se pudo iniciar sesión');
    }

    window.location.replace('/');
  } catch (error) {
    showError(error.message);
    button.disabled = false;
    button.textContent = defaultLabel;
  }
});

checkSession();
