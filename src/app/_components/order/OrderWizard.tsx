"use client";
import { useReducer } from "react";
import { useRouter } from "next/navigation";
import type { CatalogTemplate } from "../catalog/templates";
import { Nav } from "../Nav";
import { Footer } from "../Footer";
import { loadCart, saveCart, addLine, setQrAddon, type CartLine, type CoverType, type Gender } from "@/lib/cart";
import { toExtraVarValue } from "./personalization";
import { InfoStep } from "./steps/InfoStep";
import { PhotoStep } from "./steps/PhotoStep";
import { CoverStep } from "./steps/CoverStep";
import { ReviewStep } from "./steps/ReviewStep";
import { StepIndicator } from "./StepIndicator";
import { SummaryRail } from "./SummaryRail";
import styles from "./order.module.css";

// F050 — compact funnel-header eyebrow: category + template, in Korean. (Rendered with
// letter-spacing 0 via styles.koEyebrow — the global .eyebrow tracking is for Latin.)
const CATEGORY_LABEL: Record<CatalogTemplate["category"], string> = {
  ANNIVERSARY: "기념일",
  FIRST_MOMENT: "첫 순간들",
};

export type Draft = {
  childName: string;
  childGender: "" | Gender;
  extraVarValue: string;
  photo: { storageKey: string; contentType: string; byteSize: number } | null;
  coverType: CoverType;
  qrVideoAddon: boolean;
};

const STEPS = ["info", "photo", "cover", "review"] as const;
type State = { stepIndex: number; draft: Draft };
type Action = { type: "PATCH"; patch: Partial<Draft> } | { type: "NEXT" } | { type: "BACK" };

const initialDraft: Draft = {
  childName: "", childGender: "", extraVarValue: "", photo: null, coverType: "SOFT", qrVideoAddon: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "PATCH": return { ...state, draft: { ...state.draft, ...action.patch } };
    case "NEXT": return { ...state, stepIndex: Math.min(state.stepIndex + 1, STEPS.length - 1) };
    case "BACK": return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
    default: return state;
  }
}

export function OrderWizard({ template }: { template: CatalogTemplate }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, { stepIndex: 0, draft: initialDraft });
  const step = STEPS[state.stepIndex];
  const patch = (p: Partial<Draft>) => dispatch({ type: "PATCH", patch: p });
  const next = () => dispatch({ type: "NEXT" });
  const back = () => dispatch({ type: "BACK" });
  const unitPriceWon = state.draft.coverType === "HARD" ? template.hardPriceWon : template.softPriceWon;

  const addToCart = () => {
    const line: CartLine = {
      id: crypto.randomUUID(),
      templateKey: template.key,
      templateLabel: template.label,
      coverType: state.draft.coverType,
      unitPriceWon,
      personalization: {
        childName: state.draft.childName.trim(),
        childGender: state.draft.childGender as Gender,
        extraVar: toExtraVarValue(template.extraVar, state.draft.extraVarValue),
      },
      photo: state.draft.photo,
    };
    let cart = addLine(loadCart(), line);
    cart = setQrAddon(cart, state.draft.qrVideoAddon);
    saveCart(cart);
    router.push("/cart");
  };

  return (
    <>
      <Nav />
      <main>
        {/* F050 — compact funnel header (replaces the tall .hero): the funnel is a work
            surface, not a landing page. One h1 (a11y heading order): the 책 제목 alone is
            serif — the DESIGN.md signature contrast — the rest stays grotesk. */}
        <section className={styles.funnelHeader} aria-labelledby="order-title">
          <p className={`eyebrow ${styles.koEyebrow}`}>
            {CATEGORY_LABEL[template.category]} · {template.label}
          </p>
          <h1 className={styles.funnelTitle} id="order-title">
            <span className={styles.funnelBookTitle}>『{template.label}』</span> 주문 만들기
          </h1>
          {/* F048 — carry the template's story blurb into the funnel + say what's
              in the box and when it ships (entry line), before any field is asked. */}
          <p className={styles.contextBlurb}>{template.blurb}</p>
          <p className={styles.included} data-testid="order-included">
            자석 외함 · 축하 카드 기본 포함 — 주문 후 일주일 이내 제작해 보내 드립니다
          </p>
        </section>
        {/* F050 — desktop ≥1024px: 7/5 split (DESIGN.md asymmetric rhythm) — the form
            column left, the sticky book/summary rail right. Single column below. */}
        <div className={styles.layout}>
          <section className={styles.wizard} data-testid="order-wizard" data-step={step} aria-label="주문 단계">
            <StepIndicator stepIndex={state.stepIndex} />
            {step === "info" && <InfoStep template={template} draft={state.draft} onPatch={patch} onNext={next} />}
            {step === "photo" && <PhotoStep draft={state.draft} onPatch={patch} onNext={next} onBack={back} />}
            {step === "cover" && <CoverStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onPatch={patch} onNext={next} onBack={back} />}
            {step === "review" && <ReviewStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onBack={back} onAddToCart={addToCart} />}
          </section>
          <SummaryRail template={template} draft={state.draft} stepIndex={state.stepIndex} unitPriceWon={unitPriceWon} />
        </div>
      </main>
      <Footer />
    </>
  );
}
