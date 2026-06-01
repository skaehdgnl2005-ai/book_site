import type { Metadata } from "next";
import { CategoryView } from "../_components/catalog/CategoryView";
import { getTemplatesByCategory } from "../_components/catalog/templates";

// F005 — 기념일 category page. Card grid of the 5 anniversary templates
// (탄생·백일·돌·생일·입학), sourced from the seeded catalogue. Cards link to
// /order/<key> (the order flow is built by TRACK-ORDER).
export const metadata: Metadata = {
  title: "기념일 · 그림책 제작소",
  description: "탄생·백일·돌·생일·입학 — 누군가의 가장 빛나는 하루를 위한 단 하나의 그림책.",
};

// Render per request so the live-DB read (when configured) is honored, rather than
// baking a build-time snapshot. Hermetic builds still render the seed mirror.
export const dynamic = "force-dynamic";

export default async function AnniversaryPage() {
  const templates = await getTemplatesByCategory("ANNIVERSARY");
  return (
    <CategoryView
      eyebrow="Anniversary"
      title="기념일"
      intro="탄생·백일·돌·생일·입학 — 누군가의 가장 빛나는 하루를 위해, 한 권씩 만들어 드립니다."
      kicker="Anniversary"
      templates={templates}
    />
  );
}
