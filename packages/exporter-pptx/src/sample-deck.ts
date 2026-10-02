import type { Deck } from "./types.js";

/** Minimal 1×1 PNG (transparent) for offline image export tests. */
export const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const now = "2026-08-04T00:00:00.000Z";

/**
 * Deterministic sample deck covering text, shape, table, chart, image,
 * connector, smartart. Offline-safe (no network images).
 */
export function createSampleDeck(): Deck {
  return {
    id: "deck-sample-1",
    title: "DSH SlideStudio Sample",
    aspectRatio: "16:9",
    versionId: "v1",
    createdAt: now,
    updatedAt: now,
    theme: {
      name: "DSH SlideStudio Neutral",
      colors: {
        background: "#FFFFFF",
        surface: "#FFFFFF",
        ink: "#111111",
        muted: "#777777",
        accent: "#4D9CFF",
        primary: "#111111",
        secondary: "#4D9CFF",
        chart: ["#4D9CFF", "#62A8E8", "#2F7A45"],
      },
      fonts: {
        heading: "Arial",
        body: "Arial",
      },
    },
    references: [],
    citations: [
      {
        id: "c1",
        title: "Internal research note",
        excerptHash: "abc",
      },
    ],
    slides: [
      {
        id: "slide-title",
        order: 0,
        size: { width: 1920, height: 1080 },
        background: { type: "solid", color: "#FFFFFF" },
        notes: "Title slide notes",
        elements: [
          {
            id: "el-bg-shape",
            kind: "shape",
            shape: "rect",
            x: 0,
            y: 0,
            width: 1920,
            height: 120,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
            fill: { type: "solid", color: "#111111" },
          },
          {
            id: "el-title",
            kind: "text",
            x: 80,
            y: 200,
            width: 1600,
            height: 120,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            paragraphs: [
              {
                align: "left",
                runs: [
                  {
                    text: "DSH SlideStudio",
                    fontSize: 44,
                    fontWeight: "bold",
                    color: "#111111",
                  },
                ],
              },
            ],
          },
          {
            id: "el-sub",
            kind: "text",
            x: 80,
            y: 340,
            width: 1200,
            height: 80,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            paragraphs: [
              {
                runs: [
                  {
                    text: "Structured decks → native PPTX",
                    fontSize: 22,
                    color: "#777777",
                  },
                ],
              },
            ],
          },
          {
            id: "el-accent",
            kind: "shape",
            shape: "roundRect",
            x: 80,
            y: 450,
            width: 280,
            height: 56,
            rotation: 0,
            opacity: 1,
            zIndex: 3,
            cornerRadius: 8,
            fill: { type: "solid", color: "#4D9CFF" },
            text: [
              {
                align: "center",
                runs: [
                  {
                    text: "Get started",
                    fontSize: 16,
                    color: "#FFFFFF",
                    fontWeight: "bold",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "slide-data",
        order: 1,
        size: { width: 1920, height: 1080 },
        background: { type: "solid", color: "#F6F6F6" },
        elements: [
          {
            id: "el-h",
            kind: "text",
            x: 80,
            y: 60,
            width: 800,
            height: 60,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
            paragraphs: [
              {
                runs: [
                  {
                    text: "Quarterly results",
                    fontSize: 28,
                    fontWeight: "bold",
                    color: "#111111",
                  },
                ],
              },
            ],
          },
          {
            id: "el-table",
            kind: "table",
            x: 80,
            y: 160,
            width: 800,
            height: 360,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            rows: 4,
            cols: 3,
            columnWidths: [300, 250, 250],
            cells: [
              [
                {
                  text: "Region",
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  fill: { type: "solid", color: "#111111" },
                },
                {
                  text: "Revenue",
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  fill: { type: "solid", color: "#111111" },
                },
                {
                  text: "Growth",
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  fill: { type: "solid", color: "#111111" },
                },
              ],
              [{ text: "North" }, { text: "$12.4M" }, { text: "+8%" }],
              [{ text: "EMEA" }, { text: "$9.1M" }, { text: "+12%" }],
              [{ text: "APAC" }, { text: "$7.6M" }, { text: "+15%" }],
            ],
          },
          {
            id: "el-chart",
            kind: "chart",
            chartType: "column",
            x: 960,
            y: 160,
            width: 860,
            height: 500,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            title: "Revenue by region",
            categories: ["North", "EMEA", "APAC"],
            series: [
              {
                name: "Revenue ($M)",
                values: [12.4, 9.1, 7.6],
                color: "#4D9CFF",
              },
            ],
            showLegend: false,
            showDataLabels: true,
          },
        ],
      },
      {
        id: "slide-process",
        order: 2,
        size: { width: 1920, height: 1080 },
        background: { type: "solid", color: "#FFFFFF" },
        elements: [
          {
            id: "el-process-title",
            kind: "text",
            x: 80,
            y: 60,
            width: 1000,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
            paragraphs: [
              {
                runs: [
                  {
                    text: "Delivery process",
                    fontSize: 28,
                    fontWeight: "bold",
                  },
                ],
              },
            ],
          },
          {
            id: "el-smart",
            kind: "smartart",
            layout: "process",
            x: 80,
            y: 200,
            width: 1760,
            height: 280,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            nodes: [
              { id: "n1", text: "Research" },
              { id: "n2", text: "Compose" },
              { id: "n3", text: "Validate" },
              { id: "n4", text: "Export" },
            ],
            edges: [
              { id: "e1", from: "n1", to: "n2" },
              { id: "e2", from: "n2", to: "n3" },
              { id: "e3", from: "n3", to: "n4" },
            ],
          },
          {
            id: "el-img",
            kind: "image",
            x: 80,
            y: 560,
            width: 200,
            height: 200,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            src: TINY_PNG_DATA_URL,
            alt: "Sample pixel",
          },
          {
            id: "el-missing-img",
            kind: "image",
            x: 320,
            y: 560,
            width: 200,
            height: 200,
            rotation: 0,
            opacity: 1,
            zIndex: 3,
            src: "asset:unresolved-id",
            alt: "Missing",
          },
          {
            id: "el-conn",
            kind: "connector",
            connectorType: "straight",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 4,
            start: { x: 280, y: 660 },
            end: { x: 320, y: 660 },
            stroke: { color: "#4D9CFF", width: 2 },
            endArrow: "triangle",
          },
        ],
      },
    ],
  };
}
