import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Table as TableIcon, Link as LinkIcon, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TextEditorProps {
  content?: any;
  isEditor?: boolean;
  onUpdate?: (content: string, settings: any) => void;
}

const parseContent = (val: any) => {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    return val.html || val.text || val.body || '';
  }
  return '';
};

export default function TextEditor({ content = '', isEditor = false, onUpdate }: TextEditorProps) {
  // Modal states
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTargetBlank, setLinkTargetBlank] = useState(false);

  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [tableHeader, setTableHeader] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline hover:text-primary/80 transition-colors',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      Placeholder.configure({
        placeholder: 'Write your story here...',
      }),
      CharacterCount,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full my-4 border border-slate-300',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: parseContent(content),
    editable: isEditor,
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-none min-h-[150px] font-body text-gray-800 leading-relaxed',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate?.(html, {});
    },
  });

  useEffect(() => {
    if (editor) {
      const parsed = parseContent(content);
      if (parsed !== editor.getHTML()) {
        editor.commands.setContent(parsed);
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  if (!isEditor) {
    return (
      <div 
        className="prose max-w-none dark:prose-invert prose-headings:font-display prose-headings:font-bold text-gray-800 leading-relaxed font-body"
        dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
      />
    );
  }

  // Active state styling helpers
  const btnClass = (active: boolean) =>
    `p-1.5 rounded transition-colors text-xs font-medium ${
      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
    }`;

  // Link Handlers
  const handleOpenLinkModal = () => {
    const previousUrl = editor.getAttributes('link').href || '';
    const target = editor.getAttributes('link').target;
    setLinkUrl(previousUrl);
    setLinkTargetBlank(target === '_blank');
    setIsLinkModalOpen(true);
  };

  const handleSaveLink = () => {
    const trimmed = linkUrl.trim();
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({
          href: trimmed,
          target: linkTargetBlank ? '_blank' : null,
        })
        .run();
    }
    setIsLinkModalOpen(false);
  };

  const handleRemoveLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setIsLinkModalOpen(false);
  };

  // Table Handlers
  const handleInsertTable = () => {
    const rows = Math.max(1, Math.min(20, tableRows || 1));
    const cols = Math.max(1, Math.min(10, tableCols || 1));
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: tableHeader })
      .run();
    setIsTableModalOpen(false);
  };

  return (
    <div className="border rounded-md bg-white overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-muted/20 border-b">
        {/* Headings */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btnClass(editor.isActive('heading', { level: 2 }))}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btnClass(editor.isActive('heading', { level: 3 }))}
          title="Heading 3"
        >
          H3
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={btnClass(editor.isActive('paragraph'))}
          title="Paragraph"
        >
          Paragraph
        </button>

        <div className="w-[1px] h-6 bg-border mx-1" />

        {/* Formats */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={btnClass(editor.isActive('bold'))}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btnClass(editor.isActive('italic'))}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={btnClass(editor.isActive('underline'))}
          title="Underline"
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={btnClass(editor.isActive('strike'))}
          title="Strikethrough"
        >
          <s>S</s>
        </button>

        <div className="w-[1px] h-6 bg-border mx-1" />

        {/* Alignments */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={btnClass(editor.isActive({ textAlign: 'left' }))}
          title="Align Left"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={btnClass(editor.isActive({ textAlign: 'center' }))}
          title="Align Center"
        >
          Center
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={btnClass(editor.isActive({ textAlign: 'right' }))}
          title="Align Right"
        >
          Right
        </button>

        <div className="w-[1px] h-6 bg-border mx-1" />

        {/* Lists, Link & Table */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btnClass(editor.isActive('bulletList'))}
          title="Bullet List"
        >
          Bullet List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btnClass(editor.isActive('orderedList'))}
          title="Ordered List"
        >
          Ordered List
        </button>
        <button
          type="button"
          onClick={handleOpenLinkModal}
          className={btnClass(editor.isActive('link'))}
          title="Insert Link"
        >
          Link
        </button>
        <button
          type="button"
          onClick={() => setIsTableModalOpen(true)}
          className={btnClass(editor.isActive('table'))}
          title="Insert Table"
        >
          <span className="flex items-center gap-1">
            <TableIcon className="w-3.5 h-3.5" />
            Table
          </span>
        </button>

        <div className="w-[1px] h-6 bg-border mx-1" />

        {/* Undo / Redo */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="p-1.5 hover:bg-muted text-muted-foreground rounded disabled:opacity-50 text-xs"
          title="Undo"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="p-1.5 hover:bg-muted text-muted-foreground rounded disabled:opacity-50 text-xs"
          title="Redo"
        >
          Redo
        </button>
      </div>

      {/* Table Context Sub-Toolbar (Active when cursor is inside a table) */}
      {editor.isActive('table') && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-blue-50/80 border-b text-xs text-blue-900 border-blue-200">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-blue-700 mr-1 flex items-center gap-1">
            <TableIcon className="w-3.5 h-3.5" /> Table Controls:
          </span>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            className="px-2 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-medium"
            title="Add column to left"
          >
            + Col Left
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="px-2 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-medium"
            title="Add column to right"
          >
            + Col Right
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="px-2 py-0.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded text-[11px] font-medium"
            title="Delete current column"
          >
            Del Col
          </button>

          <span className="text-blue-300">|</span>

          <button
            type="button"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            className="px-2 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-medium"
            title="Add row above"
          >
            + Row Above
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            className="px-2 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-medium"
            title="Add row below"
          >
            + Row Below
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="px-2 py-0.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded text-[11px] font-medium"
            title="Delete current row"
          >
            Del Row
          </button>

          <span className="text-blue-300">|</span>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeaderCell().run()}
            className="px-2 py-0.5 bg-white border border-blue-200 hover:bg-blue-100 rounded text-[11px] font-medium"
            title="Toggle Header Cell"
          >
            Header Cell
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="px-2 py-0.5 bg-red-600 text-white hover:bg-red-700 rounded text-[11px] font-semibold ml-auto"
            title="Delete Table"
          >
            Delete Table
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="p-4 min-h-[150px] outline-none">
        <EditorContent editor={editor} />
      </div>

      {/* Character Count Footer */}
      <div className="px-4 py-1.5 border-t bg-muted/10 text-[10px] text-muted-foreground flex justify-between">
        <span>
          {editor.storage.characterCount.words()} words
        </span>
        <span>
          {editor.storage.characterCount.characters()} characters
        </span>
      </div>

      {/* Link Insertion Modal */}
      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <LinkIcon className="w-4 h-4 text-primary" />
              Insert / Edit Hyperlink
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter web URL to hyperlink selected text.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="link-url-input" className="text-xs font-semibold">
                Target URL
              </Label>
              <Input
                id="link-url-input"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                className="text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveLink();
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="link-target-blank"
                checked={linkTargetBlank}
                onChange={(e) => setLinkTargetBlank(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
              />
              <Label htmlFor="link-target-blank" className="text-xs font-normal cursor-pointer flex items-center gap-1">
                Open in new window / tab
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </Label>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {editor.isActive('link') ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemoveLink}
                className="h-8 text-xs"
              >
                Remove Link
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsLinkModalOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveLink}
                className="h-8 text-xs font-semibold"
              >
                Save Link
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Generator Modal */}
      <Dialog open={isTableModalOpen} onOpenChange={setIsTableModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <TableIcon className="w-4 h-4 text-primary" />
              Insert Table
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure grid dimensions for the new table. Columns and rows can be resized by dragging borders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="table-rows-input" className="text-xs font-semibold">
                  Number of Rows
                </Label>
                <Input
                  id="table-rows-input"
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(parseInt(e.target.value) || 1)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="table-cols-input" className="text-xs font-semibold">
                  Number of Columns
                </Label>
                <Input
                  id="table-cols-input"
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(parseInt(e.target.value) || 1)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="table-header-check"
                checked={tableHeader}
                onChange={(e) => setTableHeader(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
              />
              <Label htmlFor="table-header-check" className="text-xs font-normal cursor-pointer">
                Include Header Row (styled header cells)
              </Label>
            </div>
          </div>

          <DialogFooter className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTableModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleInsertTable}
              className="h-8 text-xs font-semibold"
            >
              Insert Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

