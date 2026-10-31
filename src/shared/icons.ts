/** Design-system icon set: 16×16 stroke icons shared by the overlay, popup and options UI. */

export type IconName =
  | 'close'
  | 'file'
  | 'list'
  | 'speaker'
  | 'markStart'
  | 'markEnd'
  | 'record'
  | 'stop'
  | 'layers'
  | 'skip'
  | 'expand'
  | 'collapse';

const PATHS: Record<IconName, string> = {
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  file: 'M4 1.8h5.2L13 5.6v8.6H4zM9.2 1.8v3.8H13',
  list: 'M3 4h10M3 8h10M3 12h6',
  speaker: 'M3 6.2h2.3L8.8 3v10L5.3 9.8H3zM11 5.8a3.2 3.2 0 0 1 0 4.4M12.9 4.2a5.4 5.4 0 0 1 0 7.6',
  // Opening / closing bracket: the pair delimits one ad.
  markStart: 'M5.2 3v10M9.5 3H5.2M9.5 13H5.2',
  markEnd: 'M10.8 3v10M6.5 3h4.3M6.5 13h4.3',
  // Record / stop pair: one toggle button starts and finishes an ad mark.
  record: 'M8 3.2a4.8 4.8 0 1 0 0 9.6a4.8 4.8 0 1 0 0-9.6',
  stop: 'M4.5 4.5h7v7h-7z',
  layers: 'M8 2.2 2.8 4.7 8 7.2l5.2-2.5zM2.8 8 8 10.5 13.2 8M2.8 11.3 8 13.8l5.2-2.5',
  skip: 'M2.8 3.2 7.2 8l-4.4 4.8zM8.2 3.2 12.6 8l-4.4 4.8zM13.2 3.2v9.6',
  // Four corners: expand lifts the player to the viewport, collapse puts it back.
  expand: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  collapse: 'M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5',
};

export type IconOptions = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

export const createIcon = (name: IconName, opts: IconOptions = {}): SVGSVGElement => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  // A record dot reads as "live" only when filled; everything else stays stroked.
  svg.setAttribute('fill', name === 'record' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(opts.strokeWidth ?? 1.6));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (opts.size) {
    svg.setAttribute('width', String(opts.size));
    svg.setAttribute('height', String(opts.size));
  }
  if (opts.className) svg.setAttribute('class', opts.className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name]);
  svg.appendChild(path);
  return svg;
};