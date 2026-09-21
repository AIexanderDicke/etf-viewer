import { isUsable, summarize } from "./portfolio.ts";
import type {
  BreakdownKind,
  ExposureRow,
  FundInfo,
  LookThrough,
  Position,
  TopicExposure,
  TopicRow,
} from "./types.ts";

const BREAKDOWN_KINDS: BreakdownKind[] = ["sector", "geography", "region", "assetAllocation"];
const UNCLASSIFIED_LABEL = "Other / not disclosed";

/**
 * Collapses a stock name to a comparison key so the same company held through
 * two funds (which may spell it differently) is aggregated into one row.
 */
export function stockKey(holding: { isin?: string; ticker?: string; name: string }): string {
  if (holding.isin) return `isin:${holding.isin.toUpperCase()}`;
  if (holding.ticker) return `ticker:${holding.ticker.toUpperCase()}`;
  return `name:${normalizeName(holding.name)}`;
}

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(
      /\b(INC|CORP|CORPORATION|LTD|LIMITED|PLC|CO|COMPANY|HOLDINGS?|GROUP|CLASS|CL|SA|NV|AG|SE|LLC|THE)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

interface MutableRow {
  label: string;
  isin?: string;
  ticker?: string;
  amount: number;
  funds: Set<string>;
}

interface MutableTopic {
  amount: number;
  basis: number;
}

/**
 * Distributes every ETF position across its fund's holdings and breakdowns,
 * then aggregates across funds. Pure: same inputs, same output.
 *
 * @param fundsByIsin only resolved funds; anything missing counts as unresolved.
 */
export function computeLookThrough(
  positions: Position[],
  fundsByIsin: Map<string, FundInfo>,
): LookThrough {
  const { total, allocations } = summarize(positions);

  const stockRows = new Map<string, MutableRow>();
  const topicRows = new Map<BreakdownKind, Map<string, MutableTopic>>(
    BREAKDOWN_KINDS.map((kind) => [kind, new Map()]),
  );

  let cashAmount = 0;
  let unresolvedAmount = 0;
  let unclassifiedAmount = 0;
  let resolvedEtfValue = 0;
  let coveredEtfValue = 0;
  const unresolvedIsins: string[] = [];

  for (const { position, amount } of allocations) {
    if (!isUsable(position)) continue;

    if (position.kind === "cash") {
      cashAmount += amount;
      continue;
    }

    const fund = fundsByIsin.get(position.isin.toUpperCase());
    if (!fund) {
      unresolvedAmount += amount;
      const isin = position.isin.toUpperCase();
      if (!unresolvedIsins.includes(isin)) unresolvedIsins.push(isin);
      continue;
    }

    resolvedEtfValue += amount;

    let covered = 0;
    for (const holding of fund.topHoldings) {
      const key = stockKey(holding);
      const row = stockRows.get(key) ?? {
        label: holding.name,
        isin: holding.isin,
        ticker: holding.ticker,
        amount: 0,
        funds: new Set<string>(),
      };
      row.amount += (amount * holding.weight) / 100;
      row.funds.add(fund.isin);
      stockRows.set(key, row);
      covered += holding.weight;
    }

    coveredEtfValue += (amount * Math.min(covered, 100)) / 100;
    unclassifiedAmount += (amount * Math.max(0, 100 - covered)) / 100;

    for (const kind of BREAKDOWN_KINDS) {
      const entries = fund.breakdowns?.[kind] ?? [];
      if (entries.length === 0) continue;

      const buckets = topicRows.get(kind)!;
      let sum = 0;
      for (const entry of entries) {
        const bucket = buckets.get(entry.label) ?? { amount: 0, basis: 0 };
        bucket.amount += (amount * entry.weight) / 100;
        buckets.set(entry.label, bucket);
        sum += entry.weight;
      }
      // Record how much fund value the breakdown was computed from, and park
      // the not-disclosed remainder so the topic still reconciles to the fund.
      for (const bucket of buckets.values()) bucket.basis += amount;
      if (sum < 100) {
        const bucket = buckets.get(UNCLASSIFIED_LABEL) ?? { amount: 0, basis: 0 };
        bucket.amount += (amount * (100 - sum)) / 100;
        buckets.set(UNCLASSIFIED_LABEL, bucket);
      }
    }
  }

  const stocks: ExposureRow[] = [...stockRows.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      isin: row.isin,
      ticker: row.ticker,
      amount: row.amount,
      share: total > 0 ? row.amount / total : 0,
      fundCount: row.funds.size,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topics = Object.fromEntries(
    BREAKDOWN_KINDS.map((kind) => {
      const buckets = topicRows.get(kind)!;
      const rows: TopicRow[] = [...buckets.entries()]
        .map(([label, bucket]) => ({
          label,
          amount: bucket.amount,
          share: total > 0 ? bucket.amount / total : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
      const basis = Math.max(0, ...[...buckets.values()].map((b) => b.basis));
      return [kind, { rows, basis } satisfies TopicExposure];
    }),
  ) as Record<BreakdownKind, TopicExposure>;

  return {
    total,
    stocks,
    cash: { amount: cashAmount, share: total > 0 ? cashAmount / total : 0 },
    unresolved: {
      amount: unresolvedAmount,
      share: total > 0 ? unresolvedAmount / total : 0,
      isins: unresolvedIsins,
    },
    unclassified: {
      amount: unclassifiedAmount,
      share: total > 0 ? unclassifiedAmount / total : 0,
    },
    topics,
    coverage: resolvedEtfValue > 0 ? coveredEtfValue / resolvedEtfValue : 0,
  };
}

/** True when a topic has anything worth rendering. */
export function hasTopicData(topic: TopicExposure): boolean {
  return topic.rows.length > 0;
}
