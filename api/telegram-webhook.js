const MAX_COMMAND_LENGTH = 1000;
const GITHUB_DISPATCH_TIMEOUT_MS = 8000;
const TELEGRAM_SEND_TIMEOUT_MS = 5000;
const OPENAI_TIMEOUT_MS = 25000;

// In-memory дедупликация (сбрасывается при cold start).
const processedUpdates = new Set();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
  
  if (secretToken && incomingSecret !== secretToken) {
    console.warn('Invalid webhook secret');
    return res.status(403).end();
  }
  if (!secretToken) {
    console.warn('TELEGRAM_WEBHOOK_SECRET is not configured, running without validation');
  }

  try {
    const update = req.body;
    if (!update?.message?.text) {
      return res.status(200).json({ status: 'ignored' });
    }

    // 2. Идемпотентность по update_id
    const updateId = update.update_id;
    if (processedUpdates.has(updateId)) {
      console.warn('Duplicate update_id, ignoring:', updateId);
      return res.status(200).json({ status: 'duplicate' });
    }
    processedUpdates.add(updateId);
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
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
      return res.status(500).end();
    }

    if (chatId !== TELEGRAM_CHAT_ID) {
      return res.status(200).json({ status: 'unauthorized' });
    }

    if (text.length > MAX_COMMAND_LENGTH) {
      await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Сообщение слишком длинное.', messageId);
      return res.status(200).json({ status: 'command_too_long' });
    }

    // Если команда начинается с /ai, то это ChatOps команда для GitHub Actions
    if (text.startsWith('/ai ') || text === '/ai') {
      const command = text.substring(4).trim();

      if (!command) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Пустая команда.', messageId);
        return res.status(200).json({ status: 'empty_command' });
      }
      if (!GITHUB_TOKEN) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ GITHUB_TOKEN не настроен.', messageId);
        return res.status(200).json({ status: 'no_github_token' });
      }

      await sendMessage(
        TELEGRAM_BOT_TOKEN, chatId,
        `🤖 <b>Принял задачу:</b> <i>"${escapeHtml(command)}"</i>\n\nРазворачиваю агента...`,
        messageId
      );

      const ghController = new AbortController();
      const ghTimeout = setTimeout(() => ghController.abort(), GITHUB_DISPATCH_TIMEOUT_MS);

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
          await sendMessage(TELEGRAM_BOT_TOKEN, chatId, `❌ Не удалось запустить агента (${ghResponse.status}).`, messageId);
        }
      } catch (ghErr) {
        const isTimeout = ghErr.name === 'AbortError';
        console.error(isTimeout ? 'GitHub dispatch timed out' : 'GitHub dispatch error:', ghErr);
        await sendMessage(
          TELEGRAM_BOT_TOKEN, chatId,
          isTimeout ? '⏱ GitHub не ответил вовремя. Проверьте Actions вручную.' : '❌ Ошибка соединения с GitHub.',
          messageId
        );
      } finally {
        clearTimeout(ghTimeout);
      }
    } 
    // Иначе это обычный вопрос к Support Bot (OpenAI)
    else {
      if (!OPENAI_API_KEY) {
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ OPENAI_API_KEY не настроен.', messageId);
        return res.status(200).json({ status: 'no_openai_key' });
      }

      const systemPrompt = `Вы — AI-ассистент VkusBuket/SweetSync (POS + склад для цветочных и клубничных мастерских).
Отвечай кратко, вежливо и по существу на русском языке. Форматируй текст жирным или курсивом для читаемости.`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), OPENAI_TIMEOUT_MS);

      try {
        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: aiController.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }),
        });

        if (!openAiRes.ok) {
          console.error('OpenAI API error:', openAiRes.status);
          await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Сервис временно недоступен. Попробуйте позже.', messageId);
        } else {
          const aiData = await openAiRes.json();
          const answer = aiData.choices?.[0]?.message?.content || 'Не удалось получить ответ.';
          await sendMessage(TELEGRAM_BOT_TOKEN, chatId, escapeHtml(answer).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>').replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>'), messageId);
        }
      } catch (aiErr) {
        if (aiErr.name === 'AbortError') {
          await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '⏱ AI-сервис не ответил вовремя.', messageId);
        } else {
          console.error('OpenAI fetch error:', aiErr);
          await sendMessage(TELEGRAM_BOT_TOKEN, chatId, '❌ Внутренняя ошибка AI.', messageId);
        }
      } finally {
        clearTimeout(aiTimeout);
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
