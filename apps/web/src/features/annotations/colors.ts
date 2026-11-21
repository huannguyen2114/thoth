import type { AnnotationColor } from "@thoth/core";

/**
 * Annotation colours are stored as names (ADR-0038) and drawn with Hearth tokens (ADR-0009).
 * Hearth has one brand hue and four status hues, so each name maps to one of them:
 * yellow → warning, green → success, blue → info, pink → danger, purple → accent.
 */
export interface ColorClasses {
  label: string;
  /** Text highlight: a tinted ground behind the passage. */
  mark: string;
  /** SVG fill of a PDF highlight box (drawn at low opacity). */
  fill: string;
  /** SVG stroke for ink and shapes. */
  stroke: string;
  /** A solid swatch for the toolbar. */
  swatch: string;
  /** Hearth token name, for the PDF export (light theme value). */
  token: "warning" | "success" | "info" | "danger" | "accent";
}

export const COLORS: Record<AnnotationColor, ColorClasses> = {
  yellow: {
    label: "Yellow",
    mark: "bg-warning-tint",
    fill: "fill-warning",
    stroke: "stroke-warning",
    swatch: "bg-warning",
    token: "warning",
  },
  green: {
    label: "Green",
    mark: "bg-success-tint",
    fill: "fill-success",
    stroke: "stroke-success",
    swatch: "bg-success",
    token: "success",
  },
  blue: {
    label: "Blue",
    mark: "bg-info-tint",
    fill: "fill-info",
    stroke: "stroke-info",
    swatch: "bg-info",
    token: "info",
  },
  pink: {
    label: "Pink",
    mark: "bg-danger-tint",
    fill: "fill-danger",
    stroke: "stroke-danger",
    swatch: "bg-danger",
    token: "danger",
  },
  purple: {
    label: "Purple",
    mark: "bg-accent-tint",
    fill: "fill-accent",
    stroke: "stroke-accent",
    swatch: "bg-accent",
    token: "accent",
  },
};

export const COLOR_NAMES = Object.keys(COLORS) as AnnotationColor[];
