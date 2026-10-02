import { cn } from "@/lib/utils";

/** Intro / ambient circular bokeh orbs — matches warm cream video open. */
export function BokehField({ className }: { className?: string }) {
  const orbs = [
    { t: "8%", l: "12%", s: 120, c: "rgba(255,210,150,0.55)", d: "0s", a: "animate-bokeh" },
    { t: "22%", l: "38%", s: 90, c: "rgba(255,180,120,0.4)", d: "0.6s", a: "animate-bokeh-alt" },
    { t: "55%", l: "18%", s: 160, c: "rgba(255,200,140,0.45)", d: "1.2s", a: "animate-bokeh" },
    { t: "40%", l: "70%", s: 200, c: "rgba(255,190,130,0.35)", d: "0.3s", a: "animate-bokeh-alt" },
    { t: "70%", l: "55%", s: 110, c: "rgba(255,220,170,0.5)", d: "1.8s", a: "animate-bokeh" },
    { t: "15%", l: "78%", s: 70, c: "rgba(255,170,100,0.45)", d: "0.9s", a: "animate-bokeh-alt" },
    { t: "78%", l: "80%", s: 140, c: "rgba(255,200,150,0.35)", d: "1.4s", a: "animate-bokeh" },
    { t: "48%", l: "45%", s: 50, c: "rgba(255,230,190,0.6)", d: "0.2s", a: "animate-bokeh-alt" },
  ] as const;

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#f3e7d4_0%,#e8dcc8_45%,#d9cbb8_100%)]" />
      {orbs.map((o, i) => (
        <span
          key={i}
          className={cn("absolute rounded-full blur-2xl", o.a)}
          style={{
            top: o.t,
            left: o.l,
            width: o.s,
            height: o.s,
            background: o.c,
            animationDelay: o.d,
          }}
        />
      ))}
    </div>
  );
}

/** Blue moon circle used on methodology / cover slides. */
export function MoonDisc({
  size = 160,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-[-18%] rounded-full animate-pulse-glow"
        style={{
          background: "radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(59,130,246,0) 70%)",
        }}
      />
      <div
        className="relative overflow-hidden rounded-full shadow-[0_0_40px_rgba(37,99,235,0.45)]"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at 35% 30%, #93c5fd 0%, #3b82f6 38%, #1d4ed8 72%, #1e3a8a 100%)",
        }}
      >
        {/* crater texture */}
        <span className="absolute left-[18%] top-[28%] h-[18%] w-[18%] rounded-full bg-blue-900/25" />
        <span className="absolute right-[22%] top-[42%] h-[12%] w-[12%] rounded-full bg-blue-900/20" />
        <span className="absolute bottom-[24%] left-[32%] h-[14%] w-[20%] rounded-full bg-blue-950/20" />
        <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.35)_0%,transparent_40%)]" />
      </div>
      {label ? (
        <span className="absolute -bottom-6 text-[10px] font-medium tracking-wide text-muted">{label}</span>
      ) : null}
    </div>
  );
}

/**
 * HTS / Tokamak concentric circular system — primary circular visual from the video.
 * Outer dashed orbit rings + glowing cyan core with "HTS" label.
 */
export function HtsConcentricRing({
  size = 280,
  className,
  animate = true,
}: {
  size?: number;
  className?: string;
  animate?: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div
      className={cn("relative", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label="HTS concentric ring diagram"
    >
      {/* ambient glow */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
          animate && "animate-pulse-glow",
        )}
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background: "radial-gradient(circle, rgba(34,211,238,0.55) 0%, rgba(34,211,238,0) 70%)",
        }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        {/* outer soft ring */}
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.46}
          fill="none"
          stroke="rgba(148,163,184,0.35)"
          strokeWidth="1.5"
          className={animate ? "ring-dash-slow" : undefined}
        />
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.4}
          fill="none"
          stroke="rgba(100,116,139,0.45)"
          strokeWidth="1"
          className={animate ? "ring-dash" : undefined}
        />
        {/* mid structure rings */}
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.32}
          fill="none"
          stroke="rgba(34,211,238,0.35)"
          strokeWidth="8"
          opacity={0.5}
        />
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.28}
          fill="none"
          stroke="rgba(14,165,233,0.55)"
          strokeWidth="2"
        />
        {/* tick marks around mid ring */}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r1 = size * 0.335;
          const r2 = size * 0.355;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="rgba(56,189,248,0.7)"
              strokeWidth="1.5"
            />
          );
        })}
        {/* inner coil arcs */}
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.2}
          fill="none"
          stroke="rgba(6,182,212,0.65)"
          strokeWidth="10"
          strokeDasharray="18 8"
          className={animate ? "animate-ring-spin origin-center" : undefined}
          style={{ transformOrigin: "center" }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={size * 0.155}
          fill="none"
          stroke="rgba(103,232,249,0.5)"
          strokeWidth="4"
          className={animate ? "animate-ring-reverse origin-center" : undefined}
          style={{ transformOrigin: "center" }}
        />
      </svg>

      {/* glowing core */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
          animate && "animate-core-breathe",
        )}
        style={{
          width: size * 0.22,
          height: size * 0.22,
          background:
            "radial-gradient(circle at 40% 35%, #ecfeff 0%, #67e8f9 35%, #06b6d4 70%, #0e7490 100%)",
        }}
      >
        <span className="text-[11px] font-bold tracking-[0.12em] text-slate-900/80 sm:text-xs">
          HTS
        </span>
      </div>
    </div>
  );
}

/** Circular readiness / status badge used in SmartArt matrix. */
export function StatusBadge({
  label,
  tone = "green",
  pulse = false,
  className,
}: {
  label: string;
  tone?: "green" | "amber" | "blue" | "slate";
  pulse?: boolean;
  className?: string;
}) {
  const tones = {
    green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-100 text-amber-800 ring-amber-200",
    blue: "bg-sky-100 text-sky-700 ring-sky-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
        tones[tone],
        pulse && "animate-badge-pulse",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "green" && "bg-emerald-500",
          tone === "amber" && "bg-amber-500",
          tone === "blue" && "bg-sky-500",
          tone === "slate" && "bg-slate-400",
        )}
      />
      {label}
    </span>
  );
}

/** Kimi logo mark — rounded square with circular K. */
export function KimiMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[22%] bg-fg text-surface shadow-soft",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="font-bold leading-none tracking-tight"
        style={{ fontSize: size * 0.48 }}
      >
        K
      </span>
    </div>
  );
}

/** SMART CONNECTIONS circular brand mark from agent result card. */
export function SmartConnectionsMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-[0_8px_24px_rgba(37,99,235,0.35)]",
        className,
      )}
    >
      <div className="absolute inset-1 rounded-full border border-white/30" />
      <div className="absolute inset-2.5 rounded-full border border-dashed border-white/40 animate-ring-spin" />
      <span className="relative text-[10px] font-bold tracking-wide text-white">SC</span>
    </div>
  );
}
