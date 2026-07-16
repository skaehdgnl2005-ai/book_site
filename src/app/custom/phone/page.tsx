import { Nav } from "../../_components/Nav";
import { PhoneForm, type Slot } from "./PhoneForm";
import styles from "./page.module.css";

// F022 — PHONE path: a booking calendar. Slots depend on "now", so render dynamically
// (never statically frozen at build time).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "전화 상담 예약 — 맞춤 제작",
  description: "원하는 시간을 고르면 상담사가 전화로 의뢰서를 함께 작성합니다. 예약은 무료.",
};

// Next 5 business days × 3 time slots, computed server-side at request time.
function upcomingSlots(): Slot[] {
  const times: [string, string][] = [
    ["10:00", "오전 10시"],
    ["14:00", "오후 2시"],
    ["16:00", "오후 4시"],
  ];
  const now = new Date();
  const slots: Slot[] = [];
  let businessDays = 0;
  let offset = 1;
  while (businessDays < 5 && offset < 21) {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    offset += 1;
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    businessDays += 1;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    for (const [t, tl] of times) {
      slots.push({ value: `${d.getFullYear()}-${mm}-${dd}T${t}`, label: `${mm}월 ${dd}일 ${tl}` });
    }
  }
  return slots;
}

export default function PhonePage() {
  const slots = upcomingSlots();
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="phone-title">
          <p className="eyebrow eyebrow--ko">Full custom · 전화 상담</p>
          <h1 id="phone-title">전화 상담 예약</h1>
          <p className={styles.lead}>
            원하는 시간을 고르시면 상담사가 전화로 6묶음 의뢰서를 함께 작성합니다. 예약은
            무료이며, 결제는 상담 후에 진행됩니다.
          </p>
          <PhoneForm slots={slots} />
        </section>
      </main>
    </>
  );
}
