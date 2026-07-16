/**
 * F068 — carrier → 배송 조회(딥링크) URL registry. Pure vocabulary + a normalizer (no DB, no
 * network; unit-tested exhaustively), so it is safe to import from both the SHIPPED-notification
 * server action (admin/_lib/actions) and the presentational TrackingLink server component.
 *
 * The admin enters the carrier as free text at the SHIPPED transition (F060), so we NORMALIZE
 * (trim + lowercase + strip whitespace) and match against each carrier's alias tokens. An
 * unrecognized carrier → `null`: the UI then shows the carrier + number as plain text (honest —
 * a real store adds more carriers as they onboard, never a wrong link). Tracking numbers are
 * reduced to digits before interpolation (Korean domestic waybills are numeric; the admin may
 * type hyphens/spaces).
 */
export interface Carrier {
  /** Canonical display name. */
  name: string;
  /** Build the carrier's tracking-page URL for a digits-only waybill number. */
  url: (digits: string) => string;
  /** Normalized (lowercased, whitespace-stripped) tokens that identify this carrier. */
  match: readonly string[];
}

// Registry order matters only within a carrier's own aliases; tokens do not overlap across carriers.
const CARRIERS: readonly Carrier[] = [
  {
    name: "CJ대한통운",
    match: ["cj대한통운", "대한통운", "cjlogistics", "cj"],
    url: (n) => `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo=${n}`,
  },
  {
    name: "우체국택배",
    match: ["우체국", "epost"],
    url: (n) => `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
  },
  {
    name: "한진택배",
    match: ["한진", "hanjin"],
    url: (n) => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
  },
  {
    name: "롯데택배",
    match: ["롯데글로벌로지스", "롯데", "lotteglogis", "lotte"],
    url: (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
  },
  {
    name: "로젠택배",
    match: ["로젠", "ilogen", "logen"],
    url: (n) => `https://www.ilogen.com/web/personal/trace/${n}`,
  },
];

/** Match the admin's free-text carrier name to a known carrier, or null if unrecognized. */
export function resolveCarrier(carrier: string): Carrier | null {
  const norm = carrier.trim().toLowerCase().replace(/\s+/g, "");
  if (!norm) return null;
  for (const c of CARRIERS) {
    if (c.match.some((token) => norm.includes(token))) return c;
  }
  return null;
}

/** The carrier's tracking-page URL for this waybill, or null (unknown carrier / no digits). */
export function trackingUrl(carrier: string, trackingNumber: string): string | null {
  const c = resolveCarrier(carrier);
  const digits = trackingNumber.replace(/\D/g, "");
  if (!c || !digits) return null;
  return c.url(digits);
}

/**
 * Canonical display name for a recognized carrier, else the admin's raw input verbatim. Normalizes
 * messy-but-recognized aliases ("cj", " 대한통운 ") to the registry's official name on every display
 * surface (buyer link label + shipping email) — the untrusted free text never reaches the buyer.
 */
export function carrierDisplayName(carrier: string): string {
  return resolveCarrier(carrier)?.name ?? carrier;
}
