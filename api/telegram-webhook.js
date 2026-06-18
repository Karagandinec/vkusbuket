const MAX_COMMAND_LENGTH = 1000;
const GITHUB_DISPATCH_TIMEOUT_MS = 8000;
const TELEGRAM_SEND_TIMEOUT_MS = 5000;

// In-memory дедупликация (сбрасывается при cold start).
// Для продакшена замените на Supabase:
//   await supabase.from('processed_tg_updates').insert({ update_id: updateId })
//   .then проверку на conflict
const processedUpdates = new Set();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── 1. Проверка секрета (fail-closed) ────────────────────────────────────
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken) {
    // Если переменная не настроена — блокируем все запросы
    console.error('TELEGRAM_WEBHOOK_SECRET is not configured');
    return res.status(500).end();
  }
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (incomingSecret !== secretToken) {
    console.warn('Invalid webhook secret');
    return res.status(403).end();
  }

  try {
    const update = req.body;
    if (!update?.message?.text) {
      return res.status(200).json({ status: 'ignored' });
    }

    // ── 2. Идемпотентность по update_id ──────────────────────────────────
    // Telegram гарантирует уникальность update_id для каждого события.
    const updateId = update.update_id;
    if (processedUpdates.has(updateId)) {
      console.warn('Duplicate update_id, ignoring:', updateId);
      return res.status(200).json({ status: 'duplicate' });
    }
    processedUpdates.add(updateId);
    // Чистим старые записи чтобы не раздувать память
    if (processedUpdates.size > 500) {
      const first = processedUpdates.values().next().value;
      processedUpdates.delete(first);
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const messageId = update.message.message_id;

    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    // Проверяем обязательные переменные
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
      return res.status(500).end();
    }

    if (chatId !== TELEGRAM_CHAT_ID) {
      return res.status(200).json({ status: 'unauthorized' });
    }

    if (text.startsWith('/ai ') || text === '/ai') {
      const command = text.substring(4).trim();

      if (!command) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Пустая команда.', messageId);
        return res.status(200).json({ status: 'empty_command' });
      }
      if (command.length > MAX_COMMAND_LENGTH) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Команда слишком длинная.', messageId);
        return res.status(200).json({ status: 'command_too_long' });
      }
      // ── 3. Проверка GITHUB_TOKEN перед использованием ─────────────────
      if (!GITHUB_TOKEN) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ GITHUB_TOKEN не настроен.', messageId);
        return res.status(200).json({ status: 'no_github_token' });
      }

      await sendMessage(
        TELEGRAM_BOT_TOKEN, chatId,
        `🤖 <b>Принял задачу:</b> <i>"${escapeHtml(command)}"</i>\n\nРазворачиваю агента...`,
        messageId
      );

      // ── 4. Таймаут на GitHub dispatch ─────────────────────────────────
      const ghController = new AbortController();
      const ghTimeout = setTimeout(
        () => ghController.abort(),
        GITHUB_DISPATCH_TIMEOUT_MS
      );

      try {
        const ghResponse = await fetch(
          'https://api.github.com/repos/Karagandinec/vkusbuket/dispatches',
          {
            method: 'POST',
            signal: ghController.signal,
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `token ${GITHUB_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event_type: 'chatops',
              client_payload: { command, chat_id: chatId, message_id: messageId },
            }),
          }
        );

        if (!ghResponse.ok) {
          const errText = await ghResponse.text().catch(() => '');
          console.error('GitHub Dispatch Failed:', ghResponse.status, errText);
          await sendMessage(
            TELEGRAM_BOT_TOKEN, chatId,
            `❌ Не удалось запустить агента (${ghResponse.status}).`,
            messageId
          );
        }
      } catch (ghErr) {
        const isTimeout = ghErr.name === 'AbortError';
        console.error(isTimeout ? 'GitHub dispatch timed out' : 'GitHub dispatch error:', ghErr);
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          isTimeout
            ? '⏱ GitHub не ответил вовремя. Проверьте Actions вручную.'
            : '❌ Ошибка соединения с GitHub.',
          messageId
        );
      } finally {
        clearTimeout(ghTimeout);
      }
    }

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook unhandled error:', error);
    return res.status(200).json({ status: 'error' }); // 200 — Telegram не ретраит
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMessage(token, chatId, text, replyToMessageId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text,
        parse_mode: 'HTML',
        reply_to_message_id: replyToMessageId,
      }),
    });
    if (!res.ok) {
      console.error('Telegram sendMessage failed:', await res.json().catch(() => ({})));
    }
  } catch (err) {
    console.error('sendMessage error:', err.name === 'AbortError' ? 'timeout' : err);
  } finally {
    clearTimeout(timeout);
  }
}
