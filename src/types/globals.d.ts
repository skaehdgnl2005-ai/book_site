// Committed ambient types so `pnpm typecheck` passes on a fresh clone WITHOUT
// depending on Next's generated next-env.d.ts (which references .next/types/*,
// absent until `next dev|build` runs). Keeps the verify chain self-contained.
declare module "*.css";
declare module "*.svg";
declare module "*.png";
declare module "*.jpg";
declare module "*.webp";
