const params = new URLSearchParams(location.search);
const site = params.get("site") || "";
const router = params.get("router") || "";
document.getElementById("site").textContent = site;
document.getElementById("router").textContent = router;
const key = `${site}|${router}`;

async function finish(allowed) {
  await chrome.runtime.sendMessage({ type: "approval-result", key, allowed });
  window.close();
}

document.getElementById("deny").addEventListener("click", () => finish(false));
document.getElementById("allow").addEventListener("click", async () => {
  // Must run inside the click handler (user gesture).
  const granted = await chrome.permissions.request({ origins: [router + "/*"] });
  if (!granted) return finish(false);
  const { approvals = {} } = await chrome.storage.local.get("approvals");
  approvals[site] = Array.from(new Set([...(approvals[site] || []), router]));
  await chrome.storage.local.set({ approvals });
  finish(true);
});
