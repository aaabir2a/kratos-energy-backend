import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeadPriority, LeadStatus } from '@/lib/api/types';

const STATUS_VARIANT: Record<LeadStatus, 'default' | 'success' | 'destructive' | 'secondary'> = {
  OPEN: 'default',
  CONVERTED: 'success',
  LOST: 'destructive',
  JUNK: 'secondary',
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

const PRIORITY: Record<LeadPriority, { label: string; cls: string }> = {
  HIGH: { label: 'High', cls: 'text-red-600 dark:text-red-400' },
  MEDIUM: { label: 'Medium', cls: 'text-amber-600 dark:text-amber-400' },
  LOW: { label: 'Low', cls: 'text-muted-foreground' },
};

export function PriorityDot({ priority }: { priority: LeadPriority }) {
  const p = PRIORITY[priority];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', p.cls)}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {p.label}
    </span>
  );
}

export function StageBadge({ stage }: { stage: { name: string; color: string | null } | null }) {
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  const color = stage.color ?? '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {stage.name}
    </span>
  );
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}` : 'Unassigned';
}
