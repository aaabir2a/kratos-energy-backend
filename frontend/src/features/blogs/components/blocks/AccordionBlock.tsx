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
      <div className="my-8 space-y-4">
        {items.map((item, idx) => {
          const isOpen = openIndexes.includes(idx);
          return (
            <div
              key={idx}
              className={`rounded-xl overflow-hidden shadow-sm transition-all duration-200 border ${
                isOpen
                  ? 'border-[#8bc34a] bg-white shadow-md'
                  : 'border-gray-200 bg-white hover:border-[#8bc34a]/60 hover:shadow-md'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleAccordion(idx)}
                className={`w-full flex items-center justify-between px-6 py-4 font-display font-bold text-left transition-colors text-[16px] leading-snug min-h-[54px] gap-4 ${
                  isOpen
                    ? 'bg-[#8bc34a] text-white'
                    : 'bg-white text-gray-900 hover:text-[#8bc34a]'
                }`}
              >
                <span className="flex-1 font-semibold">{item.title}</span>
                <ChevronDown
                  className={`w-5 h-5 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'text-white rotate-180' : 'text-[#8bc34a]'
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-6 py-5 text-gray-700 text-[15px] leading-relaxed font-body bg-white border-t border-[#8bc34a]/20">
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
