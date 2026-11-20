import { CATEGORY_WEIGHTS, ENGINE_VERSION } from './check-definitions';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './data/cohort';
import { CONTRACT_VERSION } from './design-system-contract';
import { registry } from './engine/registry';
import { graph } from './graph';
import { MCP_TOOL_NAMES } from './mcp-tool-registry';
import { OG_T } from './og-card';
import { MONO, Plate } from './og-lab-plates';
import { REVIEW_FINDINGS_SCHEMA } from './review-findings-schema';
import { REVIEW_PRICE } from './review-offer';
import { AXES, STAGE_LABELS } from '../maturity/axes';
import { TIERS } from '../pricing/tiers';

/**
 * Share-card plates for the tool and document pages the icon family has no
 * icon for. Each plate is drawn from the module its page is drawn from, so a
 * check, a file, a weight or a price that changes there changes on the card.
 * The plate, its faces and its colours are the lab plates' (og-lab-plates).
 *
 * The card renderer draws no SVG text, so every label is a box.
 */
const RULE = `1px solid ${OG_T.tileLine}`;

/** Methodology: the category weights as columns, heaviest first. */
export function WeightsPlate() {
  const heaviest = CATEGORY_ORDER[0];
  const lightest = CATEGORY_ORDER[CATEGORY_ORDER.length - 1];
  const max = CATEGORY_WEIGHTS[heaviest];
  const tallest = 104;
  // Each end of the row is named with its weight, the number over the name.
  const end = (key: string, align: 'flex-start' | 'flex-end') => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: 18, color: OG_T.ink }}>{CATEGORY_WEIGHTS[key]}</div>
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: 15, color: OG_T.mutedDim }}>{CATEGORY_LABELS[key]}</div>
    </div>
  );
  return (
    <Plate padding="0 28px">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: tallest, borderBottom: RULE }}>
        {CATEGORY_ORDER.map((key) => (
          <div
            key={key}
            style={{
              display: 'flex',
              width: 12,
              height: Math.round((tallest * CATEGORY_WEIGHTS[key]) / max),
              borderRadius: '3px 3px 0 0',
              background: OG_T.ink,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        {end(heaviest, 'flex-start')}
        {end(lightest, 'flex-end')}
      </div>
    </Plate>
  );
}

/** Drift: the two things the checks ask, with a cell for every check. */
export function DriftPlate() {
  const drift = registry('drift');
  return (
    <Plate padding="0 24px">
      {drift.groups.map((group, g) => {
        const count = drift.checks.filter((check) => check.group === group.id).length;
        return (
          <div
            key={group.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              paddingTop: g === 0 ? 0 : 18,
              paddingBottom: g === 0 ? 18 : 0,
              borderTop: g === 0 ? 'none' : RULE,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', fontSize: 22, fontWeight: 500, color: OG_T.ink }}>{group.label}</div>
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 18, color: OG_T.muted }}>{count}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {Array.from({ length: count }, (_, i) => (
                <div key={i} style={{ display: 'flex', width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${OG_T.muted}` }} />
              ))}
            </div>
          </div>
        );
      })}
    </Plate>
  );
}

/** Readiness: every path a probe looks at, once each, in check order. */
export function ReadinessPlate() {
  const paths = [...new Set(registry('readiness').checks.map((check) => check.path ?? ''))].filter(Boolean);
  return (
    <Plate padding="0 28px">
      {paths.map((path) => (
        <div key={path} style={{ display: 'flex', fontFamily: MONO, fontSize: 16, lineHeight: 1.3, color: OG_T.muted }}>
          {path}
        </div>
      ))}
    </Plate>
  );
}

/** Guardrails: the files of the build contract, by number. */
export function GuardrailsPlate() {
  const files = registry('guardrails').checks;
  return (
    <Plate padding="0 24px">
      {files.map((check, i) => (
        <div
          key={check.id}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            height: 32,
            paddingTop: 7,
            borderTop: i === 0 ? 'none' : RULE,
          }}
        >
          <div style={{ display: 'flex', width: 36, fontFamily: MONO, fontSize: 14, color: OG_T.mutedDim }}>
            {String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ display: 'flex', fontFamily: MONO, fontSize: 17, color: OG_T.ink }}>{check.file}</div>
        </div>
      ))}
    </Plate>
  );
}

/**
 * Compare: two sites and the ways they can differ. The dot is the diff
 * between the two rings; the labels are the registry's diff checks.
 */
export function ComparePlate() {
  const diffs = registry('compare').checks.filter((check) => check.group === 'diff');
  const half = Math.ceil(diffs.length / 2);
  const ring = <div style={{ display: 'flex', width: 30, height: 30, borderRadius: 15, border: `3px solid ${OG_T.ink}` }} />;
  const link = <div style={{ display: 'flex', flexGrow: 1, height: 0, borderTop: `1.5px dashed ${OG_T.mutedDim}` }} />;
  return (
    <Plate padding="0 24px">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 20, borderBottom: RULE }}>
        {ring}
        {link}
        <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: OG_T.signal }} />
        {link}
        {ring}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        {[diffs.slice(0, half), diffs.slice(half)].map((column, c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column' }}>
            {column.map((check) => (
              <div key={check.id} style={{ display: 'flex', fontSize: 17, fontWeight: 500, lineHeight: 1.5, color: OG_T.muted }}>
                {check.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Plate>
  );
}

/** MCP: every tool the server lists, by name, without the shared prefix. */
export function McpToolsPlate() {
  const names = MCP_TOOL_NAMES.map((name) => name.replace(/^designesy_/, ''));
  const perColumn = Math.ceil(names.length / 2);
  return (
    <Plate>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 22 }}>
        {[names.slice(0, perColumn), names.slice(perColumn)].map((column, c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column' }}>
            {column.map((name) => (
              <div key={name} style={{ display: 'flex', fontFamily: MONO, fontSize: 14, lineHeight: 1.36, color: OG_T.muted }}>
                {name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Plate>
  );
}

/**
 * Graph: the chain's stages in order, source to shipped work, on one line.
 * The dot marks the end the chain is read back from.
 */
export function ChainPlate() {
  const stages = graph.chain.map((link) => link.stage);
  const row = 20;
  const last = stages.length - 1;
  return (
    <Plate padding="0 26px">
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            position: 'absolute',
            left: 4,
            top: row / 2,
            width: 1,
            height: row * last,
            background: OG_T.mutedDim,
          }}
        />
        {stages.map((stage, i) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', height: row }}>
            <div style={{ display: 'flex', width: 24 }}>
              <div
                style={{
                  display: 'flex',
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  background: i === last ? OG_T.signal : OG_T.tile,
                  border: i === last ? 'none' : `1.5px solid ${OG_T.muted}`,
                }}
              />
            </div>
            <div style={{ display: 'flex', fontSize: 15, fontWeight: 500, color: i === 0 || i === last ? OG_T.ink : OG_T.muted }}>
              {stage}
            </div>
          </div>
        ))}
      </div>
    </Plate>
  );
}

/** Specs: the fields a findings file must carry, as the schema requires them. */
export function SchemaPlate() {
  const required = REVIEW_FINDINGS_SCHEMA.required;
  const text = (value: string, color: string) => (
    <div style={{ display: 'flex', fontFamily: MONO, fontSize: 17, lineHeight: 1.3, color }}>{value}</div>
  );
  return (
    <Plate padding="0 30px">
      {text('{', OG_T.mutedDim)}
      {required.map((field, i) => (
        <div key={field} style={{ display: 'flex', paddingLeft: 20 }}>
          {text(`"${field}"`, OG_T.ink)}
          {i === required.length - 1 ? null : text(',', OG_T.mutedDim)}
        </div>
      ))}
      {text('}', OG_T.mutedDim)}
    </Plate>
  );
}

/** The Review: its price, in the face the site sets its figures in. */
export function ReviewPricePlate() {
  return (
    <Plate>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          fontFamily: 'Fraunces',
          fontSize: 96,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: OG_T.ink,
        }}
      >
        {REVIEW_PRICE}
      </div>
    </Plate>
  );
}

/** Changelog: where the contract and the engine stand now. */
export function VersionsPlate() {
  const row = (label: string, value: string, first = false) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        paddingTop: first ? 0 : 16,
        paddingBottom: first ? 16 : 0,
        borderTop: first ? 'none' : RULE,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontFamily: MONO,
          fontSize: 15,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: OG_T.mutedDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 4,
          fontFamily: 'Fraunces',
          fontSize: 46,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.08,
          color: OG_T.ink,
        }}
      >
        {value}
      </div>
    </div>
  );
  return (
    <Plate padding="0 28px">
      {row('Contract', CONTRACT_VERSION, true)}
      {row('Engine', ENGINE_VERSION)}
    </Plate>
  );
}

/** Pricing: the three tiers by name, each with its price. */
export function TiersPlate() {
  return (
    <Plate padding="0 26px">
      {TIERS.map((tier, i) => (
        <div
          key={tier.name}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            height: 60,
            paddingTop: 14,
            borderTop: i === 0 ? 'none' : RULE,
          }}
        >
          <div style={{ display: 'flex', fontSize: 21, fontWeight: 500, color: OG_T.muted }}>{tier.name}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ display: 'flex', fontFamily: 'Fraunces', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', color: OG_T.ink }}>
              {tier.price}
            </div>
            {tier.suffix ? (
              <div style={{ display: 'flex', fontFamily: MONO, fontSize: 14, color: OG_T.mutedDim }}>{tier.suffix}</div>
            ) : null}
          </div>
        </div>
      ))}
    </Plate>
  );
}

/**
 * Maturity: the assessment's own matrix before a question is answered, one
 * row for each axis and one cell for each stage.
 */
export function MaturityPlate() {
  const stages = Object.keys(STAGE_LABELS);
  return (
    <Plate padding="0 26px">
      {AXES.map((axis, i) => (
        <div
          key={axis.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 31,
            borderTop: i === 0 ? 'none' : RULE,
          }}
        >
          <div style={{ display: 'flex', fontSize: 15, fontWeight: 500, color: OG_T.muted }}>{axis.label}</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {stages.map((stage) => (
              <div key={stage} style={{ display: 'flex', width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${OG_T.muted}` }} />
            ))}
          </div>
        </div>
      ))}
    </Plate>
  );
}
