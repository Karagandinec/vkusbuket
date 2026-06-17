export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { message } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const instructions = `
Вы — умный AI-ассистент в приложении VkusBuket/SweetSync.
Отвечай на вопросы пользователя вежливо и коротко.
Верните ответ в формате JSON с ключами:
1) "answer" (ответ текстом в markdown)
2) "selector" (null или CSS-селектор для подсветки элемента, если нужно)
`;

    const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: message }
        ],
        temperature: 0.3
      })
    });

    const aiData = await openAiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '{}';
    
    let result = { answer: "Я не смог сформулировать ответ.", selector: null };
    try {
      // In case OpenAI returns markdown wrapped JSON:
      let cleanContent = rawContent;
      if (cleanContent.startsWith("\`\`\`json")) {
        cleanContent = cleanContent.replace(/^\`\`\`json/, "").replace(/\`\`\`$/, "").trim();
      }
      result = JSON.parse(cleanContent);
    } catch (e) {
      result.answer = rawContent;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in support-bot api:", error);
    res.status(500).json({ error: error.message });
  }
}
