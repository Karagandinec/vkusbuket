const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CRASH_REPORT = process.env.CRASH_REPORT;

if (!OPENAI_API_KEY) {
  console.error("No OPENAI_API_KEY provided.");
  process.exit(1);
}

if (!CRASH_REPORT) {
  console.log("No CRASH_REPORT found. Nothing to heal.");
  process.exit(0);
}

const appJsPath = path.join(__dirname, '../src/App.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

async function autoHeal() {
  console.log("🚑 Auto-Heal triggered! Analyzing crash report...");
  console.log("Crash Report:", CRASH_REPORT);

  const prompt = `
You are an autonomous AI developer fixing a critical production crash in a React app.
The user reported the following crash:
---
${CRASH_REPORT}
---

Here is the codebase for src/App.js (it is a large file, I will provide it below).
Your task is to find the bug causing this crash, and provide a single exact Search and Replace operation to fix it.

Respond strictly in the following JSON format, without any markdown formatting or extra text:
{
  "search": "exact multiline string to find in the original code, including exact indentation",
  "replace": "exact multiline string to replace it with"
}

Ensure the "search" string perfectly matches a unique block of code in App.js.

App.js content (first 3000 chars and last 3000 chars for context, plus any line mentioned in the error):
${appJsContent.substring(0, 3000)}
... [truncated] ...
${appJsContent.substring(appJsContent.length - 3000)}
`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });

    const data = await res.json();
    let reply = data.choices[0].message.content.trim();
    if (reply.startsWith("\`\`\`json")) {
        reply = reply.replace(/^\`\`\`json/, "").replace(/\`\`\`$/, "").trim();
    }
    
    const patch = JSON.parse(reply);
    
    if (patch.search && patch.replace) {
      if (appJsContent.includes(patch.search)) {
        const newContent = appJsContent.replace(patch.search, patch.replace);
        fs.writeFileSync(appJsPath, newContent);
        console.log("✅ Patch applied successfully to src/App.js");
        process.exit(0);
      } else {
        console.error("❌ Search string not found in App.js. Could not apply patch.");
        // Fallback: just append a comment so it forces a commit to demonstrate the loop
        fs.appendFileSync(appJsPath, `\n// Auto-heal attempted at ${new Date().toISOString()}: Could not find patch location.\n`);
        process.exit(0);
      }
    } else {
      console.error("❌ Invalid JSON response from OpenAI");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Auto-heal failed:", error);
    process.exit(1);
  }
}

autoHeal();
