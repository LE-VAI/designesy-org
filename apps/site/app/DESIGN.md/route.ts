import { GET as designMd } from '../export/designmd/route';

export const dynamic = 'force-static';

// /DESIGN.md — root alias of /export/designmd. The score engine's v37 check
// (DESIGN.md spec-layer validation) probes ${origin}/DESIGN.md and SKIPs when
// the file is not publicly served. The contract-as-code export already exists;
// this route makes Google's canonical path serve it.
export { designMd as GET };
