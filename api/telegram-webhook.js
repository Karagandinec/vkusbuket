const MAX_COMMAND_LENGTH = 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not configured');
    return res.status(500).end();
  }
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (incomingSecret !== secretToken) {
    console.warn('Invalid webhook secret token');
    return res.status(403).end();
  }

  try {
    const update = req.body;

    if (!update?.message?.text) {
      return res.status(200).json({ status: 'ignored' });
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const messageId = update.message.message_id;

    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    // Проверяем наличие обязательных env в начале
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
      return res.status(500).end();
    }

    if (chatId !== TELEGRAM_CHAT_ID) {
      console.warn('Unauthorized chat attempt:', chatId);
      return res.status(200).json({ status: 'unauthorized' });
    }

    if (text.startsWith('/ai ') || text === '/ai') {
      const command = text.substring(4).trim();

      if (!command) {
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          '❌ Пустая команда. Напишите: <code>/ai добавь кнопку</code>',
          messageId
        );
        return res.status(200).json({ status: 'empty_command' });
      }

      // БАГ #4 ФИХ: лимит длины
      if (command.length > MAX_COMMAND_LENGTH) {
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          `❌ Команда слишком длинная (максимум ${MAX_COMMAND_LENGTH} символов).`,
          messageId
        );
        return res.status(200).json({ status: 'command_too_long' });
      }

      if (!GITHUB_TOKEN) {
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          '❌ Ошибка конфигурации: GITHUB_TOKEN не настроен.',
          messageId
        );
        return res.status(200).json({ status: 'no_github_token' });
      }

      // БАГ #2 ФИХ: экранируем пользовательский ввод для HTML
      await sendMessage(
        TELEGRAM_BOT_TOKEN, chatId,
        `🤖 <b>Принял задачу:</b> <i>"${escapeHtml(command)}"</i>\n\nРазворачиваю облачного агента. Ожидайте...`,
        messageId
      );

      const ghResponse = await fetch(
        'https://api.github.com/repos/Karagandinec/vkusbuket/dispatches',
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'chatops',
            client_payload: {
              command: command,
              chat_id: chatId,
              message_id: messageId,
            },
          }),
        }
      );

      // БАГ #3 ФИХ: не показываем сырой ответ GitHub пользователю
      if (!ghResponse.ok) {
        const errText = await ghResponse.text().catch(() => '');
        console.error('GitHub Dispatch Failed:', ghResponse.status, errText);
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          `❌ Не удалось запустить агента (ошибка ${ghResponse.status}). Проверьте логи.`,
          messageId
        );
      }
    }

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook Error:', error);
    // Возвращаем 200, чтобы Telegram не повторял запрос
    return res.status(200).json({ status: 'error' });
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMessage(token, chatId, text, replyToMessageId) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_to_message_id: replyToMessageId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Telegram sendMessage failed:', err);
    }
  } catch (err) {
    console.error('Failed to send telegram message:', err);
  }
}
