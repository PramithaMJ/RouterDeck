/**
 * Internet providers RouterDeck recognises. Used to show the provider's
 * name, colour and logo (favicon) once we know who supplies the connection.
 *
 * Detection hints come from the router: mobile network name (PLMN), Wi-Fi
 * name prefix, DNS servers handed out by the ISP, or the GPON vendor field.
 */
export interface IspBrand {
  id: string;
  name: string;
  /** Short label for small badges. */
  short: string;
  /** Brand colour (used for the badge tile and accents). */
  color: string;
  /** Website, used to load the provider's favicon as its logo. */
  domain: string;
  kind: ("fiber" | "4g" | "adsl" | "satellite" | "cable")[];
}

export const ISPS: IspBrand[] = [
  { id: "slt", name: "SLT-Mobitel", short: "SLT", color: "#0057b8", domain: "slt.lk", kind: ["fiber", "adsl", "4g"] },
  { id: "mobitel", name: "Mobitel", short: "Mobitel", color: "#00a650", domain: "mobitel.lk", kind: ["4g"] },
  { id: "dialog", name: "Dialog", short: "Dialog", color: "#b3005e", domain: "dialog.lk", kind: ["fiber", "4g"] },
  { id: "hutch", name: "Hutch", short: "Hutch", color: "#f26522", domain: "hutch.lk", kind: ["4g"] },
  { id: "airtel", name: "Airtel", short: "Airtel", color: "#e40000", domain: "airtel.lk", kind: ["4g"] },
  { id: "lankabell", name: "Lanka Bell", short: "Lanka Bell", color: "#1d4f91", domain: "lankabell.com", kind: ["4g", "fiber"] },
  { id: "starlink", name: "Starlink", short: "Starlink", color: "#111111", domain: "starlink.com", kind: ["satellite"] },
];

export function ispById(id?: string): IspBrand | undefined {
  return id ? ISPS.find((i) => i.id === id) : undefined;
}

/** Logo sources in order of preference (provider favicons). */
export function ispLogoUrls(isp: IspBrand): string[] {
  return [`https://icons.duckduckgo.com/ip3/${isp.domain}.ico`, `https://www.google.com/s2/favicons?domain=${isp.domain}&sz=64`];
}

export function ispLogoUrl(isp: IspBrand) {
  return ispLogoUrls(isp)[0];
}

/** Best-effort detection from any text the router reveals. */
/** Autonomous System numbers of local ISPs (public routing registry). */
const ASN: Record<number, string> = { 9329: "slt", 18001: "dialog", 14522: "starlink" };

export function detectIsp(hints: { plmn?: string; ssids?: string[]; dns?: string[]; vendor?: string; text?: string; asn?: number }): string | undefined {
  if (hints.asn && ASN[hints.asn]) return ASN[hints.asn];
  const plmn = (hints.plmn ?? "").toLowerCase();
  // Numeric network codes (MCC 413 = Sri Lanka).
  const code = plmn.replace(/\D/g, "");
  if (/^413\d\d$/.test(code)) {
    const mnc = code.slice(3);
    if (mnc === "01") return "mobitel";
    if (mnc === "02" || mnc === "11") return "dialog";
    if (mnc === "03" || mnc === "08") return "hutch";
    if (mnc === "05") return "airtel";
  }
  if (plmn) {
    if (/dialog/.test(plmn)) return "dialog";
    if (/slt/.test(plmn)) return "slt"; // SLT-Mobitel (the network name shows as "SLT")
    if (/mobitel/.test(plmn)) return "mobitel";
    if (/hutch|etisalat/.test(plmn)) return "hutch";
    if (/airtel/.test(plmn)) return "airtel";
    if (/lanka ?bell/.test(plmn)) return "lankabell";
  }
  const ssid = (hints.ssids ?? []).join(" ").toLowerCase();
  if (/\bslt|slt-fiber|slt_fiber|sltpeo/.test(ssid)) return "slt";
  if (/dialog/.test(ssid)) return "dialog";
  if (/mobitel/.test(ssid)) return "mobitel";
  if (/hutch/.test(ssid)) return "hutch";
  if (/airtel/.test(ssid)) return "airtel";
  if (/starlink/.test(ssid)) return "starlink";
  const vendor = (hints.vendor ?? "").toLowerCase();
  if (/^slt|sri lanka telecom/.test(vendor)) return "slt";
  if (/dialog/.test(vendor)) return "dialog";
  const dns = hints.dns ?? [];
  // SLT resolvers live in 222.165.x.x; Dialog in 203.94.x / 203.115.x.
  if (dns.some((d) => d.startsWith("222.165."))) return "slt";
  if (dns.some((d) => /^203\.(94|115)\./.test(d))) return "dialog";
  if (dns.some((d) => d.startsWith("103.21.") || d.startsWith("123.231."))) return "dialog";
  const text = (hints.text ?? "").toLowerCase();
  if (/mobitel/.test(text)) return "slt";
  if (/\bslt\b|sri lanka telecom/.test(text)) return "slt";
  if (/dialog/.test(text)) return "dialog";
  if (/hutch|hutchison|etisalat/.test(text)) return "hutch";
  if (/airtel|bharti/.test(text)) return "airtel";
  if (/lanka bell/.test(text)) return "lankabell";
  if (/starlink|spacex/.test(text)) return "starlink";
  return undefined;
}
