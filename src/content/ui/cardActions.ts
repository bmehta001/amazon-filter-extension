import type { Product } from "../../types";
import { buildCccUrl } from "../../util/url";
import { trustBrand, blockBrand } from "../../util/storage";
import { addToWatchlist, isWatched } from "../../watchlist/storage";
import { loadShortlists, addToShortlist, createShortlist, isInAnyShortlist } from "../../shortlist/storage";
import type { ShortlistItem } from "../../shortlist/storage";

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

  // Watch price button (only for products with price and ASIN)
  if (product.price != null && product.asin) {
    const asin = product.asin;
    const watchBtn = createButton("👁️ Watch Price", "Get notified when the price drops");

    // Check if already watched and update button state
    isWatched(asin).then((watched) => {
      if (watched) {
        watchBtn.textContent = "👁️ Watching";
        watchBtn.style.background = "#e7f4f7";
      }
    }).catch(() => { /* ignore */ });

    watchBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        // Default target: 10% below current price
        const target = Math.round(product.price! * 0.9 * 100) / 100;
        await addToWatchlist(
          asin,
          product.title,
          product.price!,
          target,
          window.location.hostname,
        );
        watchBtn.textContent = "👁️ Watching!";
        watchBtn.style.background = "#e7f4f7";
      } catch (err) {
        console.warn("[BAS] Failed to add to watchlist:", err);
        watchBtn.textContent = "⚠ Error";
      }
    });
    container.appendChild(watchBtn);
  }

  // Save to shortlist button (for products with ASIN)
  if (product.asin) {
    const asin = product.asin;
    const saveBtn = createButton("📌 Save", "Save to a shortlist for later comparison");

    // Check if already in any list
    isInAnyShortlist(asin).then((listNames) => {
      if (listNames.length > 0) {
        saveBtn.textContent = `📌 In ${listNames[0]}`;
        saveBtn.style.background = "#fef3e2";
      }
    }).catch(() => { /* ignore */ });

    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Show a quick dropdown to pick or create a list
      const existing = saveBtn.parentElement?.querySelector(".bas-shortlist-dropdown");
      if (existing) { existing.remove(); return; }

      const dropdown = document.createElement("div");
      dropdown.className = "bas-shortlist-dropdown";
      dropdown.style.cssText = `
        position: absolute; z-index: 9999; background: #fff;
        border: 1px solid #d5d9d9; border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 6px;
        min-width: 160px; font-size: 12px; margin-top: 2px;
      `;

      try {
        const lists = await loadShortlists();
        if (lists.length === 0) {
          // No lists yet — create a default one
          await createShortlist("My Research");
          lists.push({ name: "My Research", items: [], createdAt: Date.now(), updatedAt: Date.now() });
        }

        for (const list of lists) {
          const opt = document.createElement("div");
          opt.textContent = `📋 ${list.name} (${list.items.length})`;
          opt.style.cssText = "padding:4px 8px;cursor:pointer;border-radius:3px;";
          opt.addEventListener("mouseenter", () => { opt.style.background = "#f0f0f0"; });
          opt.addEventListener("mouseleave", () => { opt.style.background = ""; });
          opt.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const item: ShortlistItem = {
              asin,
              title: product.title,
              brand: product.brand,
              price: product.price,
              rating: product.rating,
              reviewCount: product.reviewCount,
              url: `https://${window.location.hostname}/dp/${asin}`,
              addedAt: Date.now(),
              reviewQuality: product.reviewQuality,
            };
            try {
              await addToShortlist(list.name, item);
              saveBtn.textContent = `📌 In ${list.name}`;
              saveBtn.style.background = "#fef3e2";
            } catch (err) {
              saveBtn.textContent = "⚠ Error";
            }
            dropdown.remove();
          });
          dropdown.appendChild(opt);
        }

        // "+ New List" option
        const newOpt = document.createElement("div");
        newOpt.textContent = "➕ New List...";
        newOpt.style.cssText = "padding:4px 8px;cursor:pointer;border-radius:3px;color:#0066c0;border-top:1px solid #eee;margin-top:4px;padding-top:6px;";
        newOpt.addEventListener("mouseenter", () => { newOpt.style.background = "#f0f0f0"; });
        newOpt.addEventListener("mouseleave", () => { newOpt.style.background = ""; });
        newOpt.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const name = prompt("Enter list name:");
          if (name?.trim()) {
            createShortlist(name.trim()).then(() => {
              const item: ShortlistItem = {
                asin,
                title: product.title,
                brand: product.brand,
                price: product.price,
                rating: product.rating,
                reviewCount: product.reviewCount,
                url: `https://${window.location.hostname}/dp/${asin}`,
                addedAt: Date.now(),
              };
              return addToShortlist(name.trim(), item);
            }).then(() => {
              saveBtn.textContent = `📌 In ${name!.trim()}`;
              saveBtn.style.background = "#fef3e2";
            }).catch(() => {
              saveBtn.textContent = "⚠ Error";
            });
          }
          dropdown.remove();
        });
        dropdown.appendChild(newOpt);
      } catch {
        dropdown.textContent = "Failed to load lists";
      }

      saveBtn.style.position = "relative";
      saveBtn.appendChild(dropdown);

      // Close dropdown on outside click — use AbortController for cleanup
      const abortCtrl = new AbortController();
      const cleanup = () => {
        dropdown.remove();
        abortCtrl.abort();
      };
      setTimeout(() => {
        document.addEventListener("click", (ev) => {
          if (!dropdown.contains(ev.target as Node)) cleanup();
        }, { signal: abortCtrl.signal });
        // Also clean up if dropdown is removed from DOM by other means
        const obs = new MutationObserver(() => {
          if (!dropdown.isConnected) { abortCtrl.abort(); obs.disconnect(); }
        });
        obs.observe(saveBtn, { childList: true });
      }, 0);
    });
    container.appendChild(saveBtn);
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
