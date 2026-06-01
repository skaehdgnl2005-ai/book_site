// Home — harness skeleton (Phase 0: 0 feature code). Static, mobile-responsive.
// The catalog/featured data wiring lands as feature F002+ (see feature_list.json).
export default function HomePage() {
  return (
    <main>
      <header>
        <h1>Storybook Shop</h1>
        <p>Premium, curated, beautifully illustrated storybooks.</p>
      </header>
      <section aria-labelledby="featured-heading" data-testid="featured">
        <h2 id="featured-heading">Featured storybooks</h2>
        <p data-testid="featured-empty">
          Catalog coming soon — this is the harness skeleton. Buyer journey
          (browse → cart → checkout → confirmation) is tracked in feature_list.json.
        </p>
      </section>
    </main>
  );
}
