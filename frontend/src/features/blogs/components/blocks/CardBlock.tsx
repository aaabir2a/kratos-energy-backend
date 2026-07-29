import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import BlogImageUpload from '../BlogImageUpload';

interface CardItem {
  title: string;
  description: string;
  imageUrl: string;
  link: string;
}

interface CardBlockProps {
  content?: {
    items?: CardItem[];
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function CardBlock({ content = {}, isEditor = false, onUpdate }: CardBlockProps) {
  const items = content.items || [{ title: 'Card Title', description: 'Card description...', imageUrl: '', link: '' }];

  const handleUpdateItem = (index: number, key: keyof CardItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [key]: value };
    onUpdate?.({ ...content, items: updated }, {});
  };

  const handleAddItem = () => {
    onUpdate?.({ ...content, items: [...items, { title: 'New Card', description: 'Description...', imageUrl: '', link: '' }] }, {});
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onUpdate?.({ ...content, items: updated }, {});
  };

  if (!isEditor) {
    return (
      <div className="my-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col hover:shadow-md hover:border-[#8bc34a]/40 transition-all group"
          >
            {item.imageUrl && (
              <div className="h-48 relative bg-gray-50 overflow-hidden">
                <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            )}
            <div className="p-6 flex-1 flex flex-col">
              <h4 className="font-display font-bold text-gray-900 text-[17px] mb-2 leading-snug group-hover:text-[#8bc34a] transition-colors">{item.title}</h4>
              <p className="font-body text-gray-600 text-[14px] leading-relaxed flex-1">{item.description}</p>
              {item.link && (
                <a
                  href={item.link}
                  className="mt-4 inline-flex items-center gap-1.5 font-display text-[14px] font-bold text-[#8bc34a] hover:underline"
                >
                  Learn more →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/5">
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="border p-3 rounded-md bg-white space-y-3 relative">
            <div className="flex justify-between items-center pr-8">
              <span className="text-xs font-semibold text-muted-foreground">Card #{idx + 1}</span>
              {items.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveItem(idx)}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 absolute top-2 right-2"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <Input
                    value={item.title}
                    onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                    placeholder="Card title..."
                    className="text-xs font-semibold"
                  />
                </div>
                <div>
                  <Textarea
                    value={item.description}
                    onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                    placeholder="Card description..."
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div>
                  <Input
                    value={item.link}
                    onChange={(e) => handleUpdateItem(idx, 'link', e.target.value)}
                    placeholder="Card action URL..."
                    className="text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground block mb-1">Image</span>
                <BlogImageUpload value={item.imageUrl} onChange={(url) => handleUpdateItem(idx, 'imageUrl', url)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddItem}
        className="w-full text-xs font-semibold flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Card
      </Button>
    </div>
  );
}
