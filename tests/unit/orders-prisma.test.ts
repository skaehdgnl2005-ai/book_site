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
});
