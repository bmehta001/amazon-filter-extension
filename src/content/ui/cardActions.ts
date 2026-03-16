import type { Product } from "../../types";
import { buildCccUrl } from "../../util/url";
import { trustBrand, blockBrand } from "../../util/storage";

/**
 * Inject per-card action buttons onto a product card.
 * Adds: CCC price history, Trust brand, Block brand.
 */
export function injectCardActions(
  product: Product,
  onBrandAction: () => void,
): void {
  const card = product.element;

  // Don't inject twice
  if (card.querySelector(".bas-card-actions")) return;

  const container = document.createElement("div");
  container.className = "bas-card-actions";
  container.style.cssText = `
    display: flex;
    gap: 4px;
    margin-top: 4px;
    padding: 2px 0;
    align-items: center;
    flex-wrap: wrap;
  `;

  // CCC button
  const cccBtn = createButton("📈 Price History", "View price history on CamelCamelCamel");
  cccBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = buildCccUrl(product.asin, product.title);
    window.open(url, "_blank", "noopener");
  });
  container.appendChild(cccBtn);

  // Trust brand button
  if (product.brand) {
    const trustBtn = createButton(`✅ Trust "${truncate(product.brand, 15)}"`, "Add this brand to your trusted list");
    trustBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await trustBrand(product.brand);
        trustBtn.textContent = "✅ Trusted!";
        trustBtn.style.background = "#e6f7e6";
        onBrandAction();
      } catch (err) {
        console.warn("[BAS] Failed to trust brand:", err);
        trustBtn.textContent = "⚠ Error";
      }
    });
    container.appendChild(trustBtn);

    // Block brand button
    const blockBtn = createButton(`🚫 Block "${truncate(product.brand, 15)}"`, "Block this brand from results");
    blockBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await blockBrand(product.brand);
        blockBtn.textContent = "🚫 Blocked!";
        blockBtn.style.background = "#fde8e8";
        onBrandAction();
      } catch (err) {
        console.warn("[BAS] Failed to block brand:", err);
        blockBtn.textContent = "⚠ Error";
      }
    });
    container.appendChild(blockBtn);
  }

  // Insert after the title area or at the bottom of the card
  const titleArea =
    card.querySelector("h2")?.closest(".a-section") ||
    card.querySelector("h2")?.parentElement;
  if (titleArea) {
    titleArea.after(container);
  } else {
    card.appendChild(container);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function createButton(text: string, tooltip: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.title = tooltip;
  btn.style.cssText = `
    padding: 2px 8px;
    border: 1px solid #d5d9d9;
    border-radius: 4px;
    background: #fff;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#f7fafa";
  });
  btn.addEventListener("mouseleave", () => {
    if (!btn.style.background.includes("e6f7e6") && !btn.style.background.includes("fde8e8")) {
      btn.style.background = "#fff";
    }
  });
  return btn;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
