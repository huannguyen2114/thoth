// The Serve on LAN window. Talks only to the shell's lan_* commands (src-tauri/src/lib.rs).
const { invoke } = window.__TAURI__.core;
const MIN = 8;

const $ = (id) => document.getElementById(id);
const form = $("start");
const input = $("passcode");
const go = $("go");
const error = $("error");

function show(info) {
  const running = Boolean(info && info.event === "lan-started");
  form.hidden = running;
  $("running").hidden = !running;
  if (!running) {
    input.focus();
    return;
  }
  $("port").textContent = String(info.port);
  const list = $("urls");
  list.replaceChildren();
  for (const u of info.urls ?? []) {
    const li = document.createElement("li");
    li.textContent = `${u.url}${u.tailscale ? "  (Tailscale)" : `  (${u.name})`}`;
    list.append(li);
  }
  if (!info.urls?.length) {
    const li = document.createElement("li");
    li.textContent = "No network found. Join a Wi-Fi network or start Tailscale.";
    list.append(li);
  }
}

function setError(el, message) {
  el.textContent = message ?? "";
  el.hidden = !message;
}

input.addEventListener("input", () => {
  go.disabled = [...input.value].length < MIN;
  setError(error, null);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if ([...input.value].length < MIN) return setError(error, `Use at least ${MIN} characters.`);
  go.disabled = true;
  try {
    const info = await invoke("lan_start", { passcode: input.value });
    input.value = "";
    show(info);
  } catch (err) {
    setError(error, String(err));
    go.disabled = false;
  }
});

$("stop").addEventListener("click", async () => {
  try {
    await invoke("lan_stop");
    show(null);
  } catch (err) {
    setError($("stop-error"), String(err));
  }
});

invoke("lan_status").then(show, () => show(null));
