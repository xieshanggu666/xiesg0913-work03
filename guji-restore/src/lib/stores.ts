import { writable } from 'svelte/store';
import type {
  Comment,
  Folio,
  ID,
  Layer,
  Material,
  Project,
  RestorationStep,
  Sample,
  Shape
} from '@shared/types';

export type ViewKey = 'annotate' | 'samples' | 'materials' | 'steps' | 'compare' | 'archive' | 'dashboard';

export const currentView = writable<ViewKey>('annotate');
export const operator = writable<string>(localStorage.getItem('guji-operator') || '修复师');
operator.subscribe((v) => localStorage.setItem('guji-operator', v));

export const projects = writable<Project[]>([]);
export const currentProjectId = writable<ID | null>(localStorage.getItem('guji-project') || null);
currentProjectId.subscribe((v) => {
  if (v) localStorage.setItem('guji-project', v);
});

export const folios = writable<Folio[]>([]);
export const currentFolioId = writable<ID | null>(null);
export const layers = writable<Layer[]>([]);
export const shapes = writable<Shape[]>([]);
export const selectedShapeId = writable<ID | null>(null);
export const activeLayerId = writable<ID | null>(null);

export const samples = writable<Sample[]>([]);
export const materials = writable<Material[]>([]);
export const recommendSampleId = writable<ID | null>(null);
export const steps = writable<RestorationStep[]>([]);
export const comments = writable<Comment[]>([]);

export const busy = writable(false);
