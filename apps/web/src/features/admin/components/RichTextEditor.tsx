import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId } from 'react';

/**
 * Editor de texto con formato (TipTap). Produce HTML; **el servidor lo sanea al guardar** (lista blanca)
 * y al mostrarlo se vuelve a tratar como no confiable (`SafeHtml`).
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
}) {
  const id = useId();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        // Solo se ofrecen los formatos que el servidor conserva.
        code: false,
        codeBlock: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer' },
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class:
          'min-h-32 rounded-b-token border border-border bg-surface p-3 text-base focus-visible:outline-offset-0 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? '' : current.getHTML()),
  });

  // Si el valor cambia desde fuera (carga del borrador), se refleja sin pisar lo que se está escribiendo.
  useEffect(() => {
    if (editor && value !== (editor.isEmpty ? '' : editor.getHTML())) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const button = (text: string, title: string, active: boolean, run: () => void) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={run}
      className={`min-h-9 min-w-9 rounded-token px-2 text-sm font-semibold ${active ? 'bg-primary text-primary-contrast' : 'hover:bg-surface-alt'}`}
    >
      {text}
    </button>
  );

  function setLink() {
    if (!editor) return;
    const previous = (editor.getAttributes('link')['href'] as string | undefined) ?? 'https://';
    const url = window.prompt('Dirección del enlace (déjala vacía para quitarlo)', previous);
    if (url === null) return;
    if (url.trim() === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div
        role="toolbar"
        aria-label={`Formato de ${label}`}
        className="flex flex-wrap gap-1 rounded-t-token border border-b-0 border-border bg-surface-alt p-1"
      >
        {button('B', 'Negrita', editor.isActive('bold'), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {button('I', 'Cursiva', editor.isActive('italic'), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {button('U', 'Subrayado', editor.isActive('underline'), () =>
          editor.chain().focus().toggleUnderline().run(),
        )}
        {button('Título', 'Título', editor.isActive('heading', { level: 2 }), () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {button('• Lista', 'Lista con viñetas', editor.isActive('bulletList'), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {button('1. Lista', 'Lista numerada', editor.isActive('orderedList'), () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {button('“ Cita', 'Cita', editor.isActive('blockquote'), () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        {button('Enlace', 'Enlace', editor.isActive('link'), setLink)}
      </div>
      <EditorContent editor={editor} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
