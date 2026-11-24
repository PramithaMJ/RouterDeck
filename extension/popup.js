const APP = "https://router.pramitha.lk/";
document.getElementById("ver").textContent = "Version " + chrome.runtime.getManifest().version;
document.getElementById("open").addEventListener("click", async () => {
  await chrome.tabs.create({ url: APP });
  window.close();
});

async function render() {
  const { approvals = {} } = await chrome.storage.local.get("approvals");
  const list = document.getElementById("list");
  list.textContent = "";
  const entries = Object.entries(approvals).flatMap(([site, routers]) => routers.map((r) => [site, r]));
  document.getElementById("empty").hidden = entries.length > 0;
  document.getElementById("state").textContent = entries.length ? "Connected" : "Ready";
  document.getElementById("state").classList.toggle("on", entries.length > 0);
  for (const [site, router] of entries) {
    const li = document.createElement("li");
    const text = document.createElement("div");
    const a = document.createElement("div");
    a.className = "site";
    a.textContent = router.replace(/^https?:\/\//, "");
    const b = document.createElement("div");
    b.className = "muted small";
    b.textContent = "for " + site.replace(/^https?:\/\//, "");
    text.append(a, b);
    const btn = document.createElement("button");
    btn.className = "secondary small";
    btn.textContent = "Revoke";
    btn.onclick = async () => {
      const cur = (await chrome.storage.local.get("approvals")).approvals || {};
      cur[site] = (cur[site] || []).filter((x) => x !== router);
      if (!cur[site].length) delete cur[site];
      await chrome.storage.local.set({ approvals: cur });
      const stillUsed = Object.values(cur).some((rs) => rs.includes(router));
      if (!stillUsed) await chrome.permissions.remove({ origins: [router + "/*"] }).catch(() => {});
      render();
    };
    li.append(text, btn);
    list.append(li);
  }
}
render();
