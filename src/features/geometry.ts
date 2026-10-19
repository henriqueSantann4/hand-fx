export interface Vec2 {
  x: number;
  y: number;
}

export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];

/** Produto vetorial (b - a) x (c - a). Sinal indica de que lado de a->b o ponto c está. */
function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Ponto onde os segmentos a-b e c-d se cruzam (só cruzamento "de verdade", sem contar as pontas). */
export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;

  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function signedArea(p: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Divide o quadrilátero p0-p1-p2-p3 (nessa ordem de contorno) em triângulos para preencher.
 *  - quadrilátero convexo ou côncavo: 2 triângulos;
 *  - contorno cruzado (as arestas se cruzam, como uma gravata-borboleta): 2 triângulos que se
 *    encontram no ponto de cruzamento.
 */
export function quadTriangles(p: Quad): Vec2[][] {
  // Arestas p0-p1 e p2-p3 se cruzam
  const x1 = segmentIntersection(p[0], p[1], p[2], p[3]);
  if (x1) {
    return [
      [x1, p[1], p[2]],
      [x1, p[3], p[0]],
    ];
  }

  // Arestas p1-p2 e p3-p0 se cruzam
  const x2 = segmentIntersection(p[1], p[2], p[3], p[0]);
  if (x2) {
    return [
      [p[0], p[1], x2],
      [x2, p[2], p[3]],
    ];
  }

  // Quadrilátero simples: corta uma "orelha" (vértice convexo cujo triângulo não contém o vértice oposto)
  const sign = signedArea(p) >= 0 ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const prev = p[(i + 3) % 4];
    const cur = p[i];
    const next = p[(i + 1) % 4];
    const other = p[(i + 2) % 4];
    const convex = cross(prev, cur, next) * sign > 0;
    if (convex && !pointInTriangle(other, prev, cur, next)) {
      return [
        [prev, cur, next],
        [prev, next, other],
      ];
    }
  }

  return [
    [p[0], p[1], p[2]],
    [p[0], p[2], p[3]],
  ];
}

/** Verdadeiro quando o contorno se cruza (gravata-borboleta): a forma vira dois triângulos. */
export function isCrossed(p: Quad): boolean {
  return segmentIntersection(p[0], p[1], p[2], p[3]) !== null || segmentIntersection(p[1], p[2], p[3], p[0]) !== null;
}
