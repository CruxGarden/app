/**
 * Compile-time app↔api contract check.
 *
 * The API's OpenAPI document is the contract source (`cd api && npm run
 * openapi`, then `npm run generate:api` here regenerates
 * src/api/generated/schema.d.ts). This file asserts that the hand-written
 * request DTOs in src/api/types.ts stay assignable to the generated wire
 * types — if the server's contract moves, `tsc` fails here instead of a
 * request failing at runtime.
 *
 * Known, deliberate divergences are excluded per-assertion with a note.
 * Response entities (Crux, Artifact, …) are NOT asserted: the app's versions
 * are domain types that extend the wire shape with local-only fields
 * (fingerprint, themeId, typed meta) — see the header note in types.ts.
 *
 * This module is type-only; it emits nothing.
 */

import type { components } from './generated/schema';
import type {
  CreateCruxDto,
  UpdateCruxDto,
  CreateAuthorDto,
  UpdateAuthorDto,
  CreateDimensionDto,
} from './types';

type Wire<K extends keyof components['schemas']> = components['schemas'][K];

type Extends<A, B> = A extends B ? true : false;
type Assert<T extends true> = T;

// kind: the app's CruxKind includes local-only 'snapshot' (snapshot cruxes
// never sync to the API); the wire enum is the publishable subset.
export type _CreateCrux = Assert<
  Extends<Omit<CreateCruxDto, 'kind'>, Omit<Wire<'CreateCruxDto'>, 'kind'>>
>;
export type _UpdateCrux = Assert<
  Extends<Omit<UpdateCruxDto, 'kind'>, Omit<Wire<'UpdateCruxDto'>, 'kind'>>
>;

export type _CreateAuthor = Assert<Extends<CreateAuthorDto, Wire<'CreateAuthorDto'>>>;
export type _UpdateAuthor = Assert<Extends<UpdateAuthorDto, Wire<'UpdateAuthorDto'>>>;

export type _CreateDimension = Assert<Extends<CreateDimensionDto, Wire<'CreateDimensionDto'>>>;

