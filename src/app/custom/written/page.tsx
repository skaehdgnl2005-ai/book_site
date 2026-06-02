import { Nav } from "../../_components/Nav";
import { Footer } from "../../_components/Footer";
import { CUSTOM_FORM_GROUPS } from "@/lib/customRequest";
import { WrittenForm } from "./WrittenForm";
import styles from "./page.module.css";

// F021 — WRITTEN path: the 6-group 의뢰서, then pay (Toss test) → SUBMITTED.
export const metadata = {
  title: "직접 작성하기 — 맞춤 제작",
  description: "6개 묶음 의뢰서를 직접 작성하고 결제하면 제작이 시작됩니다.",
};

export default function WrittenPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="written-title">
          <p className="eyebrow">Full custom · 직접 작성</p>
          <h1 id="written-title">의뢰서 작성</h1>
          <p className={styles.lead}>
            6개 묶음으로 차근차근 적어 주세요. 빈칸은 비워 두셔도 됩니다. 결제 후 제작이 시작되며,
            아이 사진은 결제 후 마이페이지에서 올릴 수 있습니다.
          </p>
          <WrittenForm groups={CUSTOM_FORM_GROUPS} />
        </section>
      </main>
      <Footer />
    </>
  );
}
