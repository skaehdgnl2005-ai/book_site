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
import styles from "./order.module.css";

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
        <section className="hero" aria-labelledby="order-title">
          <p className="eyebrow">{template.label}</p>
          <h1 className="hero__title" id="order-title">주문 만들기</h1>
          {/* F048 — carry the template's story blurb into the funnel + say what's
              in the box and when it ships (entry line), before any field is asked. */}
          <p className={styles.contextBlurb}>{template.blurb}</p>
          <p className={styles.included} data-testid="order-included">
            자석 외함 · 축하 카드 기본 포함 — 주문 후 일주일 이내 제작해 보내 드립니다
          </p>
        </section>
        <section className={styles.wizard} data-testid="order-wizard" data-step={step} aria-label="주문 단계">
          {step === "info" && <InfoStep template={template} draft={state.draft} onPatch={patch} onNext={next} />}
          {step === "photo" && <PhotoStep draft={state.draft} onPatch={patch} onNext={next} onBack={back} />}
          {step === "cover" && <CoverStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onPatch={patch} onNext={next} onBack={back} />}
          {step === "review" && <ReviewStep template={template} draft={state.draft} unitPriceWon={unitPriceWon} onBack={back} onAddToCart={addToCart} />}
        </section>
      </main>
      <Footer />
    </>
  );
}
