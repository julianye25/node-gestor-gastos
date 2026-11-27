const els = {
  form: document.querySelector('#expense-form'),
  formTitle: document.querySelector('#form-title'),
  amount: document.querySelector('#amount'),
  category: document.querySelector('#category'),
  date: document.querySelector('#date'),
  description: document.querySelector('#description'),
  submitBtn: document.querySelector('#submit-btn'),
  cancelBtn: document.querySelector('#cancel-btn'),
  currencySymbol: document.querySelector('#currency-symbol'),
  totalMonth: document.querySelector('#total-month'),
  totalMonthHint: document.querySelector('#total-month-hint'),
  totalGeneral: document.querySelector('#total-general'),
  totalGeneralHint: document.querySelector('#total-general-hint'),
  countMonth: document.querySelector('#count-month'),
  breakdown: document.querySelector('#breakdown'),
  breakdownMonth: document.querySelector('#breakdown-month'),
  monthFilter: document.querySelector('#month-filter'),
  categoryFilter: document.querySelector('#category-filter'),
  tbody: document.querySelector('#expenses-body'),
  emptyState: document.querySelector('#empty-state'),
  toast: document.querySelector('#toast'),
  currentUser: document.querySelector('#current-user'),
  logoutBtn: document.querySelector('#logout-btn'),
  exportBtn: document.querySelector('#export-btn'),
  demoBanner: document.querySelector('#demo-banner'),
  demoBannerText: document.querySelector('#demo-banner-text'),
};

const state = {
  categories: [],
  currency: 'COP',
  month: monthOf(),
  category: '',
  expenses: [],
  summary: null,
  editingId: null,
  user: null,
  demo: null,
};

const ZERO_DECIMAL_CURRENCIES = new Set(['COP', 'CLP', 'PYG', 'VND', 'JPY', 'KRW']);

const CATEGORY_COLORS = {
  Comida: '#ffb020',
  Transporte: '#00e5ff',
  Vivienda: '#b388ff',
  Ocio: '#ff2bd6',
  Salud: '#38ffb0',
  Otros: '#7c8aa5',
};

/* ---------- Utilidades ---------- */

function monthOf(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function currencyDigits() {
  return ZERO_DECIMAL_CURRENCIES.has(String(state.currency).toUpperCase()) ? 0 : 2;
}

function formatMoney(cents) {
  const digits = currencyDigits();
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: state.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((Number(cents) || 0) / 100);
}

function formatMonthLabel(month) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  if (!year || !monthNumber) return String(month);
  const label = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function renderDemoBanner() {
  if (!state.demo?.enabled) {
    els.demoBanner.hidden = true;
    return;
  }

  const expiresAt = state.user?.expiresAt ? new Date(state.user.expiresAt) : null;
  let text = 'Modo demo: esta cuenta y sus datos se eliminan automáticamente.';

  if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
    const when = new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(expiresAt);
    text = `Modo demo: esta cuenta y sus datos se eliminan el ${when}.`;
  }

  text += ' Si hay 4 cuentas activas, la más antigua se libera.';
  els.demoBannerText.textContent = text;
  els.demoBanner.hidden = false;
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function categoryColor(category) {
  return CATEGORY_COLORS[category] ?? '#94a3b8';
}

function currencySymbol(currency) {
  const parts = new Intl.NumberFormat('es-CO', { style: 'currency', currency }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}

/**
 * Convierte lo escrito en el formulario a un importe válido para la API.
 * En monedas sin decimales (COP) solo se aceptan pesos enteros.
 */
function parseAmount(raw) {
  const value = String(raw ?? '').trim();

  if (currencyDigits() === 0) {
    const cleaned = value.replace(/[.\s]/g, '');
    if (!/^\d{1,9}$/.test(cleaned)) return null;
    const cents = Number(cleaned) * 100;
    return cents > 0 ? { amount: cleaned, cents } : null;
  }

  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value.replace(',', '.')) * 100);
  return cents > 0 ? { amount: value, cents } : null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Tu sesión ha caducado');
  }

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? `Error ${response.status}`);
  }
  return data;
}

function redirectToLogin() {
  if (!window.location.pathname.endsWith('/login.html')) {
    window.location.replace('/login.html');
  }
}

let toastTimer;
function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = `toast toast--${type}`;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

/* ---------- Carga y renderizado ---------- */

async function refreshAll() {
  const params = new URLSearchParams({ month: state.month });
  const listParams = new URLSearchParams(params);
  if (state.category) listParams.set('category', state.category);

  const [summary, list] = await Promise.all([
    api(`/api/summary?${params}`),
    api(`/api/expenses?${listParams}`),
  ]);

  state.summary = summary;
  state.expenses = list.expenses;

  renderSummary();
  renderMonthOptions();
  renderBreakdown();
  renderTable();
}

async function refreshExpenses() {
  const params = new URLSearchParams({ month: state.month });
  if (state.category) params.set('category', state.category);

  const { expenses } = await api(`/api/expenses?${params}`);
  state.expenses = expenses;
  renderTable();
}

function renderSummary() {
  const summary = state.summary;
  if (!summary) return;

  els.totalMonth.textContent = formatMoney(summary.totalCents);
  els.totalMonthHint.textContent = formatMonthLabel(state.month);
  els.totalGeneral.textContent = formatMoney(summary.generalTotalCents);
  els.totalGeneralHint.textContent = `${plural(summary.generalCount, 'gasto', 'gastos')} en total`;
  els.countMonth.textContent = String(summary.count);
}

function renderMonthOptions() {
  const months = new Set((state.summary?.byMonth ?? []).map((entry) => entry.month));
  months.add(state.month);
  months.add(monthOf());

  const sorted = [...months].filter(Boolean).sort().reverse();
  els.monthFilter.replaceChildren(
    ...sorted.map((month) => new Option(formatMonthLabel(month), month, false, month === state.month)),
  );
  els.monthFilter.value = state.month;
}

function renderBreakdown() {
  els.breakdownMonth.textContent = formatMonthLabel(state.month);

  const items = state.summary?.byCategory ?? [];
  if (items.length === 0) {
    const item = document.createElement('li');
    item.className = 'breakdown-empty';
    item.textContent = 'Sin gastos en este mes.';
    els.breakdown.replaceChildren(item);
    return;
  }

  const total = state.summary.totalCents || 1;
  const nodes = items.map((entry) => {
    const percentage = Math.round((entry.totalCents / total) * 100);

    const item = document.createElement('li');
    item.className = 'breakdown-item';

    const head = document.createElement('div');
    head.className = 'breakdown-head';

    const name = document.createElement('span');
    name.className = 'breakdown-name';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = categoryColor(entry.category);

    name.append(dot, document.createTextNode(entry.category));

    const amount = document.createElement('span');
    amount.className = 'breakdown-amount';
    amount.textContent = `${formatMoney(entry.totalCents)} · ${percentage}%`;
    amount.title = plural(entry.count, 'gasto', 'gastos');

    head.append(name, amount);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('span');
    fill.style.width = `${percentage}%`;
    fill.style.background = categoryColor(entry.category);
    bar.append(fill);

    item.append(head, bar);
    return item;
  });

  els.breakdown.replaceChildren(...nodes);
}

function createCategoryBadge(category) {
  const badge = document.createElement('span');
  badge.className = 'badge';

  const dot = document.createElement('span');
  dot.className = 'badge-dot';
  dot.style.background = categoryColor(category);

  badge.append(dot, document.createTextNode(category));
  return badge;
}

function renderTable() {
  if (state.expenses.length === 0) {
    els.tbody.replaceChildren();
    els.emptyState.hidden = false;
    els.emptyState.textContent = state.category
      ? 'No hay gastos de esta categoría en el mes seleccionado.'
      : 'No hay gastos en el mes seleccionado.';
    return;
  }

  els.emptyState.hidden = true;

  const rows = state.expenses.map((expense) => {
    const row = document.createElement('tr');

    const dateCell = document.createElement('td');
    dateCell.className = 'cell-date';
    dateCell.textContent = formatDate(expense.date);

    const categoryCell = document.createElement('td');
    categoryCell.append(createCategoryBadge(expense.category));

    const descriptionCell = document.createElement('td');
    descriptionCell.className = 'cell-desc';
    descriptionCell.textContent = expense.description || '—';
    if (!expense.description) descriptionCell.classList.add('muted');

    const amountCell = document.createElement('td');
    amountCell.className = 'num cell-amount';
    amountCell.textContent = formatMoney(expense.amountCents);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-col';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--small';
    editButton.textContent = 'Editar';
    editButton.dataset.action = 'edit';
    editButton.dataset.id = expense.id;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn--small btn--danger';
    deleteButton.textContent = 'Borrar';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.id = expense.id;

    actionsCell.append(editButton, deleteButton);

    row.append(dateCell, categoryCell, descriptionCell, amountCell, actionsCell);
    return row;
  });

  els.tbody.replaceChildren(...rows);
}

/* ---------- Formulario ---------- */

function fillCategoryOptions() {
  const placeholder = new Option('Elige categoría', '', true, true);
  placeholder.disabled = true;
  els.category.replaceChildren(
    placeholder,
    ...state.categories.map((category) => new Option(category, category)),
  );

  els.categoryFilter.replaceChildren(
    new Option('Todas las categorías', '', true, state.category === ''),
    ...state.categories.map((category) => new Option(category, category, false, category === state.category)),
  );
  els.categoryFilter.value = state.category;
}

function startEdit(expense) {
  state.editingId = expense.id;
  els.amount.value =
    currencyDigits() === 0
      ? String(Math.round(expense.amountCents / 100))
      : (expense.amountCents / 100).toFixed(2).replace('.', ',');
  els.category.value = expense.category;
  els.date.value = expense.date;
  els.description.value = expense.description ?? '';
  els.formTitle.textContent = 'Editar gasto';
  els.submitBtn.textContent = 'Guardar cambios';
  els.cancelBtn.hidden = false;

  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  els.amount.focus({ preventScroll: true });
}

function resetForm() {
  state.editingId = null;
  els.form.reset();
  els.date.value = todayISO();
  els.formTitle.textContent = 'Nuevo gasto';
  els.submitBtn.textContent = 'Añadir gasto';
  els.cancelBtn.hidden = true;
}

async function handleSubmit(event) {
  event.preventDefault();

  const amount = els.amount.value.trim();
  const category = els.category.value;
  const date = els.date.value;
  const description = els.description.value.trim();

  const parsedAmount = parseAmount(amount);
  if (!parsedAmount) {
    showToast(
      currencyDigits() === 0
        ? 'Introduce un importe en pesos enteros, por ejemplo 25000 o 25.000'
        : 'Introduce un importe válido, por ejemplo 12,50',
      'error',
    );
    els.amount.focus();
    return;
  }
  if (!category) {
    showToast('Elige una categoría', 'error');
    els.category.focus();
    return;
  }
  if (!date) {
    showToast('Elige una fecha', 'error');
    els.date.focus();
    return;
  }

  const editingId = state.editingId;
  const payload = { amount: parsedAmount.amount, category, date, description };

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = editingId ? 'Guardando…' : 'Añadiendo…';

  try {
    if (editingId) {
      await api(`/api/expenses/${encodeURIComponent(editingId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast('Gasto actualizado', 'success');
    } else {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Gasto añadido', 'success');
    }

    const savedMonth = date.slice(0, 7);
    resetForm();
    if (savedMonth && savedMonth !== state.month) state.month = savedMonth;
    await refreshAll();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = state.editingId ? 'Guardar cambios' : 'Añadir gasto';
  }
}

async function handleTableClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const expense = state.expenses.find((item) => item.id === button.dataset.id);
  if (!expense) return;

  if (button.dataset.action === 'edit') {
    startEdit(expense);
    return;
  }

  if (button.dataset.action === 'delete') {
    const confirmed = window.confirm(`¿Borrar el gasto de ${formatMoney(expense.amountCents)}?`);
    if (!confirmed) return;

    button.disabled = true;
    try {
      await api(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: 'DELETE' });
      if (state.editingId === expense.id) resetForm();
      showToast('Gasto borrado', 'success');
      await refreshAll();
    } catch (error) {
      button.disabled = false;
      showToast(error.message, 'error');
    }
  }
}

/* ---------- Sesión y copia de seguridad ---------- */

async function handleLogout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    // Aunque falle, volvemos al login.
  }
  window.location.replace('/login.html');
}

async function handleExport() {
  els.exportBtn.disabled = true;
  try {
    const response = await fetch('/api/export');
    if (response.status === 401) {
      redirectToLogin();
      return;
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error ?? `Error ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gastos-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Copia descargada', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    els.exportBtn.disabled = false;
  }
}

/* ---------- Inicialización ---------- */

function bindEvents() {
  els.form.addEventListener('submit', handleSubmit);
  els.cancelBtn.addEventListener('click', resetForm);
  els.tbody.addEventListener('click', handleTableClick);
  els.logoutBtn.addEventListener('click', handleLogout);
  els.exportBtn.addEventListener('click', handleExport);

  els.monthFilter.addEventListener('change', async () => {
    state.month = els.monthFilter.value;
    try {
      await refreshAll();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  els.categoryFilter.addEventListener('change', async () => {
    state.category = els.categoryFilter.value;
    try {
      await refreshExpenses();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.editingId) resetForm();
  });
}

async function boot() {
  els.date.value = todayISO();
  bindEvents();

  try {
    const me = await api('/api/me');
    state.user = me.user;
    els.currentUser.textContent = me.user.username;

    const meta = await api('/api/meta');
    state.categories = meta.categories ?? [];
    state.currency = meta.currency || 'COP';
    state.demo = meta.demo ?? null;
    renderDemoBanner();
    els.currencySymbol.textContent = currencySymbol(state.currency);
    els.amount.placeholder = currencyDigits() === 0 ? '25000' : '0,00';
    fillCategoryOptions();
    await refreshAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

boot();
