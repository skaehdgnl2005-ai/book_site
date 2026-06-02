import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTemplateByKey } from "../../_components/catalog/templates";
import { OrderWizard } from "../../_components/order/OrderWizard";

export const metadata: Metadata = { title: "주문 만들기 · 그림책 제작소" };
// Render per request so the live-DB read (when configured) is honored; hermetic builds use the mirror.
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ templateKey: string }>;
}) {
  const { templateKey } = await params;
  const template = await getTemplateByKey(templateKey);
  if (!template) notFound();
  return <OrderWizard template={template} />;
}
