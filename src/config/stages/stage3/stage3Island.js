/** Stage3 섬 GLB 로드 후 콜라이더·walkable 설정 */

export const STAGE3_WALKABLE_NAME_PATTERNS = [/^DECO_BRICK/i, /^DECO_Grass/i];
export const STAGE3_WALKABLE_MATERIAL_PATTERNS = [/island_grass/i, /^grassM$/i];

/** walkable XZ bounds 안쪽으로 줄이는 여백(m) */
export const STAGE3_EDGE_SAFETY_INSET = 1.9;
