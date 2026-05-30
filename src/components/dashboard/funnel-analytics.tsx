"use client"

import { BarChart3 } from 'lucide-react'
import type { FunnelAnalyticsData } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface FunnelAnalyticsProps {
  data: FunnelAnalyticsData | null
  loading: boolean
}

/**
 * Three-section analytics panel:
 *   1. Stage funnel — bars sized to the largest bucket so the visual
 *      drop-off makes the funnel shape obvious.
 *   2. Sequence enrollment — flat list of nurture sequences with the
 *      number of contacts currently in each.
 *   3. Template usage — top 10 templates by send volume in the window,
 *      with delivered/read rates per template.
 *
 * All three render in one card so the funnel stays one scroll away from
 * "is the drip working?" — the question this whole panel is meant to
 * answer.
 */
export function FunnelAnalytics({ data, loading }: FunnelAnalyticsProps) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900">
      <header className="border-b border-slate-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Funnel Analytics</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Lifecycle, sequence enrollment & template performance
          {data ? ` · last ${data.windowDays} days` : ''}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-5">
        {loading || !data ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : isEmpty(data) ? (
          <EmptyState
            icon={BarChart3}
            title="No funnel data yet"
            hint="Tag contacts with stage:* / seq:* and send templates — this panel fills in as the drip runs."
          />
        ) : (
          <>
            <StageFunnel data={data} />
            <SequenceList data={data} />
            <TemplateTable data={data} />
          </>
        )}
      </div>
    </section>
  )
}

function isEmpty(d: FunnelAnalyticsData): boolean {
  const stageTotal = d.stageFunnel.reduce((s, b) => s + b.count, 0)
  const seqTotal = d.sequences.reduce((s, b) => s + b.count, 0)
  return d.templateUsage.length === 0 && stageTotal === 0 && seqTotal === 0
}

// ----------------------------------------------------------------------

function StageFunnel({ data }: { data: FunnelAnalyticsData }) {
  const max = Math.max(1, ...data.stageFunnel.map((b) => b.count))
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Lifecycle funnel
      </h3>
      <ul className="space-y-2">
        {data.stageFunnel.map((b) => {
          const pct = (b.count / max) * 100
          return (
            <li
              key={b.tag}
              className="grid grid-cols-[100px_1fr_56px] items-center gap-3 text-xs"
            >
              <span className="truncate text-slate-300">{b.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
              <span className="text-right text-slate-300 tabular-nums">
                {b.count.toLocaleString()}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SequenceList({ data }: { data: FunnelAnalyticsData }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Sequence enrollment
      </h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.sequences.map((b) => (
          <li
            key={b.tag}
            className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs"
          >
            <span className="truncate text-slate-300">{b.label}</span>
            <span className="font-medium text-white tabular-nums">
              {b.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TemplateTable({ data }: { data: FunnelAnalyticsData }) {
  if (data.templateUsage.length === 0) {
    return (
      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
          Template performance
        </h3>
        <p className="text-xs text-slate-500">
          No template sends in this window yet.
        </p>
      </div>
    )
  }
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        Template performance
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2 font-medium">Template</th>
              <th className="pb-2 text-right font-medium">Sent</th>
              <th className="pb-2 text-right font-medium">Delivered</th>
              <th className="pb-2 text-right font-medium">Read rate</th>
            </tr>
          </thead>
          <tbody>
            {data.templateUsage.map((t) => {
              const deliveredPct = t.sent > 0 ? (t.delivered / t.sent) * 100 : 0
              const readPct = t.sent > 0 ? (t.read / t.sent) * 100 : 0
              return (
                <tr
                  key={t.templateName}
                  className="border-t border-slate-800/60 text-slate-300"
                >
                  <td className="py-2 pr-3 font-mono text-[11px]">
                    {t.templateName}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {t.sent.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {t.delivered.toLocaleString()}
                    <span className="ml-1 text-slate-500">
                      ({deliveredPct.toFixed(0)}%)
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {readPct.toFixed(0)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
