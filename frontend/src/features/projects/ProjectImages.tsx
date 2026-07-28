import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { projectsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';

// Multi-image picker for a project. Uploads each file to MinIO and keeps an
// ordered list of public URLs — order here is the order the website receives.
export function ProjectImages({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).filter((f) => {
      if (/^image\/(jpeg|png|webp)$/.test(f.type)) return true;
      toast.error(`${f.name}: use a JPEG, PNG or WebP image`);
      return false;
    });
    if (!picked.length) return;

    setUploading(picked.length);
    const uploaded: string[] = [];
    for (const file of picked) {
      try {
        const { url } = await projectsApi.uploadImage(file);
        uploaded.push(url);
      } catch (e) {
        toast.error(`${file.name}: ${apiErrorMessage(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="group relative h-24 w-24 overflow-hidden rounded-lg border">
            <img src={url} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                Cover
              </span>
            )}
            {!disabled && (
              <>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-background/85 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="px-1 text-xs disabled:opacity-30" aria-label="Move left">
                    ←
                  </button>
                  <GripVertical className="h-3 w-3 self-center text-muted-foreground" />
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} className="px-1 text-xs disabled:opacity-30" aria-label="Move right">
                    →
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {uploading > 0 ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[10px]">{uploading} left</span>
              </>
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px]">Add photos</span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {value.length ? `${value.length} image${value.length > 1 ? 's' : ''} — first one is the cover.` : 'No images yet.'}{' '}
        Select multiple at once. Max 1600px wide, saved as WebP.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
