import { describe, it, expect } from "vitest";
import {
  parseHistogram,
  parseReviews,
  parseTotalRatings,
  parseAverageRating,
} from "../src/review/fetcher";

function toDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function buildHistogramHtml(
  percentages: [number, number, number, number, number],
): string {
  const stars = ["5 star", "4 star", "3 star", "2 star", "1 star"];
  const rows = percentages
    .map(
      (pct, i) =>
        `<tr aria-label="${pct}% of reviews have ${5 - i} stars">
           <td><a href="/product/ref=filterByStar_${stars[i]}">${stars[i]}</a></td>
           <td><span class="a-size-base">${pct}%</span></td>
         </tr>`,
    )
    .join("\n");
  return `<table id="histogramTable">${rows}</table>`;
}

function buildReviewHtml(
  reviews: Array<{
    rating?: number;
    text?: string;
    date?: string;
    verified?: boolean;
    helpfulVotes?: number;
  }>,
): string {
  return reviews
    .map((r) => {
      const rating = r.rating ?? 5;
      const text = r.text ?? "Great product";
      const date = r.date ?? "January 15, 2024";
      const verifiedBadge = r.verified
        ? '<span data-hook="avp-badge">Verified Purchase</span>'
        : "";
      const helpful =
        r.helpfulVotes != null && r.helpfulVotes > 0
          ? `<span data-hook="helpful-vote-statement">${r.helpfulVotes} people found this helpful</span>`
          : "";

      return `
        <div data-hook="review">
          <i data-hook="review-star-rating"><span class="a-icon-alt">${rating}.0 out of 5 stars</span></i>
          <span data-hook="review-body"><span>${text}</span></span>
          <span data-hook="review-date">Reviewed in the United States on ${date}</span>
          ${verifiedBadge}
          ${helpful}
        </div>`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// parseHistogram
// ---------------------------------------------------------------------------

describe("parseHistogram", () => {
  it("parses a valid histogram table", () => {
    const doc = toDoc(buildHistogramHtml([72, 15, 8, 3, 2]));
    const result = parseHistogram(doc);

    expect(result).toEqual({
      five: 72,
      four: 15,
      three: 8,
      two: 3,
      one: 2,
    });
  });

  it("returns null when no histogram table exists", () => {
    const doc = toDoc("<div>No table here</div>");
    expect(parseHistogram(doc)).toBeNull();
  });

  it("returns null when fewer than 5 rows with filterByStar links", () => {
    const html = `
      <table id="histogramTable">
        <tr aria-label="72% of reviews have 5 stars">
          <td><a href="/ref=filterByStar_five">5 star</a></td>
        </tr>
        <tr aria-label="15% of reviews have 4 stars">
          <td><a href="/ref=filterByStar_four">4 star</a></td>
        </tr>
      </table>`;
    const doc = toDoc(html);
    expect(parseHistogram(doc)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseReviews
// ---------------------------------------------------------------------------

describe("parseReviews", () => {
  it("parses review data correctly", () => {
    const doc = toDoc(
      buildReviewHtml([
        {
          rating: 5,
          text: "Absolutely fantastic!",
          date: "January 15, 2024",
          verified: true,
          helpfulVotes: 42,
        },
      ]),
    );
    const reviews = parseReviews(doc);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].text).toBe("Absolutely fantastic!");
    expect(reviews[0].date).toEqual(new Date("January 15, 2024"));
    expect(reviews[0].verified).toBe(true);
    expect(reviews[0].helpfulVotes).toBe(42);
  });

  it("returns empty array when no reviews exist", () => {
    const doc = toDoc("<div>No reviews</div>");
    expect(parseReviews(doc)).toEqual([]);
  });

  it("limits to 10 reviews max", () => {
    const manyReviews = Array.from({ length: 15 }, (_, i) => ({
      rating: (i % 5) + 1,
      text: `Review number ${i + 1}`,
    }));
    const doc = toDoc(buildReviewHtml(manyReviews));
    const reviews = parseReviews(doc);

    expect(reviews).toHaveLength(10);
  });

  it("handles unverified reviews without helpful votes", () => {
    const doc = toDoc(
      buildReviewHtml([
        {
          rating: 3,
          text: "It was okay",
          date: "March 5, 2023",
          verified: false,
          helpfulVotes: 0,
        },
      ]),
    );
    const reviews = parseReviews(doc);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].verified).toBe(false);
    expect(reviews[0].helpfulVotes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseTotalRatings
// ---------------------------------------------------------------------------

describe("parseTotalRatings", () => {
  it("parses total ratings with commas", () => {
    const doc = toDoc(
      '<span data-hook="total-review-count">1,234 global ratings</span>',
    );
    expect(parseTotalRatings(doc)).toBe(1234);
  });

  it("returns 0 when element not found", () => {
    const doc = toDoc("<div>Nothing here</div>");
    expect(parseTotalRatings(doc)).toBe(0);
  });

  it("parses ratings without the 'global' prefix", () => {
    const doc = toDoc(
      '<span data-hook="total-review-count">567 ratings</span>',
    );
    expect(parseTotalRatings(doc)).toBe(567);
  });
});

// ---------------------------------------------------------------------------
// parseAverageRating
// ---------------------------------------------------------------------------

describe("parseAverageRating", () => {
  it("parses average rating from rating-out-of-text", () => {
    const doc = toDoc(
      '<span data-hook="rating-out-of-text">4.5 out of 5</span>',
    );
    expect(parseAverageRating(doc)).toBe(4.5);
  });

  it("returns 0 when element not found", () => {
    const doc = toDoc("<div>Nothing here</div>");
    expect(parseAverageRating(doc)).toBe(0);
  });
});
