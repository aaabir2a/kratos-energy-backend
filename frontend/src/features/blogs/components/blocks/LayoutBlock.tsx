import { Label } from '@/components/ui/label';
import BlogImageUpload from '../BlogImageUpload';
import { Textarea } from '@/components/ui/textarea';

interface LayoutBlockProps {
  content?: {
    columns?: number; // 2 or 3
    col1Type?: 'text' | 'image';
    col1Text?: string;
    col1Image?: string;
    col2Type?: 'text' | 'image';
    col2Text?: string;
    col2Image?: string;
    col3Type?: 'text' | 'image';
    col3Text?: string;
    col3Image?: string;
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function LayoutBlock({ content = {}, isEditor = false, onUpdate }: LayoutBlockProps) {
  const {
    columns = 2,
    col1Type = 'text',
    col1Text = '',
    col1Image = '',
    col2Type = 'text',
    col2Text = '',
    col2Image = '',
    col3Type = 'text',
    col3Text = '',
    col3Image = '',
  } = content;

  const handleChange = (key: string, value: any) => {
    onUpdate?.({ ...content, [key]: value }, {});
  };

  const renderColumnPreview = (type: 'text' | 'image', text: string, img: string) => {
    if (type === 'image') {
      return img ? (
        <img src={img} alt="Column image" className="w-full rounded-md object-cover max-h-[300px]" />
      ) : (
        <div className="border border-dashed aspect-video flex items-center justify-center text-xs text-muted-foreground bg-muted/10 rounded-md">
          No image uploaded
        </div>
      );
    }
    return (
      <div 
        className="prose max-w-none text-sm text-ash-700 font-body leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: text || 'Empty column text' }}
      />
    );
  };

  if (!isEditor) {
    const gridCols = columns === 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
    return (
      <div className={`my-6 grid gap-6 ${gridCols}`}>
        <div className="flex flex-col">{renderColumnPreview(col1Type, col1Text, col1Image)}</div>
        <div className="flex flex-col">{renderColumnPreview(col2Type, col2Text, col2Image)}</div>
        {columns === 3 && (
          <div className="flex flex-col">{renderColumnPreview(col3Type, col3Text, col3Image)}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/5">
      <div className="flex gap-4 items-center mb-2">
        <Label className="text-xs font-semibold">Columns Layout</Label>
        <select
          value={columns}
          onChange={(e) => handleChange('columns', parseInt(e.target.value))}
          className="border rounded px-2 py-1 text-xs bg-white"
        >
          <option value={2}>2 Columns</option>
          <option value={3}>3 Columns</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1 */}
        <div className="border p-3 rounded-md bg-white space-y-3">
          <div className="flex justify-between items-center border-b pb-1.5">
            <span className="text-xs font-bold text-navy-800">Column 1</span>
            <select
              value={col1Type}
              onChange={(e) => handleChange('col1Type', e.target.value)}
              className="border rounded text-[11px] px-1 bg-white"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </div>
          {col1Type === 'text' ? (
            <Textarea
              value={col1Text}
              onChange={(e) => handleChange('col1Text', e.target.value)}
              placeholder="Column content (HTML supported)..."
              className="text-xs min-h-[100px]"
            />
          ) : (
            <BlogImageUpload value={col1Image} onChange={(url) => handleChange('col1Image', url)} />
          )}
        </div>

        {/* Column 2 */}
        <div className="border p-3 rounded-md bg-white space-y-3">
          <div className="flex justify-between items-center border-b pb-1.5">
            <span className="text-xs font-bold text-navy-800">Column 2</span>
            <select
              value={col2Type}
              onChange={(e) => handleChange('col2Type', e.target.value)}
              className="border rounded text-[11px] px-1 bg-white"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </div>
          {col2Type === 'text' ? (
            <Textarea
              value={col2Text}
              onChange={(e) => handleChange('col2Text', e.target.value)}
              placeholder="Column content (HTML supported)..."
              className="text-xs min-h-[100px]"
            />
          ) : (
            <BlogImageUpload value={col2Image} onChange={(url) => handleChange('col2Image', url)} />
          )}
        </div>

        {/* Column 3 (conditional) */}
        {columns === 3 && (
          <div className="border p-3 rounded-md bg-white space-y-3">
            <div className="flex justify-between items-center border-b pb-1.5">
              <span className="text-xs font-bold text-navy-800">Column 3</span>
              <select
                value={col3Type}
                onChange={(e) => handleChange('col3Type', e.target.value)}
                className="border rounded text-[11px] px-1 bg-white"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
              </select>
            </div>
            {col3Type === 'text' ? (
              <Textarea
                value={col3Text}
                onChange={(e) => handleChange('col3Text', e.target.value)}
                placeholder="Column content (HTML supported)..."
                className="text-xs min-h-[100px]"
              />
            ) : (
              <BlogImageUpload value={col3Image} onChange={(url) => handleChange('col3Image', url)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
