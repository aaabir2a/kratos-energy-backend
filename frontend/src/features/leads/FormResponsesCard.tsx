import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FormResponse } from '@/lib/api/types';

/**
 * Everything the visitor answered on the CRM-built form that isn't already a
 * first-class lead column. The backend resolves each stored key back to its
 * schema label and drops the origin markers, so this renders what it's given.
 */
export function FormResponsesCard({
  responses,
  formTitle,
}: {
  responses: FormResponse[];
  formTitle?: string | null;
}) {
  if (!responses.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-muted-foreground" /> Form responses
          {formTitle && (
            <span className="ml-auto max-w-[45%] truncate text-xs font-normal text-muted-foreground" title={formTitle}>
              {formTitle}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {responses.map((r) => (
          <div key={r.field} className="min-w-0">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="break-words text-sm font-medium">{r.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
