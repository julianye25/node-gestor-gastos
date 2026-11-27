/**
 * Utilidades del modo demo: datos de ejemplo, limpieza de cuentas caducadas
 * y rotación de la cuenta demo más antigua cuando el cupo está lleno.
 */

const DEMO_TEMPLATES = [
  { daysAgo: 1, amount: 32_000, category: 'Comida', description: 'Mercado semanal' },
  { daysAgo: 2, amount: 12_000, category: 'Transporte', description: 'Taxi al trabajo' },
  { daysAgo: 3, amount: 9_500, category: 'Comida', description: 'Café y pan' },
  { daysAgo: 5, amount: 1_200_000, category: 'Vivienda', description: 'Arriendo' },
  { daysAgo: 7, amount: 45_000, category: 'Ocio', description: 'Cine' },
  { daysAgo: 10, amount: 28_000, category: 'Salud', description: 'Farmacia' },
  { daysAgo: 13, amount: 80_000, category: 'Otros', description: 'Internet' },
  { daysAgo: 16, amount: 22_000, category: 'Comida', description: 'Almuerzo' },
  { daysAgo: 20, amount: 15_000, category: 'Transporte', description: 'Bus' },
  { daysAgo: 25, amount: 65_000, category: 'Comida', description: 'Supermercado' },
  { daysAgo: 32, amount: 1_200_000, category: 'Vivienda', description: 'Arriendo mes anterior' },
  { daysAgo: 38, amount: 18_000, category: 'Ocio', description: 'Streaming' },
  { daysAgo: 45, amount: 37_000, category: 'Salud', description: 'Consulta médica' },
  { daysAgo: 52, amount: 26_000, category: 'Otros', description: 'Recarga celular' },
];

function isoDaysAgo(now, days) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildDemoExpenses(now = new Date()) {
  return DEMO_TEMPLATES.map(({ daysAgo, amount, category, description }) => ({
    amount,
    category,
    date: isoDaysAgo(now, daysAgo),
    description,
  }));
}

export async function seedDemoExpenses({ expenses, ownerId, now = new Date() }) {
  const items = buildDemoExpenses(now);

  if (typeof expenses.createMany === 'function') {
    await expenses.createMany(ownerId, items);
  } else {
    for (const item of items) {
      await expenses.create(ownerId, item);
    }
  }

  return items.length;
}

export async function cleanupExpiredDemoUsers({ users, now = new Date() }) {
  if (typeof users.removeExpiredDemo !== 'function') return 0;
  return users.removeExpiredDemo(now);
}

export async function rotateOldestDemoUser({ users }) {
  if (typeof users.removeOldestDemo !== 'function') return null;
  return users.removeOldestDemo();
}

/**
 * Ejecuta la limpieza al arrancar y cada `intervalMs`. El temporizador no
 * mantiene vivo el proceso por sí solo.
 */
export function startDemoCleanup({
  users,
  intervalMs = 60 * 60 * 1_000,
  now = () => new Date(),
  logger = console,
}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const removed = await cleanupExpiredDemoUsers({ users, now: now() });
      if (removed > 0) logger.log(`[demo] cuentas eliminadas: ${removed}`);
    } catch (error) {
      logger.error('[demo] error en la limpieza:', error.message);
    } finally {
      running = false;
    }
  }

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
