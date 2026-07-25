import React from 'react';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import TextEditor from './blocks/TextEditor';
import ImageBlock from './blocks/ImageBlock';
import AccordionBlock from './blocks/AccordionBlock';
import CardBlock from './blocks/CardBlock';
import TabBlock from './blocks/TabBlock';
import ButtonBlock from './blocks/ButtonBlock';
import LayoutBlock from './blocks/LayoutBlock';

export interface BlockData {
  id: string;
  type: string;
  content: any;
  settings?: any;
  order: number;
}

interface BlockRendererProps {
  blocks: BlockData[];
  isEditor?: boolean;
  onBlockUpdate?: (blockId: string, content: any, settings: any) => void;
  onBlockDelete?: (blockId: string) => void;
  onBlockMove?: (blockId: string, direction: 'up' | 'down') => void;
}

const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  text: TextEditor,
  texteditor: TextEditor,
  image: ImageBlock,
  accordion: AccordionBlock,
  card: CardBlock,
  tabs: TabBlock,
  button: ButtonBlock,
  layout: LayoutBlock,
};

export default function BlockRenderer({
  blocks,
  isEditor = false,
  onBlockUpdate,
  onBlockDelete,
  onBlockMove,
}: BlockRendererProps) {
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const handleBlockUpdate = (blockId: string, content: any, settings: any) => {
    onBlockUpdate?.(blockId, content, settings);
  };

  const handleBlockDelete = (blockId: string) => {
    onBlockDelete?.(blockId);
  };

  const handleBlockMove = (blockId: string, direction: 'up' | 'down') => {
    onBlockMove?.(blockId, direction);
  };

  return (
    <div className="space-y-6">
      {sortedBlocks.map((block, index) => {
        const BlockComponent = BLOCK_COMPONENTS[block.type];

        if (!BlockComponent) {
          if (isEditor) {
            return (
              <div key={block.id} className="p-4 border border-red-200 bg-red-50 rounded">
                <p className="text-red-600 text-sm">Unknown block type: {block.type}</p>
                <p className="text-xs text-gray-500 mt-1">Block ID: {block.id}</p>
              </div>
            );
          }
          return null;
        }

        const blockElement = (
          <BlockComponent
            content={block.content || {}}
            settings={block.settings || {}}
            isEditor={isEditor}
            onUpdate={(content: any, settings: any) =>
              handleBlockUpdate(block.id, content, settings)
            }
          />
        );

        if (!isEditor) {
          return <div key={block.id}>{blockElement}</div>;
        }

        return (
          <div
            key={block.id}
            className="group relative border rounded-lg bg-white shadow-sm hover:border-primary/50 transition-colors"
          >
            {/* Header controls for editor mode */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b rounded-t-lg">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {block.type} Block
              </span>
              <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBlockMove(block.id, 'up')}
                    className="p-1 hover:bg-muted text-gray-500 hover:text-gray-800 rounded transition-colors"
                    title="Move block up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                )}
                {index < sortedBlocks.length - 1 && (
                  <button
                    type="button"
                    onClick={() => handleBlockMove(block.id, 'down')}
                    className="p-1 hover:bg-muted text-gray-500 hover:text-gray-800 rounded transition-colors"
                    title="Move block down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleBlockDelete(block.id)}
                  className="p-1 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded transition-colors ml-1"
                  title="Delete block"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Block content body */}
            <div className="p-4">{blockElement}</div>
          </div>
        );
      })}
    </div>
  );
}
