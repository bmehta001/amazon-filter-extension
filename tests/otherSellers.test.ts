import { describe, it, expect } from "vitest";
import { extractOtherSellersInfo } from "../src/brand/fetcher";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("extractOtherSellersInfo", () => {
  it("extracts count and price from 'New (5) from $12.99'", () => {
    const doc = makeDoc(`<div id="olp-upd-new">New (5) from $12.99</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(5);
    expect(result.minPrice).toBeCloseTo(12.99);
  });

  it("extracts from '12 new from $9.99'", () => {
    const doc = makeDoc(`<div id="olp_feature_div">12 new from $9.99</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(12);
    expect(result.minPrice).toBeCloseTo(9.99);
  });

  it("extracts from '3 offers from $24.50'", () => {
    const doc = makeDoc(`<div id="ppd">3 offers from $24.50</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(3);
    expect(result.minPrice).toBeCloseTo(24.50);
  });

  it("handles prices with commas", () => {
    const doc = makeDoc(`<div id="olp-upd-new">New (2) from $1,299.99</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(2);
    expect(result.minPrice).toBeCloseTo(1299.99);
  });

  it("returns zero when no seller info found", () => {
    const doc = makeDoc(`<div>Some product page</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(0);
    expect(result.minPrice).toBeNull();
  });

  it("finds info in buying choices area", () => {
    const doc = makeDoc(`
      <div id="buybox-see-all-buying-choices">
        See All Buying Options (8 new from $15.00)
      </div>
    `);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(8);
    expect(result.minPrice).toBeCloseTo(15.0);
  });

  it("extracts 'used' counts too", () => {
    const doc = makeDoc(`<div id="olp-upd-new">Used (3) from $7.50</div>`);
    const result = extractOtherSellersInfo(doc);
    expect(result.count).toBe(3);
    expect(result.minPrice).toBeCloseTo(7.50);
  });
});
