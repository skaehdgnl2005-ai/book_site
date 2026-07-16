import { Nav } from "../_components/Nav";
import { ContactForm } from "../_components/content/ContactForm";
import styles from "./page.module.css";

// F028 — 문의. 전화·이메일 are honest flagged placeholders until the maker provides
// them (brief §10); Instagram is 추후 개설. The contact form (client) tags input
// untrusted() and guides to phone/email. Styled via DESIGN tokens.
export default function ContactPage() {
  return (
    <>
      <Nav />
      <main>
        <section className="section" aria-labelledby="contact-title">
          <p className="eyebrow">Contact</p>
          <h1 id="contact-title">문의</h1>
          <p className={styles.intro}>궁금한 점이 있으시면 아래로 연락 주세요.</p>

          {/* TODO(F028): real 전화/이메일 — brief §10 추후 제공. Instagram 추후 개설. */}
          <dl className={styles.channels}>
            <div className={styles.row}>
              <dt className={styles.dt}>전화</dt>
              <dd className={styles.dd}>〔전화번호 준비 중〕</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>이메일</dt>
              <dd className={styles.dd}>〔이메일 준비 중〕</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.dt}>인스타그램</dt>
              <dd className={styles.dd}>추후 개설 예정</dd>
            </div>
          </dl>

          <ContactForm />
        </section>
      </main>
    </>
  );
}
