/**
 * 맞춤 제작 (full-custom) domain core — F020–F023.
 *
 * One shared **6-group 의뢰서** (web-brief §4 "공통 의뢰서 양식") is the single source of
 * truth for BOTH intake paths (PHONE 전화 상담 예약 / WRITTEN 글로 작성), so production input
 * is homogeneous regardless of how a customer entered (F023). The phone script == the web form.
 *
 * This module is pure: **no DB, no network, no logging** (mirrors ADR-0002). Persistence is an
 * in-memory repository cached on `globalThis` (same singleton pattern as `db.ts`) — the hermetic
 * store the dev server + Playwright run against. A production deployment swaps a Prisma-backed
 * adapter behind the same `customRequestStore` surface (the `CustomRequest`/`Consultation` models
 * already exist in `schema.prisma`); that seam is documented, not silently skipped (see the design
 * spec, D1). Payments go through the provider-agnostic `PaymentProvider` (relative import keeps
 * vitest — which has no `@/` alias — resolving this file under `tests/unit`).
 */
import {
  TossPaymentProvider,
  tossFromEnv,
  type PaymentProvider,
  type TossTransport,
} from "./payments";
import type { Db } from "./db";

/** 맞춤 제작 price — 119,000 KRW won (integer, no minor unit). */
export const CUSTOM_PRICE_WON = 119000;

export type GroupKey =
  | "protagonist"
  | "people"
  | "motivation"
  | "direction"
  | "expression"
  | "practical";

export interface FormFieldDef {
  key: string;
  label: string;
}

export interface FormGroupDef {
  key: GroupKey;
  title: string;
  /** the 계기와 마음 group is the ★ core material of a full-custom book (web-brief §4). */
  star?: boolean;
  fields: FormFieldDef[];
}

/**
 * The 6-group request form. Both paths render / collect against THIS definition, and every
 * stored `CustomForm` carries every group + field (missing → ""), which is what makes the
 * production input homogeneous (F023). Answers are free text — the groups are conversation
 * prompts that read naturally whether spoken on a call or typed at night.
 */
export const CUSTOM_FORM_GROUPS: readonly FormGroupDef[] = [
  {
    key: "protagonist",
    title: "주인공 아이",
    fields: [
      { key: "name", label: "이름" },
      { key: "nickname", label: "애칭" },
      { key: "ageGender", label: "나이 · 성별" },
      { key: "appearance", label: "외형 묘사 (사진은 결제 후 마이페이지에서)" },
      { key: "personality", label: "성격 한마디" },
      { key: "currentlyInto", label: "요즘 푹 빠진 것" },
      { key: "habits", label: "자주 하는 말 · 행동 · 습관" },
    ],
  },
  {
    key: "people",
    title: "함께하는 사람들",
    fields: [
      { key: "relationToChild", label: "의뢰인과 아이의 관계" },
      { key: "familyToInclude", label: "책에 등장했으면 하는 가족 (호칭 포함)" },
      { key: "siblings", label: "형제자매 (이름 · 나이)" },
    ],
  },
  {
    key: "motivation",
    title: "이 책의 계기와 마음",
    star: true,
    fields: [
      { key: "occasion", label: "어떤 순간 · 기념일을 위한 책인지" },
      { key: "messageToConvey", label: "아이에게 꼭 전하고 싶은 한 가지" },
      { key: "specialEpisode", label: "아이에 얽힌 특별한 사연 · 에피소드" },
    ],
  },
  {
    key: "direction",
    title: "이야기 방향",
    fields: [
      { key: "mood", label: "원하는 분위기 (따뜻한 / 모험적인 / 잔잔한 / 유쾌한 등)" },
      { key: "references", label: "좋아하는 동화 · 레퍼런스" },
      { key: "avoid", label: "피하고 싶은 소재 · 요소" },
    ],
  },
  {
    key: "expression",
    title: "표현 취향 (선택 · 위임 가능)",
    fields: [
      { key: "writingStyle", label: "문체 느낌" },
      { key: "illustrationMood", label: "삽화 분위기" },
      { key: "delegateToExpert", label: "전문가에게 맡길게요" },
    ],
  },
  {
    key: "practical",
    title: "실무 정보",
    fields: [
      { key: "desiredCompletionDate", label: "완성 희망일" },
      { key: "recipientShipping", label: "받는 분 · 배송지" },
      { key: "contact", label: "연락처" },
      { key: "preferredCallTime", label: "상담 희망 시간대 (전화 경로)" },
    ],
  },
] as const;

export interface CustomForm {
  version: 1;
  groups: Record<GroupKey, Record<string, string>>;
}

export type CustomPath = "PHONE" | "WRITTEN";

export type CustomStatus =
  | "PENDING_PAYMENT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "IN_PRODUCTION"
  | "COMPLETED"
  | "CANCELLED";

export type ConsultationStatus = "REQUESTED" | "CONFIRMED" | "DONE" | "CANCELLED";

export interface StoredConsultation {
  requestedSlot: string;
  status: ConsultationStatus;
  note: string;
}

export interface StoredCustomRequest {
  id: string;
  path: CustomPath;
  status: CustomStatus;
  form: CustomForm;
  /** booking/requester contact — PII (sensitive): never logged/traced in plaintext. */
  contactName: string;
  contactPhone: string;
  amountWon: number;
  consultation?: StoredConsultation;
  createdAt: string;
}

/** A request before it is persisted (the store assigns `id` + `createdAt`). */
export type CustomRequestDraft = Omit<StoredCustomRequest, "id" | "createdAt">;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface WrittenInput {
  contactName: string;
  contactPhone: string;
  /** free-form 6-group answers keyed by group → field; normalized by `buildCustomForm`. */
  answers: Record<string, unknown>;
}

export interface PhoneInput {
  slot: string;
  name: string;
  phone: string;
  memo: string;
}

// ── small, defensive helpers (input is untrusted; never throw) ──────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return ""; // null/undefined/object/array → "" (drop, never interpret as structure)
}

/**
 * Normalize free-form (untrusted) answers into the canonical `CustomForm`: every group + field
 * from `CUSTOM_FORM_GROUPS` is present, values trimmed, unknown keys ignored, non-strings coerced.
 * Path-agnostic by construction → both paths yield the identical shape (the F023 invariant).
 */
export function buildCustomForm(rawAnswers: Record<string, unknown> = {}): CustomForm {
  const source = isRecord(rawAnswers) ? rawAnswers : {};
  const groups = {} as Record<GroupKey, Record<string, string>>;
  for (const g of CUSTOM_FORM_GROUPS) {
    const rawGroup = source[g.key];
    const groupSource = isRecord(rawGroup) ? rawGroup : {};
    const fields: Record<string, string> = {};
    for (const f of g.fields) fields[f.key] = coerceStr(groupSource[f.key]);
    groups[g.key] = fields;
  }
  return { version: 1, groups };
}

export function validateWrittenInput(input: unknown): ValidationResult<WrittenInput> {
  const obj = isRecord(input) ? input : {};
  const contactName = coerceStr(obj.contactName);
  const contactPhone = coerceStr(obj.contactPhone);
  const answers = isRecord(obj.answers) ? obj.answers : {};
  const protagonist = isRecord(answers.protagonist) ? answers.protagonist : {};
  const childName = coerceStr(protagonist.name);

  const errors: string[] = [];
  if (!childName) errors.push("아이 이름을 입력해 주세요.");
  if (!contactName) errors.push("의뢰인 이름을 입력해 주세요.");
  if (!contactPhone) errors.push("연락처를 입력해 주세요.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { contactName, contactPhone, answers } };
}

export function validatePhoneInput(input: unknown): ValidationResult<PhoneInput> {
  const obj = isRecord(input) ? input : {};
  const slot = coerceStr(obj.slot);
  const name = coerceStr(obj.name);
  const phone = coerceStr(obj.phone);
  const memo = coerceStr(obj.memo);

  const errors: string[] = [];
  // Slot must be the exact 16-char wall-clock shape the picker emits. It is untrusted (a client can
  // POST anything) and is later stored in a DateTime column — a malformed/seconds-bearing value would
  // be timezone-shifted or rejected by the DB. Reject it at the boundary so the round-trip is exact.
  if (!slot) errors.push("상담 희망 시간을 선택해 주세요.");
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) errors.push("상담 희망 시간 형식이 올바르지 않습니다.");
  if (!name) errors.push("이름을 입력해 주세요.");
  if (!phone) errors.push("연락처를 입력해 주세요.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { slot, name, phone, memo } };
}

/** WRITTEN: pay first → submit. Stored PENDING_PAYMENT until the test payment settles (→ SUBMITTED). */
export function buildWrittenIntake(input: WrittenInput): CustomRequestDraft {
  return {
    path: "WRITTEN",
    status: "PENDING_PAYMENT",
    form: buildCustomForm(input.answers),
    contactName: coerceStr(input.contactName),
    contactPhone: coerceStr(input.contactPhone),
    amountWon: CUSTOM_PRICE_WON,
  };
}

/**
 * PHONE: booking is free; payment follows the call (web-brief §4). The intake record is SUBMITTED
 * (the request is in), while the Consultation is REQUESTED — a customer *request*, NOT the
 * irreversible operator-side 예약 확정 (which is guarded by `requireApproval("consultation.book")`).
 * Child details are filled live on the call, so the form carries only the known booking facts.
 */
export function buildPhoneIntake(input: PhoneInput): CustomRequestDraft {
  return {
    path: "PHONE",
    status: "SUBMITTED",
    form: buildCustomForm({
      practical: { preferredCallTime: input.slot, contact: input.phone },
    }),
    contactName: coerceStr(input.name),
    contactPhone: coerceStr(input.phone),
    amountWon: CUSTOM_PRICE_WON,
    consultation: { requestedSlot: input.slot, status: "REQUESTED", note: coerceStr(input.memo) },
  };
}

// ── repository: in-memory (hermetic) OR Prisma (when DATABASE_URL is set) ────────
// 맞춤 제작 is the highest-value product (119,000원) — a lost request is a lost order, so the
// store persists to the CustomRequest/Consultation tables whenever a DB is configured. One async
// surface; the in-memory backend is the hermetic path for pnpm check + Playwright (ADR-0002).
interface CustomBackend {
  create(draft: CustomRequestDraft): Promise<StoredCustomRequest>;
  get(id: string): Promise<StoredCustomRequest | undefined>;
  markSubmitted(id: string): Promise<StoredCustomRequest | undefined>;
}

interface MemStore {
  map: Map<string, StoredCustomRequest>;
  seq: number;
}

function createInMemoryBackend(): CustomBackend {
  const s: MemStore = { map: new Map(), seq: 0 };
  return {
    async create(draft) {
      const id = `cr_${(++s.seq).toString(36).padStart(4, "0")}`;
      const rec: StoredCustomRequest = { ...draft, id, createdAt: new Date().toISOString() };
      s.map.set(id, rec);
      return rec;
    },
    async get(id) {
      return s.map.get(id);
    },
    async markSubmitted(id) {
      const rec = s.map.get(id);
      if (!rec) return undefined;
      if (rec.status === "PENDING_PAYMENT") rec.status = "SUBMITTED";
      return rec;
    },
  };
}

// Slots are tz-naive wall-clock strings ("YYYY-MM-DDTHH:MM"); store as UTC so the displayed
// value round-trips exactly (no timezone shift), and slice back to the same 16-char shape.
function slotToDate(slot: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot) ? `${slot}:00Z` : slot);
}
function dateToSlot(d: Date): string {
  return d.toISOString().slice(0, 16);
}

type CustomDelegate = {
  create(args: { data: unknown; include: { consultation: true } }): Promise<CustomRow>;
  findUnique(args: { where: { id: string }; include: { consultation: true } }): Promise<CustomRow | null>;
  updateMany(args: { where: { id: string; status: "PENDING_PAYMENT" }; data: { status: "SUBMITTED" } }): Promise<{ count: number }>;
};
type CustomRow = {
  id: string;
  path: CustomPath;
  status: CustomStatus;
  form: unknown;
  contactName: string;
  contactPhone: string;
  createdAt: Date | string;
  consultation: { requestedSlot: Date | string; status: ConsultationStatus; note: string | null } | null;
};

function mapCustomRow(row: CustomRow): StoredCustomRequest {
  return {
    id: row.id,
    path: row.path,
    status: row.status,
    form: row.form as CustomForm,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    amountWon: CUSTOM_PRICE_WON, // fixed price (no column); recomputed on read
    consultation: row.consultation
      ? {
          requestedSlot: typeof row.consultation.requestedSlot === "string" ? row.consultation.requestedSlot : dateToSlot(row.consultation.requestedSlot),
          status: row.consultation.status,
          note: row.consultation.note ?? "",
        }
      : undefined,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
  };
}

export function createPrismaBackend(getDb: () => Promise<Db>): CustomBackend {
  return {
    async create(draft) {
      const db = await getDb();
      const row = await (db.customRequest as CustomDelegate).create({
        data: {
          path: draft.path,
          status: draft.status,
          form: draft.form,
          contactName: draft.contactName,
          contactPhone: draft.contactPhone,
          consultation: draft.consultation
            ? { create: { requestedSlot: slotToDate(draft.consultation.requestedSlot), status: draft.consultation.status, note: draft.consultation.note } }
            : undefined,
        },
        include: { consultation: true },
      });
      return mapCustomRow(row);
    },
    async get(id) {
      const db = await getDb();
      const row = await (db.customRequest as CustomDelegate).findUnique({ where: { id }, include: { consultation: true } });
      return row ? mapCustomRow(row) : undefined;
    },
    async markSubmitted(id) {
      const db = await getDb();
      await (db.customRequest as CustomDelegate).updateMany({ where: { id, status: "PENDING_PAYMENT" }, data: { status: "SUBMITTED" } });
      const row = await (db.customRequest as CustomDelegate).findUnique({ where: { id }, include: { consultation: true } });
      return row ? mapCustomRow(row) : undefined;
    },
  };
}

const g = globalThis as unknown as { __customMem?: CustomBackend; __customDb?: CustomBackend };
const getDbLazy = (): Promise<Db> => import("./db").then((m) => m.getDb());

function backend(): CustomBackend {
  if (process.env.DATABASE_URL) return (g.__customDb ??= createPrismaBackend(getDbLazy));
  return (g.__customMem ??= createInMemoryBackend());
}

/** Repository surface (async). Production persists to Prisma; hermetic runs use the in-memory backend. */
export const customRequestStore = {
  create: (draft: CustomRequestDraft): Promise<StoredCustomRequest> => backend().create(draft),
  get: (id: string): Promise<StoredCustomRequest | undefined> => backend().get(id),
  /** Settle a WRITTEN request once its (test) payment is PAID. */
  markSubmitted: (id: string): Promise<StoredCustomRequest | undefined> => backend().markSubmitted(id),
};

/**
 * Payment provider for the WRITTEN path. In production, real keys from env (real `fetch`). Outside
 * production (dev / Playwright / `pnpm check`), a sandbox transport stands in so the flow is
 * hermetic — confirm() resolves a test paymentKey to a PAID settlement without touching the network
 * (ADR-0010 made the transport injectable for exactly this; the build is test/sandbox-only per
 * ADR-0004). The stub is impossible when APP_ENV === "production".
 */
export function customTossProvider(
  env: Record<string, string | undefined> = process.env,
): PaymentProvider {
  if (env.APP_ENV === "production") return tossFromEnv(env);
  const sandboxTransport: TossTransport = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "DONE", approvedAt: new Date().toISOString() }),
  });
  return new TossPaymentProvider({
    secretKey: env.TOSS_SECRET_KEY ?? "test_sk_customsandbox",
    clientKey: env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_customsandbox",
    transport: sandboxTransport,
  });
}
