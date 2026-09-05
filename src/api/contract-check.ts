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
import type { CheckoutBody } from './billing';
import type { AddDomainBody } from './domains';

type Wire<K extends keyof components['schemas']> = components['schemas'][K];

type Extends<A, B> = A extends B ? true : false;
type Assert<T extends true> = T;

/**
 * Fields the app sends that the wire type no longer has.
 *
 * Assignability alone only catches ADDED or retyped server fields: an app DTO
 * with extra properties still "extends" a narrower wire type, so a field the
 * API REMOVED would sail through and fail at runtime as a Postgres
 * "column does not exist" 500. This makes removals a compile error too.
 */
type ExtraKeys<AppDto, WireDto> = Exclude<keyof AppDto, keyof WireDto>;
// Resolves to `true` when nothing is extra; otherwise to the offending key
// names, which then fail the `Assert` at the use site and name themselves.
type NoExtraKeys<AppDto, WireDto> = [ExtraKeys<AppDto, WireDto>] extends [never]
  ? true
  : ExtraKeys<AppDto, WireDto>;

// kind: the app's CruxKind includes local-only 'snapshot' (snapshot cruxes
// never sync to the API); the wire enum is the publishable subset.
export type _CreateCrux = Assert<
  Extends<Omit<CreateCruxDto, 'kind'>, Omit<Wire<'CreateCruxDto'>, 'kind'>>
>;
export type _UpdateCrux = Assert<
  Extends<Omit<UpdateCruxDto, 'kind'>, Omit<Wire<'UpdateCruxDto'>, 'kind'>>
>;
export type _CreateCruxNoStrays = Assert<NoExtraKeys<CreateCruxDto, Wire<'CreateCruxDto'>>>;
export type _UpdateCruxNoStrays = Assert<NoExtraKeys<UpdateCruxDto, Wire<'UpdateCruxDto'>>>;

// Billing and custom domains (ADR 0011/0012): the app builds these bodies by hand.
export type _Checkout = Assert<Extends<CheckoutBody, Wire<'CheckoutDto'>>>;
export type _CheckoutNoStrays = Assert<NoExtraKeys<CheckoutBody, Wire<'CheckoutDto'>>>;
export type _AddDomain = Assert<Extends<AddDomainBody, Wire<'AddDomainDto'>>>;
export type _AddDomainNoStrays = Assert<NoExtraKeys<AddDomainBody, Wire<'AddDomainDto'>>>;

export type _CreateAuthor = Assert<Extends<CreateAuthorDto, Wire<'CreateAuthorDto'>>>;
export type _UpdateAuthor = Assert<Extends<UpdateAuthorDto, Wire<'UpdateAuthorDto'>>>;
export type _CreateAuthorNoStrays = Assert<NoExtraKeys<CreateAuthorDto, Wire<'CreateAuthorDto'>>>;
export type _UpdateAuthorNoStrays = Assert<NoExtraKeys<UpdateAuthorDto, Wire<'UpdateAuthorDto'>>>;

export type _CreateDimension = Assert<Extends<CreateDimensionDto, Wire<'CreateDimensionDto'>>>;
export type _CreateDimensionNoStrays = Assert<
  NoExtraKeys<CreateDimensionDto, Wire<'CreateDimensionDto'>>
>;
