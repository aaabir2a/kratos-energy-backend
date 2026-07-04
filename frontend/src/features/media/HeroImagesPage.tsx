import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2, Monitor, Smartphone, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { api, apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { ImageEditor, type EditorJob, type EditorSpec } from './ImageEditor';

type Variant = 'DESKTOP' | 'MOBILE';

interface HeroImage {
  id: string;
  variant: Variant;
  url: string;
  originalUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

const SPECS: Record<Variant, EditorSpec & { title: string; hint: string; icon: React.ElementType }> = {
  DESKTOP: {
    aspect: 16 / 9,
    minW: 2400,
    minH: 1350,
    label: 'Desktop 16:9',
    targetText: '2560 × 1440 px',
    title: 'Desktop view',
    hint: 'Landscape 16:9 — 2560 × 1440 px recommended (2400 × 1350 minimum)',
    icon: Monitor,
  },
  MOBILE: {
    aspect: 3 / 4,
    minW: 1080,
    minH: 1440,
    label: 'Mobile 3:4',
    targetText: '1200 × 1600 px',
    title: 'Mobile view',
    hint: 'Portrait 3:4 — 1200 × 1600 px recommended (1080 × 1440 minimum)',
    icon: Smartphone,
  },
};

function readDims(file: File): Promise<EditorJob> {
  return new Promise((res, rej) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ src, fileName: file.name, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = rej;
    img.src = src;
  });
}

function UploadPanel({ variant }: { variant: Variant }) {
  const spec = SPECS[variant];
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('landing_pages.write');
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<EditorJob[]>([]); // mismatched files → editor, one at a time

  const images = useQuery({
    queryKey: ['hero-images'],
    queryFn: () => api.get<{ success: true; data: HeroImage[] }>('/media/hero').then((r) => r.data.data),
  });
  const mine = (images.data ?? []).filter((i) => i.variant === variant);

  const upload = useMutation({
    mutationFn: async ({ blob, name }: { blob: Blob; name: string }) => {
      const fd = new FormData();
      fd.append('variant', variant);
      fd.append('file', blob, name);
      return api.post('/media/hero', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast.success(`${spec.title} image uploaded`);
      qc.invalidateQueries({ queryKey: ['hero-images'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/media/hero/${id}`),
    onSuccess: () => {
      toast.success('Image deleted');
      qc.invalidateQueries({ queryKey: ['hero-images'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const needEditing: EditorJob[] = [];
      for (const file of Array.from(files)) {
        try {
          const job = await readDims(file);
          const aspectOk = Math.abs(job.width / job.height - spec.aspect) / spec.aspect <= 0.02;
          const sizeOk = job.width >= spec.minW && job.height >= spec.minH;
          if (aspectOk && sizeOk) {
            upload.mutate({ blob: file, name: file.name });
            URL.revokeObjectURL(job.src);
          } else {
            needEditing.push(job); // wrong shape or too small → built-in editor
          }
        } catch {
          toast.error(`${file.name}: could not read image`);
        }
      }
      if (needEditing.length) {
        setQueue((q) => [...q, ...needEditing]);
        toast.info(
          needEditing.length === 1
            ? `${needEditing[0].fileName} needs fitting to ${spec.label} — opening the editor`
            : `${needEditing.length} images need fitting to ${spec.label} — opening the editor`,
        );
      }
    },
    [spec, upload],
  );

  function advanceQueue() {
    setQueue((q) => {
      if (q[0]) URL.revokeObjectURL(q[0].src);
      return q.slice(1);
    });
  }

  const Icon = spec.icon;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {spec.title}
          <Badge variant="secondary">{mine.length}</Badge>
        </CardTitle>
        <CardDescription>{spec.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canWrite && (
          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFiles(e.dataTransfer.files);
            }}
          >
            {upload.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">Drop images here or click to browse</p>
            <p className="text-xs text-muted-foreground">
              JPEG / PNG / WebP · multiple files · wrong shapes open the built-in editor
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {images.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !mine.length ? (
          <p className="text-center text-sm text-muted-foreground">No {spec.title.toLowerCase()} images yet.</p>
        ) : (
          <div className={variant === 'DESKTOP' ? 'grid gap-3 sm:grid-cols-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3'}>
            {mine.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-lg border">
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  className="w-full object-cover"
                  style={{ aspectRatio: variant === 'DESKTOP' ? '16/9' : '3/4' }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-[10px] font-medium text-white">
                    {img.width}×{img.height} · {Math.round(img.sizeBytes / 1024)}KB webp
                  </span>
                  <div className="flex gap-1">
                    <button
                      className="rounded bg-white/20 p-1 text-white hover:bg-white/40"
                      title="Copy URL"
                      onClick={() => {
                        navigator.clipboard.writeText(img.url);
                        toast.success('URL copied');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        className="rounded bg-white/20 p-1 text-white hover:bg-red-500"
                        title="Delete"
                        onClick={() => remove.mutate(img.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ImageEditor
        job={queue[0] ?? null}
        spec={spec}
        queueLeft={Math.max(0, queue.length - 1)}
        busy={upload.isPending}
        onConfirm={(blob, name) => {
          upload.mutate({ blob, name });
          advanceQueue();
        }}
        onCancel={advanceQueue}
      />
    </Card>
  );
}

export function HeroImagesPage() {
  return (
    <div>
      <PageHeader
        title="Image Uploads — Hero Section"
        description="Hero images for the main website. GET /api/v1/public/hero-images returns { desktop: [...], mobile: [...] } — originals kept untouched, optimized WebP served for speed."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <UploadPanel variant="DESKTOP" />
        <UploadPanel variant="MOBILE" />
      </div>
    </div>
  );
}
