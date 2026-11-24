import type { Device } from "./router/types";
import { isRandomizedMac } from "./router/util";

export type DeviceKind = "phone" | "laptop" | "desktop" | "tv" | "tablet" | "console" | "speaker" | "camera" | "iot" | "unknown";

const RULES: [RegExp, DeviceKind][] = [
  [/iphone|android|galaxy|note|pixel|redmi|xiaomi|oppo|vivo|huawei|honor|oneplus|realme|nokia|phone|sm-[a-z]\d/i, "phone"],
  [/ipad|tab|kindle/i, "tablet"],
  [/macbook|laptop|thinkpad|xps|zenbook|vivobook|ideapad|surface|notebook|chromebook/i, "laptop"],
  [/imac|desktop|-pc\b|^pc-|workstation|^desktop-|^[a-z0-9]{2}\d[a-z0-9]{9,}$/i, "desktop"],
  [/tv|bravia|roku|firestick|fire-tv|chromecast|appletv|apple-tv|android-tv|mibox|shield/i, "tv"],
  [/playstation|ps[45]|xbox|nintendo|switch/i, "console"],
  [/echo|alexa|homepod|google-home|nest-?mini|sonos|speaker/i, "speaker"],
  [/cam|ipc|doorbell|ring-|dvr|nvr/i, "camera"],
  [/esp|tuya|smart|plug|bulb|raspberrypi|printer|epson|hp-|canon/i, "iot"],
];

export function guessKind(d: Pick<Device, "hostname">, nickname?: string): DeviceKind {
  const s = `${nickname ?? ""} ${d.hostname ?? ""}`.trim();
  if (!s) return "unknown";
  for (const [re, kind] of RULES) if (re.test(s)) return kind;
  return "unknown";
}

export function displayName(d: Device, nickname?: string) {
  if (nickname) return nickname;
  if (d.hostname) return d.hostname.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return isRandomizedMac(d.mac) ? "Private device" : "Unknown device";
}

export { isRandomizedMac };
