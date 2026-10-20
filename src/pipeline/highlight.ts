export interface HighlightRegion {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function compactHighlight(value: string): string {
  return value.replace(/[\s\p{P}\p{S}]+/gu, "");
}

function sameBox(left: HighlightRegion, right: HighlightRegion): boolean {
  return [left.x, left.y, left.w, left.h].every((value, index) => {
    const other = [right.x, right.y, right.w, right.h][index];
    return Math.abs(value - other) < 0.0001;
  });
}

export function regionsForLine(line: string, regions: HighlightRegion[]): HighlightRegion[] {
  const spoken = compactHighlight(line);
  if (spoken.length < 2) return [];
  const matched = regions.filter((region) => {
    const shape = compactHighlight(region.text);
    if (shape.length < 2) return false;
    if (spoken.includes(shape)) return true;
    return shape.includes(spoken) && spoken.length >= 4 && (spoken.length >= 8 || spoken.length * 3 >= shape.length);
  });
  return matched.filter((region, index) => matched.findIndex((item) => sameBox(item, region)) === index);
}
