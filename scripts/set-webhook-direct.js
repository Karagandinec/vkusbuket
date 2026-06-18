const token = '8816918861:AAF3G0alBgWD-Cw_TfpK7ST7ya_muoNTUxc';
const url = 'https://vkusweb.vercel.app/api/telegram-webhook';
fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}`)
  .then(r => r.json())
  .then(data => console.log(data))
  .catch(err => console.error(err));
