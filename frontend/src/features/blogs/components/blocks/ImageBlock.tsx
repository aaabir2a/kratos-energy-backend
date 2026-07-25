import BlogImageUpload from '../BlogImageUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ImageBlockProps {
  content?: {
    imageUrl?: string;
    alt?: string;
    caption?: string;
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function ImageBlock({ content = {}, isEditor = false, onUpdate }: ImageBlockProps) {
  const { imageUrl = '', alt = '', caption = '' } = content;

  const handleChange = (key: string, value: string) => {
    onUpdate?.({ ...content, [key]: value }, {});
  };

  if (!isEditor) {
    if (!imageUrl) return null;
    return (
      <figure className="my-6 text-center">
        <img src={imageUrl} alt={alt || caption} className="mx-auto rounded-lg max-h-[500px] object-contain shadow-sm" />
        {caption && <figcaption className="mt-2 text-xs text-muted-foreground italic font-body">{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <div className="space-y-4 p-4 border border-dashed rounded-md bg-muted/5">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Image File</Label>
        <BlogImageUpload value={imageUrl} onChange={(url) => handleChange('imageUrl', url)} />
      </div>
      {imageUrl && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Alt Text (SEO)</Label>
            <Input
              value={alt}
              onChange={(e) => handleChange('alt', e.target.value)}
              placeholder="Describe the image..."
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Caption</Label>
            <Input
              value={caption}
              onChange={(e) => handleChange('caption', e.target.value)}
              placeholder="Image caption display..."
              className="text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
