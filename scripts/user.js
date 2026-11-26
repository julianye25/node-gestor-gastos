import { createInterface } from 'node:readline/promises';
import {
  ConflictError,
  NotFoundError,
  normalizeUsername,
  usernameKey,
  validatePassword,
} from '../src/domain.js';
import { loadConfig } from '../src/config.js';
import { createMongoRepositories } from '../src/mongo.js';
import { hashPassword } from '../src/users.js';

try {
  process.loadEnvFile();
} catch {
  // .env es opcional aquí; si faltan variables, loadConfig lo indicará.
}

function usage() {
  console.log(`Uso: npm run user -- <comando> [usuario]

Comandos:
  list                 Lista las cuentas existentes
  add <usuario>        Crea una cuenta y pide la contraseña
  passwd <usuario>     Cambia la contraseña de una cuenta
  delete <usuario>     Borra la cuenta y todos sus gastos`);
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return rl.question(question).finally(() => rl.close());
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question(question).then(
        (answer) => {
          rl.close();
          resolve(answer);
        },
        (error) => {
          rl.close();
          reject(error);
        },
      );
      return;
    }

    stdout.write(question);
    let value = '';
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = () => {
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelado'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += char;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function readNewPassword() {
  const password = await askHidden('Contraseña: ');
  const confirmation = await askHidden('Repite la contraseña: ');
  if (password !== confirmation) {
    throw new Error('Las contraseñas no coinciden');
  }
  return validatePassword(password);
}

async function listUsers({ users }, config) {
  const all = await users.listAll();
  console.log(`Usuarios: ${all.length}/${config.maxUsers}`);
  for (const user of all) {
    console.log(`- ${user.username} (creado ${user.createdAt ?? 'sin fecha'})`);
  }
}

async function addUser({ users }, config, rawUsername) {
  if (!rawUsername) throw new Error('Uso: npm run user -- add <usuario>');

  const username = normalizeUsername(rawUsername);
  if ((await users.count()) >= config.maxUsers) {
    throw new Error(`Límite alcanzado: ya hay ${config.maxUsers} usuarios`);
  }

  const password = await readNewPassword();
  const passwordHash = await hashPassword(password);
  const user = await users.create({
    username,
    usernameLower: usernameKey(username),
    passwordHash,
  });

  console.log(`Usuario creado: ${user.username}`);
}

async function changePassword({ users }, rawUsername) {
  if (!rawUsername) throw new Error('Uso: npm run user -- passwd <usuario>');

  const username = normalizeUsername(rawUsername);
  const user = await users.findByUsernameLower(usernameKey(username));
  if (!user) throw new NotFoundError(`No existe el usuario "${username}"`);

  const password = await readNewPassword();
  await users.setPassword(user.id, await hashPassword(password));
  console.log(`Contraseña actualizada: ${user.username}`);
}

async function deleteUser({ users, expenses }, rawUsername) {
  if (!rawUsername) throw new Error('Uso: npm run user -- delete <usuario>');

  const username = normalizeUsername(rawUsername);
  const user = await users.findByUsernameLower(usernameKey(username));
  if (!user) throw new NotFoundError(`No existe el usuario "${username}"`);

  const answer = await ask(`¿Borrar "${user.username}" y todos sus gastos? (s/N): `);
  if (!/^s[ií]?$/i.test(answer.trim())) {
    console.log('Cancelado');
    return;
  }

  const deletedExpenses = await expenses.removeAllByOwner(user.id);
  await users.remove(user.id);
  console.log(`Usuario borrado: ${user.username} (${deletedExpenses} gastos eliminados)`);
}

async function main() {
  const command = process.argv[2];
  if (!command || ['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }

  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    console.error(`[config] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (!config.mongo.uri) {
    console.error('[config] Falta MONGODB_URI. Copia .env.example a .env y configúralo.');
    process.exitCode = 1;
    return;
  }

  const repositories = createMongoRepositories(config.mongo);

  try {
    switch (command) {
      case 'list':
        await listUsers(repositories, config);
        break;
      case 'add':
        await addUser(repositories, config, process.argv[3]);
        break;
      case 'passwd':
        await changePassword(repositories, process.argv[3]);
        break;
      case 'delete':
        await deleteUser(repositories, process.argv[3]);
        break;
      default:
        usage();
        process.exitCode = 1;
    }
  } catch (error) {
    const known = error instanceof ConflictError || error instanceof NotFoundError;
    if (known || error?.statusCode === 400 || !error?.statusCode) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('[error]', error);
    }
    process.exitCode = 1;
  } finally {
    await repositories.close().catch(() => {});
  }
}

main();
