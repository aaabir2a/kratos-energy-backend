import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { catalogApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// Single square catalog image. Uploads to MinIO (cropped 400×400 WebP) and
// returns the public URL via onChange. Used for both products and packages.
export function ImageUploader({
  value,
  onChange,
  disabled,
  className,
}: {
  value?: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Use a JPEG, PNG or WebP image');
      return;
    }
    setUploading(true);
    try {
      const { url } = await catalogApi.uploadImage(file);
      onChange(url);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <ImagePlus className="h-3.5 w-3.5" /> {value ? 'Replace' : 'Upload'}
          </button>
          {value && !disabled && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Square image, 400×400px recommended. JPEG/PNG/WebP.</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
