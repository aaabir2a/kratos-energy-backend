import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Trash2, Monitor, Smartphone, Copy, Crop as CropIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { api, apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';

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

const SPECS: Record<Variant, { aspect: number; minW: number; minH: number; title: string; hint: string; icon: React.ElementType }> = {
  DESKTOP: {
    aspect: 16 / 9,
    minW: 2400,
    minH: 1350,
    title: 'Desktop view',
    hint: 'Landscape 16:9 — 2560 × 1440 px recommended (2400 × 1350 minimum)',
    icon: Monitor,
  },
  MOBILE: {
    aspect: 3 / 4,
    minW: 1080,
    minH: 1440,
    title: 'Mobile view',
    hint: 'Portrait 3:4 — 1200 × 1600 px recommended (1080 × 1440 minimum)',
    icon: Smartphone,
  },
};

// Crop at the image's NATIVE resolution — no downscaling, quality preserved.
async function cropAtFullResolution(src: string, area: Area): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // 1:1 pixel copy — nothing resampled
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('crop failed'))), 'image/jpeg', 0.97),
  );
}

function readDims(file: File): Promise<{ w: number; h: number; url: string }> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight, url });
    img.onerror = rej;
    img.src = url;
  });
}

function UploadPanel({ variant }: { variant: Variant }) {
  const spec = SPECS[variant];
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('landing_pages.write');
  const fileRef = useRef<HTMLInputElement>(null);

  // Cropper state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('image.jpg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [srcDims, setSrcDims] = useState<{ w: number; h: number } | null>(null);

  const images = useQuery({
    queryKey: ['hero-images'],
    queryFn: () => api.get<{ success: true; data: HeroImage[] }>('/media/hero').then((r) => r.data.data),
  });
  const mine = (images.data ?? []).filter((i) => i.variant === variant);

  const upload = useMutation({
    mutationFn: async (blob: Blob | File) => {
      const fd = new FormData();
      fd.append('variant', variant);
      fd.append('file', blob, blob instanceof File ? blob.name : cropFileName);
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
      for (const file of Array.from(files)) {
        try {
          const { w, h, url } = await readDims(file);
          const aspectOk = Math.abs(w / h - spec.aspect) / spec.aspect <= 0.02;
          if (w < spec.minW || h < spec.minH) {
            // Too small even before cropping — cropping can't add pixels.
            toast.error(`${file.name}: ${w}×${h} is below the ${spec.minW}×${spec.minH} minimum — use a larger image`);
            URL.revokeObjectURL(url);
            continue;
          }
          if (aspectOk) {
            upload.mutate(file);
            URL.revokeObjectURL(url);
          } else {
            // Wrong shape → open the full-resolution cropper.
            setSrcDims({ w, h });
            setCropFileName(file.name.replace(/\.\w+$/, '') + '-cropped.jpg');
            setCropSrc(url);
            setCrop({ x: 0, y: 0 });
            setZoom(1);
          }
        } catch {
          toast.error(`${file.name}: could not read image`);
        }
      }
    },
    [spec, upload],
  );

  async function confirmCrop() {
    if (!cropSrc || !areaPixels) return;
    if (areaPixels.width < spec.minW || areaPixels.height < spec.minH) {
      toast.error(`Crop is ${Math.round(areaPixels.width)}×${Math.round(areaPixels.height)} — below the ${spec.minW}×${spec.minH} minimum. Zoom out to include more of the image.`);
      return;
    }
    const blob = await cropAtFullResolution(cropSrc, areaPixels);
    upload.mutate(blob);
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
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
            {upload.isPending ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
            <p className="text-sm font-medium">Drop images here or click to browse</p>
            <p className="text-xs text-muted-foreground">JPEG / PNG / WebP · multiple files supported · wrong shapes open the cropper</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
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
                <img src={img.url} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: variant === 'DESKTOP' ? '16/9' : '3/4' }} />
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
                      <button className="rounded bg-white/20 p-1 text-white hover:bg-red-500" title="Delete" onClick={() => remove.mutate(img.id)}>
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

      {/* Cropper dialog */}
      <Dialog open={Boolean(cropSrc)} onOpenChange={(o) => !o && cropSrc && (URL.revokeObjectURL(cropSrc), setCropSrc(null))}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CropIcon className="h-4 w-4" /> Crop to {spec.title.toLowerCase()} ({variant === 'DESKTOP' ? '16:9' : '3:4'})
            </DialogTitle>
          </DialogHeader>
          <div className="relative h-[420px] w-full overflow-hidden rounded-lg bg-black">
            {cropSrc && (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={spec.aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_a, px) => setAreaPixels(px)}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-primary" />
            {areaPixels && srcDims && (
              <span className={`text-xs ${areaPixels.width >= spec.minW ? 'text-muted-foreground' : 'text-destructive'}`}>
                {Math.round(areaPixels.width)}×{Math.round(areaPixels.height)} px (min {spec.minW}×{spec.minH})
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Cropping happens at the image's full native resolution — pixels are copied 1:1, nothing is resampled or compressed until export (97% quality JPEG).
          </p>
          <DialogFooter>
            <Button onClick={confirmCrop} disabled={upload.isPending}>
              {upload.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Crop & upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
