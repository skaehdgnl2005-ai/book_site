import type { ReactNode } from "react";

// Section header (DESIGN.md): large uppercase-grotesk title + optional inline aside.
export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section__head">
      <h2 className="section__title">{title}</h2>
      {aside ? <div className="section__aside">{aside}</div> : null}
    </div>
  );
}
