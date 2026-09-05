import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Clock, Gauge, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { messagingApi, type SendingWindow } from './api/messagingApi';
import { hourLabel } from './messagingHelpers';

// Australian offices only for now; the list matches what offices.timezone holds.
const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function MessagingSettingsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('settings.write');

  const settings = useQuery({ queryKey: ['messaging', 'settings'], queryFn: () => messagingApi.getSettings() });

  const [window, setWindow] = useState<SendingWindow | null>(null);
  const [throttle, setThrottle] = useState<number>(200);

  useEffect(() => {
    if (settings.data) {
      setWindow(settings.data.sendingWindow);
      setThrottle(settings.data.throttlePerHour);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof messagingApi.updateSettings>[0]) => messagingApi.updateSettings(body),
    onSuccess: () => {
      toast.success('Sending rules saved');
      qc.invalidateQueries({ queryKey: ['messaging'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (settings.isLoading || !window) return <Skeleton className="h-96 w-full rounded-xl" />;

  const paused = settings.data?.sendingPaused ?? false;
  const windowInvalid = window.quietEndHour >= window.quietStartHour;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Sending rules"
        description="When messages are allowed to go out, how fast, and the switch that stops everything."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {paused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} Sending
              <Badge variant={paused ? 'destructive' : 'success'} className="ml-auto">
                {paused ? 'Paused' : 'Active'}
              </Badge>
            </CardTitle>
            <CardDescription>
              Pausing stops the queue from being drained. Nothing is lost — messages keep queueing and go out
              when you resume.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={paused ? 'default' : 'outline'}
              disabled={!canWrite || save.isPending}
              onClick={() => save.mutate({ sendingPaused: !paused })}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? 'Resume sending' : 'Pause all sending'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Quiet hours
            </CardTitle>
            <CardDescription>
              A message that falls due outside these hours waits for the next opening rather than being sent
              or dropped. Times are the office's own — a Perth lead is sent in Perth's morning.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sending opens</Label>
                <Select
                  value={String(window.quietEndHour)}
                  disabled={!canWrite}
                  onChange={(e) => setWindow({ ...window, quietEndHour: Number(e.target.value) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sending closes</Label>
                <Select
                  value={String(window.quietStartHour)}
                  disabled={!canWrite}
                  onChange={(e) => setWindow({ ...window, quietStartHour: Number(e.target.value) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {windowInvalid && (
              <p className="text-sm text-destructive">
                Sending must open before it closes, or nothing would ever go out.
              </p>
            )}

            <div className="space-y-1.5">
              <Label>Default timezone</Label>
              <Select
                value={window.timezone}
                disabled={!canWrite}
                onChange={(e) => setWindow({ ...window, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace('Australia/', '')}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Used when a lead has no office. Leads with an office use that office's timezone.
              </p>
            </div>

            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={window.businessDaysOnly}
                disabled={!canWrite}
                onChange={(e) => setWindow({ ...window, businessDaysOnly: e.target.checked })}
              />
              Weekdays only — a Friday evening message waits for Monday
            </label>

            <Button
              disabled={!canWrite || windowInvalid || save.isPending}
              onClick={() => save.mutate({ sendingWindow: window })}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save quiet hours
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Hourly limit
            </CardTitle>
            <CardDescription>
              The most messages that will be sent in any rolling hour. A large campaign spreads out instead of
              firing at once, which protects the sending domain's reputation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="throttle">Messages per hour</Label>
              <Input
                id="throttle"
                type="number"
                min={1}
                max={10000}
                value={throttle}
                disabled={!canWrite}
                onChange={(e) => setThrottle(Number(e.target.value))}
                className="max-w-[160px]"
              />
            </div>
            <Button
              disabled={!canWrite || throttle < 1 || save.isPending}
              onClick={() => save.mutate({ throttlePerHour: throttle })}
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save limit
            </Button>
          </CardContent>
        </Card>

        {!canWrite && (
          <p className="text-sm text-muted-foreground">
            You can view these rules but not change them. That needs the settings permission.
          </p>
        )}
      </div>
    </div>
  );
}
