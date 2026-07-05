/**
 * Reframe crop for <img>: the element box IS the crop viewport and the source
 * is shown via `object-fit: cover` + `object-position` (pan). All plain inline
 * CSS — no wrapper — so it round-trips and renders standalone. Removing crop
 * clears the props back to a bare image.
 *
 * Limitation: object-fit gives pan but not free zoom below "cover".
 */
import type { StageCtx } from './commands';
import { commit } from './commands';
import { applyStyle } from './geometry';

export interface CoverGeom {
  natW: number;
  natH: number;
  boxW: number;
  boxH: number;
  /** cover scale: source is scaled by this to cover the box. */
  scale: number;
  /** how much wider/taller the scaled source is than the box (slide px). */
  overflowX: number;
  overflowY: number;
}

export function coverGeometry(img: HTMLImageElement): CoverGeom {
  const natW = img.naturalWidth || img.clientWidth || 1;
  const natH = img.naturalHeight || img.clientHeight || 1;
  const boxW = img.clientWidth || img.offsetWidth || natW;
  const boxH = img.clientHeight || img.offsetHeight || natH;
  const scale = Math.max(boxW / natW, boxH / natH);
  return {
    natW,
    natH,
    boxW,
    boxH,
    scale,
    overflowX: natW * scale - boxW,
    overflowY: natH * scale - boxH,
  };
}

/** Read `object-position` as {x,y} percentages (default centered). */
export function readObjectPosition(img: HTMLImageElement): { x: number; y: number } {
  const m = img.style.objectPosition.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
}

/** True once the image carries an explicit crop (object-fit set). */
export function isCropped(img: HTMLImageElement): boolean {
  return img.style.objectFit === 'cover' || img.style.objectFit === 'contain';
}

/**
 * Enter crop: pin a fixed box (so the source can overflow) + object-fit:cover +
 * a centered object-position if none. Commits once.
 */
export function ensureCropBox(ctx: StageCtx, img: HTMLImageElement): void {
  const r = img.getBoundingClientRect();
  const patch: Record<string, string> = { 'object-fit': 'cover' };
  if (!img.style.width) patch.width = `${Math.round(r.width)}px`;
  if (!img.style.height || img.style.height === 'auto') patch.height = `${Math.round(r.height)}px`;
  if (!img.style.objectPosition) patch['object-position'] = '50% 50%';
  applyStyle(img, patch);
  commit(ctx);
}

/** Pan live (no commit): move object-position by a pointer delta in slide px. */
export function panLive(
  img: HTMLImageElement,
  start: { x: number; y: number },
  dxPx: number,
  dyPx: number,
): void {
  const g = coverGeometry(img);
  // Dragging content right (dx>0) reveals its left side → object-position drops.
  const dX = g.overflowX > 0 ? -(dxPx / g.overflowX) * 100 : 0;
  const dY = g.overflowY > 0 ? -(dyPx / g.overflowY) * 100 : 0;
  const x = Math.min(100, Math.max(0, start.x + dX));
  const y = Math.min(100, Math.max(0, start.y + dY));
  applyStyle(img, { 'object-position': `${Math.round(x)}% ${Math.round(y)}%` });
}

/** Remove the crop entirely, restoring a bare (uncropped) image. Commits. */
export function clearCrop(ctx: StageCtx, img: HTMLImageElement): void {
  applyStyle(img, { 'object-fit': null, 'object-position': null });
  commit(ctx);
}
