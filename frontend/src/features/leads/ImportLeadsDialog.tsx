import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2, CopyX, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { leadsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import type { ImportReport } from '@/lib/api/types';

export function ImportLeadsDialog() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  const spec = useQuery({ queryKey: ['lead-import-spec'], queryFn: () => leadsApi.importSpec(), enabled: open });

  if (!can('leads.write')) return null;

  function reset() {
    setFile(null);
    setReport(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error('Choose a .csv file');
      return;
    }
    setFile(f);
    setBusy(true);
    try {
      setReport(await leadsApi.importValidate(f));
    } catch (e) {
      toast.error(apiErrorMessage(e));
      reset();
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    try {
      const res = await leadsApi.importCommit(file);
      toast.success(`Imported ${res.imported} lead${res.imported === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{report ? 'Check your file' : 'Import leads from CSV'}</DialogTitle>
        </DialogHeader>

        {/* ── Step 1: the expected format ── */}
        {!report && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Your file needs a header row using these column names. Extra columns are ignored.
              </p>
              <Button variant="outline" size="sm" onClick={() => leadsApi.importTemplate()}>
                <Download className="h-3.5 w-3.5" /> Download template
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Example</TableHead>
                    <TableHead>Rules</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spec.data?.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {c.header}
                        {c.required && <span className="ml-1 text-destructive">*</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{c.example || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.rules || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
              <span className="text-sm font-medium">{busy ? 'Checking your file…' : 'Choose a CSV file'}</span>
              <span className="text-xs">We'll check it before anything is imported.</span>
            </button>
          </div>
        )}

        {/* ── Step 2: validation report ── */}
        {report && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> {report.readyCount}
                </p>
                <p className="text-xs text-muted-foreground">ready to import</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-lg font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {report.issues.length}
                </p>
                <p className="text-xs text-muted-foreground">problems to fix</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-lg font-semibold text-amber-600 dark:text-amber-400">
                  <CopyX className="h-4 w-4" /> {report.duplicates.length}
                </p>
                <p className="text-xs text-muted-foreground">duplicates (skipped)</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {file?.name} · {report.totalRows} data row{report.totalRows === 1 ? '' : 's'}
              {report.unknownHeaders.length > 0 && ` · ignoring unknown column(s): ${report.unknownHeaders.join(', ')}`}
            </p>

            {report.issues.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-destructive">Fix these, then upload again</p>
                <div className="max-h-56 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-36">Column</TableHead>
                        <TableHead className="w-32">Value</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.issues.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{it.row}</TableCell>
                          <TableCell className="text-xs font-medium">{it.column}</TableCell>
                          <TableCell className="max-w-[8rem] truncate text-xs text-muted-foreground" title={it.value}>
                            {it.value || '—'}
                          </TableCell>
                          <TableCell className="text-xs">{it.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Row numbers match your spreadsheet (row 1 is the header).</p>
              </div>
            )}

            {report.duplicates.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                  Already in the CRM — these rows will be skipped
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead>Identifier</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.duplicates.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{d.row}</TableCell>
                          <TableCell className="text-xs">{d.identifier}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {report.readyCount === 0 && (
              <Badge variant="secondary" className="w-full justify-center py-2">
                Nothing to import yet — fix the problems above and upload again.
              </Badge>
            )}
          </div>
        )}

        <DialogFooter className="items-center justify-between sm:justify-between">
          {report ? (
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              <ArrowLeft className="h-4 w-4" /> Choose another file
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={commit} disabled={busy || !report || report.readyCount === 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {report?.readyCount ? `${report.readyCount} lead${report.readyCount === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </DialogContent>
    </Dialog>
  );
}
