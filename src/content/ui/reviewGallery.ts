import type { ReviewMediaGallery, ReviewMedia } from "../../review/types";

const GALLERY_CLASS = "bas-review-gallery";
const LIGHTBOX_CLASS = "bas-gallery-lightbox";
const MAX_THUMBNAILS = 8;

/** CSS styles for the review photo gallery. */
export const REVIEW_GALLERY_STYLES = `
.${GALLERY_CLASS} {
  margin-top: 6px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
}

.bas-gallery-header {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  color: #565959;
  font-weight: 600;
  font-size: 11px;
}

.bas-gallery-header:hover {
  color: #0066c0;
}

.bas-gallery-toggle {
  font-size: 9px;
  transition: transform 0.2s;
}

.bas-gallery-toggle.open {
  transform: rotate(90deg);
}

.bas-gallery-grid {
  display: none;
  grid-template-columns: repeat(auto-fill, 52px);
  gap: 4px;
  margin-top: 4px;
  padding: 4px;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.bas-gallery-grid.open {
  display: grid;
}

.bas-gallery-thumb {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #d5d9d9;
  transition: border-color 0.15s;
}

.bas-gallery-thumb:hover {
  border-color: #007185;
}

.bas-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bas-gallery-thumb-verified {
  position: absolute;
  top: 1px;
  right: 1px;
  background: #067d62;
  color: #fff;
  font-size: 7px;
  padding: 1px 2px;
  border-radius: 2px;
  line-height: 1;
}

.bas-gallery-thumb-rating {
  position: absolute;
  bottom: 1px;
  left: 1px;
  background: rgba(0,0,0,0.6);
  color: #ffa41c;
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 2px;
  line-height: 1;
}

.bas-gallery-video-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 16px;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  pointer-events: none;
}

.bas-gallery-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  border: 1px dashed #d5d9d9;
  border-radius: 3px;
  font-size: 10px;
  color: #007185;
  cursor: pointer;
  background: #fff;
}

.bas-gallery-more:hover {
  border-color: #007185;
  background: #f0f8fa;
}

/* Lightbox overlay */
.${LIGHTBOX_CLASS} {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0,0,0,0.85);
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.bas-lightbox-close {
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 28px;
  color: #fff;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  z-index: 100000;
}

.bas-lightbox-close:hover {
  color: #ffa41c;
}

.bas-lightbox-main {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 4px;
}

.bas-lightbox-video {
  max-width: 80vw;
  max-height: 70vh;
  border-radius: 4px;
}

.bas-lightbox-info {
  color: #fff;
  font-size: 12px;
  margin-top: 8px;
  text-align: center;
}

.bas-lightbox-info .verified {
  color: #067d62;
  font-weight: 600;
}

.bas-lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 32px;
  color: #fff;
  cursor: pointer;
  background: rgba(0,0,0,0.3);
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  z-index: 100000;
}

.bas-lightbox-nav:hover {
  background: rgba(0,0,0,0.6);
}

.bas-lightbox-prev {
  left: 12px;
}

.bas-lightbox-next {
  right: 12px;
}

.bas-lightbox-strip {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  overflow-x: auto;
  max-width: 80vw;
  padding: 4px;
}

.bas-lightbox-strip-thumb {
  width: 40px;
  height: 40px;
  border-radius: 3px;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid transparent;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s, border-color 0.15s;
}

.bas-lightbox-strip-thumb:hover {
  opacity: 1;
}

.bas-lightbox-strip-thumb.active {
  border-color: #ffa41c;
  opacity: 1;
}
`;

/**
 * Inject the review photo/video gallery onto a product card.
 * Shows a collapsible grid of customer review images with lightbox.
 */
export function injectReviewGallery(card: HTMLElement, gallery: ReviewMediaGallery): void {
  if (!gallery.items.length) return;

  // Don't inject twice
  removeReviewGallery(card);

  const container = document.createElement("div");
  container.className = GALLERY_CLASS;

  // Header (collapsible)
  const imageCount = gallery.items.filter((i) => i.type === "image").length;
  const videoCount = gallery.items.filter((i) => i.type === "video").length;
  const verifiedCount = gallery.items.filter((i) => i.verified).length;

  const header = document.createElement("div");
  header.className = "bas-gallery-header";

  const toggle = document.createElement("span");
  toggle.className = "bas-gallery-toggle";
  toggle.textContent = "▶";

  const label = document.createElement("span");
  let labelText = `📷 ${imageCount} Review Photo${imageCount !== 1 ? "s" : ""}`;
  if (videoCount > 0) labelText += ` · ${videoCount} Video${videoCount !== 1 ? "s" : ""}`;
  if (verifiedCount > 0) labelText += ` · ${verifiedCount} Verified`;
  label.textContent = labelText;

  header.appendChild(toggle);
  header.appendChild(label);

  // Grid
  const grid = document.createElement("div");
  grid.className = "bas-gallery-grid";

  const displayItems = gallery.items.slice(0, MAX_THUMBNAILS);
  const remaining = gallery.items.length - MAX_THUMBNAILS;

  for (let i = 0; i < displayItems.length; i++) {
    grid.appendChild(createThumbnail(displayItems[i], i, gallery.items));
  }

  // "+N more" button
  if (remaining > 0) {
    const more = document.createElement("div");
    more.className = "bas-gallery-more";
    more.textContent = `+${remaining}`;
    more.title = `View all ${gallery.items.length} images`;
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(gallery.items, MAX_THUMBNAILS);
    });
    grid.appendChild(more);
  }

  // Toggle expand/collapse
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = grid.classList.toggle("open");
    toggle.classList.toggle("open", isOpen);
  });

  container.appendChild(header);
  container.appendChild(grid);

  // Insert after review badge or summary panel, or after h2
  const anchor =
    card.querySelector(".bas-review-badge") ??
    card.querySelector(".bas-summary-panel") ??
    card.querySelector(".bas-insights-panel") ??
    card.querySelector("h2")?.closest(".a-section") ??
    card.querySelector("h2")?.parentElement;

  if (anchor && anchor !== card) {
    anchor.after(container);
  } else {
    card.appendChild(container);
  }
}

/** Remove gallery from a card. */
export function removeReviewGallery(card: HTMLElement): void {
  card.querySelector(`.${GALLERY_CLASS}`)?.remove();
}

function createThumbnail(item: ReviewMedia, index: number, allItems: ReviewMedia[]): HTMLElement {
  const thumb = document.createElement("div");
  thumb.className = "bas-gallery-thumb";

  const img = document.createElement("img");
  if (isAmazonImage(item.thumbnailUrl)) {
    img.src = item.thumbnailUrl;
  }
  img.alt = `Review ${item.type} ${index + 1}`;
  img.loading = "lazy";
  thumb.appendChild(img);

  // Verified badge
  if (item.verified) {
    const badge = document.createElement("span");
    badge.className = "bas-gallery-thumb-verified";
    badge.textContent = "✓";
    badge.title = "Verified Purchase";
    thumb.appendChild(badge);
  }

  // Star rating
  if (item.reviewRating > 0) {
    const ratingEl = document.createElement("span");
    ratingEl.className = "bas-gallery-thumb-rating";
    ratingEl.textContent = `${"★".repeat(Math.round(item.reviewRating))}`;
    thumb.appendChild(ratingEl);
  }

  // Video play icon
  if (item.type === "video") {
    const play = document.createElement("span");
    play.className = "bas-gallery-video-icon";
    play.textContent = "▶";
    thumb.appendChild(play);
  }

  thumb.addEventListener("click", (e) => {
    e.stopPropagation();
    openLightbox(allItems, index);
  });

  return thumb;
}

// ---------------------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------------------

function openLightbox(items: ReviewMedia[], startIndex: number): void {
  // Remove any existing lightbox
  document.querySelector(`.${LIGHTBOX_CLASS}`)?.remove();

  let currentIndex = startIndex;

  const overlay = document.createElement("div");
  overlay.className = LIGHTBOX_CLASS;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Review image gallery");

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "bas-lightbox-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Close gallery");
  closeBtn.addEventListener("click", () => closeLightbox(overlay, keyHandler));

  // Close on background click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLightbox(overlay, keyHandler);
  });

  // Navigation
  const prevBtn = document.createElement("button");
  prevBtn.className = "bas-lightbox-nav bas-lightbox-prev";
  prevBtn.textContent = "‹";
  prevBtn.setAttribute("aria-label", "Previous image");

  const nextBtn = document.createElement("button");
  nextBtn.className = "bas-lightbox-nav bas-lightbox-next";
  nextBtn.textContent = "›";
  nextBtn.setAttribute("aria-label", "Next image");

  // Main image/video container
  const mainContainer = document.createElement("div");
  mainContainer.style.cssText = "display:flex;align-items:center;justify-content:center;";

  // Info bar
  const info = document.createElement("div");
  info.className = "bas-lightbox-info";

  // Thumbnail strip
  const strip = document.createElement("div");
  strip.className = "bas-lightbox-strip";

  for (let i = 0; i < items.length; i++) {
    const stripThumb = document.createElement("img");
    stripThumb.className = "bas-lightbox-strip-thumb";
    stripThumb.src = items[i].thumbnailUrl;
    stripThumb.alt = `${i + 1}`;
    stripThumb.addEventListener("click", () => {
      currentIndex = i;
      renderCurrent();
    });
    strip.appendChild(stripThumb);
  }

  function renderCurrent(): void {
    const item = items[currentIndex];
    mainContainer.innerHTML = "";

    if (item.type === "video") {
      const video = document.createElement("video");
      video.className = "bas-lightbox-video";
      video.src = item.url;
      video.controls = true;
      video.autoplay = true;
      mainContainer.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.className = "bas-lightbox-main";
      img.src = item.url;
      img.alt = `Review image ${currentIndex + 1}`;
      mainContainer.appendChild(img);
    }

    // Update info
    const parts: string[] = [`${currentIndex + 1} / ${items.length}`];
    if (item.reviewRating > 0) parts.push(`${"★".repeat(Math.round(item.reviewRating))} review`);
    if (item.verified) parts.push('<span class="verified">Verified Purchase</span>');
    info.innerHTML = parts.join(" · ");

    // Update strip highlights
    const thumbs = strip.querySelectorAll(".bas-lightbox-strip-thumb");
    thumbs.forEach((t, i) => t.classList.toggle("active", i === currentIndex));

    // Show/hide nav buttons
    prevBtn.style.display = currentIndex > 0 ? "" : "none";
    nextBtn.style.display = currentIndex < items.length - 1 ? "" : "none";
  }

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentIndex > 0) { currentIndex--; renderCurrent(); }
  });

  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentIndex < items.length - 1) { currentIndex++; renderCurrent(); }
  });

  // Keyboard navigation
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeLightbox(overlay, keyHandler);
    if (e.key === "ArrowLeft" && currentIndex > 0) { currentIndex--; renderCurrent(); }
    if (e.key === "ArrowRight" && currentIndex < items.length - 1) { currentIndex++; renderCurrent(); }
    // Focus trap — prevent Tab from leaving the lightbox
    if (e.key === "Tab") {
      const focusable = overlay.querySelectorAll<HTMLElement>("button, [tabindex]");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", keyHandler);

  // Cleanup keyboard listener when lightbox is removed
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) {
      document.removeEventListener("keydown", keyHandler);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });

  overlay.appendChild(closeBtn);
  overlay.appendChild(prevBtn);
  overlay.appendChild(mainContainer);
  overlay.appendChild(nextBtn);
  overlay.appendChild(info);
  overlay.appendChild(strip);

  renderCurrent();
  document.body.appendChild(overlay);

  // Focus the close button so keyboard users start inside the lightbox
  closeBtn.focus();
}

/** Close lightbox and clean up listeners. */
function closeLightbox(overlay: HTMLElement, keyHandler: (e: KeyboardEvent) => void): void {
  document.removeEventListener("keydown", keyHandler);
  overlay.remove();
}

/** Validate that a URL points to an Amazon image CDN. */
function isAmazonImage(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  return url.includes("images-amazon.com/") ||
         url.includes("m.media-amazon.com/") ||
         url.includes("images-na.ssl-images-amazon.com/");
}
