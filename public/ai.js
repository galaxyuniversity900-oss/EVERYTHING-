const form = document.querySelector("#ai-form");
const input = document.querySelector("#ai-input");
const output = document.querySelector("#ai-output");
const status = document.querySelector("#ai-status");
const sendButton = document.querySelector("#ai-send");
const providerSelect = document.querySelector("#ai-provider");
const taskSelect = document.querySelector("#ai-task");
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

function trimHistory() {
  history = history.slice(-40);
  let size = history.reduce((sum, message) => sum + message.content.length, 0);
  while (history.length > 2 && size > 60_000) {
    size -= history.shift().content.length;
  }
}

function requestContext(task) {
  let messages = history.slice(-40);
  const request = () => {
    const body = { messages, task };
    if (providerSelect.value) body.providerId = providerSelect.value;
    return body;
  };
  while (messages.length > 1 && new TextEncoder().encode(JSON.stringify(request())).length > 36 * 1024) {
    messages = messages.slice(1);
  }
  return request();
}

async function checkProvider() {
  try {
    const response = await fetch("/api/ai/providers");
    const data = await response.json();
    providerSelect.replaceChildren();
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = `Auto route${data.defaultProviderId ? ` · default: ${data.defaultProviderId}` : ""}`;
    providerSelect.append(auto);
    const configured = (data.providers || []).filter((provider) => provider.configured);
    for (const provider of configured) {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = `${provider.name} · ${provider.model}${provider.local ? " · local" : ""}`;
      providerSelect.append(option);
    }
    providerSelect.disabled = configured.length === 0;
    taskSelect.disabled = configured.length === 0;
    sendButton.disabled = configured.length === 0;
    if (configured.length) {
      status.textContent = `${configured.length} AI provider(s) ready. ${data.fallbackEnabled ? "Automatic fallback is enabled." : "Automatic fallback is off."}`;
    } else {
      status.textContent = data.configurationError || "AI is disabled. Configure a cloud provider key or a localhost-compatible model endpoint, then set AI_API_ENABLED=true.";
    }
  } catch {
    status.textContent = "AI provider status unavailable.";
    sendButton.disabled = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || sendButton.disabled) return;
  history.push({ role: "user", content });
  trimHistory();
  addMessage("user", content);
  input.value = "";
  sendButton.disabled = true;
  status.textContent = "Waiting for the selected AI route…";
  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(requestContext(taskSelect.value))
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "AI request failed");
    history.push({ role: "assistant", content: data.content });
    trimHistory();
    addMessage("assistant", data.content);
    status.textContent = `Response from ${data.providerName || data.providerId} · ${data.model}`;
  } catch (error) {
    if (history.at(-1)?.role === "user") history.pop();
    status.textContent = error.message;
  } finally {
    sendButton.disabled = providerSelect.options.length < 2;
    input.focus();
  }
});

checkProvider();
