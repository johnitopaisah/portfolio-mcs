import { Node, mergeAttributes } from '@tiptap/core';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import ListItem from '@tiptap/extension-list-item';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';

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

// StarterKit's stock Paragraph/Heading/ListItem nodes don't preserve
// class/style attributes either — same root cause as the div/span
// issue above, just on recognized node types instead of unrecognized
// ones. Every template resets all default spacing to zero
// (* { margin: 0; padding: 0; }) and relies entirely on classes like
// .cl-para (margin-bottom: 16px) for paragraph spacing — once the
// class drops during parsing, that spacing silently disappears even
// though the <p> tags themselves survive, producing paragraphs that
// are structurally separate but visually run together.
const classAndStyleAttrs = {
  class: { default: null },
  style: { default: null },
};

export const ClassParagraph = Paragraph.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAndStyleAttrs };
  },
});

export const ClassHeading = Heading.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAndStyleAttrs };
  },
});

export const ClassListItem = ListItem.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAndStyleAttrs };
  },
});

export const ClassBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAndStyleAttrs };
  },
});

export const ClassOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAndStyleAttrs };
  },
});
