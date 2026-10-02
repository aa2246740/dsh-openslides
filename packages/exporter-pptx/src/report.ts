import type {
  Degradation,
  ElementCoverage,
  ExportReport,
} from "./types.js";

export function createCoverage(): ElementCoverage {
  return {
    text: 0,
    shape: 0,
    table: 0,
    chart: 0,
    image: 0,
    group: 0,
    connector: 0,
    smartArt: 0,
    skipped: 0,
    failed: 0,
  };
}

export type ReportBuilder = {
  degradations: Degradation[];
  warnings: string[];
  coverage: ElementCoverage;
  addDegradation: (d: Degradation) => void;
  warn: (message: string) => void;
  bump: (key: keyof ElementCoverage, n?: number) => void;
  build: (meta: {
    deckId: string;
    title: string;
    versionId?: string;
    slideCount: number;
  }) => ExportReport;
};

const HARD_EDITABILITY_LOSS: ReadonlySet<string> = new Set([
  "missing-image",
  "unsupported-element",
  "error",
  "empty-content",
]);

export function createReportBuilder(): ReportBuilder {
  const degradations: Degradation[] = [];
  const warnings: string[] = [];
  const coverage = createCoverage();

  return {
    degradations,
    warnings,
    coverage,
    addDegradation(d) {
      degradations.push(d);
    },
    warn(message) {
      warnings.push(message);
    },
    bump(key, n = 1) {
      coverage[key] += n;
    },
    build(meta) {
      const mapped =
        coverage.text +
        coverage.shape +
        coverage.table +
        coverage.chart +
        coverage.image +
        coverage.group +
        coverage.connector +
        coverage.smartArt;
      const total = mapped + coverage.skipped + coverage.failed;
      const nativeCoverage = total === 0 ? 1 : mapped / total;

      const fullyNative = !degradations.some((d) =>
        HARD_EDITABILITY_LOSS.has(d.kind),
      );

      return {
        deckId: meta.deckId,
        title: meta.title,
        versionId: meta.versionId,
        slideCount: meta.slideCount,
        elementCounts: { ...coverage },
        degradations: [...degradations],
        warnings: [...warnings],
        fullyNative,
        nativeCoverage,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}
