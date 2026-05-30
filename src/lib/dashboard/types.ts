// Shared result shapes the dashboard components consume. Centralised
// here so each component stays thin and the page-level loader wires
// them up without type gymnastics.

export interface MetricDelta {
  current: number
  previous: number
}

export interface MetricsBundle {
  activeConversations: MetricDelta
  newContactsToday: MetricDelta
  openDealsValue: number
  openDealsCount: number
  messagesSentToday: MetricDelta
}

export interface ConversationsSeriesPoint {
  day: string // YYYY-MM-DD local
  incoming: number
  outgoing: number
}

export interface PipelineStageSlice {
  id: string
  name: string
  color: string
  dealCount: number
  totalValue: number
}

export interface PipelineDonutData {
  stages: PipelineStageSlice[]
  totalValue: number
}

export interface ResponseTimeBucket {
  /** 0 = Mon … 6 = Sun (Monday-first). */
  dow: number
  /** Average first-response time in minutes. Null means no samples. */
  avgMinutes: number | null
  samples: number
}

export interface ResponseTimeSummary {
  buckets: ResponseTimeBucket[]
  thisWeekAvg: number | null
  lastWeekAvg: number | null
}

export type ActivityKind =
  | 'message'
  | 'deal'
  | 'broadcast'
  | 'automation'
  | 'contact'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** Primary line of text rendered in the feed. Pre-formatted. */
  text: string
  /** ISO timestamp the item happened at, drives relative-time + sort. */
  at: string
  /** Optional deep-link for the whole row (not all items have a target). */
  href?: string
}

// --- Funnel analytics --------------------------------------------------

export interface TemplateUsage {
  templateName: string
  /** Total outbound template messages in the window. */
  sent: number
  /** Reached the recipient's phone (status reached delivered or beyond). */
  delivered: number
  /** Recipient actually opened the message (status === 'read'). */
  read: number
}

export interface TagBucket {
  /** The raw tag name (e.g. "seq:cohort"). */
  tag: string
  /** Human-readable label derived from the suffix. */
  label: string
  /** Distinct contacts currently carrying the tag. */
  count: number
}

export interface FunnelAnalyticsData {
  /** Top templates by send volume in the window. */
  templateUsage: TemplateUsage[]
  /** Distinct contacts enrolled in each nurture sequence. */
  sequences: TagBucket[]
  /** Lifecycle funnel: new → engaged → call-booked → call-done → won/lost. */
  stageFunnel: TagBucket[]
  /** Days the template window covers (for the panel header). */
  windowDays: number
}
