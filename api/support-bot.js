const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://app.sweetsync.ru',
  'https://vkusbuket.sweetsync.ru',
  'https://sweetsync-demo.vercel.app',
  'https://vkusbuket.vercel.app'
];
const MAX_MESSAGE_LENGTH = 2000;

export default async function handler(req, res) {
  // CORS
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
    const { message } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'No message provided' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const instructions = `Вы — AI-ассистент в приложении VkusBuket/SweetSync (POS + склад для цветочных и клубничных мастерских).
Отвечай вежливо, по существу, на русском языке.
Ты ОБЯЗАН вернуть ответ строго в формате JSON со следующими ключами:
- "answer": строка с ответом в markdown
- "selector": null, или CSS-селектор элемента интерфейса, который стоит подсветить (если применимо)
Пример: {"answer": "Нажмите кнопку 'Новая продажа'", "selector": ".btn-new-sale"}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25с < Vercel 30с лимит

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
        // ГЛАВНЫЙ ФИХ: принудительный JSON-режим
        response_format: { type: 'json_object' },
        max_tokens: 500,
      }),
    }).finally(() => clearTimeout(timeout));

    // ГЛАВНЫЙ ФИХ: проверяем статус ответа OpenAI
    if (!openAiRes.ok) {
      const errData = await openAiRes.json().catch(() => ({}));
      console.error('OpenAI API error:', openAiRes.status, errData);
      return res.status(502).json({
        error: 'AI service error',
        details: errData?.error?.message || String(openAiRes.status),
      });
    }

    const aiData = await openAiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content;

    if (!rawContent) {
      console.error('OpenAI returned empty content:', aiData);
      return res.status(200).json({
        answer: 'Не удалось получить ответ от AI. Попробуйте ещё раз.',
        selector: null,
      });
    }

    // С response_format: json_object этот блок — запасной парашют
    let result;
    try {
      result = JSON.parse(rawContent);
    } catch (e) {
      console.warn('Failed to parse OpenAI JSON, falling back to raw text');
      result = { answer: rawContent, selector: null };
    }

    // Валидируем структуру результата
    return res.status(200).json({
      answer: typeof result?.answer === 'string'
        ? result.answer
        : 'Не удалось сформулировать ответ.',
      selector: typeof result?.selector === 'string' ? result.selector : null,
    });

  } catch (error) {
    console.error('Support-bot unhandled error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
