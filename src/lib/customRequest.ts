/**
 * 맞춤 제작 (full-custom) domain core — F020–F023.
 *
 * One shared **6-group 의뢰서** (web-brief §4 "공통 의뢰서 양식") is the single source of
 * truth for BOTH intake paths (PHONE 전화 상담 예약 / WRITTEN 글로 작성), so production input
 * is homogeneous regardless of how a customer entered (F023). The phone script == the web form.
 *
 * The domain helpers here are pure: **no network, no logging** (mirrors ADR-0002). Persistence is
 * `customRequestStore` with TWO backends behind one async surface (ADR-0016): Prisma
 * (`CustomRequest`/`Consultation` tables) whenever `DATABASE_URL` is set, else an in-memory map
 * cached on `globalThis` — the hermetic store `pnpm check` + Playwright run against. Since F052 a
 * settled WRITTEN payment also persists an `Order(kind=CUSTOM)` (id = CustomRequest.id =
 * tossOrderId) via the shared `orderRepo`, and `CustomRequest.orderId` links to it — see
 * `src/app/api/custom/_lib/settle.ts`. Payments go through the provider-agnostic
 * `PaymentProvider` (relative import keeps vitest — which has no `@/` alias — resolving this
 * file under `tests/unit`).
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

/** PII-free product name for a CUSTOM order — payment window, Order.orderName, admin lists. */
export const CUSTOM_ORDER_NAME = "맞춤 제작 그림책";

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

// F061 — 의뢰 상태 전이표 (관리자 백오피스). PENDING_PAYMENT→SUBMITTED는 결제 정산(settle.ts)
// 전용이라 표에 없다 — 관리자가 결제를 손으로 넘길 수 없다(F054의 markPaid 원칙과 동형).
const CUSTOM_ALLOWED: Record<CustomStatus, readonly CustomStatus[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  SUBMITTED: ["IN_REVIEW", "CANCELLED"],
  IN_REVIEW: ["IN_PRODUCTION", "CANCELLED"],
  IN_PRODUCTION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionCustom(from: CustomStatus, to: CustomStatus): boolean {
  return CUSTOM_ALLOWED[from]?.includes(to) ?? false;
}

export const CUSTOM_STATUS_LABEL: Record<CustomStatus, string> = {
  PENDING_PAYMENT: "결제 대기",
  SUBMITTED: "접수됨",
  IN_REVIEW: "검토중",
  IN_PRODUCTION: "제작중",
  COMPLETED: "완료",
  CANCELLED: "취소됨",
};

export const CONSULTATION_STATUS_LABEL: Record<ConsultationStatus, string> = {
  REQUESTED: "요청됨",
  CONFIRMED: "확정",
  DONE: "완료",
  CANCELLED: "취소됨",
};

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
  /** WRITTEN: required (becomes the CUSTOM Order's buyerEmail, F052). PHONE: "" (no upfront pay). */
  contactEmail: string;
  amountWon: number;
  /** The settled Order(kind=CUSTOM) this request was paid under ("결제 후" link, F052). */
  orderId?: string;
  consultation?: StoredConsultation;
  createdAt: string;
}

/** A request before it is persisted (the store assigns `id` + `createdAt`; `orderId` links later). */
export type CustomRequestDraft = Omit<StoredCustomRequest, "id" | "createdAt" | "orderId">;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface WrittenInput {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
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

// Same rule as the entry checkout (`buildOrderDraft`'s EMAIL_RE) — one buyer-email discipline.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateWrittenInput(input: unknown): ValidationResult<WrittenInput> {
  const obj = isRecord(input) ? input : {};
  const contactName = coerceStr(obj.contactName);
  const contactPhone = coerceStr(obj.contactPhone);
  const contactEmail = coerceStr(obj.contactEmail);
  const answers = isRecord(obj.answers) ? obj.answers : {};
  const protagonist = isRecord(answers.protagonist) ? answers.protagonist : {};
  const childName = coerceStr(protagonist.name);

  const errors: string[] = [];
  if (!childName) errors.push("아이 이름을 입력해 주세요.");
  if (!contactName) errors.push("의뢰인 이름을 입력해 주세요.");
  if (!contactPhone) errors.push("연락처를 입력해 주세요.");
  // F052: the settled payment persists an Order whose buyerEmail is required — collect it up front.
  if (!EMAIL_RE.test(contactEmail) || contactEmail.length > 254) errors.push("올바른 이메일을 입력해 주세요.");
  // F067 — 맞춤 제작도 주문제작 상품: 청약철회 제한은 결제 전 별도 고지 + 전자적 동의가
  // 있어야 유효(전자상거래법 17조 2항 6호). 서버가 최종 게이트.
  if (obj.withdrawalConsent !== true) errors.push("주문 제작 상품의 청약철회 제한 안내에 동의해 주세요.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { contactName, contactPhone, contactEmail, answers } };
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
    contactEmail: coerceStr(input.contactEmail),
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
    contactEmail: "", // no upfront payment on the PHONE path — email is collected later if needed
    amountWon: CUSTOM_PRICE_WON,
    consultation: { requestedSlot: input.slot, status: "REQUESTED", note: coerceStr(input.memo) },
  };
}

// ── repository: in-memory (hermetic) OR Prisma (when DATABASE_URL is set) ────────
// 맞춤 제작 is the highest-value product (119,000원) — a lost request is a lost order, so the
// store persists to the CustomRequest/Consultation tables whenever a DB is configured. One async
// surface; the in-memory backend is the hermetic path for pnpm check + Playwright (ADR-0002).
export interface CustomBackend {
  create(draft: CustomRequestDraft): Promise<StoredCustomRequest>;
  get(id: string): Promise<StoredCustomRequest | undefined>;
  markSubmitted(id: string): Promise<StoredCustomRequest | undefined>;
  /** Attach the settled Order(kind=CUSTOM) id — idempotent, first link wins (F052). */
  linkOrder(id: string, orderId: string): Promise<StoredCustomRequest | undefined>;
  /** F061 — admin listing: newest first, optional path/status filter, bounded take (default 50). */
  list(opts?: { path?: CustomPath; status?: CustomStatus; take?: number }): Promise<StoredCustomRequest[]>;
  /** F083 — honest full count over list's filter vocabulary, NO take cut (대시보드 '신규 맞춤' 타일). */
  count(opts?: { path?: CustomPath; status?: CustomStatus }): Promise<number>;
  /** F061 — conditional status move (updateMany idiom): applies only while status ∈ from. */
  updateStatus(id: string, from: readonly CustomStatus[], to: CustomStatus): Promise<{ ok: boolean }>;
  /** F061 — 상담 확정: REQUESTED→CONFIRMED, conditional. Caller holds the requireApproval gate. */
  confirmConsultation(id: string): Promise<{ ok: boolean }>;
}

interface MemStore {
  map: Map<string, StoredCustomRequest>;
  seq: number;
}

/** Exported for hermetic unit tests (settle.ts injection); the app uses `customRequestStore`. */
export function createInMemoryCustomBackend(): CustomBackend {
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
    async linkOrder(id, orderId) {
      const rec = s.map.get(id);
      if (!rec) return undefined;
      if (!rec.orderId) rec.orderId = orderId; // first link wins (mirrors markPaid's first-key rule)
      return rec;
    },
    async list(opts = {}) {
      const take = opts.take ?? 50;
      return [...s.map.values()]
        .filter((r) => (opts.path ? r.path === opts.path : true))
        .filter((r) => (opts.status ? r.status === opts.status : true))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, take);
    },
    async count(opts = {}) {
      // Full scan, NO take — the dashboard tile is honest even when the list is cut (F083).
      return [...s.map.values()]
        .filter((r) => (opts.path ? r.path === opts.path : true))
        .filter((r) => (opts.status ? r.status === opts.status : true)).length;
    },
    async updateStatus(id, from, to) {
      const rec = s.map.get(id);
      if (!rec || !from.includes(rec.status)) return { ok: false };
      rec.status = to;
      return { ok: true };
    },
    async confirmConsultation(id) {
      const rec = s.map.get(id);
      if (!rec?.consultation || rec.consultation.status !== "REQUESTED") return { ok: false };
      rec.consultation.status = "CONFIRMED";
      return { ok: true };
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
  findMany(args: {
    where: { path?: CustomPath; status?: CustomStatus };
    orderBy: { createdAt: "desc" };
    take?: number;
    include: { consultation: true };
  }): Promise<CustomRow[]>;
  updateMany(args: {
    where: { id: string; status?: "PENDING_PAYMENT" | { in: CustomStatus[] }; orderId?: null };
    data: { status?: CustomStatus; orderId?: string };
  }): Promise<{ count: number }>;
  count(args: { where: { path?: CustomPath; status?: CustomStatus } }): Promise<number>;
};
type ConsultationDelegate = {
  updateMany(args: {
    where: { customRequestId: string; status: "REQUESTED" };
    data: { status: "CONFIRMED" };
  }): Promise<{ count: number }>;
};
type CustomRow = {
  id: string;
  path: CustomPath;
  status: CustomStatus;
  form: unknown;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null; // nullable column (pre-F052 rows have none)
  orderId?: string | null;
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
    contactEmail: row.contactEmail ?? "",
    orderId: row.orderId ?? undefined,
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
          contactEmail: draft.contactEmail || null,
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
    async linkOrder(id, orderId) {
      const db = await getDb();
      // Conditional write: only an unlinked row takes the link (first link wins — idempotent).
      await (db.customRequest as CustomDelegate).updateMany({ where: { id, orderId: null }, data: { orderId } });
      const row = await (db.customRequest as CustomDelegate).findUnique({ where: { id }, include: { consultation: true } });
      return row ? mapCustomRow(row) : undefined;
    },
    async list(opts = {}) {
      const db = await getDb();
      const where: { path?: CustomPath; status?: CustomStatus } = {};
      if (opts.path) where.path = opts.path;
      if (opts.status) where.status = opts.status;
      const rows = await (db.customRequest as CustomDelegate).findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts.take ?? 50,
        include: { consultation: true },
      });
      return rows.map(mapCustomRow);
    },
    async count(opts = {}) {
      const db = await getDb();
      // Same where vocabulary as list, NO take — the honest tile total (F083).
      const where: { path?: CustomPath; status?: CustomStatus } = {};
      if (opts.path) where.path = opts.path;
      if (opts.status) where.status = opts.status;
      return (db.customRequest as CustomDelegate).count({ where });
    },
    async updateStatus(id, from, to) {
      const db = await getDb();
      const res = await (db.customRequest as CustomDelegate).updateMany({
        where: { id, status: { in: [...from] } },
        data: { status: to },
      });
      return { ok: res.count === 1 };
    },
    async confirmConsultation(id) {
      const db = await getDb();
      const res = await (db.consultation as ConsultationDelegate).updateMany({
        where: { customRequestId: id, status: "REQUESTED" },
        data: { status: "CONFIRMED" },
      });
      return { ok: res.count === 1 };
    },
  };
}

const g = globalThis as unknown as { __customMem?: CustomBackend; __customDb?: CustomBackend };
const getDbLazy = (): Promise<Db> => import("./db").then((m) => m.getDb());

function backend(): CustomBackend {
  if (process.env.DATABASE_URL) return (g.__customDb ??= createPrismaBackend(getDbLazy));
  return (g.__customMem ??= createInMemoryCustomBackend());
}

/** Repository surface (async). Production persists to Prisma; hermetic runs use the in-memory backend. */
export const customRequestStore = {
  create: (draft: CustomRequestDraft): Promise<StoredCustomRequest> => backend().create(draft),
  get: (id: string): Promise<StoredCustomRequest | undefined> => backend().get(id),
  /** Settle a WRITTEN request once its (test) payment is PAID. */
  markSubmitted: (id: string): Promise<StoredCustomRequest | undefined> => backend().markSubmitted(id),
  /** Attach the settled Order(kind=CUSTOM) id (F052) — idempotent, first link wins. */
  linkOrder: (id: string, orderId: string): Promise<StoredCustomRequest | undefined> =>
    backend().linkOrder(id, orderId),
  /** F061 — admin listing (newest first, optional path/status filter). */
  list: (opts?: { path?: CustomPath; status?: CustomStatus; take?: number }): Promise<StoredCustomRequest[]> =>
    backend().list(opts),
  /** F083 — honest full count (no take cut) over list's filter vocabulary. */
  count: (opts?: { path?: CustomPath; status?: CustomStatus }): Promise<number> => backend().count(opts),
  /** F061 — conditional status move; callers gate the pair via canTransitionCustom. */
  updateStatus: (id: string, from: readonly CustomStatus[], to: CustomStatus): Promise<{ ok: boolean }> =>
    backend().updateStatus(id, from, to),
  /** F061 — 상담 확정 (REQUESTED→CONFIRMED); requireApproval("consultation.book") gate at the caller. */
  confirmConsultation: (id: string): Promise<{ ok: boolean }> => backend().confirmConsultation(id),
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
  const sandboxTransport: TossTransport = async (url) => ({
    ok: true,
    status: 200,
    // POST …/cancel = refund (F063) → CANCELED; everything else settles DONE (confirm path).
    json: async () =>
      url.includes("/cancel")
        ? { status: "CANCELED" }
        : { status: "DONE", approvedAt: new Date().toISOString() },
  });
  return new TossPaymentProvider({
    secretKey: env.TOSS_SECRET_KEY ?? "test_sk_customsandbox",
    clientKey: env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "test_ck_customsandbox",
    transport: sandboxTransport,
  });
}
