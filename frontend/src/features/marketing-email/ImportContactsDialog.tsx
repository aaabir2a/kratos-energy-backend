import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/lib/api/client';
import { importApi, type ColumnRole, type ImportPreview, type ImportResult } from './api/marketingApi';

/**
 * Two-step import: read the file and confirm what each column is, then import.
 *
 * The mapping step exists because a CSV exported from anywhere else will not
 * use our column names, and silently guessing wrong turns a company name into
 * a first name across a whole list.
 */
export function ImportContactsDialog({
  listId,
  open,
  onOpenChange,
}: {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, ColumnRole>>({});
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const readFile = useMutation({
    mutationFn: (f: File) => importApi.preview(f),
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.suggested as Record<string, ColumnRole>);
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      reset();
    },
  });

  const run = useMutation({
    mutationFn: () => importApi.run(file!, listId, mapping),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['marketing'] });
      toast.success(`${r.imported} added, ${r.updated} updated`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const emailColumns = Object.values(mapping).filter((role) => role === 'email').length;
  const canImport = Boolean(file) && emailColumns === 1;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            A CSV with one row per person. Existing contacts are updated rather than duplicated.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <CheckCircle2 className="h-6 w-6 shrink-0 text-[#6abf2e]" />
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{result.imported}</span> added,{' '}
                <span className="font-semibold tabular-nums">{result.updated}</span> updated.
              </p>
            </div>

            {(result.skipped.invalidEmail > 0 ||
              result.skipped.duplicateInFile > 0 ||
              result.skipped.suppressed > 0) && (
              <div className="space-y-2 rounded-lg bg-amber-500/10 p-4 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">Worth knowing</p>
                <ul className="space-y-1 text-muted-foreground">
                  {result.skipped.invalidEmail > 0 && (
                    <li>{result.skipped.invalidEmail} row(s) had an address that is not valid — not imported.</li>
                  )}
                  {result.skipped.duplicateInFile > 0 && (
                    <li>{result.skipped.duplicateInFile} row(s) repeated an address already in the file.</li>
                  )}
                  {result.skipped.suppressed > 0 && (
                    <li>
                      {result.skipped.suppressed} imported contact(s) have unsubscribed previously. They are on
                      the list but will not be emailed.
                    </li>
                  )}
                </ul>
              </div>
            )}

            {result.rejectedExamples.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    {result.rejectedExamples.map((r) => (
                      <tr key={`${r.row}-${r.value}`} className="border-b last:border-0">
                        <td className="w-16 px-3 py-1.5 text-xs text-muted-foreground">Row {r.row}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.value}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFile(f);
                  readFile.mutate(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={readFile.isPending}>
                {readFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {file ? file.name : 'Choose a CSV file'}
              </Button>
            </div>

            {preview && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} — check the columns
                  </p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-3">
                    {preview.headers.map((header) => (
                      <div key={header} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {header}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {preview.sampleRows[0]?.[header] || '—'}
                          </span>
                        </span>
                        <Select
                          value={mapping[header] ?? 'ignore'}
                          className="w-auto min-w-[130px]"
                          onChange={(e) =>
                            setMapping((prev) => ({ ...prev, [header]: e.target.value as ColumnRole }))
                          }
                        >
                          <option value="email">Email</option>
                          <option value="firstName">First name</option>
                          <option value="lastName">Last name</option>
                          <option value="custom">Keep as a field</option>
                          <option value="ignore">Ignore</option>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {emailColumns !== 1 && (
                  <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {emailColumns === 0
                      ? 'Mark exactly one column as Email.'
                      : 'Only one column can be the Email.'}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Anyone who has unsubscribed will be imported but kept out of every send.{' '}
                  <Badge variant="secondary" className="text-[10px]">
                    always
                  </Badge>
                </p>
              </>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button disabled={!canImport || run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import {preview ? `${preview.totalRows} rows` : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
