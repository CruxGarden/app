import type { Slide, SlideTheme, PPTElement, PPTTextElement } from '../src/types/slides';
export type PptistCommand = {
  op: string;
  slideId?: string;
  elementId?: string;
  offset?: number;
  limit?: number;
  name?: string;
  title?: string;
  text?: string;
  find?: string;
  replace?: string;
  index?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
  fontSize?: number;
  color?: string;
};
export function validateCommand(value: unknown): PptistCommand;
export function resolveTargets(
  slides: Slide[],
  command: PptistCommand,
): { slide?: Slide; element?: PPTElement };
export function replaceText(html: string, find: string, replacement: string): string;
export function textElement(command: PptistCommand, theme: SlideTheme): PPTTextElement;
