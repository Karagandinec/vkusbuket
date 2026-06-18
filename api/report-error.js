export default async function handler(req, res) {
  // CORS: mirror the request origin only if it's in the allowlist (wildcard + credentials is invalid)
  const origin = req.headers.origin || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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
    const { error_message, error_stack, component_stack, url } = req.body || {};
    
    console.error("App Error Reported:", error_message);

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      const message = `
🚨 <b>VkusBuket Crash Report</b> 🚨
<b>URL:</b> ${url || 'Unknown'}

<b>Error:</b>
<pre>${(error_message || 'No message').substring(0, 500)}</pre>

<b>Component Stack:</b>
<pre>${(component_stack || '').substring(0, 500)}...</pre>
      `;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML"
        })
      });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    if (GITHUB_TOKEN) {
      await fetch("https://api.github.com/repos/Karagandinec/vkusbuket/dispatches", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          event_type: "crash_report",
          client_payload: {
            error_message: error_message || 'Unknown error',
            error_stack: error_stack || '',
            url: url || ''
          }
        })
      }).catch(err => console.error("Failed to trigger GH Action:", err));
    }

    res.status(200).json({ success: true, message: "Error reported to AI Engineer team." });
  } catch (error) {
    console.error("Failed to report error:", error);
    res.status(500).json({ error: error.message });
  }
}
