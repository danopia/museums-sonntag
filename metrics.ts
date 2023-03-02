import DatadogApi from "https://deno.land/x/datadog_api@v0.1.5/mod.ts";
export const datadog = DatadogApi.fromEnvironment(Deno.env);

import { type Quota } from "./quotas.ts";

const host_name = [
  Deno.env.get('DENO_REGION'),
].filter(x => x).map(x => `deno-deploy-${x}`)[0] ?? 'localhost';

export function reportQuotaMetrics(rows: Quota[]) {
  return datadog.v1Metrics.submit(rows.flatMap(row => [{
    metric_name: 'museumssonntag.slot_count',
    metric_type: 'gauge',
    points: [{ value: row.slot_count }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.slot_size',
    metric_type: 'gauge',
    points: [{ value: row.slot_size }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.tickets_total',
    metric_type: 'gauge',
    points: [{ value: row.total_tickets }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.tickets_available',
    metric_type: 'gauge',
    points: [{ value: row.available_tickets }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }]));
}
