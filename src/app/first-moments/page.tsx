import type { Metadata } from "next";
import { CategoryView } from "../_components/catalog/CategoryView";
import { getTemplatesByCategory } from "../_components/catalog/templates";

// F006 — 첫 순간들 category page. Card grid of the 3 first-moment templates
// (첫 걸음마·첫 말·형아 된 날), sourced from the seeded catalogue. Each card opens
// its order flow (/order/<key>, built by TRACK-ORDER).
export const metadata: Metadata = {
  title: "첫 순간들 · 그림책 제작소",
  description: "첫 걸음마·첫 말·형아 된 날 — 다시 오지 않을 처음을 아이의 이름으로 기록합니다.",
};

// ISR: serve the statically cached page, re-render (honoring the live-DB read when
// configured) at most every 5 minutes. force-dynamic here made every request pay a
// function + DB round trip (~1.3s TTFB cross-region) for an 8-row catalogue that
// almost never changes; hermetic builds still render the seed mirror.
export const revalidate = 300;

export default async function FirstMomentsPage() {
  const templates = await getTemplatesByCategory("FIRST_MOMENT");
  return (
    <CategoryView
      eyebrow="First moments"
      title="첫 순간들"
      intro="첫 걸음마·첫 말·형아 된 날 — 다시 오지 않을 처음을, 아이의 이름으로 기록합니다."
      kicker="First moments"
      templates={templates}
    />
  );
}
