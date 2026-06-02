/**
 * Pure personalization validation for the pre-pay form (F008). All buyer input is
 * untrusted() at the call boundary (the wizard); this never trusts raw input. The
 * extra-var field + label are derived from the template's TemplateExtraVar.
 */
import type { TemplateExtraVar } from "../catalog/templates";
import type { ExtraVarValue } from "@/lib/cart";

export type ExtraVarSpec = {
  kind: Exclude<TemplateExtraVar, "NONE">;
  label: string;
  inputType: "text" | "date" | "number" | "gender";
};

export const EXTRA_VAR_SPECS: Record<Exclude<TemplateExtraVar, "NONE">, ExtraVarSpec> = {
  BIRTHDATE: { kind: "BIRTHDATE", label: "생년월일", inputType: "date" },
  AGE: { kind: "AGE", label: "몇 번째 생일인가요?", inputType: "number" },
  SCHOOL: { kind: "SCHOOL", label: "입학하는 곳", inputType: "text" },
  FIRST_WORD: { kind: "FIRST_WORD", label: "아이가 처음 한 말", inputType: "text" },
  SIBLING_GENDER: { kind: "SIBLING_GENDER", label: "새로 태어난 동생의 성별", inputType: "gender" },
};

// became_sibling renders TWO gender fields; distinct labels prevent swapping them.
export const CHILD_GENDER_LABEL = "우리 아이(형·누나가 될 아이) 성별";
export const CHILD_GENDER_LABEL_DEFAULT = "아이 성별";

export type RawPersonalization = {
  childName: string;
  childGender: string;
  extraVarValue: string;
};
export type PersonalizationErrors = Partial<
  Record<"childName" | "childGender" | "extraVar", string>
>;

const NAME_MAX = 40;
const TEXT_MAX = 60;

export function validatePersonalization(
  raw: RawPersonalization,
  extraVar: TemplateExtraVar,
): PersonalizationErrors {
  const errors: PersonalizationErrors = {};
  const name = raw.childName.trim();
  if (name.length === 0) errors.childName = "아이 이름을 입력해 주세요.";
  else if (name.length > NAME_MAX) errors.childName = `이름은 ${NAME_MAX}자 이내로 입력해 주세요.`;

  if (raw.childGender !== "MALE" && raw.childGender !== "FEMALE")
    errors.childGender = "성별을 선택해 주세요.";

  if (extraVar !== "NONE") {
    const v = raw.extraVarValue.trim();
    if (v.length === 0) {
      errors.extraVar = "필수 항목을 입력해 주세요.";
    } else if (extraVar === "BIRTHDATE") {
      const ms = Date.parse(v);
      if (Number.isNaN(ms)) errors.extraVar = "올바른 날짜를 입력해 주세요.";
      else if (ms > Date.now()) errors.extraVar = "미래 날짜는 입력할 수 없습니다.";
    } else if (extraVar === "AGE") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 12)
        errors.extraVar = "1에서 12 사이의 숫자를 입력해 주세요.";
    } else if (extraVar === "SIBLING_GENDER") {
      if (v !== "MALE" && v !== "FEMALE") errors.extraVar = "동생의 성별을 선택해 주세요.";
    } else if (v.length > TEXT_MAX) {
      errors.extraVar = `${TEXT_MAX}자 이내로 입력해 주세요.`;
    }
  }
  return errors;
}

export function isValid(errors: PersonalizationErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Build the typed ExtraVarValue for the cart from validated raw input. */
export function toExtraVarValue(extraVar: TemplateExtraVar, raw: string): ExtraVarValue {
  return extraVar === "NONE" ? null : { kind: extraVar, value: raw.trim() };
}
