const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://app.sweetsync.ru',
  'https://vkusbuket.sweetsync.ru',
  'https://sweetsync-demo.vercel.app',
  'https://vkusbuket.vercel.app'
];
const MAX_MESSAGE_LENGTH = 2000;
const OPENAI_TIMEOUT_MS = 25000;

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1]
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // ── 1. Валидация входа ────────────────────────────────────────────────
    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message too long' });
    }

    // ── 2. Проверка ключа до отправки запроса ────────────────────────────
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const systemPrompt = `Вы — AI-ассистент VkusBuket/SweetSync (POS + склад для цветочных и клубничных мастерских).
Отвечай кратко и по существу на русском языке.
ОБЯЗАТЕЛЬНО верни JSON с ключами:
- "answer": строка в markdown
- "selector": null или CSS-селектор элемента для подсветки`;

    // ── 3. Fetch с AbortController ────────────────────────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    let openAiRes;
    try {
      openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
          max_tokens: 500,
        }),
      });
    } catch (fetchErr) {
      // ── 4. AbortError перехватываем отдельно — возвращаем 408 ──────────
      if (fetchErr.name === 'AbortError') {
        console.error('OpenAI request timed out');
        return res.status(408).json({
          answer: 'AI-сервис не ответил вовремя. Попробуйте ещё раз.',
          selector: null,
        });
      }
      throw fetchErr; // Остальные ошибки сети — пробрасываем в общий catch
    } finally {
      clearTimeout(timeout);
    }

    if (!openAiRes.ok) {
      const errData = await openAiRes.json().catch(() => ({}));
      console.error('OpenAI API error:', openAiRes.status, errData);
      return res.status(502).json({
        answer: 'Сервис временно недоступен. Попробуйте позже.',
        selector: null,
      });
    }

    const aiData = await openAiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content;

    // ── 5. Защита от null/undefined перед JSON.parse ──────────────────────
    if (!rawContent || typeof rawContent !== 'string') {
      console.error('OpenAI returned empty content:', JSON.stringify(aiData));
      return res.status(200).json({
        answer: 'Не удалось получить ответ от AI. Попробуйте ещё раз.',
        selector: null,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      console.warn('Failed to parse OpenAI JSON, using raw text:', rawContent.substring(0, 100));
      parsed = null;
    }

    // ── 6. Нормализация результата — всегда возвращаем валидную структуру ─
    return res.status(200).json({
      answer:
        parsed && typeof parsed.answer === 'string'
          ? parsed.answer
          : rawContent, // fallback: показываем сырой текст если это хотя бы строка
      selector:
        parsed && typeof parsed.selector === 'string'
          ? parsed.selector
          : null,
    });

  } catch (error) {
    // ── 7. Логируем все необработанные ошибки ────────────────────────────
    console.error('Support-bot unhandled error:', error);
    return res.status(500).json({
      answer: 'Произошла внутренняя ошибка. Пожалуйста, попробуйте позже.',
      selector: null,
    });
  }
}
