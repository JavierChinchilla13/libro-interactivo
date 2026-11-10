import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useId, type ReactNode } from 'react';

/** Iconos de alineación: líneas de texto (trazo de 1,75 px, como el texto semibold del botón). */
function AlignIcon({ center }: { center: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d={center ? 'M4 5h12M6.5 10h7M4 15h12' : 'M4 5h12M4 10h7.5M4 15h12'} />
    </svg>
  );
}

/**
 * Editor de texto con formato (TipTap). Produce HTML; **el servidor lo sanea al guardar** (lista blanca)
 * y al mostrarlo se vuelve a tratar como no confiable (`SafeHtml`).
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  hint,
  pages = false,
}: {
  label: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
  /** Muestra «Nueva página» (inserta un separador `<hr>`: el mensaje de bienvenida lo muestra por páginas). */
  pages?: boolean;
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
      // Solo izquierda y centro: es lo único que el servidor conserva de `style`.
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center'] }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class:
          'rte-content min-h-32 rounded-b-token border border-border bg-surface p-3 text-base focus-visible:outline-offset-0 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6',
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

  const button = (text: ReactNode, title: string, active: boolean, run: () => void) => (
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
        <span aria-hidden="true" className="mx-0.5 my-1.5 w-px bg-border" />
        {button(
          <AlignIcon center={false} />,
          'Alinear a la izquierda',
          !editor.isActive({ textAlign: 'center' }),
          () => editor.chain().focus().setTextAlign('left').run(),
        )}
        {button(<AlignIcon center />, 'Centrar', editor.isActive({ textAlign: 'center' }), () =>
          editor.chain().focus().setTextAlign('center').run(),
        )}
        {pages ? (
          <>
            <span aria-hidden="true" className="mx-0.5 my-1.5 w-px bg-border" />
            {button('Nueva página', 'Nueva página (separa el mensaje en páginas)', false, () =>
              editor.chain().focus().setHorizontalRule().run(),
            )}
          </>
        ) : null}
      </div>
      <EditorContent editor={editor} />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
