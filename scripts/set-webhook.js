const fs = require('fs');
const env = fs.readFileSync('.env.production', 'utf8');
const tokenMatch = env.match(/TELEGRAM_BOT_TOKEN=(.+)/);
if (tokenMatch) {
  let token = tokenMatch[1].trim();
  if (token.startsWith('"') || token.startsWith("'")) token = token.slice(1, -1);
  const url = 'https://vkusweb.vercel.app/api/telegram-webhook';
  fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`)
    .then(r => r.json())
    .then(data => console.log(data))
    .catch(err => console.error(err));
} else {
  console.error('Token not found');
}
