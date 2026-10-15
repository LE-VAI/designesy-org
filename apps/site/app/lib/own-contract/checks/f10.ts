// f10 Your primary action pair meets contrast on shipped values (contract-mode spec
// §6.3; derived from v22). The `primary-action` pair. A FAIL caps fidelity at
// 70 (score.ts).

import type { Ctx, CheckResultV2 } from './common';
import { pairCheck } from './pairs';

export function f10(ctx: Ctx): CheckResultV2 {
  return pairCheck('f10', ctx, 'primary-action');
}
