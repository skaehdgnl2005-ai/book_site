import { describe, it, expect } from "vitest";
import {
  CUSTOM_PRICE_WON,
  CUSTOM_FORM_GROUPS,
  buildCustomForm,
  buildWrittenIntake,
  buildPhoneIntake,
  validateWrittenInput,
  validatePhoneInput,
  customRequestStore,
  createInMemoryCustomBackend,
  canTransitionCustom,
  CUSTOM_STATUS_LABEL,
  type CustomForm,
  type CustomStatus,
} from "../../src/lib/customRequest";

// The 맞춤 제작 question set — one shared 6-group 의뢰서 (web-brief §4 "공통 의뢰서 양식").
// Phone script == web form, so production input is homogeneous regardless of path (F023).
const GROUP_KEYS = ["protagonist", "people", "motivation", "direction", "expression", "practical"];

describe("CUSTOM_FORM_GROUPS — the shared 6-group 의뢰서", () => {
  it("has exactly the 6 groups in order, each with at least one field", () => {
    expect(CUSTOM_FORM_GROUPS.map((g) => g.key)).toEqual(GROUP_KEYS);
    for (const g of CUSTOM_FORM_GROUPS) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.fields.length).toBeGreaterThan(0);
      for (const f of g.fields) expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it("marks 이 책의 계기와 마음 as the ★ full-custom core group", () => {
    const motivation = CUSTOM_FORM_GROUPS.find((g) => g.key === "motivation");
    expect(motivation?.star).toBe(true);
  });
});

describe("price", () => {
  it("맞춤 제작 is 119,000원 (KRW won integer)", () => {
    expect(CUSTOM_PRICE_WON).toBe(119000);
    expect(Number.isInteger(CUSTOM_PRICE_WON)).toBe(true);
  });
});

describe("buildCustomForm — identical shape across both paths (F023 invariant)", () => {
  const writtenRaw = {
    protagonist: { name: "  서연  ", ageGender: "5세 여아", personality: "씩씩함" },
    people: { relationToChild: "엄마" },
    motivation: { occasion: "다섯 번째 생일", messageToConvey: "넌 그대로 충분해" },
    direction: { mood: "따뜻한" },
    expression: { delegateToExpert: true },
    practical: { recipientShipping: "서울시 ...", contact: "010-1234-5678" },
    bogusGroup: { x: 1 }, // unknown group → ignored
  };
  const phoneRaw = {
    practical: { preferredCallTime: "평일 저녁", contact: "010-9876-5432" },
  };

  it("produces the identical group + field key set regardless of which path filled it", () => {
    const w = buildCustomForm(writtenRaw);
    const p = buildCustomForm(phoneRaw);
    expect(Object.keys(w.groups)).toEqual(Object.keys(p.groups));
    expect(Object.keys(w.groups)).toEqual(GROUP_KEYS);
    for (const k of GROUP_KEYS) {
      const wk = w.groups[k as keyof CustomForm["groups"]];
      const pk = p.groups[k as keyof CustomForm["groups"]];
      expect(Object.keys(wk).sort()).toEqual(Object.keys(pk).sort());
    }
    expect(w.version).toBe(1);
  });

  it("trims values, fills missing fields with '', coerces non-strings, ignores unknown keys", () => {
    const w = buildCustomForm(writtenRaw);
    expect(w.groups.protagonist.name).toBe("서연"); // trimmed
    expect(w.groups.protagonist.nickname).toBe(""); // missing → ""
    expect(w.groups.expression.delegateToExpert).toBe("true"); // boolean coerced to string
    expect((w.groups as Record<string, unknown>).bogusGroup).toBeUndefined();
    expect(buildCustomForm({}).groups.motivation.occasion).toBe("");
  });

  it("never throws on junk / non-object input (untrusted)", () => {
    expect(() => buildCustomForm({ protagonist: "not-an-object" } as Record<string, unknown>)).not.toThrow();
    expect(() => buildCustomForm(undefined as unknown as Record<string, unknown>)).not.toThrow();
    expect(buildCustomForm({ protagonist: "x" } as Record<string, unknown>).groups.protagonist.name).toBe("");
  });
});

describe("validateWrittenInput (untrusted)", () => {
  it("rejects empty contact / missing protagonist name", () => {
    expect(validateWrittenInput({ contactName: "", contactPhone: "", contactEmail: "", answers: {} }).ok).toBe(false);
    expect(
      validateWrittenInput({
        contactName: "김부모",
        contactPhone: "010-1234-5678",
        contactEmail: "parent@example.com",
        answers: { protagonist: {} },
      }).ok,
    ).toBe(false);
    expect(validateWrittenInput("garbage").ok).toBe(false);
  });

  it("rejects a missing or malformed contactEmail (F052 — the Order needs a buyerEmail)", () => {
    const base = { contactName: "김부모", contactPhone: "010-1234-5678", answers: { protagonist: { name: "서연" } } };
    expect(validateWrittenInput({ ...base }).ok).toBe(false); // missing
    expect(validateWrittenInput({ ...base, contactEmail: "not-an-email" }).ok).toBe(false);
    expect(validateWrittenInput({ ...base, contactEmail: "a@b" }).ok).toBe(false); // no TLD dot
  });

  it("accepts a minimal valid payload", () => {
    const r = validateWrittenInput({
      contactName: "김부모",
      contactPhone: "010-1234-5678",
      contactEmail: "parent@example.com",
      withdrawalConsent: true,
      answers: { protagonist: { name: "서연" } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.contactName).toBe("김부모");
      expect(r.value.contactEmail).toBe("parent@example.com");
    }
  });

  // F067 — 맞춤 제작도 주문제작 상품: 결제(제출) 전 청약철회 제한 동의가 필수.
  it("rejects a missing 청약철회 제한 동의 (F067)", () => {
    const base = {
      contactName: "김부모",
      contactPhone: "010-1234-5678",
      contactEmail: "parent@example.com",
      answers: { protagonist: { name: "서연" } },
    };
    expect(validateWrittenInput(base).ok).toBe(false);
    expect(validateWrittenInput({ ...base, withdrawalConsent: "true" }).ok).toBe(false);
    expect(validateWrittenInput({ ...base, withdrawalConsent: true }).ok).toBe(true);
  });
});

describe("validatePhoneInput (untrusted)", () => {
  it("rejects missing slot / name / phone (memo optional)", () => {
    expect(validatePhoneInput({ slot: "", name: "", phone: "", memo: "" }).ok).toBe(false);
    expect(validatePhoneInput({ slot: "2026-06-08T10:00", name: "", phone: "010", memo: "" }).ok).toBe(false);
    expect(validatePhoneInput(42).ok).toBe(false);
  });

  it("rejects a malformed slot shape (untrusted → prevents a tz-shifted / Invalid DB write)", () => {
    expect(validatePhoneInput({ slot: "2026-06-08T10:00:00", name: "n", phone: "p", memo: "" }).ok).toBe(false); // 19-char (seconds)
    expect(validatePhoneInput({ slot: "garbage", name: "n", phone: "p", memo: "" }).ok).toBe(false);
  });

  it("accepts a slot + name + phone, memo optional", () => {
    const r = validatePhoneInput({ slot: "2026-06-08T10:00", name: "김부모", phone: "010-1234-5678", memo: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slot).toBe("2026-06-08T10:00");
  });
});

describe("buildWrittenIntake / buildPhoneIntake", () => {
  it("WRITTEN: PENDING_PAYMENT, 119000원, no consultation, child name in the form", () => {
    const d = buildWrittenIntake({
      contactName: "김부모",
      contactPhone: "010-1234-5678",
      contactEmail: "parent@example.com",
      answers: { protagonist: { name: "서연" }, motivation: { occasion: "생일" } },
    });
    expect(d.path).toBe("WRITTEN");
    expect(d.status).toBe("PENDING_PAYMENT");
    expect(d.amountWon).toBe(119000);
    expect(d.consultation).toBeUndefined();
    expect(d.contactEmail).toBe("parent@example.com"); // F052: becomes the CUSTOM Order's buyerEmail
    expect(d.form.groups.protagonist.name).toBe("서연");
    expect(d.form.groups.motivation.occasion).toBe("생일");
  });

  it("PHONE: a REQUESTED consultation, no upfront payment, slot recorded in the form", () => {
    const d = buildPhoneIntake({
      slot: "2026-06-08T10:00",
      name: "김부모",
      phone: "010-1234-5678",
      memo: "낮에 전화 주세요",
    });
    expect(d.path).toBe("PHONE");
    expect(d.consultation?.status).toBe("REQUESTED");
    expect(d.consultation?.requestedSlot).toBe("2026-06-08T10:00");
    expect(d.consultation?.note).toBe("낮에 전화 주세요");
    expect(d.contactName).toBe("김부모"); // the requester (booking contact)
    expect(d.contactEmail).toBe(""); // PHONE path collects no email (payment follows the call)
    expect(d.form.groups.practical.preferredCallTime).toBe("2026-06-08T10:00");
    expect(d.form.groups.protagonist.name).toBe(""); // child details are filled live during the call
  });
});

describe("customRequestStore — hermetic in-memory repository", () => {
  const draft = () =>
    buildWrittenIntake({
      contactName: "김부모",
      contactPhone: "010",
      contactEmail: "parent@example.com",
      answers: { protagonist: { name: "서연" } },
    });

  it("create → get round-trips with a unique cr_ id + createdAt", async () => {
    const rec = await customRequestStore.create(draft());
    expect(rec.id).toMatch(/^cr_/);
    expect(rec.createdAt).toBeTruthy();
    expect((await customRequestStore.get(rec.id))?.contactName).toBe("김부모");
  });

  it("markSubmitted flips PENDING_PAYMENT → SUBMITTED", async () => {
    const rec = await customRequestStore.create(draft());
    expect(rec.status).toBe("PENDING_PAYMENT");
    expect((await customRequestStore.markSubmitted(rec.id))?.status).toBe("SUBMITTED");
  });

  it("unknown id → undefined for get and markSubmitted", async () => {
    expect(await customRequestStore.get("cr_nope")).toBeUndefined();
    expect(await customRequestStore.markSubmitted("cr_nope")).toBeUndefined();
  });

  it("assigns distinct ids across creates", async () => {
    const a = await customRequestStore.create(buildPhoneIntake({ slot: "s", name: "n", phone: "p", memo: "" }));
    const b = await customRequestStore.create(buildPhoneIntake({ slot: "s", name: "n", phone: "p", memo: "" }));
    expect(a.id).not.toBe(b.id);
  });

  it("linkOrder attaches the settled Order id once — idempotent, first link wins (F052)", async () => {
    const rec = await customRequestStore.create(draft());
    expect(rec.orderId).toBeUndefined();
    expect((await customRequestStore.linkOrder(rec.id, rec.id))?.orderId).toBe(rec.id);
    expect((await customRequestStore.linkOrder(rec.id, "ord_other"))?.orderId).toBe(rec.id); // no overwrite
    expect((await customRequestStore.get(rec.id))?.orderId).toBe(rec.id);
    expect(await customRequestStore.linkOrder("cr_nope", "x")).toBeUndefined();
  });
});

// ── F061: admin listing + conditional status moves + 상담 확정 ─────────────────────
describe("custom admin surface (F061)", () => {
  const draft = () =>
    buildWrittenIntake({
      contactName: "김부모",
      contactPhone: "010",
      contactEmail: "parent@example.com",
      answers: { protagonist: { name: "서연" } },
    });
  const ALL: readonly CustomStatus[] = ["PENDING_PAYMENT", "SUBMITTED", "IN_REVIEW", "IN_PRODUCTION", "COMPLETED", "CANCELLED"];
  const ALLOWED: ReadonlyArray<[CustomStatus, CustomStatus]> = [
    ["PENDING_PAYMENT", "CANCELLED"],
    ["SUBMITTED", "IN_REVIEW"],
    ["SUBMITTED", "CANCELLED"],
    ["IN_REVIEW", "IN_PRODUCTION"],
    ["IN_REVIEW", "CANCELLED"],
    ["IN_PRODUCTION", "COMPLETED"],
    ["IN_PRODUCTION", "CANCELLED"],
  ];

  it("canTransitionCustom matches the table EXHAUSTIVELY (PENDING_PAYMENT→SUBMITTED = settle-only)", () => {
    const allowed = new Set(ALLOWED.map(([f, t]) => `${f}>${t}`));
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canTransitionCustom(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
    for (const s of ALL) expect(CUSTOM_STATUS_LABEL[s].length).toBeGreaterThan(0);
  });

  it("list filters by path/status, newest first, bounded take", async () => {
    const store = createInMemoryCustomBackend();
    const w = await store.create(draft());
    const p = await store.create(buildPhoneIntake({ slot: "2026-06-08T10:00", name: "n", phone: "p", memo: "" }));

    expect((await store.list()).map((r) => r.id).sort()).toEqual([w.id, p.id].sort());
    expect((await store.list({ path: "PHONE" })).map((r) => r.id)).toEqual([p.id]);
    expect((await store.list({ status: "PENDING_PAYMENT" })).map((r) => r.id)).toEqual([w.id]);
    expect((await store.list({ take: 1 })).length).toBe(1);
  });

  it("updateStatus is a conditional write — replays and wrong-from moves are honest no-ops", async () => {
    const store = createInMemoryCustomBackend();
    const rec = await store.create(draft());
    await store.markSubmitted(rec.id);

    expect((await store.updateStatus(rec.id, ["IN_REVIEW"], "IN_PRODUCTION")).ok).toBe(false); // still SUBMITTED
    expect((await store.updateStatus(rec.id, ["SUBMITTED"], "IN_REVIEW")).ok).toBe(true);
    expect((await store.updateStatus(rec.id, ["SUBMITTED"], "IN_REVIEW")).ok).toBe(false); // replay
    expect((await store.get(rec.id))?.status).toBe("IN_REVIEW");
    expect((await store.updateStatus("cr_nope", ["SUBMITTED"], "IN_REVIEW")).ok).toBe(false);
  });

  it("confirmConsultation flips REQUESTED→CONFIRMED exactly once; WRITTEN(무상담) requests never", async () => {
    const store = createInMemoryCustomBackend();
    const phone = await store.create(buildPhoneIntake({ slot: "2026-06-08T10:00", name: "n", phone: "p", memo: "" }));
    expect((await store.confirmConsultation(phone.id)).ok).toBe(true);
    expect((await store.get(phone.id))?.consultation?.status).toBe("CONFIRMED");
    expect((await store.confirmConsultation(phone.id)).ok).toBe(false); // replay

    const written = await store.create(draft());
    expect((await store.confirmConsultation(written.id)).ok).toBe(false); // no consultation at all
  });
});
