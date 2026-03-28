import { describe, it, expect, vi, beforeEach } from "vitest";

// ── jsdom environment ──
vi.stubGlobal("chrome", {
  storage: {
    sync: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    local: { get: vi.fn((_k: unknown, cb: (r: Record<string, unknown>) => void) => cb({})), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { lastError: undefined },
});

import { parseReviewMediaGallery } from "../src/review/fetcher";
import { injectReviewGallery, removeReviewGallery, REVIEW_GALLERY_STYLES } from "../src/content/ui/reviewGallery";
import type { ReviewMediaGallery } from "../src/review/types";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// ── Media Extraction ──

describe("parseReviewMediaGallery", () => {
  it("extracts images from review-image-tile", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">5.0 out of 5 stars</span></i>
        <span data-hook="avp-badge">Verified Purchase</span>
        <span data-hook="review-body"><span>Great product</span></span>
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/thumb_SY88_.jpg" />
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/second_SY88_.jpg" />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(2);
    expect(gallery.reviewsWithMedia).toBe(1);
    expect(gallery.items[0].type).toBe("image");
    expect(gallery.items[0].reviewRating).toBe(5);
    expect(gallery.items[0].verified).toBe(true);
    // Thumbnail URL preserved
    expect(gallery.items[0].thumbnailUrl).toContain("thumb_SY88_");
    // Full URL has _SL500_ replacement
    expect(gallery.items[0].url).toContain("_SL500_");
    expect(gallery.items[0].url).not.toContain("_SY88_");
  });

  it("extracts images via data-hook attribute", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">4.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Decent</span></span>
        <img data-hook="review-image-tile" src="https://images-amazon.com/images/I/img_SX100_.jpg" />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(1);
    expect(gallery.items[0].reviewRating).toBe(4);
    expect(gallery.items[0].verified).toBe(false);
  });

  it("extracts videos from data-video-url", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">3.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Okay</span></span>
        <div data-hook="review-video-tile" data-video-url="https://example.com/video.mp4">
          <img src="https://m.media-amazon.com/images/I/poster.jpg" />
        </div>
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    // Video item + poster image (poster is also an Amazon image in the review)
    const videos = gallery.items.filter((i) => i.type === "video");
    expect(videos.length).toBe(1);
    expect(videos[0].url).toBe("https://example.com/video.mp4");
    expect(videos[0].thumbnailUrl).toContain("poster");
    expect(videos[0].reviewRating).toBe(3);
  });

  it("deduplicates identical image URLs", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">5.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Great</span></span>
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/same.jpg" />
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/same.jpg" />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(1);
  });

  it("counts reviews with media correctly across multiple reviews", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">5.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Great</span></span>
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/a.jpg" />
      </div>
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">4.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Good</span></span>
      </div>
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">3.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Meh</span></span>
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/b.jpg" />
        <img class="review-image-tile" src="https://m.media-amazon.com/images/I/c.jpg" />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(3);
    expect(gallery.reviewsWithMedia).toBe(2);
  });

  it("returns empty gallery when no reviews have media", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">5.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Text-only review</span></span>
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(0);
    expect(gallery.reviewsWithMedia).toBe(0);
  });

  it("returns empty gallery when page has no reviews", () => {
    const doc = makeDoc(`<div>No reviews here</div>`);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(0);
    expect(gallery.reviewsWithMedia).toBe(0);
  });

  it("skips non-Amazon images (icons, external)", () => {
    const doc = makeDoc(`
      <div data-hook="review">
        <i data-hook="review-star-rating"><span class="a-icon-alt">5.0 out of 5 stars</span></i>
        <span data-hook="review-body"><span>Fine</span></span>
        <img src="https://other-cdn.com/icon.png" />
        <img src="data:image/svg+xml,..." />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(0);
  });

  it("extracts from top-level media gallery section", () => {
    const doc = makeDoc(`
      <div id="cr-media-gallery-popover">
        <img src="https://m.media-amazon.com/images/I/gallery1_SX200_.jpg" />
        <img src="https://m.media-amazon.com/images/I/gallery2_SX200_.jpg" />
      </div>
    `);
    const gallery = parseReviewMediaGallery(doc);
    expect(gallery.items.length).toBe(2);
    expect(gallery.items[0].url).toContain("_SL500_");
    // These come from the top gallery, not individual reviews
    expect(gallery.items[0].reviewRating).toBe(0);
    expect(gallery.items[0].verified).toBe(false);
  });
});

// ── Gallery UI ──

describe("reviewGallery UI", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("injects gallery onto a card", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "Product Title";
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [
        { url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1t.jpg", type: "image", reviewRating: 5, verified: true },
        { url: "https://img.com/2.jpg", thumbnailUrl: "https://img.com/2t.jpg", type: "image", reviewRating: 4, verified: false },
      ],
      reviewsWithMedia: 2,
    };

    injectReviewGallery(card, gallery);
    const el = card.querySelector(".bas-review-gallery");
    expect(el).not.toBeNull();

    // Should have 2 thumbnails
    const thumbs = el!.querySelectorAll(".bas-gallery-thumb");
    expect(thumbs.length).toBe(2);

    // Header should show count
    const header = el!.querySelector(".bas-gallery-header");
    expect(header?.textContent).toContain("2 Review Photos");
    expect(header?.textContent).toContain("1 Verified");
  });

  it("does not inject when gallery has no items", () => {
    const card = document.createElement("div");
    document.body.appendChild(card);

    injectReviewGallery(card, { items: [], reviewsWithMedia: 0 });
    expect(card.querySelector(".bas-review-gallery")).toBeNull();
  });

  it("does not inject twice (idempotent)", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [{ url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1t.jpg", type: "image", reviewRating: 5, verified: true }],
      reviewsWithMedia: 1,
    };

    injectReviewGallery(card, gallery);
    injectReviewGallery(card, gallery);
    expect(card.querySelectorAll(".bas-review-gallery").length).toBe(1);
  });

  it("removes gallery from card", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [{ url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1t.jpg", type: "image", reviewRating: 5, verified: true }],
      reviewsWithMedia: 1,
    };

    injectReviewGallery(card, gallery);
    expect(card.querySelector(".bas-review-gallery")).not.toBeNull();

    removeReviewGallery(card);
    expect(card.querySelector(".bas-review-gallery")).toBeNull();
  });

  it("shows video count in header", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [
        { url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1t.jpg", type: "image", reviewRating: 5, verified: true },
        { url: "https://vid.com/v.mp4", thumbnailUrl: "https://vid.com/poster.jpg", type: "video", reviewRating: 4, verified: false },
      ],
      reviewsWithMedia: 2,
    };

    injectReviewGallery(card, gallery);
    const header = card.querySelector(".bas-gallery-header");
    expect(header?.textContent).toContain("1 Review Photo");
    expect(header?.textContent).toContain("1 Video");
  });

  it("shows +N more button when over MAX_THUMBNAILS", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const items = Array.from({ length: 12 }, (_, i) => ({
      url: `https://img.com/${i}.jpg`,
      thumbnailUrl: `https://img.com/${i}t.jpg`,
      type: "image" as const,
      reviewRating: 5,
      verified: true,
    }));

    injectReviewGallery(card, { items, reviewsWithMedia: 5 });
    const thumbs = card.querySelectorAll(".bas-gallery-thumb");
    expect(thumbs.length).toBe(8); // MAX_THUMBNAILS

    const moreBtn = card.querySelector(".bas-gallery-more");
    expect(moreBtn).not.toBeNull();
    expect(moreBtn?.textContent).toBe("+4");
  });

  it("shows verified badge on verified thumbnails", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [
        { url: "https://img.com/1.jpg", thumbnailUrl: "https://img.com/1t.jpg", type: "image", reviewRating: 5, verified: true },
        { url: "https://img.com/2.jpg", thumbnailUrl: "https://img.com/2t.jpg", type: "image", reviewRating: 3, verified: false },
      ],
      reviewsWithMedia: 2,
    };

    injectReviewGallery(card, gallery);
    const thumbs = card.querySelectorAll(".bas-gallery-thumb");
    expect(thumbs[0].querySelector(".bas-gallery-thumb-verified")).not.toBeNull();
    expect(thumbs[1].querySelector(".bas-gallery-thumb-verified")).toBeNull();
  });

  it("shows video play icon on video thumbnails", () => {
    const card = document.createElement("div");
    const h2 = document.createElement("h2");
    card.appendChild(h2);
    document.body.appendChild(card);

    const gallery: ReviewMediaGallery = {
      items: [
        { url: "https://vid.com/v.mp4", thumbnailUrl: "https://vid.com/poster.jpg", type: "video", reviewRating: 4, verified: false },
      ],
      reviewsWithMedia: 1,
    };

    injectReviewGallery(card, gallery);
    const thumb = card.querySelector(".bas-gallery-thumb");
    expect(thumb?.querySelector(".bas-gallery-video-icon")).not.toBeNull();
  });

  it("exports REVIEW_GALLERY_STYLES", () => {
    expect(REVIEW_GALLERY_STYLES).toContain("bas-review-gallery");
    expect(REVIEW_GALLERY_STYLES).toContain("bas-gallery-lightbox");
    expect(REVIEW_GALLERY_STYLES).toContain("bas-gallery-thumb");
  });
});
