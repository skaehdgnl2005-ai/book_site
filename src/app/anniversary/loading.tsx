import { Nav } from "../_components/Nav";

// Segment loading fallback: instant feedback the moment the category card is clicked,
// covering ISR revalidation misses / slow networks. Scoped to this segment on purpose —
// a ROOT loading.tsx puts a Suspense boundary above the dynamic order/mypage pages,
// which streams the shell as HTTP 200 before their notFound() can set a real 404
// (regresses the F007/F014 unknown-id E2Es). This page never calls notFound().
export default function Loading() {
  return (
    <>
      <Nav />
      <main>
        <section className="loading-view" role="status" aria-label="페이지 불러오는 중">
          <p className="eyebrow loading-view__label">Loading</p>
        </section>
      </main>
    </>
  );
}
