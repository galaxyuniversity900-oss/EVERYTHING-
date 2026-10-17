const overlay = document.querySelector("#auth-overlay");
const form = document.querySelector("#auth-form");
const passwordInput = document.querySelector("#auth-password");
const statusNode = document.querySelector("#auth-status");
const logoutButton = document.querySelector("#auth-logout");

async function refreshAuthState() {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    const data = await response.json();
    const locked = data.required && !data.authenticated;
    overlay.hidden = !locked;
    document.body.classList.toggle("auth-locked", locked);
    logoutButton.hidden = !(data.required && data.authenticated);
    if (locked) {
      statusNode.textContent = "Enter the server access password to continue.";
      passwordInput.focus();
    }
  } catch {
    overlay.hidden = false;
    document.body.classList.add("auth-locked");
    statusNode.textContent = "Cannot verify sign-in status. Check that the server is running.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!password) return;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  statusNode.textContent = "Signing in…";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Sign-in failed.");
    passwordInput.value = "";
    location.reload();
  } catch (error) {
    statusNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  if (!window.confirm("Sign out of this workspace on this browser?")) return;
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { accept: "application/json" } });
  } finally {
    location.reload();
  }
});

refreshAuthState();
