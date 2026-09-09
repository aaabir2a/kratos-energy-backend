import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { listsApi } from './api/marketingApi';

export function ContactListsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('marketing_email.write');

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const lists = useQuery({
    queryKey: ['marketing', 'lists', search],
    queryFn: () => listsApi.list({ limit: 100, ...(search ? { search } : {}) }),
  });

  const create = useMutation({
    mutationFn: () => listsApi.create({ name, description: description || undefined }),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['marketing', 'lists'] });
      setOpen(false);
      setName('');
      setDescription('');
      navigate(`/email/contacts/${list.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = lists.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Contact lists"
        description="Audiences for email marketing. Separate from CRM leads — but an unsubscribe covers both."
        action={
          canWrite ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New list
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New contact list</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="list-name">Name</Label>
                    <Input
                      id="list-name"
                      value={name}
                      placeholder="Newsletter subscribers"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="list-desc">Description</Label>
                    <Input
                      id="list-desc"
                      value={description}
                      placeholder="Optional"
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                    {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <div className="relative mb-4 w-full sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search lists…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {lists.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No lists match.' : 'No contact lists yet.'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A list is a group of people you can send a campaign to — imported from a CSV or added by hand.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => navigate(`/email/contacts/${list.id}`)}
            >
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{list.name}</p>
                  {list.description && (
                    <p className="truncate text-xs text-muted-foreground">{list.description}</p>
                  )}
                </div>
                <div className="mt-auto flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">{list._count.members}</span>
                  <span className="text-xs text-muted-foreground">
                    contact{list._count.members === 1 ? '' : 's'} · {formatDate(list.updatedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
