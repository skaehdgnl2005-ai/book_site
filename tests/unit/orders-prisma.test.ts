import { describe, it, expect } from "vitest";
import {
  buildOrderCreateData,
  mapOrderRow,
  type OrderDraft,
  type OrderRow,
  type OrderRowItem,
  type StoredOrder,
} from "../../src/app/api/payments/_lib/orders";

// ── fixtures ──────────────────────────────────────────────────────────────────
function draft(over: Partial<OrderDraft> = {}): OrderDraft {
  return {
    amountWon: 43000,
    orderName: "탄생",
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    items: [
      {
        templateKey: "birth",
        templateLabel: "탄생",
        coverType: "SOFT",
        unitPriceWon: 43000,
        personalization: {
          childName: "도윤",
          childGender: "MALE",
          extraVar: { kind: "BIRTHDATE", value: "2024-01-15" },
        },
        photo: null,
      },
    ],
    ...over,
  };
}

const idForKey: (key: string) => string | undefined = (key) =>
  ({ birth: "tpl_birth", became_sibling: "tpl_sibling" } as Record<string, string>)[key];

// ── buildOrderCreateData: domain draft → Prisma create input (pure) ─────────────
describe("buildOrderCreateData", () => {
  it("sets id, tossOrderId (== id), CREATED status, and authoritative amount", () => {
    const data = buildOrderCreateData(draft(), "ord_x", idForKey);
    expect(data.id).toBe("ord_x");
    expect(data.tossOrderId).toBe("ord_x"); // our public id IS the toss order id
    expect(data.status).toBe("CREATED");
    expect(data.amountWon).toBe(43000);
    expect(data.qrVideoAddon).toBe(false);
    expect(data.buyerName).toBe("김부모");
    expect(data.buyerEmail).toBe("parent@example.com");
  });

  it("connects each item to the resolved templateId + nests personalization", () => {
    const data = buildOrderCreateData(draft(), "ord_x", idForKey);
    const item = data.items.create[0];
    expect(item.templateId).toBe("tpl_birth");
    expect(item.coverType).toBe("SOFT");
    expect(item.unitPriceWon).toBe(43000);
    expect(item.position).toBe(0); // 0-based index within the order
    expect(item.personalization.create.childName).toBe("도윤");
    expect(item.personalization.create.childGender).toBe("MALE");
    expect(item.personalization.create.extraVar).toEqual({ kind: "BIRTHDATE", value: "2024-01-15" });
  });

  it("nests a CHILD_PHOTO asset only when a photo descriptor is present", () => {
    const withPhoto = buildOrderCreateData(
      draft({
        items: [
          {
            ...draft().items[0],
            photo: { storageKey: "child-photo/abc.jpg", contentType: "image/jpeg", byteSize: 1234 },
          },
        ],
      }),
      "ord_p",
      idForKey,
    );
    const pers = withPhoto.items.create[0].personalization.create;
    expect(pers.photoAsset?.create).toEqual({
      kind: "CHILD_PHOTO",
      storageKey: "child-photo/abc.jpg",
      contentType: "image/jpeg",
      byteSize: 1234,
    });
    // no photo → no nested asset
    expect(buildOrderCreateData(draft(), "ord_n", idForKey).items.create[0].personalization.create.photoAsset).toBeUndefined();
  });

  it("throws when a templateKey cannot be resolved to an id (integrity guard)", () => {
    expect(() => buildOrderCreateData(draft({ items: [{ ...draft().items[0], templateKey: "ghost" }] }), "ord_x", idForKey)).toThrow();
  });

  it("defaults kind to ENTRY; a CUSTOM draft carries kind + an empty item set (F052)", () => {
    expect(buildOrderCreateData(draft(), "ord_x", idForKey).kind).toBe("ENTRY");
    const data = buildOrderCreateData(draft({ kind: "CUSTOM", items: [], amountWon: 119000 }), "cr_abc", idForKey);
    expect(data.kind).toBe("CUSTOM");
    expect(data.id).toBe("cr_abc");
    expect(data.tossOrderId).toBe("cr_abc"); // Order.id === tossOrderId === CustomRequest.id
    expect(data.items.create).toEqual([]);
    expect(data.amountWon).toBe(119000);
  });

  it("carries the shipping block (F053) — null when absent (CUSTOM/legacy drafts)", () => {
    const shipped = buildOrderCreateData(
      draft({ shipName: "김수취", shipPhone: "010-2222-3333", shipZip: "04524", shipAddress: "서울특별시 중구 세종대로 110" }),
      "ord_s",
      idForKey,
    );
    expect(shipped.shipName).toBe("김수취");
    expect(shipped.shipPhone).toBe("010-2222-3333");
    expect(shipped.shipZip).toBe("04524");
    expect(shipped.shipAddress).toBe("서울특별시 중구 세종대로 110");
    const bare = buildOrderCreateData(draft(), "ord_b", idForKey);
    expect(bare.shipName).toBeNull();
    expect(bare.shipZip).toBeNull();
  });
});

// ── mapOrderRow: Prisma row (with includes) → app StoredOrder (pure) ─────────────
function item(over: Partial<OrderRowItem> = {}): OrderRowItem {
  return {
    coverType: "SOFT",
    unitPriceWon: 43000,
    template: { key: "birth", label: "탄생" },
    personalization: {
      childName: "도윤",
      childGender: "MALE",
      extraVar: { kind: "BIRTHDATE", value: "2024-01-15" },
      photoAsset: null,
    },
    ...over,
  };
}

function row(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "ord_x",
    status: "PAID",
    tossPaymentKey: "pk_1",
    amountWon: 43000,
    qrVideoAddon: false,
    buyerName: "김부모",
    buyerEmail: "parent@example.com",
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    items: [item()],
    ...over,
  };
}

describe("mapOrderRow", () => {
  it("maps a PAID row to a StoredOrder with recomputed PII-free orderName", () => {
    const o: StoredOrder = mapOrderRow(row());
    expect(o.id).toBe("ord_x");
    expect(o.status).toBe("PAID");
    expect(o.tossPaymentKey).toBe("pk_1");
    expect(o.amountWon).toBe(43000);
    expect(o.orderName).toBe("탄생"); // recomputed from item labels, no buyer/child PII
    expect(o.createdAt).toBe("2026-06-02T00:00:00.000Z");
    expect(o.items[0]).toMatchObject({
      templateKey: "birth",
      templateLabel: "탄생",
      coverType: "SOFT",
      unitPriceWon: 43000,
      personalization: { childName: "도윤", childGender: "MALE", extraVar: { kind: "BIRTHDATE", value: "2024-01-15" } },
      photo: null,
    });
  });

  it("names a multi-item order '<label> 외 N건'", () => {
    const o = mapOrderRow(
      row({
        items: [
          item(),
          item({
            coverType: "HARD",
            unitPriceWon: 49000,
            template: { key: "became_sibling", label: "형아 된 날" },
            personalization: { childName: "하준", childGender: "MALE", extraVar: null, photoAsset: null },
          }),
        ],
      }),
    );
    expect(o.orderName).toBe("탄생 외 1건");
    expect(o.items).toHaveLength(2);
    expect(o.items[1].personalization.extraVar).toBeNull();
  });

  it("maps a present photoAsset to a photo descriptor", () => {
    const o = mapOrderRow(
      row({
        items: [
          item({
            personalization: {
              childName: "도윤",
              childGender: "MALE",
              extraVar: { kind: "BIRTHDATE", value: "2024-01-15" },
              photoAsset: { storageKey: "child-photo/x.png", contentType: "image/png", byteSize: 99 },
            },
          }),
        ],
      }),
    );
    expect(o.items[0].photo).toEqual({ storageKey: "child-photo/x.png", contentType: "image/png", byteSize: 99 });
  });

  it("treats any non-PAID DB status as CREATED (the app's binary status)", () => {
    expect(mapOrderRow(row({ status: "CREATED", tossPaymentKey: null })).status).toBe("CREATED");
    expect(mapOrderRow(row({ status: "IN_PRODUCTION" })).status).toBe("CREATED");
  });

  it("maps kind (default ENTRY) and names a zero-item CUSTOM order by its fixed product (F052)", () => {
    expect(mapOrderRow(row()).kind).toBe("ENTRY");
    const custom = mapOrderRow(row({ kind: "CUSTOM", items: [] }));
    expect(custom.kind).toBe("CUSTOM");
    expect(custom.orderName).toBe("맞춤 제작 그림책"); // no items to recompute from — fixed, PII-free
    expect(custom.items).toEqual([]);
  });

  it("passes the shipping block through (F053) — undefined when the row has none", () => {
    const shipped = mapOrderRow(
      row({ shipName: "김수취", shipPhone: "010-2222-3333", shipZip: "04524", shipAddress: "서울특별시 중구 세종대로 110" }),
    );
    expect(shipped.shipName).toBe("김수취");
    expect(shipped.shipPhone).toBe("010-2222-3333");
    expect(shipped.shipZip).toBe("04524");
    expect(shipped.shipAddress).toBe("서울특별시 중구 세종대로 110");
    const bare = mapOrderRow(row());
    expect(bare.shipName).toBeUndefined();
    expect(bare.shipAddress).toBeUndefined();
  });
});

// ── in-memory repo: explicit id + kind (F052 — CUSTOM orders reuse the same repo) ──
describe("createOrderRepo — explicit id / kind", () => {
  it("uses a caller-provided id (CUSTOM: = CustomRequest.id) and defaults kind to ENTRY", async () => {
    const { createOrderRepo } = await import("../../src/app/api/payments/_lib/orders");
    const repo = createOrderRepo();
    const entry = await repo.create(draft());
    expect(entry.kind).toBe("ENTRY");
    expect(entry.id).toMatch(/^ord_/);

    const custom = await repo.create(draft({ kind: "CUSTOM", id: "cr_zz01", items: [], amountWon: 119000, orderName: "맞춤 제작 그림책" }));
    expect(custom.id).toBe("cr_zz01");
    expect(custom.kind).toBe("CUSTOM");
    expect(custom.status).toBe("CREATED");
    expect((await repo.get("cr_zz01"))?.amountWon).toBe(119000);
    expect((await repo.markPaid("cr_zz01", "pk_c"))?.status).toBe("PAID");
  });
});
