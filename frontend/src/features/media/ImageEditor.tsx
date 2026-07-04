import { useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Check,
  Loader2,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Sun,
  Contrast,
  Droplets,
  ZoomIn,
  Ruler,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface EditorSpec {
  aspect: number;
  minW: number;
  minH: number;
  label: string; // "Desktop 16:9"
  targetText: string; // "2560 × 1440 px"
}

export interface EditorJob {
  src: string; // object URL
  fileName: string;
  width: number;
  height: number;
}

interface Adjust {
  brightness: number; // 100 = neutral
  contrast: number;
  saturation: number;
}
const NEUTRAL: Adjust = { brightness: 100, contrast: 100, saturation: 100 };

// Export the edited image at FULL native resolution.
// Geometry (rotation/crop) is applied on a canvas sized to the source pixels —
// nothing is downscaled; adjustments are applied via canvas filters; final
// encode is 97%-quality JPEG.
async function renderEdit(src: string, area: Area, rotation: number, adj: Adjust): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const rad = (rotation * Math.PI) / 180;
  // Bounding box of the rotated image.
  const bW = Math.abs(Math.cos(rad) * img.naturalWidth) + Math.abs(Math.sin(rad) * img.naturalHeight);
  const bH = Math.abs(Math.sin(rad) * img.naturalWidth) + Math.abs(Math.cos(rad) * img.naturalHeight);

  const stage = document.createElement('canvas');
  stage.width = Math.round(bW);
  stage.height = Math.round(bH);
  const sctx = stage.getContext('2d')!;
  sctx.imageSmoothingQuality = 'high';
  sctx.filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`;
  sctx.translate(bW / 2, bH / 2);
  sctx.rotate(rad);
  sctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const out = document.createElement('canvas');
  out.width = Math.round(area.width);
  out.height = Math.round(area.height);
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(stage, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);

  return new Promise((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/jpeg', 0.97),
  );
}

function Slider({
  icon: Icon,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  neutral,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  neutral?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
        </span>
        <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
          {value}
          {unit}
          {neutral !== undefined && value !== neutral && (
            <button className="text-primary hover:underline" onClick={() => onChange(neutral)} title="Reset">
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

export function ImageEditor({
  job,
  spec,
  queueLeft,
  busy,
  onConfirm,
  onCancel,
}: {
  job: EditorJob | null;
  spec: EditorSpec;
  queueLeft: number;
  busy: boolean;
  onConfirm: (blob: Blob, fileName: string) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [straighten, setStraighten] = useState(0); // fine ±10°
  const [adj, setAdj] = useState<Adjust>(NEUTRAL);
  const [area, setArea] = useState<Area | null>(null);
  const [rendering, setRendering] = useState(false);

  // Reset controls whenever a new image enters the editor.
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setStraighten(0);
    setAdj(NEUTRAL);
    setArea(null);
  }, [job?.src]);

  const totalRotation = rotation + straighten;
  const outOk = area ? area.width >= spec.minW && area.height >= spec.minH : false;
  const filterCss = useMemo(
    () => `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`,
    [adj],
  );
  const edited =
    adj.brightness !== 100 || adj.contrast !== 100 || adj.saturation !== 100 || totalRotation !== 0 || zoom !== 1;

  async function confirm() {
    if (!job || !area || !outOk) return;
    setRendering(true);
    try {
      const blob = await renderEdit(job.src, area, totalRotation, adj);
      onConfirm(blob, job.fileName.replace(/\.\w+$/, '') + '-edited.jpg');
    } finally {
      setRendering(false);
    }
  }

  return (
    <Dialog open={Boolean(job)} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        {job && (
          <div className="flex flex-col md:flex-row">
            {/* Workspace */}
            <div className="relative min-h-[300px] flex-1 bg-black md:h-[560px]">
              <div className="absolute left-3 top-3 z-10 rounded-md bg-black/60 px-2.5 py-1 text-[11px] text-white/90">
                {job.fileName} · {job.width}×{job.height}px
              </div>
              <Cropper
                image={job.src}
                crop={crop}
                zoom={zoom}
                rotation={totalRotation}
                aspect={spec.aspect}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_a, px) => setArea(px)}
                style={{ mediaStyle: { filter: filterCss } }}
              />
            </div>

            {/* Controls */}
            <div className="flex w-full flex-col gap-4 border-l bg-card p-5 md:w-[300px]">
              <div>
                <h2 className="text-sm font-semibold">Fit to {spec.label}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  This image doesn't match the required shape. Frame it below — quality is preserved (edited at full
                  resolution).
                </p>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">{spec.targetText}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Minimum</span>
                  <span className="font-medium">
                    {spec.minW} × {spec.minH} px
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t pt-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Ruler className="h-3.5 w-3.5" /> Your crop
                  </span>
                  <span className={cn('font-semibold tabular-nums', outOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                    {area ? `${Math.round(area.width)} × ${Math.round(area.height)} px` : '—'}
                  </span>
                </div>
                {!outOk && area && (
                  <p className="mt-1.5 text-[11px] text-destructive">Zoom out to include more of the image.</p>
                )}
              </div>

              <Slider icon={ZoomIn} label="Zoom" value={Math.round(zoom * 100)} min={100} max={300} unit="%" neutral={100} onChange={(v) => setZoom(v / 100)} />

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">Rotate</span>
                  <span className="tabular-nums text-muted-foreground">{totalRotation}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setRotation((r) => r - 90)} title="Rotate left 90°">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setRotation((r) => r + 90)} title="Rotate right 90°">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <input type="range" min={-10} max={10} step={0.5} value={straighten} onChange={(e) => setStraighten(Number(e.target.value))} className="flex-1 accent-primary" title="Straighten" />
                </div>
              </div>

              <div className="space-y-3 border-t pt-3">
                <Slider icon={Sun} label="Brightness" value={adj.brightness} min={60} max={140} unit="%" neutral={100} onChange={(v) => setAdj({ ...adj, brightness: v })} />
                <Slider icon={Contrast} label="Contrast" value={adj.contrast} min={60} max={140} unit="%" neutral={100} onChange={(v) => setAdj({ ...adj, contrast: v })} />
                <Slider icon={Droplets} label="Saturation" value={adj.saturation} min={0} max={200} unit="%" neutral={100} onChange={(v) => setAdj({ ...adj, saturation: v })} />
              </div>

              <div className="mt-auto space-y-2 border-t pt-3">
                {edited && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setRotation(0);
                      setStraighten(0);
                      setAdj(NEUTRAL);
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset all
                  </Button>
                )}
                <Button className="w-full" disabled={!outOk || rendering || busy} onClick={confirm}>
                  {rendering || busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Save & upload{queueLeft > 0 ? ` (${queueLeft} more waiting)` : ''}
                </Button>
                <Button variant="outline" className="w-full" onClick={onCancel} disabled={rendering || busy}>
                  <X className="h-4 w-4" /> Skip this image
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
