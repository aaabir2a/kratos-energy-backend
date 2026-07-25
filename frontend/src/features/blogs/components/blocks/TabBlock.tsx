import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface TabItem {
  title: string;
  content: string;
}

interface TabBlockProps {
  content?: {
    tabs?: TabItem[];
  };
  isEditor?: boolean;
  onUpdate?: (content: any, settings: any) => void;
}

export default function TabBlock({ content = {}, isEditor = false, onUpdate }: TabBlockProps) {
  const tabs = content.tabs || [{ title: 'Tab 1', content: 'Tab 1 content...' }];
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  const handleUpdateTab = (index: number, key: keyof TabItem, value: string) => {
    const updated = [...tabs];
    updated[index] = { ...updated[index], [key]: value };
    onUpdate?.({ ...content, tabs: updated }, {});
  };

  const handleAddTab = () => {
    onUpdate?.({ ...content, tabs: [...tabs, { title: `Tab ${tabs.length + 1}`, content: 'New tab content...' }] }, {});
  };

  const handleRemoveTab = (index: number) => {
    const updated = tabs.filter((_, i) => i !== index);
    if (activeTabIdx >= updated.length) {
      setActiveTabIdx(Math.max(0, updated.length - 1));
    }
    onUpdate?.({ ...content, tabs: updated }, {});
  };

  if (!isEditor) {
    return (
      <div className="my-6 border border-ash-200 rounded-lg overflow-hidden bg-white shadow-sm">
        {/* Tab Headers */}
        <div className="flex border-b border-ash-200 overflow-x-auto bg-paper">
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTabIdx(idx)}
              className={`px-5 py-3.5 font-display text-[14.5px] font-bold border-b-2 text-center whitespace-nowrap transition-all ${
                activeTabIdx === idx
                  ? 'border-forest-600 text-forest-700 bg-white'
                  : 'border-transparent text-ash-500 hover:text-navy-800'
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>
        {/* Tab Content */}
        <div className="p-6 font-body text-ash-700 text-[15px] leading-relaxed">
          {tabs[activeTabIdx]?.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/5">
      <div className="space-y-3">
        {tabs.map((tab, idx) => (
          <div key={idx} className="border p-3 rounded-md bg-white space-y-2.5 relative">
            <div className="flex justify-between items-center pr-8">
              <span className="text-xs font-semibold text-muted-foreground">Tab #{idx + 1}</span>
              {tabs.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveTab(idx)}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 absolute top-2 right-2"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <Input
                value={tab.title}
                onChange={(e) => handleUpdateTab(idx, 'title', e.target.value)}
                placeholder="Tab Title..."
                className="text-xs font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Textarea
                value={tab.content}
                onChange={(e) => handleUpdateTab(idx, 'content', e.target.value)}
                placeholder="Tab Content..."
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddTab}
        className="w-full text-xs font-semibold flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Tab
      </Button>
    </div>
  );
}
