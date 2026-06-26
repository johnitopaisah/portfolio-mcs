'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import {
  PassthroughDiv, PassthroughSpan,
  ClassParagraph, ClassHeading, ClassListItem, ClassBulletList, ClassOrderedList,
} from '@/lib/tiptapPassthrough';
import { adminApi } from '@/lib/api';

interface DocumentEditorProps {
  appId: number | string;
  docId: number;
  initialHtml: string;
  onSaved: (warnings: string[]) => void;
  onCancel: () => void;
  onPageMetrics?: (pages: number) => void;
}

const COLORS = ['#000000', '#DC2626', '#2563EB', '#16A34A', '#CA8A04', '#7C3AED'];
const FONT_SIZES = ['9pt', '10pt', '10.5pt', '11pt', '12pt', '14pt', '16pt'];
const AUTOSAVE_DELAY_MS = 10000;
const PAGE_HEIGHT_PX = 1123; // A4 at the same px/pt scale used by the rest of the preview pipeline
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, li';

function splitHeadBody(html: string): { head: string; bodyHtml: string } {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return {
    head: headMatch ? headMatch[1] : '',
    bodyHtml: bodyMatch ? bodyMatch[1] : html,
  };
}

export default function DocumentEditor({
  appId, docId, initialHtml, onSaved, onCancel, onPageMetrics,
}: DocumentEditorProps) {
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const parsedRef     = useRef(splitHeadBody(initialHtml));
  const autosaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mountNode,      setMountNode]      = useState<HTMLElement | null>(null);
  const [overlayNode,    setOverlayNode]    = useState<HTMLElement | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [shrinking,       setShrinking]      = useState<'document' | 'paragraph' | null>(null);
  const [intensity,      setIntensity]      = useState<'light' | 'aggressive'>('light');
  const [autosaveState,  setAutosaveState]  = useState<'idle' | 'saving' | 'saved'>('idle');
  const [warnings,       setWarnings]       = useState<string[]>([]);
  const [pages,          setPages]          = useState<number | null>(null);
  const [shrinkError,    setShrinkError]    = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: false, heading: false, listItem: false, bulletList: false, orderedList: false,
      }),
      ClassParagraph, ClassHeading, ClassListItem, ClassBulletList, ClassOrderedList,
      TextStyleKit, Underline,
      TextAlign.configure({ types: ['paragraph', 'heading', 'passthroughDiv'] }),
      PassthroughDiv, PassthroughSpan,
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => scheduleAutosave(),
  });

  // Bootstrap the iframe's own document with the document's existing
  // <head> (so fonts/CSS exactly match what gets printed to PDF), hand
  // off a mount node for the TipTap portal plus a second overlay mount
  // (page-boundary line + overflow tint, both purely visual, no
  // pointer-events so they never interfere with editing), then load
  // the real content once the editor instance exists. No sandbox
  // attribute — this iframe only ever holds blank, self-authored
  // content we write ourselves (never externally-loaded HTML), so
  // cross-document contentEditable behavior isn't at risk of sandbox
  // restrictions.
  useEffect(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc || !editor) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head>${parsedRef.current.head}</head><body style="position:relative;"></body></html>`);
    doc.close();

    const mount = doc.createElement('div');
    mount.id = 'tiptap-edit-mount';
    doc.body.appendChild(mount);

    const overlay = doc.createElement('div');
    overlay.id = 'tiptap-edit-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.pointerEvents = 'none';
    doc.body.appendChild(overlay);

    setMountNode(mount);
    setOverlayNode(overlay);
    editor.commands.setContent(parsedRef.current.bodyHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  function buildFullHtml(): string {
    if (!editor) return initialHtml;
    return `<!DOCTYPE html><html><head>${parsedRef.current.head}</head><body>${editor.getHTML()}</body></html>`;
  }

  const scheduleAutosave = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        await adminApi.autosaveDocumentEdit(appId, docId, buildFullHtml());
        setAutosaveState('saved');
      } catch {
        setAutosaveState('idle');
      }
    }, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, docId]);

  useEffect(() => () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); }, []);

  // Live page-overflow readout. Measures the TipTap mount node's own
  // height, never document.body — body also contains the overlay
  // (boundary line + overflow tint), and the tint's height is itself
  // derived from the measured page count. Measuring body would create
  // a feedback loop: pages -> tint height -> body scrollHeight -> bigger
  // pages -> bigger tint -> ... growing without bound on every tick.
  useEffect(() => {
    if (!mountNode) return;
    const id = setInterval(() => {
      const h = mountNode.scrollHeight || mountNode.getBoundingClientRect().height;
      if (h > 0) {
        const p = h / PAGE_HEIGHT_PX;
        setPages(p);
        onPageMetrics?.(p);
      }
    }, 500);
    return () => clearInterval(id);
  }, [mountNode, onPageMetrics]);

  async function handleSave() {
    if (!editor) return;
    setSaving(true);
    try {
      const result = await adminApi.saveDocumentEdit(appId, docId, buildFullHtml());
      const w = result.warnings || [];
      setWarnings(w);
      onSaved(w);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Resolve a block-level DOM element (p/h1-4/li) rendered inside the
  // iframe back to its ProseMirror node boundaries, so the shortened
  // text can be swapped in at exactly the right position. posAtDOM
  // with the child-count as the offset gives the position just before
  // the node's closing tag — the standard approach for mapping a
  // rendered block element back to its node range.
  function blockRange(el: Element): { from: number; to: number } | null {
    if (!editor) return null;
    try {
      const from = editor.view.posAtDOM(el, 0);
      const to   = editor.view.posAtDOM(el, el.childNodes.length);
      return { from, to };
    } catch {
      return null;
    }
  }

  async function handleShrinkDocument() {
    if (!editor || !mountNode) return;
    setShrinkError(null);
    const elements = Array.from(mountNode.querySelectorAll(BLOCK_SELECTOR))
      .filter(el => (el.textContent || '').trim().length > 0);
    if (elements.length === 0) return;

    setShrinking('document');
    try {
      const texts = elements.map(el => el.textContent || '');
      const { blocks } = await adminApi.shrinkText(appId, docId, texts, intensity);

      // Apply back-to-front so earlier replacements don't shift the
      // positions of elements not yet processed.
      const ranges = elements.map(blockRange);
      for (let i = elements.length - 1; i >= 0; i--) {
        const range = ranges[i];
        const text  = blocks[i];
        if (!range || text === undefined) continue;
        editor.chain().insertContentAt(range, text).run();
      }
      scheduleAutosave();
    } catch (e: unknown) {
      setShrinkError(e instanceof Error ? e.message : 'Shrink failed');
    } finally {
      setShrinking(null);
    }
  }

  async function handleShrinkParagraph() {
    if (!editor) return;
    setShrinkError(null);
    const { $head } = editor.state.selection;
    // Walk up to the nearest block-level ancestor (paragraph, heading, or list item).
    let depth = $head.depth;
    while (depth > 0 && !['paragraph', 'heading', 'listItem'].includes($head.node(depth).type.name)) {
      depth--;
    }
    if (depth === 0) return;
    const node = $head.node(depth);
    const from = $head.before(depth);
    const to   = $head.after(depth);
    const text = node.textContent.trim();
    if (!text) return;

    setShrinking('paragraph');
    try {
      const { blocks } = await adminApi.shrinkText(appId, docId, [text], intensity);
      if (blocks[0] !== undefined) {
        editor.chain().insertContentAt({ from, to }, blocks[0]).run();
        scheduleAutosave();
      }
    } catch (e: unknown) {
      setShrinkError(e instanceof Error ? e.message : 'Shrink failed');
    } finally {
      setShrinking(null);
    }
  }

  function btnClass(active: boolean) {
    return `px-2.5 py-1 rounded text-xs transition-colors ${
      active ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;
  }

  const overflowing = pages !== null && pages > 1.0;
  const overflowPx  = overflowing ? Math.round((pages! - 1) * PAGE_HEIGHT_PX) : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-gray-900 border border-gray-800 flex-wrap">
        <button onClick={() => editor?.chain().focus().toggleBold().run()}
          className={btnClass(!!editor?.isActive('bold'))} title="Bold"><b>B</b></button>
        <button onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={btnClass(!!editor?.isActive('italic'))} title="Italic"><i>I</i></button>
        <button onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={btnClass(!!editor?.isActive('underline'))} title="Underline"><u>U</u></button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <button onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          className={btnClass(!!editor?.isActive({ textAlign: 'left' }))} title="Align left">⫷</button>
        <button onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          className={btnClass(!!editor?.isActive({ textAlign: 'center' }))} title="Align center">≡</button>
        <button onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          className={btnClass(!!editor?.isActive({ textAlign: 'right' }))} title="Align right">⫸</button>
        <button onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
          className={btnClass(!!editor?.isActive({ textAlign: 'justify' }))} title="Justify">☰</button>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {COLORS.map(c => (
          <button key={c} onClick={() => editor?.chain().focus().setColor(c).run()}
            className="w-5 h-5 rounded-full border border-gray-600 hover:scale-110 transition-transform"
            style={{ background: c }} title={c} />
        ))}

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <select
          onChange={e => { if (e.target.value) editor?.chain().focus().setFontSize(e.target.value).run(); }}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-1 cursor-pointer"
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <button onClick={() => editor?.chain().focus().undo().run()}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800">↶ Undo</button>
        <button onClick={() => editor?.chain().focus().redo().run()}
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800">↷ Redo</button>

        <div className="flex-1" />

        <span className="text-[10px] text-gray-500 px-1">
          {autosaveState === 'saving' ? 'Saving…' : autosaveState === 'saved' ? 'Saved' : ''}
        </span>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !editor}
          className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Shrink-to-fit toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-gray-900 border border-gray-800 flex-wrap">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider px-1">Shrink</span>
        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          <button onClick={() => setIntensity('light')}
            className={`px-2.5 py-1 text-xs transition-colors ${intensity === 'light' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}>
            Light
          </button>
          <button onClick={() => setIntensity('aggressive')}
            className={`px-2.5 py-1 text-xs transition-colors ${intensity === 'aggressive' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}>
            Aggressive
          </button>
        </div>
        <button onClick={handleShrinkDocument} disabled={!!shrinking}
          className="px-3 py-1.5 rounded-lg text-xs bg-purple-700 hover:bg-purple-600 text-white font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5">
          {shrinking === 'document' ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Shrinking…</> : '✂ Shrink to fit'}
        </button>
        <button onClick={handleShrinkParagraph} disabled={!!shrinking}
          className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          title="Shortens the paragraph/bullet your cursor is currently in">
          {shrinking === 'paragraph' ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Shortening…</> : '✂ Shorten this paragraph'}
        </button>
        {pages !== null && (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ml-auto ${
            overflowing ? 'bg-red-900/40 text-red-300 border-red-800/40' : 'bg-green-900/40 text-green-300 border-green-800/40'
          }`}>
            {overflowing ? `~${pages!.toFixed(2)} pages` : '✓ Fits 1 page'}
          </span>
        )}
      </div>

      {shrinkError && (
        <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400">⚠ {shrinkError}</div>
      )}

      {warnings.length > 0 && (
        <div className="px-3 py-2 rounded-lg bg-yellow-950/30 border border-yellow-800/40 text-xs text-yellow-400 flex flex-col gap-1">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      <iframe ref={iframeRef} className="w-full bg-white rounded-lg border border-gray-800" style={{ height: 1000 }} />
      {mountNode && createPortal(<EditorContent editor={editor} />, mountNode)}
      {overlayNode && createPortal(
        <>
          {/* Page-boundary line — fixed position, marks where page 1 ends */}
          <div style={{
            position: 'absolute', top: `${PAGE_HEIGHT_PX}px`, left: 0, right: 0,
            borderTop: '2px dashed rgba(239,68,68,0.75)', height: 0,
          }}>
            <span style={{
              position: 'absolute', right: 0, top: '2px', fontSize: '10px',
              background: 'rgba(239,68,68,0.85)', color: 'white', padding: '2px 6px', borderRadius: '0 0 3px 3px',
            }}>
              Page 1 ends here
            </span>
          </div>
          {/* Overflow tint — highlights whatever spills onto page 2+.
              Sized to exactly the measured overflow, no extra buffer —
              extending past the real content would itself inflate the
              next scrollHeight measurement (the bug this whole effect
              exists to avoid; see the page-metrics effect above). */}
          {overflowing && (
            <div style={{
              position: 'absolute', top: `${PAGE_HEIGHT_PX}px`, left: 0, right: 0,
              height: `${overflowPx}px`, background: 'rgba(239,68,68,0.08)',
            }} />
          )}
        </>,
        overlayNode
      )}
    </div>
  );
}
