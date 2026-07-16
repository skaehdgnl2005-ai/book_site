import { trackingUrl, carrierDisplayName } from "../../api/payments/_lib/tracking";

/**
 * F068 — renders a shipment's carrier + waybill as a click-through to the carrier's tracking
 * page when the carrier is recognized (trackingUrl), else as plain text (honest fallback for an
 * un-registered carrier). Shared by every order surface (buyer /account · /mypage, admin) so the
 * deep-link + fallback behavior is defined once. The page keeps its own testid wrapper; the link
 * itself carries `tracking-link` for the E2E. New tab + rel="noopener" (untrusted external nav).
 */
export function TrackingLink({ carrier, trackingNumber }: { carrier: string; trackingNumber: string }) {
  const url = trackingUrl(carrier, trackingNumber);
  const label = `${carrierDisplayName(carrier)} ${trackingNumber}`;
  if (!url) return <>{label}</>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" data-testid="tracking-link">
      {label}
    </a>
  );
}
