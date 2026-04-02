import type { Product } from "../../types";
import { buildCccUrl } from "../../util/url";
import { trustBrand, blockBrand } from "../../util/storage";
import { addToWatchlist, isWatched, removeFromWatchlist } from "../../watchlist/storage";
import { loadShortlists, addToShortlist, createShortlist, isInAnyShortlist } from "../../shortlist/storage";
import type { ShortlistItem } from "../../shortlist/storage";
import { addToCompare, isInCompare, removeFromCompare } from "../../compare/storage";
import type { CompareItem } from "../../compare/storage";

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
    position: relative;
  `;

  if (product.asin) {
    const asin = product.asin;

    // ── Primary actions (always visible) ──

    // Save to shortlist button
    const saveBtn = createButton("📌 Save", "Save to a shortlist for later comparison");
    isInAnyShortlist(asin).then((listNames) => {
      if (listNames.length > 0) {
        saveBtn.textContent = `📌 In ${listNames[0]}`;
        saveBtn.style.background = "#fef3e2";
      }
    }).catch(() => { /* ignore */ });
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleShortlistClick(saveBtn, card, product, asin);
    });
    container.appendChild(saveBtn);

    // Compare button
    const compareBtn = createButton("⚖️ Compare", "Add to cross-search comparison");
    isInCompare(asin).then((inCompare) => {
      if (inCompare) {
        compareBtn.textContent = "⚖️ Comparing";
        compareBtn.style.background = "#e7f4f7";
      }
    }).catch(() => { /* ignore */ });
    compareBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const alreadyIn = await isInCompare(asin);
      if (alreadyIn) {
        await removeFromCompare(asin);
        compareBtn.textContent = "⚖️ Compare";
        compareBtn.style.background = "";
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const item: CompareItem = {
        asin,
        title: product.title,
        brand: product.brand,
        price: product.price,
        rating: product.rating,
        reviewCount: product.reviewCount,
        url: `https://${window.location.hostname}/dp/${asin}`,
        pinnedAt: Date.now(),
        searchQuery: params.get("k") ?? "",
        reviewQuality: product.reviewQuality,
      };
      const added = await addToCompare(item);
      if (added) {
        compareBtn.textContent = "⚖️ Comparing";
        compareBtn.style.background = "#e7f4f7";
      } else {
        compareBtn.textContent = "⚖️ Full (20)";
      }
    });
    container.appendChild(compareBtn);

    // ── Overflow menu ──
    const overflowBtn = createButton("⋯", "More actions");
    overflowBtn.style.fontWeight = "700";
    overflowBtn.style.fontSize = "14px";
    overflowBtn.style.padding = "0 6px";
    overflowBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleOverflowMenu(overflowBtn, product, asin, onBrandAction);
    });
    container.appendChild(overflowBtn);
  }

  // Insert after the unified reviews, price intel, product score, or title
  const anchor =
    card.querySelector(".bas-reviews-section") ??
    card.querySelector(".bas-price-intel") ??
    card.querySelector(".bas-product-score-panel") ??
    card.querySelector(".bas-product-score") ??
    card.querySelector("h2")?.closest(".a-section") ??
    card.querySelector("h2")?.parentElement;

  if (anchor && anchor !== card) {
    anchor.after(container);
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

// ── Overflow Menu ────────────────────────────────────────────────────

function toggleOverflowMenu(
  anchor: HTMLElement,
  product: Product,
  asin: string,
  onBrandAction: () => void,
): void {
  const card = product.element;
  const existing = card.querySelector(".bas-overflow-menu");
  if (existing) { existing.remove(); return; }

  const menu = document.createElement("div");
  menu.className = "bas-overflow-menu";
  menu.style.cssText = `
    position: absolute; z-index: 9999; background: #fff;
    border: 1px solid #d5d9d9; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 4px;
    min-width: 180px; font-size: 12px; margin-top: 2px;
    right: 0; top: 100%;
  `;

  // Price History
  addMenuItem(menu, "📈 Price History", "View on CamelCamelCamel", () => {
    window.open(buildCccUrl(product.asin, product.title), "_blank", "noopener");
    menu.remove();
  });

  // Watch Price
  if (product.price != null) {
    isWatched(asin).then((watched) => {
      const label = watched ? "👁️ Stop Watching" : "👁️ Watch Price";
      const tip = watched ? "Remove from price watchlist" : "Get notified when price drops";
      addMenuItem(menu, label, tip, async () => {
        if (watched) {
          await removeFromWatchlist(asin);
        } else {
          const target = Math.round(product.price! * 0.9 * 100) / 100;
          await addToWatchlist(asin, product.title, product.price!, target, window.location.hostname);
        }
        menu.remove();
      });
    }).catch(() => {});
  }

  // Trust / Block brand
  if (product.brand) {
    addMenuItem(menu, `✅ Trust "${truncate(product.brand, 20)}"`, "Add to trusted brands", async () => {
      await trustBrand(product.brand);
      onBrandAction();
      menu.remove();
    });
    addMenuItem(menu, `🚫 Block "${truncate(product.brand, 20)}"`, "Hide this brand from results", async () => {
      await blockBrand(product.brand);
      onBrandAction();
      menu.remove();
    });
  }

  anchor.style.position = "relative";
  anchor.parentElement?.appendChild(menu);

  // Close on outside click
  const abortCtrl = new AbortController();
  setTimeout(() => {
    document.addEventListener("click", (ev) => {
      if (!menu.contains(ev.target as Node) && ev.target !== anchor) {
        menu.remove();
        abortCtrl.abort();
      }
    }, { signal: abortCtrl.signal });
  }, 0);
}

function addMenuItem(menu: HTMLElement, text: string, title: string, onClick: () => void): void {
  const item = document.createElement("div");
  item.textContent = text;
  item.title = title;
  item.style.cssText = `
    padding: 6px 10px; cursor: pointer; border-radius: 4px;
    white-space: nowrap; font-size: 12px;
  `;
  item.addEventListener("mouseenter", () => { item.style.background = "#f0f0f0"; });
  item.addEventListener("mouseleave", () => { item.style.background = ""; });
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  menu.appendChild(item);
}

// ── Shortlist Dropdown ───────────────────────────────────────────────

async function handleShortlistClick(
  saveBtn: HTMLButtonElement,
  card: HTMLElement,
  product: Product,
  asin: string,
): Promise<void> {
  const existing = saveBtn.parentElement?.querySelector(".bas-shortlist-dropdown");
  if (existing) { existing.remove(); return; }

  const dropdown = document.createElement("div");
  dropdown.className = "bas-shortlist-dropdown";
  dropdown.style.cssText = `
    position: absolute; z-index: 9999; background: #fff;
    border: 1px solid #d5d9d9; border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 6px;
    min-width: 160px; font-size: 12px; margin-top: 2px;
  `;

  try {
    const lists = await loadShortlists();
    if (lists.length === 0) {
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
        } catch {
          saveBtn.textContent = "⚠ Couldn't save";
        }
        dropdown.remove();
      });
      dropdown.appendChild(opt);
    }

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
          saveBtn.textContent = "⚠ Couldn't save";
        });
      }
      dropdown.remove();
    });
    dropdown.appendChild(newOpt);
  } catch {
    dropdown.textContent = "Couldn't load shortlists";
  }

  saveBtn.style.position = "relative";
  saveBtn.appendChild(dropdown);

  const abortCtrl = new AbortController();
  setTimeout(() => {
    document.addEventListener("click", (ev) => {
      if (!dropdown.contains(ev.target as Node)) {
        dropdown.remove();
        abortCtrl.abort();
      }
    }, { signal: abortCtrl.signal });
    const obs = new MutationObserver(() => {
      if (!dropdown.isConnected) { abortCtrl.abort(); obs.disconnect(); }
    });
    const observeTarget = card.parentElement ?? document.body;
    obs.observe(observeTarget, { childList: true, subtree: true });
  }, 0);
}
