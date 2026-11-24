/**
 * Superficies de agua por nivel + caras de cascada.
 *
 * El agua se mantiene SIEMPRE plana dentro de cada nivel. Cada celda de agua
 * se emite como un quad completo (recortado donde el terreno sobresale), de
 * modo que no quedan huecos entre celdas del mismo nivel. Donde dos celdas
 * vecinas tienen distinto nivel, el borde compartido se convierte en una cara
 * vertical de cascada en vez de una rampa inclinada.
 *
 * Sin dependencias de THREE: lo usan el juego y el editor de mapa.
 */

const finiteLevel = (v) => Number.isFinite(v) && v > -20;
const snapLevel = (v) => Math.round(v * 2) / 2;

/** Convierte `waterCells` en niveles discretos consultables por celda. */
export function createWaterLevels(cells, options = {}) {
  const cell = Math.max(0.5, Number(options.cell) || 2);
  const entries = cells instanceof Map ? [...cells] : Array.isArray(cells) ? cells : [];
  const map = new Map();
  for (const e of entries) {
    let gx, gz, y;
    if (Array.isArray(e) && typeof e[0] === 'string' && e[0].includes(',')) {
      const i = e[0].indexOf(',');
      gx = +e[0].slice(0, i); gz = +e[0].slice(i + 1); y = e[1];
    } else if (Array.isArray(e)) {
      [gx, gz, y] = e;
    } else if (e && typeof e === 'object' && typeof e.key === 'string') {
      const i = e.key.indexOf(',');
      gx = +e.key.slice(0, i); gz = +e.key.slice(i + 1); y = e.y;
    }
    gx = Math.round(Number(gx)); gz = Math.round(Number(gz)); y = Number(y);
    if (Number.isFinite(gx) && Number.isFinite(gz) && finiteLevel(y)) map.set(`${gx},${gz}`, y);
  }

  let seaLevel = Number(options.seaLevel);
  if (!finiteLevel(seaLevel)) {
    seaLevel = map.size ? Math.min(...map.values()) : 0;
  }
  // Cualquier altura de agua por debajo del mar se elimina: solo existe una
  // superficie de agua (el mar). Las cascadas se unen a ella directamente.
  for (const [key, y] of map) if (y <= seaLevel + 0.01) map.delete(key);

  const neighbors = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  const at = (gx, gz) => {
    const direct = map.get(`${gx},${gz}`);
    if (direct !== undefined) return direct;

    // Rellenamos huecos de una celda cuando la mayoría de vecinos coincide en
    // nivel. Nunca rellenamos un hueco que separa dos niveles distintos: ahí
    // debe quedar la cara de cascada.
    const groups = new Map();
    let total = 0;
    for (const [dx, dz] of neighbors) {
      const v = map.get(`${gx + dx},${gz + dz}`);
      if (!finiteLevel(v)) continue;
      const key = snapLevel(v);
      const g = groups.get(key) || { count: 0, raw: v };
      g.count++;
      groups.set(key, g);
      total++;
    }
    if (!total) return -Infinity;
    let best = null;
    for (const g of groups.values()) if (!best || g.count > best.count) best = g;
    return best.count >= 2 && best.count > total - best.count ? best.raw : -Infinity;
  };

  return {
    seaLevel, cell, map,
    levels: [...new Set([...map.values()].map(snapLevel))].sort((a, b) => b - a),
    levelAtGrid: at,
    levelAt: (x, z) => at(Math.round(x / cell), Math.round(z / cell)),
  };
}

/**
 * Construye una superficie plana por nivel, recortada contra el terreno, y
 * devuelve las aristas donde el nivel cambia (futuras caras de cascada).
 */
export function buildWaterSurfaces({ levels, heightAt, minX, minZ, maxX, maxZ, step = 2, offset = 0.06, subdiv = 3 }) {
  const surfaces = new Map();
  const fallEdges = [];
  if (!levels || typeof heightAt !== 'function') return { surfaces: [], fallEdges };

  const cell = levels.cell || step;
  const half = cell * 0.5;
  const sea = finiteLevel(levels.seaLevel) ? levels.seaLevel : -Infinity;
  // Subdivisión por celda: más vértices = ondas más suaves y mayor subida.
  const sub = Math.max(1, Math.floor(Number(subdiv) || 3));
  // Bordes exactos de celda (múltiplos de `cell/2`) para que quads vecinos
  // compartan vértices y no aparezcan raíces por redondeo de coordenadas.
  const cellFloor = (v) => Math.floor(v / half) * half;
  const cellCeil = (v) => Math.ceil(v / half) * half;
  const gxMin = Math.floor(minX / cell) - 1;
  const gxMax = Math.ceil(maxX / cell) + 1;
  const gzMin = Math.floor(minZ / cell) - 1;
  const gzMax = Math.ceil(maxZ / cell) + 1;

  const getSurface = (level) => {
    let s = surfaces.get(level);
    if (!s) { s = { level, positions: [], uvs: [], indices: [] }; surfaces.set(level, s); }
    return s;
  };

  const emitVertex = (s, x, z, level) => {
    const id = s.positions.length / 3;
    s.positions.push(x, level + offset, z);
    s.uvs.push(x / 12, z / 12);
    return id;
  };

  const levelCache = new Map();
  const levelAtCell = (gx, gz) => {
    const key = `${gx},${gz}`;
    if (levelCache.has(key)) return levelCache.get(key);
    const raw = levels.levelAtGrid(gx, gz);
    // Nivel por debajo del mar = no existe: el océano global lo sustituye.
    const lv = finiteLevel(raw) && raw > sea + 0.01 ? raw : -Infinity;
    levelCache.set(key, lv);
    return lv;
  };

  const addLevelEdge = (a, b, x0, z0, x1, z1) => {
    if (!finiteLevel(a) || !finiteLevel(b) || Math.abs(a - b) < 0.25) return;
    // La cara debe empezar en la superficie real (nivel + offset) para que
    // no quede un hueco entre el agua plana y la cascada.
    const top = Math.max(a, b) + offset;
    const bottom = Math.max(sea, Math.min(a, b)) + offset;
    if (top - bottom < 0.25) return;
    fallEdges.push({ x0, z0, x1, z1, top, bottom, type: 'level' });
  };

  for (let gz = gzMin; gz <= gzMax; gz++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const lv = levelAtCell(gx, gz);
      if (!finiteLevel(lv)) continue;

      const cx = gx * cell, cz = gz * cell;
      const x0 = cellFloor(cx - half), x1 = cellCeil(cx + half);
      const z0 = cellFloor(cz - half), z1 = cellCeil(cz + half);
      const dx = (x1 - x0) / sub, dz = (z1 - z0) / sub;
      const s = getSurface(snapLevel(lv));

      // Quad completo por subcelda: recortar contra el terreno generaba
      // triángulos y huecos entre celdas. La profundidad oculta el agua bajo
      // tierra y el shader suaviza la orilla usando el heightmap de profundidad.
      for (let iz = 0; iz < sub; iz++) {
        const qz0 = z0 + iz * dz, qz1 = qz0 + dz;
        for (let ix = 0; ix < sub; ix++) {
          const qx0 = x0 + ix * dx, qx1 = qx0 + dx;
          const ids = [
            emitVertex(s, qx0, qz0, snapLevel(lv)),
            emitVertex(s, qx1, qz0, snapLevel(lv)),
            emitVertex(s, qx1, qz1, snapLevel(lv)),
            emitVertex(s, qx0, qz1, snapLevel(lv)),
          ];
          s.indices.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
        }
      }

      // Cada arista interior se registra una sola vez: derecha y delantera.
      addLevelEdge(lv, levelAtCell(gx + 1, gz), x1, z0, x1, z1);
      addLevelEdge(lv, levelAtCell(gx, gz + 1), x0, z1, x1, z1);
    }
  }

  // Cierre lateral de la orilla. La cara baja hasta el terreno (o hasta el
  // mar, si está más abajo) para que la cascada no deje un hueco vacío.
  for (let gz = gzMin; gz <= gzMax; gz++) {
    for (let gx = gxMin; gx <= gxMax; gx++) {
      const lv = levelAtCell(gx, gz);
      if (!finiteLevel(lv)) continue;
      const cx = gx * cell, cz = gz * cell;
      const halfCell = cell * 0.5;
      const edges = [
        { nx: 1, nz: 0, x0: cx + halfCell, z0: cz - halfCell, x1: cx + halfCell, z1: cz + halfCell },
        { nx: -1, nz: 0, x0: cx - halfCell, z0: cz + halfCell, x1: cx - halfCell, z1: cz - halfCell },
        { nx: 0, nz: 1, x0: cx - halfCell, z0: cz + halfCell, x1: cx + halfCell, z1: cz + halfCell },
        { nx: 0, nz: -1, x0: cx + halfCell, z0: cz - halfCell, x1: cx - halfCell, z1: cz - halfCell },
      ];
      for (const e of edges) {
        const other = levelAtCell(gx + e.nx, gz + e.nz);
        if (finiteLevel(other) && Math.abs(other - lv) < 0.25) continue;
        const bed = heightAt((e.x0 + e.x1) * 0.5, (e.z0 + e.z1) * 0.5);
        if (!Number.isFinite(bed) || bed >= lv - 0.05) continue;
        const bottom = Math.max(sea, bed - 0.05);
        if (lv - bottom < 0.25) continue;
        fallEdges.push({ x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, top: lv + offset, bottom, type: 'shore' });
      }
    }
  }

  return {
    surfaces: [...surfaces.values()].filter((s) => s.indices.length).sort((a, b) => b.level - a.level),
    fallEdges,
  };
}
