// page-flip@2.0.7 ships no .d.ts and no "types" field — ambient declaration for the
// surface F077 uses (constructor, HTML loading, flip navigation, events, teardown).
// Source of truth: node_modules/page-flip/src/{PageFlip,Settings}.ts.
declare module "page-flip" {
  export interface FlipSetting {
    startPage: number;
    /** "fixed" | "stretch" — stretch sizes the book from the parent block. */
    size: "fixed" | "stretch";
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    drawShadow: boolean;
    flippingTime: number;
    usePortrait: boolean;
    startZIndex: number;
    autoSize: boolean;
    /** 0 hides flip shadows entirely; keep ≤0.1 (DESIGN.md: no heavy shadows). */
    maxShadowOpacity: number;
    showCover: boolean;
    mobileScrollSupport: boolean;
    clickEventForward: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
  }

  export type FlipEventName = "flip" | "changeOrientation" | "changeState" | "init" | "update";

  export interface FlipEvent {
    data: unknown;
    object: PageFlip;
  }

  export class PageFlip {
    constructor(inBlock: HTMLElement, setting: Partial<FlipSetting>);
    destroy(): void;
    update(): void;
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    flip(page: number, corner?: "top" | "bottom"): void;
    turnToPage(page: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    getOrientation(): "portrait" | "landscape";
    on(eventName: FlipEventName, callback: (e: FlipEvent) => void): PageFlip;
    off(eventName: FlipEventName): void;
  }
}
