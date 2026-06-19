export default async function handler(req, res) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const VERCEL_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'vkusbuket.sweetsync.ru';

  if (!TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not set' });
  }

  const webhookUrl = `https://vkusbuket.sweetsync.ru/api/telegram-webhook`;
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
    const data = await response.json();
    return res.status(200).json({ success: true, url: webhookUrl, telegram_response: data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
