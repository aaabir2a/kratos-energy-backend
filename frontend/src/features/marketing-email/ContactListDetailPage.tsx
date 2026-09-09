import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, Search, MailX, Trash2, Users, ShieldAlert, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { listsApi, contactsApi } from './api/marketingApi';
import { ImportContactsDialog } from './ImportContactsDialog';

export function ContactListDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('marketing_email.write');

  const [search, setSearch] = useState('');
  const [suppressedOnly, setSuppressedOnly] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const list = useQuery({ queryKey: ['marketing', 'lists', id], queryFn: () => listsApi.get(id) });
  const health = useQuery({ queryKey: ['marketing', 'lists', id, 'health'], queryFn: () => listsApi.health(id) });
  const contacts = useQuery({
    queryKey: ['marketing', 'contacts', id, { search, suppressedOnly }],
    queryFn: () =>
      contactsApi.list({
        listId: id,
        limit: 100,
        ...(search ? { search } : {}),
        ...(suppressedOnly ? { suppressedOnly: 'true' as const } : {}),
      }),
  });

  const removeFromList = useMutation({
    mutationFn: (contactId: string) => listsApi.removeContacts(id, [contactId]),
    onSuccess: () => {
      toast.success('Removed from this list');
      qc.invalidateQueries({ queryKey: ['marketing'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (list.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!list.data) return <p className="text-sm text-muted-foreground">List not found.</p>;

  const rows = contacts.data?.data ?? [];
  const customColumns = list.data.customColumns.slice(0, 3);

  return (
    <div>
      <PageHeader
        title={list.data.name}
        description={list.data.description ?? 'Contact list'}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/email/contacts')}>
              <ArrowLeft className="h-4 w-4" /> All lists
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">On this list</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{health.data?.total ?? '—'}</p>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Can be emailed</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[#4a8c1e] dark:text-[#8ed24f]">
                {health.data?.sendable ?? '—'}
              </p>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Unsubscribed</p>
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold tabular-nums',
                  (health.data?.suppressed ?? 0) > 0 && 'text-amber-600 dark:text-amber-400',
                )}
              >
                {health.data?.suppressed ?? '—'}
              </p>
            </div>
            <MailX className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search this list…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={suppressedOnly}
            onChange={(e) => setSuppressedOnly(e.target.checked)}
          />
          Unsubscribed only
        </label>
      </div>

      <Card className="mt-4">
        {contacts.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search || suppressedOnly ? 'Nobody matches.' : 'This list is empty.'}
            </p>
            {canWrite && !search && !suppressedOnly && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import a CSV
              </Button>
            )}
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                {customColumns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  {customColumns.map((c) => (
                    <TableCell key={c} className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {contact.customData?.[c] ?? '—'}
                    </TableCell>
                  ))}
                  <TableCell>
                    {contact.suppressed ? (
                      <Badge variant="warning" className="text-[10px]">
                        <ShieldAlert className="mr-1 h-3 w-3" /> Unsubscribed
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-[10px]">
                        Sendable
                      </Badge>
                    )}
                    {contact.leadId && (
                      <button
                        type="button"
                        title="This address is also a lead"
                        className="ml-2 text-muted-foreground hover:text-primary"
                        onClick={() => navigate(`/leads/${contact.leadId}`)}
                      >
                        <Link2 className="inline h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Remove from this list"
                        onClick={() => removeFromList.mutate(contact.id)}
                        disabled={removeFromList.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ImportContactsDialog listId={id} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
