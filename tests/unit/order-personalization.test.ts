import { describe, it, expect } from "vitest";
import {
  validatePersonalization, isValid, toExtraVarValue, EXTRA_VAR_SPECS,
  CHILD_GENDER_LABEL, CHILD_GENDER_LABEL_DEFAULT,
} from "../../src/app/_components/order/personalization";

const base = { childName: "도윤", childGender: "MALE", extraVarValue: "" };

describe("validatePersonalization", () => {
  it("requires a non-empty name and a gender", () => {
    const e = validatePersonalization({ childName: "  ", childGender: "", extraVarValue: "" }, "NONE");
    expect(e.childName).toBeDefined();
    expect(e.childGender).toBeDefined();
    expect(isValid(e)).toBe(false);
  });

  it("passes a NONE template with just name + gender", () => {
    expect(isValid(validatePersonalization(base, "NONE"))).toBe(true);
  });

  it("requires the extra-var when the template has one", () => {
    expect(validatePersonalization(base, "BIRTHDATE").extraVar).toBeDefined();
  });

  it("BIRTHDATE rejects a non-date and a future date", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "nope" }, "BIRTHDATE").extraVar).toBeDefined();
    expect(validatePersonalization({ ...base, extraVarValue: "2999-01-01" }, "BIRTHDATE").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "2024-01-15" }, "BIRTHDATE"))).toBe(true);
  });

  it("AGE accepts 1..12 integers only", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "0" }, "AGE").extraVar).toBeDefined();
    expect(validatePersonalization({ ...base, extraVarValue: "1.5" }, "AGE").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "1" }, "AGE"))).toBe(true);
  });

  it("SIBLING_GENDER accepts only MALE/FEMALE", () => {
    expect(validatePersonalization({ ...base, extraVarValue: "x" }, "SIBLING_GENDER").extraVar).toBeDefined();
    expect(isValid(validatePersonalization({ ...base, extraVarValue: "FEMALE" }, "SIBLING_GENDER"))).toBe(true);
  });

  it("became_sibling labels its two gender fields distinctly", () => {
    expect(CHILD_GENDER_LABEL).not.toBe(EXTRA_VAR_SPECS.SIBLING_GENDER.label);
    expect(CHILD_GENDER_LABEL_DEFAULT).not.toBe(CHILD_GENDER_LABEL);
  });

  it("toExtraVarValue returns null for NONE and {kind,value} otherwise", () => {
    expect(toExtraVarValue("NONE", "x")).toBeNull();
    expect(toExtraVarValue("AGE", " 2 ")).toEqual({ kind: "AGE", value: "2" });
  });
});
