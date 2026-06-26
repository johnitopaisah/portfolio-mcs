import { Node, mergeAttributes } from '@tiptap/core';

// The CV/cover-letter templates are built almost entirely from
// <div class="..."> (sections, headers, contact blocks) and
// <span class="..."> (skill chips, contact pills) — TipTap's
// StarterKit schema has no node type for either, so without these,
// editor.commands.setContent() silently drops every div/span wrapper
// (and its class) while parsing, flattening the whole document to
// plain paragraphs. That destroys both the visual layout (the <head>
// CSS has nothing left to target) and the page-fit (browser default
// paragraph spacing is far larger than the template's tightly
// controlled div spacing) — these two nodes pass the original
// structure through unchanged so only the text/marks are editable.

export const PassthroughDiv = Node.create({
  name: 'passthroughDiv',
  group: 'block',
  content: 'block*',
  parseHTML() {
    return [{ tag: 'div' }];
  },
  addAttributes() {
    return {
      class: { default: null },
      style: { default: null },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});

// Only matches spans that carry a class attribute — chips/badges from
// the template always do. Plain <span style="..."> spans produced by
// TipTap's own Color/FontSize marks never have a class, so this never
// collides with how those marks render.
export const PassthroughSpan = Node.create({
  name: 'passthroughSpan',
  group: 'inline',
  inline: true,
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'span[class]' }];
  },
  addAttributes() {
    return {
      class: { default: null },
      style: { default: null },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});
