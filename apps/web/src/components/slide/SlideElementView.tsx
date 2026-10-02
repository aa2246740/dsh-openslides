import type { CSSProperties, ReactNode } from "react";
import type {
  ChartElement,
  ConnectorElement,
  GroupElement,
  ImageElement,
  ShapeElement,
  SlideElement,
  SmartArtElement,
  TableElement,
  TextElement,
  TextParagraph,
} from "@open-slidestudio/pptd";
import { fillToCss, shadowToCss, strokeToCss } from "../../lib/fill-style";

type Props = {
  element: SlideElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  /** When rendering group children, offset is already applied via parent */
  offsetX?: number;
  offsetY?: number;
};

function baseStyle(
  el: SlideElement,
  offsetX = 0,
  offsetY = 0,
): CSSProperties {
  return {
    left: el.x + offsetX,
    top: el.y + offsetY,
    width: el.width,
    height: el.height,
    opacity: el.opacity ?? 1,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    zIndex: el.zIndex ?? 0,
    visibility: el.visible === false ? "hidden" : undefined,
    pointerEvents: el.locked ? "none" : undefined,
  };
}

function renderParagraphs(paragraphs: TextParagraph[]) {
  return paragraphs.map((p, i) => {
    const bullet = p.bullet === true || (typeof p.bullet === "object" && p.bullet);
    const align = p.align ?? "left";
    return (
      <p
        key={i}
        style={{
          textAlign: align,
          lineHeight: p.lineHeight ?? 1.3,
          marginTop: p.spaceBefore ?? 0,
          marginBottom: p.spaceAfter ?? (i < paragraphs.length - 1 ? 6 : 0),
        }}
      >
        {bullet ? (
          <span style={{ marginRight: 6 }} aria-hidden>
            •
          </span>
        ) : null}
        {p.runs.map((r, j) => (
          <span
            key={j}
            style={{
              fontFamily: r.fontFamily,
              fontSize: r.fontSize,
              fontWeight: r.fontWeight,
              fontStyle: r.italic ? "italic" : undefined,
              textDecoration: r.underline ? "underline" : undefined,
              color: r.color,
              letterSpacing: r.letterSpacing,
            }}
          >
            {r.text}
          </span>
        ))}
      </p>
    );
  });
}

function TextView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: TextElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  const stroke = strokeToCss(el.stroke);
  return (
    <div
      className="slide-el slide-el--text"
      data-selected={selected || undefined}
      data-kind="text"
      style={{
        ...baseStyle(el, offsetX, offsetY),
        ...stroke,
        background: fillToCss(el.fill),
        justifyContent:
          el.verticalAlign === "middle"
            ? "center"
            : el.verticalAlign === "bottom"
              ? "flex-end"
              : "flex-start",
        padding: 4,
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.name ?? "Text"}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(el.id);
        }
      }}
    >
      {renderParagraphs(el.paragraphs)}
    </div>
  );
}

function shapePath(kind: ShapeElement["shape"]): string {
  switch (kind) {
    case "ellipse":
    case "roundRect":
    case "rect":
    case "line":
    case "freeform":
      return "";
    case "triangle":
      return "polygon(50% 0%, 0% 100%, 100% 100%)";
    case "diamond":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon":
      return "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    case "arrow":
      return "polygon(0% 30%, 60% 30%, 60% 0%, 100% 50%, 60% 100%, 60% 70%, 0% 70%)";
    default:
      return "";
  }
}

function ShapeView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: ShapeElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  const stroke = strokeToCss(el.stroke);
  const clip = shapePath(el.shape);
  const isLine = el.shape === "line";

  return (
    <div
      className="slide-el slide-el--shape"
      data-selected={selected || undefined}
      data-kind="shape"
      style={{
        ...baseStyle(el, offsetX, offsetY),
        ...stroke,
        background: isLine ? "transparent" : fillToCss(el.fill),
        borderRadius:
          el.shape === "ellipse"
            ? "50%"
            : el.shape === "roundRect"
              ? el.cornerRadius ?? 12
              : undefined,
        clipPath: clip || undefined,
        boxShadow: shadowToCss(el.shadow),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...(isLine
          ? {
              height: Math.max(el.stroke?.width ?? 2, 2),
              background:
                el.stroke?.color ??
                (el.fill.type === "solid" ? el.fill.color : "#333"),
              top: el.y + el.height / 2 + (offsetY ?? 0),
            }
          : {}),
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.name ?? "Shape"}
    >
      {el.text ? (
        <div style={{ padding: 8, width: "100%" }}>{renderParagraphs(el.text)}</div>
      ) : null}
    </div>
  );
}

function ImageView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: ImageElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  return (
    <div
      className="slide-el slide-el--image"
      data-selected={selected || undefined}
      style={baseStyle(el, offsetX, offsetY)}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.alt ?? el.name ?? "Image"}
    >
      {el.src.startsWith("data:") || el.src.startsWith("http") || el.src.startsWith("/") ? (
        <img src={el.src} alt={el.alt ?? ""} style={{ objectFit: el.objectFit ?? "cover" }} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg,#e8eef5,#d0d8e0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#667",
            fontSize: 14,
          }}
        >
          {el.alt ?? "Image"}
        </div>
      )}
    </div>
  );
}

function TableView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: TableElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  return (
    <div
      className="slide-el slide-el--table"
      data-selected={selected || undefined}
      style={{ ...baseStyle(el, offsetX, offsetY), fontSize: 14 }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.name ?? "Table"}
    >
      <table>
        <tbody>
          {el.cells.map((row, ri) => (
            <tr key={ri} style={{ height: el.rowHeights?.[ri] }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  colSpan={cell.colspan}
                  rowSpan={cell.rowspan}
                  style={{
                    background: fillToCss(cell.fill),
                    textAlign: cell.align ?? "left",
                    fontSize: cell.fontSize,
                    fontWeight: cell.fontWeight,
                    color: cell.color ?? "#111",
                    width: el.columnWidths[ci],
                  }}
                >
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: ChartElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  const maxVal = Math.max(
    1,
    ...el.series.flatMap((s) => s.values),
  );
  const colors = el.series.map(
    (s, i) => s.color ?? ["#1F6FEB", "#3D9B8F", "#E8A838", "#C64545"][i % 4]!,
  );
  const catCount = Math.max(el.categories.length, 1);
  const seriesCount = Math.max(el.series.length, 1);
  const isPie = el.chartType === "pie" || el.chartType === "doughnut";
  const isBar = el.chartType === "bar";

  return (
    <div
      className="slide-el slide-el--chart"
      data-selected={selected || undefined}
      style={baseStyle(el, offsetX, offsetY)}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.title ?? el.name ?? "Chart"}
    >
      {el.title ? (
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{el.title}</div>
      ) : null}
      <svg viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden>
        {isPie ? (
          <PieSvg series={el.series[0]?.values ?? []} colors={colors} doughnut={el.chartType === "doughnut"} />
        ) : (
          <>
            {/* axes */}
            <line x1="40" y1="10" x2="40" y2="190" stroke="#ccc" strokeWidth="1" />
            <line x1="40" y1="190" x2="390" y2="190" stroke="#ccc" strokeWidth="1" />
            {el.categories.map((cat, ci) => {
              const groupW = 340 / catCount;
              const x0 = 40 + ci * groupW;
              return (
                <g key={ci}>
                  <text
                    x={x0 + groupW / 2}
                    y={208}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#666"
                  >
                    {cat.length > 10 ? `${cat.slice(0, 9)}…` : cat}
                  </text>
                  {el.series.map((series, si) => {
                    const v = series.values[ci] ?? 0;
                    const barW = isBar
                      ? (groupW * 0.7) / seriesCount
                      : (groupW * 0.75) / seriesCount;
                    const h = (v / maxVal) * 170;
                    const x = x0 + groupW * 0.15 + si * barW;
                    const y = 190 - h;
                    if (el.chartType === "line" || el.chartType === "area") {
                      return null;
                    }
                    return (
                      <rect
                        key={si}
                        x={x}
                        y={y}
                        width={Math.max(barW - 2, 4)}
                        height={h}
                        fill={colors[si]}
                        rx={2}
                      />
                    );
                  })}
                </g>
              );
            })}
            {(el.chartType === "line" || el.chartType === "area") &&
              el.series.map((series, si) => {
                const pts = el.categories.map((_, ci) => {
                  const groupW = 340 / catCount;
                  const x = 40 + ci * groupW + groupW / 2;
                  const v = series.values[ci] ?? 0;
                  const y = 190 - (v / maxVal) * 170;
                  return `${x},${y}`;
                });
                return (
                  <polyline
                    key={si}
                    fill={el.chartType === "area" ? `${colors[si]}33` : "none"}
                    stroke={colors[si]}
                    strokeWidth="2"
                    points={pts.join(" ")}
                  />
                );
              })}
          </>
        )}
      </svg>
      {el.showLegend !== false ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 11,
            color: "#555",
            marginTop: 4,
          }}
        >
          {el.series.map((s, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: colors[i],
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PieSvg({
  series,
  colors,
  doughnut,
}: {
  series: number[];
  colors: string[];
  doughnut?: boolean;
}) {
  const total = series.reduce((a, b) => a + b, 0) || 1;
  let angle = -Math.PI / 2;
  const cx = 200;
  const cy = 110;
  const r = 80;
  const paths: ReactNode[] = [];
  series.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    paths.push(<path key={i} d={d} fill={colors[i % colors.length]} />);
  });
  return (
    <g>
      {paths}
      {doughnut ? <circle cx={cx} cy={cy} r={40} fill="#fff" /> : null}
    </g>
  );
}

function SmartArtView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
}: {
  el: SmartArtElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  const nodes = el.nodes;
  return (
    <div
      className="slide-el slide-el--smartart"
      data-selected={selected || undefined}
      style={baseStyle(el, offsetX, offsetY)}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.name ?? "Process"}
    >
      {nodes.map((n, i) => (
        <div key={n.id} style={{ display: "contents" }}>
          {i > 0 ? <span className="smartart-arrow">→</span> : null}
          <div
            className="smartart-node"
            style={{
              background: fillToCss(n.style?.fill) !== "transparent" ? fillToCss(n.style?.fill) : "#1F6FEB",
              color: n.style?.color ?? "#fff",
              border: n.style?.stroke
                ? `${n.style.stroke.width}px solid ${n.style.stroke.color}`
                : undefined,
            }}
          >
            {n.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectorView({
  el,
  selected,
  onSelect,
  interactive,
  offsetX = 0,
  offsetY = 0,
}: {
  el: ConnectorElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  offsetX?: number;
  offsetY?: number;
}) {
  const x1 = (el.start.x ?? el.x) + offsetX;
  const y1 = (el.start.y ?? el.y) + offsetY;
  const x2 = (el.end.x ?? el.x + el.width) + offsetX;
  const y2 = (el.end.y ?? el.y + el.height) + offsetY;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 4);
  const h = Math.max(Math.abs(y2 - y1), 4);

  return (
    <div
      className="slide-el slide-el--connector"
      data-selected={selected || undefined}
      style={{
        left: minX,
        top: minY,
        width: w,
        height: h,
        zIndex: el.zIndex ?? 0,
        opacity: el.opacity ?? 1,
        overflow: "visible",
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={el.name ?? "Connector"}
    >
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <line
          x1={x1 - minX}
          y1={y1 - minY}
          x2={x2 - minX}
          y2={y2 - minY}
          stroke={el.stroke.color}
          strokeWidth={el.stroke.width}
          strokeDasharray={
            el.stroke.dash === "dashed"
              ? "8 4"
              : el.stroke.dash === "dotted"
                ? "2 3"
                : undefined
          }
        />
      </svg>
    </div>
  );
}

function GroupView({
  el,
  selected,
  onSelect,
  interactive,
  selectedId,
  offsetX = 0,
  offsetY = 0,
}: {
  el: GroupElement;
  selected: boolean;
  onSelect: (id: string) => void;
  interactive: boolean;
  selectedId: string | null;
  offsetX?: number;
  offsetY?: number;
}) {
  return (
    <div
      className="slide-el slide-el--group"
      data-selected={selected || undefined}
      style={{
        ...baseStyle(el, offsetX, offsetY),
        overflow: "visible",
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(el.id);
      }}
    >
      {el.children.map((child) => (
        <SlideElementView
          key={child.id}
          element={child}
          selected={selectedId === child.id}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={0}
          offsetY={0}
        />
      ))}
    </div>
  );
}

export function SlideElementView({
  element,
  selected,
  onSelect,
  interactive,
  offsetX,
  offsetY,
  selectedId = null,
}: Props & { selectedId?: string | null }) {
  switch (element.kind) {
    case "text":
      return (
        <TextView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "shape":
      return (
        <ShapeView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "image":
      return (
        <ImageView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "table":
      return (
        <TableView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "chart":
      return (
        <ChartView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "smartart":
      return (
        <SmartArtView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "connector":
      return (
        <ConnectorView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    case "group":
      return (
        <GroupView
          el={element}
          selected={selected}
          onSelect={onSelect}
          interactive={interactive}
          selectedId={selectedId}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      );
    default:
      return null;
  }
}
