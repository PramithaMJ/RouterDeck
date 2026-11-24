/**
 * Big services load from several domains. Blocking only the main one leaves
 * videos/images working through the others, so we block the family together.
 */
export const SITE_GROUPS: Record<string, string[]> = {
  "youtube.com": ["youtube.com", "youtu.be", "googlevideo.com", "ytimg.com", "youtube-nocookie.com", "youtubei.googleapis.com"],
  "tiktok.com": ["tiktok.com", "tiktokcdn.com", "tiktokv.com", "tiktokcdn-us.com", "byteoversea.com", "ibytedtos.com"],
  "facebook.com": ["facebook.com", "fbcdn.net", "fb.com", "fb.me", "facebook.net"],
  "instagram.com": ["instagram.com", "cdninstagram.com"],
  "netflix.com": ["netflix.com", "nflxvideo.net", "nflximg.net", "nflxso.net", "nflxext.com"],
  "roblox.com": ["roblox.com", "rbxcdn.com", "roblox.cn"],
  "twitter.com": ["twitter.com", "x.com", "twimg.com", "t.co"],
  "x.com": ["x.com", "twitter.com", "twimg.com", "t.co"],
  "snapchat.com": ["snapchat.com", "snap.com", "sc-cdn.net", "snapkit.com"],
  "discord.com": ["discord.com", "discord.gg", "discordapp.com", "discordapp.net"],
  "twitch.tv": ["twitch.tv", "ttvnw.net", "jtvnw.net"],
};

export function sitesFor(site: string): string[] {
  const key = site.replace(/^www\./, "");
  return SITE_GROUPS[key] ?? [site];
}

/** Which main site a domain belongs to (for showing "related" entries together). */
export function groupOf(domain: string): string | undefined {
  for (const [main, list] of Object.entries(SITE_GROUPS)) if (main !== domain && list.includes(domain)) return main;
  return undefined;
}
