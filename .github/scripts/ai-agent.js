import Anthropic from '@anthropic-ai/sdk';
import { execSync, execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COMMAND = process.env.AI_COMMAND;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const REPLY_TO = process.env.REPLY_TO_MESSAGE_ID;

// БАГ #1 ФИХ: определяем функцию, которая использовалась, но отсутствовала
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// БАГ #7 ФИХ: try/catch чтобы ошибка sendTelegram не давала unhandled rejection
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          reply_to_message_id: REPLY_TO ? parseInt(REPLY_TO) : undefined,
        }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Telegram sendMessage failed:', err);
    }
  } catch (err) {
    console.error('Failed to reach Telegram API:', err.message);
  }
}

// БАГ #4 ФИХ: вспомогательная функция проверки пути
const REPO_ROOT = path.resolve('.');

function safeResolvePath(inputPath) {
  const resolved = path.resolve(REPO_ROOT, inputPath);
  if (!resolved.startsWith(REPO_ROOT + path.sep) && resolved !== REPO_ROOT) {
    return null; // path traversal
  }
  return resolved;
}

const tools = [
  {
    name: 'read_file',
    description: 'Прочитать содержимое файла из репозитория (только файлы внутри репо)',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Путь к файлу относительно корня репо' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Записать или обновить файл в репозитории (только src/, api/, public/)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Путь к файлу' },
        content: { type: 'string', description: 'Полное содержимое файла' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'Получить список JS/JSX файлов из src/ или api/',
    input_schema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Директория для поиска: "src" или "api"',
          enum: ['src', 'api'],
        },
      },
      required: ['directory'],
    },
  },
  {
    name: 'commit_and_push',
    description: 'Зафиксировать все изменения и запушить в репозиторий',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string', description: 'Сообщение коммита' } },
      required: ['message'],
    },
  },
];

const WRITE_ALLOWED_PREFIXES = ['src', 'api', 'public'];

function executeTool(name, input) {
  console.log(`[tool] ${name}`, JSON.stringify(input).substring(0, 200));

  switch (name) {
    case 'read_file': {
      // БАГ #4 ФИХ: проверяем что путь внутри репо
      const filePath = safeResolvePath(input.path);
      if (!filePath) return `ОТКАЗАНО: путь выходит за пределы репозитория`;
      if (!existsSync(filePath)) return `Файл не найден: ${input.path}`;
      const content = readFileSync(filePath, 'utf-8');
      // Ограничиваем размер чтобы не переполнить контекст
      if (content.length > 50000) {
        return content.substring(0, 50000) + '\n... [файл обрезан до 50000 символов]';
      }
      return content;
    }

    case 'write_file': {
      const normalized = path.normalize(input.path);
      const allowed = WRITE_ALLOWED_PREFIXES.some(
        (p) => normalized.startsWith(p + path.sep) || normalized.startsWith(p + '/')
      );
      if (!allowed) {
        return `ОТКАЗАНО: запись разрешена только в ${WRITE_ALLOWED_PREFIXES.join('/, ')+'/'}`;
      }
      const filePath = safeResolvePath(input.path);
      if (!filePath) return `ОТКАЗАНО: путь выходит за пределы репозитория`;
      writeFileSync(filePath, input.content, 'utf-8');
      return `Файл ${input.path} успешно записан`;
    }

    case 'list_files': {
      // БАГ #9 ФИХ: используем параметр directory
      const dir = ['src', 'api'].includes(input.directory) ? input.directory : 'src';
      try {
        const result = execSync(
          `find ${dir} -type f \\( -name "*.js" -o -name "*.jsx" \\) | sort | head -100`,
          { encoding: 'utf-8' }
        );
        return result || 'Файлы не найдены';
      } catch (e) {
        return `Ошибка поиска: ${e.message}`;
      }
    }

    case 'commit_and_push': {
      try {
        execSync('git add -A', { stdio: 'pipe' });
        const status = execSync('git status --short', { encoding: 'utf-8' });
        if (!status.trim()) return 'Нет изменений для коммита';

        // БАГ #3 ФИХ: execFileSync не передаёт аргументы через shell
        execFileSync('git', ['commit', '-m', input.message], { stdio: 'pipe' });
        execFileSync('git', ['push', 'origin', 'HEAD'], { stdio: 'pipe' });
        return `Успешно закоммичено: "${input.message}"`;
      } catch (e) {
        return `Ошибка git: ${e.stderr?.toString() || e.message}`;
      }
    }

    default:
      return `Неизвестный инструмент: ${name}`;
  }
}

async function runAgent() {
  if (!COMMAND) {
    await sendTelegram('❌ Агент: пустая команда');
    process.exit(1);
  }

  console.log(`Starting AI agent. Command: ${COMMAND}`);

  const messages = [
    {
      role: 'user',
      content: `Задача: ${COMMAND}

Ты — AI-агент, который редактирует React-приложение SweetSync (Point of Sale + Warehouse для цветочных и клубничных мастерских).
Репозиторий уже склонирован в текущей директории.
Используй инструменты для изучения кода, внесения изменений и коммита.
Сначала изучи структуру с помощью list_files, потом читай нужные файлы, вноси изменения, делай коммит.
После завершения напиши краткий отчёт: что именно было изменено и в каких файлах.`,
    },
  ];

  let finalMessage = null;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`[agent] iteration ${iterations}/${MAX_ITERATIONS}`);

    const response = await client.messages.create({
      // БАГ #6 ФИХ: актуальная модель
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4096,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      finalMessage = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        const result = executeTool(block.name, block.input);
        console.log(`[tool result] ${String(result).substring(0, 300)}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: String(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    } else {
      console.warn(`Unexpected stop_reason: ${response.stop_reason}`);
      break;
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    await sendTelegram(
      '⚠️ Агент: превышен лимит итераций (10). Проверьте репозиторий — изменения могли быть применены частично.'
    );
    process.exit(1);
  }

  const telegramReport = finalMessage
    ? `✅ <b>Задача выполнена</b>\n\n<i>"${escapeHtml(COMMAND)}"</i>\n\n${escapeHtml(finalMessage).substring(0, 3000)}`
    : `✅ <b>Задача выполнена:</b> <i>"${escapeHtml(COMMAND)}"</i>`;

  await sendTelegram(telegramReport);
  console.log('Agent completed successfully');
}

runAgent().catch(async (err) => {
  console.error('Agent fatal error:', err);
  await sendTelegram(`❌ Агент упал с ошибкой: ${escapeHtml(err.message)}`);
  process.exit(1);
});
