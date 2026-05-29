/**
 * Shared display config for message_templates.status.
 *
 * The DB stores Meta's raw enum (DRAFT / APPROVED / PENDING / REJECTED /
 * PAUSED / DISABLED / IN_APPEAL / PENDING_DELETION) — the UI maps it to
 * a human label + dark-theme badge classes here so the template manager,
 * inbox picker, and broadcast picker stay aligned.
 */

import type { MessageTemplateStatus } from '@/types';

export interface TemplateStatusDisplay {
  label: string;
  classes: string;
}

export const templateStatusConfig: Record<
  MessageTemplateStatus,
  TemplateStatusDisplay
> = {
  DRAFT: {
    label: 'Draft',
    classes: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  },
  PENDING: {
    label: 'Pending',
    classes: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  },
  APPROVED: {
    label: 'Approved',
    classes: 'bg-primary/20 text-primary border-primary/30',
  },
  REJECTED: {
    label: 'Rejected',
    classes: 'bg-red-600/20 text-red-400 border-red-600/30',
  },
  PAUSED: {
    label: 'Paused',
    classes: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  },
  DISABLED: {
    label: 'Disabled',
    classes: 'bg-red-900/30 text-red-500 border-red-900/40',
  },
  IN_APPEAL: {
    label: 'In Appeal',
    classes: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  },
  PENDING_DELETION: {
    label: 'Pending Deletion',
    classes: 'bg-slate-700/30 text-slate-500 border-slate-700/40',
  },
};

/**
 * Resolve a (possibly unknown / legacy / mis-cased) status value to a display
 * config that is guaranteed to exist. The DB column is supposed to hold Meta's
 * raw enum, but legacy rows (pre-migration 014 TitleCase like 'Approved'),
 * Meta status aliases (PENDING_REVIEW), or a brand-new status Meta adds can all
 * leak through — so callers must never index the map directly and assume a hit.
 */
export function resolveTemplateStatus(
  status: string | null | undefined,
): TemplateStatusDisplay {
  if (!status) return templateStatusConfig.DRAFT;
  const upper = status.toUpperCase();
  if (upper === 'PENDING_REVIEW') return templateStatusConfig.PENDING;
  return (
    templateStatusConfig[upper as MessageTemplateStatus] ?? {
      label: status,
      classes: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
    }
  );
}
