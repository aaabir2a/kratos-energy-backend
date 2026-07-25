import { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface AccordionItem {
  title: string;
  content: string;
}

interface AccordionBlockProps {
  content?: {
    items?: AccordionItem[];
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function AccordionBlock({ content = {}, isEditor = false, onUpdate }: AccordionBlockProps) {
  const items = content.items || [{ title: 'FAQ Item Title', content: 'FAQ item content...' }];
  const [openIndexes, setOpenIndexes] = useState<number[]>([]);

  const handleUpdateItem = (index: number, key: keyof AccordionItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [key]: value };
    onUpdate?.({ ...content, items: updated }, {});
  };

  const handleAddItem = () => {
    onUpdate?.({ ...content, items: [...items, { title: 'New FAQ Title', content: 'New FAQ content...' }] }, {});
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onUpdate?.({ ...content, items: updated }, {});
  };

  const toggleAccordion = (index: number) => {
    setOpenIndexes((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  if (!isEditor) {
    return (
      <div className="my-6 border border-ash-200 rounded-lg overflow-hidden divide-y divide-ash-200 bg-white">
        {items.map((item, idx) => {
          const isOpen = openIndexes.includes(idx);
          return (
            <div key={idx} className="group">
              <button
                onClick={() => toggleAccordion(idx)}
                className="w-full flex items-center justify-between p-4 font-display font-bold text-navy-800 hover:text-forest-700 text-left transition-colors text-[16px]"
              >
                <span>{item.title}</span>
                <ChevronDown className={`w-4 h-4 text-ash-400 group-hover:text-forest-700 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="p-4 pt-0 font-body text-ash-700 text-[14.5px] leading-relaxed border-t border-ash-50 bg-paper">
                  {item.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/5">
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="border p-3 rounded-md bg-white space-y-2.5 relative">
            <div className="flex justify-between items-center pr-8">
              <span className="text-xs font-semibold text-muted-foreground">FAQ Item #{idx + 1}</span>
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
            <div className="space-y-1">
              <Input
                value={item.title}
                onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                placeholder="Question..."
                className="text-xs font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Textarea
                value={item.content}
                onChange={(e) => handleUpdateItem(idx, 'content', e.target.value)}
                placeholder="Answer..."
                className="text-xs min-h-[60px]"
              />
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
        Add FAQ Item
      </Button>
    </div>
  );
}
