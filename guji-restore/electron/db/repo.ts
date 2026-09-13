import type Database from 'better-sqlite3';
import type {
  Comment,
  Folio,
  LabColor,
  Layer,
  Material,
  PlanSnapshot,
  PlanVersion,
  Project,
  RestorationStep,
  Sample,
  Shape
} from '@shared/types';

type DB = Database.Database;

const bool = (v: unknown) => v === 1;
const j = (v: unknown) => (v == null ? null : JSON.parse(v as string));

/* ---------------- 全局库 ---------------- */

export const projectRow = (r: any): Project => ({ ...r });

export function listProjects(db: DB): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(projectRow);
}

export function getProject(db: DB, id: string): Project | null {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return r ? projectRow(r) : null;
}

export function insertProject(db: DB, p: Project): void {
  db.prepare(
    `INSERT INTO projects (id, name, author, shelf_no, era, description, created_at, updated_at)
     VALUES (@id,@name,@author,@shelf_no,@era,@description,@created_at,@updated_at)`
  ).run(p);
}

export function updateProjectRow(db: DB, id: string, patch: Partial<Project>): Project {
  const cur = getProject(db, id);
  if (!cur) throw new Error(`项目不存在: ${id}`);
  const next = { ...cur, ...patch, id, updated_at: new Date().toISOString() };
  db.prepare(
    `UPDATE projects SET name=@name, author=@author, shelf_no=@shelf_no, era=@era,
       description=@description, updated_at=@updated_at WHERE id=@id`
  ).run(next);
  return next;
}

export function deleteProjectRow(db: DB, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function listSamples(db: DB, kind?: string): Sample[] {
  const rows = kind
    ? db.prepare('SELECT * FROM samples WHERE kind = ? ORDER BY updated_at DESC').all(kind)
    : db.prepare('SELECT * FROM samples ORDER BY updated_at DESC').all();
  return rows.map(sampleRow);
}

export function sampleRow(r: any): Sample {
  return {
    id: r.id,
    project_id: r.project_id,
    kind: r.kind,
    name: r.name,
    source: r.source,
    color_hex: r.color_hex,
    lab: j(r.lab_json) as LabColor | null,
    fiber: r.fiber,
    grain: r.grain,
    thickness_mm: r.thickness_mm,
    absorbency: r.absorbency,
    image_rel: r.image_rel,
    note: r.note,
    created_at: r.created_at,
    updated_at: r.updated_at ?? r.created_at
  };
}

export function insertSample(db: DB, s: Sample): void {
  db.prepare(
    `INSERT INTO samples (id, project_id, kind, name, source, color_hex, lab_json, fiber, grain,
       thickness_mm, absorbency, image_rel, note, created_at, updated_at)
     VALUES (@id,@project_id,@kind,@name,@source,@color_hex,@lab_json,@fiber,@grain,
       @thickness_mm,@absorbency,@image_rel,@note,@created_at,@updated_at)`
  ).run({
    ...s,
    project_id: s.project_id ?? null,
    lab_json: s.lab ? JSON.stringify(s.lab) : null,
    updated_at: s.updated_at ?? s.created_at
  });
}

export function updateSampleRow(db: DB, id: string, patch: Partial<Sample>): Sample {
  const cur = db.prepare('SELECT * FROM samples WHERE id = ?').get(id) as any;
  if (!cur) throw new Error(`样本不存在: ${id}`);
  const next: Sample = { ...sampleRow(cur), ...patch, id, updated_at: new Date().toISOString() };
  db.prepare(
    `UPDATE samples SET kind=@kind, name=@name, source=@source, color_hex=@color_hex,
       lab_json=@lab_json, fiber=@fiber, grain=@grain, thickness_mm=@thickness_mm,
       absorbency=@absorbency, image_rel=@image_rel, note=@note, updated_at=@updated_at
     WHERE id=@id`
  ).run({ ...next, lab_json: next.lab ? JSON.stringify(next.lab) : null });
  return next;
}

export function deleteSampleRow(db: DB, id: string): void {
  db.prepare('DELETE FROM samples WHERE id = ?').run(id);
}

export function listMaterials(db: DB, category?: string): Material[] {
  const rows = category
    ? db.prepare('SELECT * FROM materials WHERE category = ? ORDER BY updated_at DESC').all(category)
    : db.prepare('SELECT * FROM materials ORDER BY updated_at DESC').all();
  return rows.map(materialRow);
}

export function materialRow(r: any): Material {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    color_hex: r.color_hex,
    lab: j(r.lab_json) as LabColor | null,
    fiber: r.fiber,
    thickness_mm: r.thickness_mm,
    weight_gsm: r.weight_gsm,
    weave: r.weave,
    ph: r.ph,
    supplier: r.supplier,
    note: r.note,
    created_at: r.created_at,
    updated_at: r.updated_at ?? r.created_at
  };
}

export function getMaterial(db: DB, id: string): Material | null {
  const r = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  return r ? materialRow(r) : null;
}

export function insertMaterial(db: DB, m: Material): void {
  db.prepare(
    `INSERT INTO materials (id, name, category, color_hex, lab_json, fiber, thickness_mm,
       weight_gsm, weave, ph, supplier, note, created_at, updated_at)
     VALUES (@id,@name,@category,@color_hex,@lab_json,@fiber,@thickness_mm,
       @weight_gsm,@weave,@ph,@supplier,@note,@created_at,@updated_at)`
  ).run({
    ...m,
    lab_json: m.lab ? JSON.stringify(m.lab) : null,
    updated_at: m.updated_at ?? m.created_at
  });
}

export function updateMaterialRow(db: DB, id: string, patch: Partial<Material>): Material {
  const cur = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as any;
  if (!cur) throw new Error(`材料不存在: ${id}`);
  const next: Material = { ...materialRow(cur), ...patch, id, updated_at: new Date().toISOString() };
  db.prepare(
    `UPDATE materials SET name=@name, category=@category, color_hex=@color_hex, lab_json=@lab_json,
       fiber=@fiber, thickness_mm=@thickness_mm, weight_gsm=@weight_gsm, weave=@weave,
       ph=@ph, supplier=@supplier, note=@note, updated_at=@updated_at WHERE id=@id`
  ).run({ ...next, lab_json: next.lab ? JSON.stringify(next.lab) : null });
  return next;
}

export function deleteMaterialRow(db: DB, id: string): void {
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
}

/* ---------------- 项目库 ---------------- */

export function folioRow(r: any): Folio {
  return { ...r };
}

export function listFolios(db: DB): Folio[] {
  return db.prepare('SELECT * FROM folios ORDER BY sequence, name').all().map(folioRow);
}

export function getFolio(db: DB, id: string): Folio | null {
  const r = db.prepare('SELECT * FROM folios WHERE id = ?').get(id);
  return r ? folioRow(r) : null;
}

export function insertFolio(db: DB, f: Folio): void {
  db.prepare(
    `INSERT INTO folios (id, project_id, name, sequence, original_rel, original_checksum,
       width, height, thumb_rel, after_rel, after_checksum, imported_at, note)
     VALUES (@id,@project_id,@name,@sequence,@original_rel,@original_checksum,
       @width,@height,@thumb_rel,@after_rel,@after_checksum,@imported_at,@note)`
  ).run(f);
}

export function updateFolioRow(db: DB, id: string, patch: Partial<Folio>): Folio {
  const cur = getFolio(db, id);
  if (!cur) throw new Error(`扫描叶不存在: ${id}`);
  const next: Folio = { ...cur, ...patch, id };
  db.prepare(
    `UPDATE folios SET name=@name, note=@note, after_rel=@after_rel, after_checksum=@after_checksum
     WHERE id=@id`
  ).run(next);
  return next;
}

export function deleteFolioRow(db: DB, id: string): void {
  db.prepare('DELETE FROM folios WHERE id = ?').run(id);
}

export function layerRow(r: any): Layer {
  return {
    id: r.id,
    folio_id: r.folio_id,
    name: r.name,
    kind: r.kind,
    color: r.color,
    visible: bool(r.visible),
    locked: bool(r.locked),
    opacity: r.opacity,
    order_index: r.order_index,
    created_at: r.created_at
  };
}

export function listLayers(db: DB, folioId: string): Layer[] {
  return db
    .prepare('SELECT * FROM layers WHERE folio_id = ? ORDER BY order_index, created_at')
    .all(folioId)
    .map(layerRow);
}

export function insertLayer(db: DB, l: Layer): void {
  db.prepare(
    `INSERT INTO layers (id, folio_id, name, kind, color, visible, locked, opacity, order_index, created_at)
     VALUES (@id,@folio_id,@name,@kind,@color,@visible,@locked,@opacity,@order_index,@created_at)`
  ).run({ ...l, visible: l.visible ? 1 : 0, locked: l.locked ? 1 : 0 });
}

export function updateLayerRow(db: DB, id: string, patch: Partial<Layer>): Layer {
  const cur = db.prepare('SELECT * FROM layers WHERE id = ?').get(id) as any;
  if (!cur) throw new Error(`图层不存在: ${id}`);
  const next: Layer = { ...layerRow(cur), ...patch, id };
  db.prepare(
    `UPDATE layers SET name=@name, color=@color, visible=@visible, locked=@locked,
       opacity=@opacity, order_index=@order_index WHERE id=@id`
  ).run({ ...next, visible: next.visible ? 1 : 0, locked: next.locked ? 1 : 0 });
  return next;
}

export function deleteLayerRow(db: DB, id: string): void {
  db.prepare('DELETE FROM layers WHERE id = ?').run(id);
}

export function shapeRow(r: any): Shape {
  return {
    id: r.id,
    folio_id: r.folio_id,
    layer_id: r.layer_id,
    damage: r.damage,
    geometry: j(r.geom_json),
    label: r.label,
    note: r.note,
    area_px: r.area_px,
    order_index: r.order_index,
    created_at: r.created_at
  };
}

export function listShapes(db: DB, folioId: string): Shape[] {
  return db
    .prepare('SELECT * FROM shapes WHERE folio_id = ? ORDER BY order_index, created_at')
    .all(folioId)
    .map(shapeRow);
}

export function insertShape(db: DB, s: Shape): void {
  db.prepare(
    `INSERT INTO shapes (id, folio_id, layer_id, damage, geom_json, label, note, area_px, order_index, created_at)
     VALUES (@id,@folio_id,@layer_id,@damage,@geom_json,@label,@note,@area_px,@order_index,@created_at)`
  ).run({ ...s, geom_json: JSON.stringify(s.geometry) });
}

export function updateShapeRow(db: DB, id: string, patch: Partial<Shape>): Shape {
  const cur = db.prepare('SELECT * FROM shapes WHERE id = ?').get(id) as any;
  if (!cur) throw new Error(`标注不存在: ${id}`);
  const next: Shape = { ...shapeRow(cur), ...patch, id };
  db.prepare(
    `UPDATE shapes SET layer_id=@layer_id, damage=@damage, geom_json=@geom_json, label=@label,
       note=@note, area_px=@area_px, order_index=@order_index WHERE id=@id`
  ).run({ ...next, geom_json: JSON.stringify(next.geometry) });
  return next;
}

export function deleteShapeRow(db: DB, id: string): void {
  db.prepare('DELETE FROM shapes WHERE id = ?').run(id);
}

export function stepRow(r: any): RestorationStep {
  return { ...r, material_ids: j(r.material_ids) || [] };
}

export function listSteps(db: DB, projectId: string): RestorationStep[] {
  return db
    .prepare('SELECT * FROM steps WHERE project_id = ? ORDER BY order_index, performed_at')
    .all(projectId)
    .map(stepRow);
}

export function insertStep(db: DB, s: RestorationStep): void {
  db.prepare(
    `INSERT INTO steps (id, project_id, folio_id, order_index, title, technique, material_ids,
       operator, performed_at, duration_min, photo_rel, note, created_at)
     VALUES (@id,@project_id,@folio_id,@order_index,@title,@technique,@material_ids,
       @operator,@performed_at,@duration_min,@photo_rel,@note,@created_at)`
  ).run({ ...s, folio_id: s.folio_id ?? null, material_ids: JSON.stringify(s.material_ids) });
}

export function updateStepRow(db: DB, id: string, patch: Partial<RestorationStep>): RestorationStep {
  const cur = db.prepare('SELECT * FROM steps WHERE id = ?').get(id) as any;
  if (!cur) throw new Error(`工序不存在: ${id}`);
  const next: RestorationStep = { ...stepRow(cur), ...patch, id };
  db.prepare(
    `UPDATE steps SET folio_id=@folio_id, order_index=@order_index, title=@title,
       technique=@technique, material_ids=@material_ids, operator=@operator,
       performed_at=@performed_at, duration_min=@duration_min, photo_rel=@photo_rel, note=@note
     WHERE id=@id`
  ).run({ ...next, folio_id: next.folio_id ?? null, material_ids: JSON.stringify(next.material_ids) });
  return next;
}

export function deleteStepRow(db: DB, id: string): void {
  db.prepare('DELETE FROM steps WHERE id = ?').run(id);
}

export function versionRow(r: any): PlanVersion {
  return {
    id: r.id,
    project_id: r.project_id,
    folio_id: r.folio_id,
    version: r.version,
    label: r.label,
    note: r.note,
    author: r.author,
    snapshot: j(r.snapshot) as PlanSnapshot,
    created_at: r.created_at
  };
}

export function listVersions(db: DB, folioId: string): PlanVersion[] {
  return db
    .prepare('SELECT * FROM plan_versions WHERE folio_id = ? ORDER BY version DESC')
    .all(folioId)
    .map(versionRow);
}

export function getVersion(db: DB, id: string): PlanVersion | null {
  const r = db.prepare('SELECT * FROM plan_versions WHERE id = ?').get(id);
  return r ? versionRow(r) : null;
}

export function insertVersion(db: DB, v: PlanVersion): void {
  db.prepare(
    `INSERT INTO plan_versions (id, project_id, folio_id, version, label, note, author, snapshot, created_at)
     VALUES (@id,@project_id,@folio_id,@version,@label,@note,@author,@snapshot,@created_at)`
  ).run({ ...v, snapshot: JSON.stringify(v.snapshot) });
}

export function commentRow(r: any): Comment {
  return { ...r, resolved: bool(r.resolved) };
}

export function listComments(db: DB, projectId: string): Comment[] {
  return db
    .prepare('SELECT * FROM comments WHERE project_id = ? ORDER BY created_at')
    .all(projectId)
    .map(commentRow);
}

export function insertComment(db: DB, c: Comment): void {
  db.prepare(
    `INSERT INTO comments (id, project_id, folio_id, target_type, target_id, author, body, resolved, created_at)
     VALUES (@id,@project_id,@folio_id,@target_type,@target_id,@author,@body,@resolved,@created_at)`
  ).run({ ...c, folio_id: c.folio_id ?? null, target_id: c.target_id ?? null, resolved: c.resolved ? 1 : 0 });
}

export function resolveCommentRow(db: DB, id: string, resolved: boolean): Comment {
  db.prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
  const r = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
  if (!r) throw new Error(`批注不存在: ${id}`);
  return commentRow(r);
}

export function deleteCommentRow(db: DB, id: string): void {
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
}

/** 用版本快照整体替换某叶的图层/标注（回退用，单事务） */
export function replacePlan(db: DB, folioId: string, snapshot: PlanSnapshot): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM shapes WHERE folio_id = ?').run(folioId);
    db.prepare('DELETE FROM layers WHERE folio_id = ?').run(folioId);
    for (const l of snapshot.layers) insertLayer(db, l);
    for (const s of snapshot.shapes) insertShape(db, s);
  });
  tx();
}
