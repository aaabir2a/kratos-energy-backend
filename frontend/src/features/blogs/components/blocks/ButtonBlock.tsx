import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ButtonBlockProps {
  content?: {
    text?: string;
    url?: string;
    alignment?: 'left' | 'center' | 'right';
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function ButtonBlock({ content = {}, isEditor = false, onUpdate }: ButtonBlockProps) {
  const { text = 'Click Here', url = '', alignment = 'left' } = content;

  const handleChange = (key: string, value: string) => {
    onUpdate?.({ ...content, [key]: value }, {});
  };

  if (!isEditor) {
    const alignClass =
      alignment === 'center'
        ? 'text-center'
        : alignment === 'right'
        ? 'text-right'
        : 'text-left';

    return (
      <div className={`my-6 ${alignClass}`}>
        <a
          href={url || '#'}
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors shadow-sm"
        >
          {text}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Button Text</Label>
          <Input
            value={text}
            onChange={(e) => handleChange('text', e.target.value)}
            placeholder="Click here..."
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Action URL</Label>
          <Input
            value={url}
            onChange={(e) => handleChange('url', e.target.value)}
            placeholder="https://..."
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Alignment</Label>
          <select
            value={alignment}
            onChange={(e) => handleChange('alignment', e.target.value)}
            className="w-full border rounded-md px-3 py-1.5 text-xs bg-white"
          >
            <option value="left">Left Align</option>
            <option value="center">Center Align</option>
            <option value="right">Right Align</option>
          </select>
        </div>
      </div>
    </div>
  );
}
