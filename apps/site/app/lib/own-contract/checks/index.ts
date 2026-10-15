// The fourteen fidelity checks, in order (contract-mode spec §6.1).

import type { Ctx, CheckResultV2 } from './common';
import { f01 } from './f01';
import { f02 } from './f02';
import { f03 } from './f03';
import { f04 } from './f04';
import { f05 } from './f05';
import { f06 } from './f06';
import { f07 } from './f07';
import { f08 } from './f08';
import { f09 } from './f09';
import { f10 } from './f10';
import { f11 } from './f11';
import { f12 } from './f12';
import { f13 } from './f13';
import { f14 } from './f14';

export const FIDELITY_CHECKS: Array<(ctx: Ctx) => CheckResultV2> = [f01, f02, f03, f04, f05, f06, f07, f08, f09, f10, f11, f12, f13, f14];

export { paletteLine } from './f02';
export type { Ctx, CheckResultV2 } from './common';
