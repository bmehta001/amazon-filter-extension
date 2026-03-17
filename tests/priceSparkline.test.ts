import { describe, it, expect } from "vitest";
import { buildKeepaGraphUrl, injectPriceSparkline } from "../src/content/ui/priceSparkline";

describe("buildKeepaGraphUrl", () => {
  it("builds URL for US domain", () => {
    const url = buildKeepaGraphUrl("B0CQXMXJC5", "www.amazon.com");
    expect(url).toBe("https://graph.keepa.com/pricehistory.png?asin=B0CQXMXJC5&domain=com");
  });

  it("builds URL for UK domain", () => {
    const url = buildKeepaGraphUrl("B0CQXMXJC5", "www.amazon.co.uk");
    expect(url).toBe("https://graph.keepa.com/pricehistory.png?asin=B0CQXMXJC5&domain=co.uk");
  });

  it("falls back to 'com' for unknown domains", () => {
    const url = buildKeepaGraphUrl("B0CQXMXJC5", "www.amazon.com.br");
    expect(url).toBe("https://graph.keepa.com/pricehistory.png?asin=B0CQXMXJC5&domain=com");
  });
});

describe("injectPriceSparkline", () => {
  it("injects sparkline after price element", () => {
    const card = document.createElement("div");
    const priceSpan = document.createElement("span");
    priceSpan.className = "a-price";
    priceSpan.textContent = "$29.99";
    card.appendChild(priceSpan);

    injectPriceSparkline(card, "B0CQXMXJC5");

    const sparkline = card.querySelector(".bas-sparkline");
    expect(sparkline).not.toBeNull();
    expect(sparkline?.tagName).toBe("A");
    expect((sparkline as HTMLAnchorElement).target).toBe("_blank");

    const img = sparkline?.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.src).toContain("graph.keepa.com");
    expect(img?.src).toContain("B0CQXMXJC5");
    expect(img?.loading).toBe("lazy");
  });

  it("does not inject twice", () => {
    const card = document.createElement("div");
    const priceSpan = document.createElement("span");
    priceSpan.className = "a-price";
    card.appendChild(priceSpan);

    injectPriceSparkline(card, "B0CQXMXJC5");
    injectPriceSparkline(card, "B0CQXMXJC5");

    const sparklines = card.querySelectorAll(".bas-sparkline");
    expect(sparklines.length).toBe(1);
  });

  it("does nothing when no price element exists", () => {
    const card = document.createElement("div");
    card.innerHTML = "<h2>Product Title</h2>";

    injectPriceSparkline(card, "B0CQXMXJC5");

    expect(card.querySelector(".bas-sparkline")).toBeNull();
  });
});
