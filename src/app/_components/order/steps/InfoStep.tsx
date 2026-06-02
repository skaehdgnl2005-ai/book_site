"use client";
import { useState } from "react";
import type { CatalogTemplate } from "../../catalog/templates";
import type { Draft } from "../OrderWizard";
import {
  validatePersonalization, isValid, EXTRA_VAR_SPECS,
  CHILD_GENDER_LABEL, CHILD_GENDER_LABEL_DEFAULT, type PersonalizationErrors,
} from "../personalization";
import styles from "../order.module.css";

export function InfoStep({
  template, draft, onPatch, onNext,
}: {
  template: CatalogTemplate;
  draft: Draft;
  onPatch: (p: Partial<Draft>) => void;
  onNext: () => void;
}) {
  const [errors, setErrors] = useState<PersonalizationErrors>({});
  const spec = template.extraVar === "NONE" ? null : EXTRA_VAR_SPECS[template.extraVar];
  const isSibling = template.extraVar === "SIBLING_GENDER";
  const childGenderLabel = isSibling ? CHILD_GENDER_LABEL : CHILD_GENDER_LABEL_DEFAULT;

  const submit = () => {
    const errs = validatePersonalization(
      { childName: draft.childName, childGender: draft.childGender, extraVarValue: draft.extraVarValue },
      template.extraVar,
    );
    setErrors(errs);
    if (isValid(errs)) onNext();
  };

  return (
    <div className={styles.step}>
      <label className={styles.field}>
        <span className={styles.label}>아이 이름</span>
        <input className={styles.input} data-testid="order-name-input" value={draft.childName}
          aria-invalid={errors.childName ? true : undefined}
          aria-describedby={errors.childName ? "order-error-childName" : undefined}
          onChange={(e) => onPatch({ childName: e.target.value })} />
      </label>
      {errors.childName && <p className={styles.error} role="alert" id="order-error-childName" data-testid="order-error-childName">{errors.childName}</p>}

      <fieldset className={styles.field}
        aria-invalid={errors.childGender ? true : undefined}
        aria-describedby={errors.childGender ? "order-error-childGender" : undefined}>
        <legend className={styles.label}>{childGenderLabel}</legend>
        <label><input type="radio" name="childGender" data-testid="order-gender-male"
          checked={draft.childGender === "MALE"} onChange={() => onPatch({ childGender: "MALE" })} /> 남아</label>
        <label><input type="radio" name="childGender" data-testid="order-gender-female"
          checked={draft.childGender === "FEMALE"} onChange={() => onPatch({ childGender: "FEMALE" })} /> 여아</label>
      </fieldset>
      {errors.childGender && <p className={styles.error} role="alert" id="order-error-childGender" data-testid="order-error-childGender">{errors.childGender}</p>}

      {spec && (
        spec.inputType === "gender" ? (
          <fieldset className={styles.field}>
            <legend className={styles.label} data-testid="order-extravar-label">{spec.label}</legend>
            <label><input type="radio" name="extraVar" data-testid="order-extravar-male"
              checked={draft.extraVarValue === "MALE"} onChange={() => onPatch({ extraVarValue: "MALE" })} /> 남아</label>
            <label><input type="radio" name="extraVar" data-testid="order-extravar-female"
              checked={draft.extraVarValue === "FEMALE"} onChange={() => onPatch({ extraVarValue: "FEMALE" })} /> 여아</label>
          </fieldset>
        ) : (
          <label className={styles.field}>
            <span className={styles.label} data-testid="order-extravar-label">{spec.label}</span>
            <input className={styles.input} data-testid="order-extravar-input"
              type={spec.inputType === "date" ? "date" : spec.inputType === "number" ? "number" : "text"}
              aria-invalid={errors.extraVar ? true : undefined}
              aria-describedby={errors.extraVar ? "order-error-extraVar" : undefined}
              value={draft.extraVarValue} onChange={(e) => onPatch({ extraVarValue: e.target.value })} />
          </label>
        )
      )}
      {errors.extraVar && <p className={styles.error} role="alert" id="order-error-extraVar" data-testid="order-error-extraVar">{errors.extraVar}</p>}

      <button className="cta" type="button" data-testid="order-next" onClick={submit}>다음</button>
    </div>
  );
}
