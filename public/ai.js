const form = document.querySelector("#ai-form");
const input = document.querySelector("#ai-input");
const output = document.querySelector("#ai-output");
const status = document.querySelector("#ai-status");
const sendButton = document.querySelector("#ai-send");
let history = [];

function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = `chat-message ${role}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "You" : "AI";
  const text = document.createElement("p");
  text.textContent = content;
  article.append(label, text);
  output.append(article);
  output.scrollTop = output.scrollHeight;
}

async function checkProvider() {
  try {
    const response = await fetch("/api/ai/providers");
    const data = await response.json();
    status.textContent = data.providers?.[0]?.configured
      ? `Provider configured · ${data.providers[0].model}`
      : "AI is disabled. Configure a server-side cloud key or a localhost-compatible model endpoint, then set AI_API_ENABLED=true.";
  } catch {
    status.textContent = "AI provider status unavailable.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || sendButton.disabled) return;
  history.push({ role: "user", content });
  addMessage("user", content);
  input.value = "";
  sendButton.disabled = true;
  status.textContent = "Waiting for the configured AI provider…";
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ messages: history })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI request failed");
    history.push({ role: "assistant", content: data.content });
    addMessage("assistant", data.content);
    status.textContent = `Response from ${data.model}`;
  } catch (error) {
    history.pop();
    status.textContent = error.message;
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
});

checkProvider();
