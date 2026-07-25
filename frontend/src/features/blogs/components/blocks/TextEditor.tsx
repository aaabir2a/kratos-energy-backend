import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';

interface TextEditorProps {
  content?: string;
  isEditor?: boolean;
  onUpdate?: (content: string, settings: any) => void;
}

export default function TextEditor({ content = '', isEditor = false, onUpdate }: TextEditorProps) {
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
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Write your story here...',
      }),
      CharacterCount,
    ],
    content: typeof content === 'string' ? content : content || '',
    editable: isEditor,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate?.(html, {});
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
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

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter link URL:', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
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

        {/* Lists & Link */}
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
          onClick={setLink}
          className={btnClass(editor.isActive('link'))}
          title="Insert Link"
        >
          Link
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
    </div>
  );
}
