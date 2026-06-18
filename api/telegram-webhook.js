export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const update = req.body;
    
    // Ignore updates that are not messages
    if (!update || !update.message || !update.message.text) {
      return res.status(200).json({ status: "ignored" });
    }

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const messageId = update.message.message_id;

    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    // Security check: Only listen to the authorized chat
    if (chatId !== TELEGRAM_CHAT_ID) {
      console.warn("Unauthorized chat attempt:", chatId);
      return res.status(200).json({ status: "unauthorized" }); // Return 200 so Telegram doesn't retry
    }

    // Check if it's an AI command
    if (text.startsWith("/ai ")) {
      const command = text.substring(4).trim();
      
      if (!command) {
         // Empty command
         await sendMessage(TELEGRAM_BOT_TOKEN, chatId, "❌ Пустая команда. Напишите: `/ai добавь кнопку`", messageId);
         return res.status(200).json({ status: "empty_command" });
      }

      if (!GITHUB_TOKEN) {
         await sendMessage(TELEGRAM_BOT_TOKEN, chatId, "❌ Ошибка: не настроен GITHUB_TOKEN.", messageId);
         return res.status(200).json({ status: "no_github_token" });
      }

      // 1. Notify user that agent is starting
      await sendMessage(
        TELEGRAM_BOT_TOKEN, 
        chatId, 
        `🤖 <b>Принял задачу:</b> <i>"${command}"</i>\n\nРазворачиваю облачного агента. Ожидайте...`, 
        messageId
      );

      // 2. Trigger GitHub Action
      const ghResponse = await fetch("https://api.github.com/repos/Karagandinec/vkusbuket/dispatches", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Authorization": `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          event_type: "chatops",
          client_payload: {
            command: command,
            message_id: messageId
          }
        })
      });

      if (!ghResponse.ok) {
        const errText = await ghResponse.text();
        console.error("GitHub Dispatch Failed:", errText);
        await sendMessage(TELEGRAM_BOT_TOKEN, chatId, `❌ Ошибка запуска GitHub Action: ${ghResponse.status} ${errText}`, messageId);
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function sendMessage(token, chatId, text, replyToMessageId) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        reply_to_message_id: replyToMessageId
      })
    });
  } catch (err) {
    console.error("Failed to send telegram message:", err);
  }
}
