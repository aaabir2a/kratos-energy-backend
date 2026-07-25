import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, AlignLeft, Image, Columns, LayoutGrid, HelpCircle, Layers, Link as LinkIcon } from 'lucide-react';
import BlockRenderer, { BlockData } from './BlockRenderer';

interface BlockEditorProps {
  initialBlocks?: BlockData[];
  onChange?: (blocks: BlockData[]) => void;
}

const AVAILABLE_BLOCKS = [
  { type: 'text', label: 'Rich Text', icon: AlignLeft, description: 'TipTap rich text block' },
  { type: 'image', label: 'Image', icon: Image, description: 'Single cover/inline image block' },
  { type: 'layout', label: 'Layout Grid', icon: Columns, description: 'Multi-column nested text/image' },
  { type: 'card', label: 'Info Cards', icon: LayoutGrid, description: 'Product/feature showcase cards' },
  { type: 'accordion', label: 'FAQ Accordion', icon: HelpCircle, description: 'Collapsible accordion items' },
  { type: 'tabs', label: 'Tabs Block', icon: Layers, description: 'Tabbed text details' },
  { type: 'button', label: 'CTA Button', icon: LinkIcon, description: 'Action link button' },
];

export default function BlockEditor({ initialBlocks = [], onChange }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<BlockData[]>([]);

  useEffect(() => {
    if (initialBlocks && JSON.stringify(initialBlocks) !== JSON.stringify(blocks)) {
      setBlocks(initialBlocks);
    }
  }, [initialBlocks]);

  const triggerChange = (newBlocks: BlockData[]) => {
    setBlocks(newBlocks);
    onChange?.(newBlocks);
  };

  const addBlock = (type: string) => {
    const newBlock: BlockData = {
      id: uuidv4(),
      type,
      content: getDefaultContent(type),
      order: blocks.length + 1,
    };
    triggerChange([...blocks, newBlock]);
  };

  const updateBlock = (blockId: string, content: any, _settings: any) => {
    const updated = blocks.map((b) =>
      b.id === blockId ? { ...b, content } : b
    );
    triggerChange(updated);
  };

  const deleteBlock = (blockId: string) => {
    const filtered = blocks.filter((b) => b.id !== blockId);
    // Re-index orders
    const reordered = filtered.map((b, idx) => ({ ...b, order: idx + 1 }));
    triggerChange(reordered);
  };

  const moveBlock = (blockId: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === blocks.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const reordered = [...blocks];
    
    // Swap items
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    // Fix orders
    const final = reordered.map((b, i) => ({ ...b, order: i + 1 }));
    triggerChange(final);
  };

  return (
    <div className="space-y-6">
      {/* Editor Canvas */}
      {blocks.length > 0 ? (
        <BlockRenderer
          blocks={blocks}
          isEditor={true}
          onBlockUpdate={updateBlock}
          onBlockDelete={deleteBlock}
          onBlockMove={moveBlock}
        />
      ) : (
        <div className="text-center py-12 border border-dashed rounded-lg bg-muted/5">
          <AlignLeft className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No content blocks yet</h3>
          <p className="text-xs text-muted-foreground mb-4">Start building your blog by adding block components.</p>
        </div>
      )}

      {/* Block Picker Panel */}
      <div className="border rounded-lg p-4 bg-muted/10">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Add Content Block
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {AVAILABLE_BLOCKS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => addBlock(item.type)}
              className="flex items-center gap-2.5 p-3 rounded-lg border bg-white hover:border-primary/50 text-left transition-all hover:shadow-sm"
            >
              <div className="p-1.5 rounded bg-muted">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{item.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function getDefaultContent(type: string): any {
  switch (type) {
    case 'text':
      return '';
    case 'image':
      return { imageUrl: '', alt: '', caption: '' };
    case 'layout':
      return { columns: 2, col1Type: 'text', col2Type: 'text' };
    case 'card':
      return { items: [{ title: 'Card Title', description: 'Description details...', imageUrl: '', link: '' }] };
    case 'accordion':
      return { items: [{ title: 'Question FAQ', content: 'Answer text...' }] };
    case 'tabs':
      return { tabs: [{ title: 'Tab 1', content: 'Tab 1 details...' }] };
    case 'button':
      return { text: 'Learn More', url: '', alignment: 'center' };
    default:
      return {};
  }
}
