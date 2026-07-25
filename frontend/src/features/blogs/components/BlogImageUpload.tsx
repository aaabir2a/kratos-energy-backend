import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiErrorMessage } from '@/lib/api/client';

interface BlogImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  className?: string;
}

export default function BlogImageUpload({ value, onChange, className = '' }: BlogImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      toast.error('Only JPEG, PNG, GIF or WebP images are accepted');
      return;
    }

    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await api.post<{ success: true; data: { url: string } }>(
        '/blogs/upload-image',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const url = res.data.data.url;
      onChange(url);
      toast.success('Image uploaded successfully');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="file"
        ref={fileRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif"
      />
      {value ? (
        <div className="relative group border rounded-md overflow-hidden aspect-video max-w-sm bg-muted/20">
          <img src={value} alt="Blog image" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="bg-white text-gray-800 px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-100 flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              Change Image
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="border border-dashed rounded-md w-full max-w-sm aspect-video flex flex-col items-center justify-center gap-2 hover:bg-muted/10 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : (
            <ImagePlus className="w-6 h-6 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {loading ? 'Uploading...' : 'Upload cover or inline image'}
          </span>
        </button>
      )}
    </div>
  );
}
