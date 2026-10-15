// f09 Declared text and background pairs meet contrast on shipped values
// (contract-mode spec §6.3; derived from v06). The `component` pairs; the worst pair
// decides. A FAIL caps fidelity at 65 (score.ts).

import type { Ctx, CheckResultV2 } from './common';
import { pairCheck } from './pairs';

export function f09(ctx: Ctx): CheckResultV2 {
  return pairCheck('f09', ctx, 'component');
}
