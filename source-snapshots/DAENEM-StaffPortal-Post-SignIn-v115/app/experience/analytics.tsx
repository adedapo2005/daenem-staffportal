"use client";
import { WorldClockCenter, LocationWeather } from "./technology";
import { useId, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ScatterChart,
  Scatter,
  Treemap,
  Brush,
  Legend,
} from "recharts";
import { useLab } from "./lab-context";
import { byId, recordsFor, fieldAccess, type RecordData } from "./model";
import {
  metricValue,
  metricCatalog,
  type ConfigVersion,
} from "./enterprise-contract";
import { activeConfigurations } from "./config-runtime";
import { useDeviceState } from "./device-state";
import { Panel, Pick, Btn, Empty, Metric, DownloadCSV } from "./ui";
export const chartKinds = [
  "Bar",
  "Horizontal bar",
  "Line",
  "Area",
  "Donut",
  "Pie",
  "Radar",
  "Scatter",
  "Treemap",
  "Heatmap",
  "Gauge",
  "KPI",
  "Table",
];
export function RecordChart({
  rows,
  kind = "Bar",
  metric = "record-count",
  group = "status",
  onSelect,
}: {
  rows: RecordData[];
  kind?: string;
  metric?: string;
  group?: string;
  onSelect?: (rows: RecordData[]) => void;
}) {
  const { prefs } = useLab();
  const id = useId().replaceAll(":", "");
  const [excluded, setExcluded] = useState<string[]>([]);
  const groups = [
    ...new Set(
      rows.map((r) =>
        group === "company"
          ? r.company
          : group === "owner"
            ? r.owner
            : r.status,
      ),
    ),
  ];
  const data = groups.map((name) => ({
    name,
    value: metricValue(
      rows.filter(
        (r) =>
          (group === "company"
            ? r.company
            : group === "owner"
              ? r.owner
              : r.status) === name,
      ),
      metric,
    ),
    count: rows.filter(
      (r) =>
        (group === "company"
          ? r.company
          : group === "owner"
            ? r.owner
            : r.status) === name,
    ).length,
  }));
  const visible = data.filter((d) => !excluded.includes(d.name)),
    colors = ["#2b958a", "#5f84db", "#bd945c", "#8265b9", "#679e73", "#bc7883"];
  const animate =
    prefs.motion !== "Off" &&
    !(
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  const click = (name: string) =>
    onSelect?.(
      rows.filter(
        (r) =>
          (group === "company"
            ? r.company
            : group === "owner"
              ? r.owner
              : r.status) === name,
      ),
    );
  if (!rows.length) return <Empty title="No authorized chart data" />;
  const total = visible.reduce((s, d) => s + d.value, 0);
  if (kind === "KPI")
    return (
      <Metric
        label={metricCatalog.find((m) => m.id === metric)?.name || metric}
        value={String(total)}
        detail="Current authorized records"
      />
    );
  if (kind === "Table")
    return (
      <div className="tech-chart-table">
        {visible.map((d) => (
          <button key={d.name} onClick={() => click(d.name || "")}>
            <span>{d.name}</span>
            <strong>{d.value}</strong>
          </button>
        ))}
      </div>
    );
  if (kind === "Heatmap")
    return (
      <div className="tech-heatmap">
        {visible.map((d) => (
          <button
            key={d.name}
            onClick={() => click(d.name)}
            style={{
              background: `color-mix(in srgb,var(--p-accent) ${15 + (70 * d.value) / Math.max(1, ...visible.map((v) => v.value))}%,var(--p-surface))`,
            }}
          >
            <strong>{d.value}</strong>
            <span>{d.name}</span>
          </button>
        ))}
      </div>
    );
  if (kind === "Gauge") {
    const complete = rows.filter((r) =>
        /^(Complete|Closed|Done|Paid|Reconciled)$/.test(r.status),
      ).length,
      pct = Math.round((complete / rows.length) * 100);
    return (
      <div
        className="tech-stat-ring"
        style={{ "--progress": pct + "%" } as React.CSSProperties}
      >
        <strong>{pct}%</strong>
        <small>
          {complete}/{rows.length} completed
        </small>
      </div>
    );
  }
  return (
    <>
      <div
        className="tech-chart"
        role="group"
        aria-label={kind + " of " + metric + " by " + group}
      >
        <ResponsiveContainer width="100%" height={290}>
          {kind === "Donut" || kind === "Pie" ? (
            <PieChart accessibilityLayer={false}>
              <Pie
                data={visible}
                dataKey="value"
                nameKey="name"
                innerRadius={kind === "Donut" ? 65 : 0}
                outerRadius={105}
                paddingAngle={2}
                isAnimationActive={animate}
                onClick={(d) => click(d.name || "")}
              >
                {visible.map((d, i) => (
                  <Cell key={d.name} fill={colors[i % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--p-surface)",
                  color: "var(--p-ink)",
                  border: "1px solid var(--p-line)",
                  borderRadius: 12,
                }}
              />
            </PieChart>
          ) : kind === "Radar" ? (
            <RadarChart data={visible} accessibilityLayer={false}>
              <PolarGrid stroke="var(--p-line)" />
              <PolarAngleAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--p-muted)" }}
              />
              <Radar
                dataKey="value"
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.25}
                isAnimationActive={animate}
              />
              <Tooltip />
            </RadarChart>
          ) : kind === "Scatter" ? (
            <ScatterChart accessibilityLayer={false}>
              <CartesianGrid stroke="var(--p-line)" />
              <XAxis dataKey="count" type="number" name="Records" />
              <YAxis dataKey="value" type="number" name={metric} />
              <Scatter
                data={visible}
                fill={colors[0]}
                isAnimationActive={animate}
              />
              <Tooltip />
            </ScatterChart>
          ) : kind === "Treemap" ? (
            <Treemap
              data={visible}
              dataKey="value"
              nameKey="name"
              stroke="var(--p-surface)"
              fill={colors[0]}
              isAnimationActive={animate}
            />
          ) : (
            <ComposedChart
              accessibilityLayer={false}
              data={visible}
              layout={kind === "Horizontal bar" ? "vertical" : "horizontal"}
              onClick={(state) => {
                if (state.activeLabel) click(String(state.activeLabel));
              }}
              margin={{ left: 5, right: 15, top: 15, bottom: 5 }}
            >
              <defs>
                <linearGradient id={"chart-" + id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={colors[0]} stopOpacity={0.45} />
                  <stop offset="1" stopColor={colors[0]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--p-line)"
                strokeDasharray="3 5"
              />
              <XAxis
                type={kind === "Horizontal bar" ? "number" : "category"}
                dataKey={kind === "Horizontal bar" ? undefined : "name"}
                tick={{ fontSize: 11, fill: "var(--p-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type={kind === "Horizontal bar" ? "category" : "number"}
                dataKey={kind === "Horizontal bar" ? "name" : undefined}
                width={kind === "Horizontal bar" ? 95 : 38}
                tick={{ fontSize: 10, fill: "var(--p-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--p-surface)",
                  color: "var(--p-ink)",
                  border: "1px solid var(--p-line)",
                  borderRadius: 12,
                }}
              />
              {kind === "Line" ? (
                <Line
                  dataKey="value"
                  stroke={colors[0]}
                  strokeWidth={3}
                  isAnimationActive={animate}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              ) : kind === "Area" ? (
                <Area
                  dataKey="value"
                  stroke={colors[0]}
                  strokeWidth={3}
                  fill={"url(#chart-" + id + ")"}
                  isAnimationActive={animate}
                />
              ) : (
                <Bar
                  dataKey="value"
                  fill={colors[0]}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={64}
                  isAnimationActive={animate}
                />
              )}
              <Brush
                dataKey="name"
                height={18}
                stroke="var(--p-line)"
                fill="var(--p-surface)"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="tech-chart-legend">
        {data.map((d, i) => (
          <button
            key={d.name}
            aria-pressed={!excluded.includes(d.name)}
            onClick={() =>
              setExcluded((x) =>
                x.includes(d.name)
                  ? x.filter((n) => n !== d.name)
                  : [...x, d.name],
              )
            }
          >
            <i style={{ background: colors[i % colors.length] }} />
            {d.name} <strong>{d.value}</strong>
          </button>
        ))}
      </div>
      <details className="tech-chart-data">
        <summary>Accessible data & drill-down</summary>
        {visible.map((d) => (
          <button key={d.name} onClick={() => click(d.name || "")}>
            {d.name}: {d.value}
          </button>
        ))}
      </details>
    </>
  );
}
export function PublishedWidgets() {
  const { session, records, open } = useLab();
  const [versions] = useDeviceState<ConfigVersion[]>(
    "governed-widget-builder-" + session.company,
    [],
  );
  return (
    <>
      {activeConfigurations(versions, session).map((v) => {
        const rows = recordsFor(records, byId(v.target)!, session);
        return (
          <Panel key={v.id} title={v.name}>
            <WidgetPreview
              rows={rows}
              definition={v.definition}
              onSelect={(selected) => selected[0] && open(selected[0])}
            />
          </Panel>
        );
      })}
    </>
  );
}

export function WidgetPreview({
  rows,
  definition,
  onSelect,
}: {
  rows: RecordData[];
  definition: Record<string, string>;
  onSelect?: (rows: RecordData[]) => void;
}) {
  const type = definition.widgetType || "Chart";
  if (type === "Clock")
    return (
      <WorldClockCenter
        ids={["ibadan", "london", "toronto"]}
        style="Both"
        compact
      />
    );
  if (type === "Weather") return <LocationWeather compact />;
  if (type === "Queue" || type === "Activity")
    return (
      <div className="tech-chart-table">
        {rows.slice(0, 8).map((r) => (
          <button key={r.id} onClick={() => onSelect?.([r])}>
            <span>
              {r.title}
              <small>
                {type === "Activity" ? r.history.at(-1)?.action : r.status}
              </small>
            </span>
            <strong>{r.due}</strong>
          </button>
        ))}
      </div>
    );
  if (type === "Calendar")
    return (
      <div className="tech-widget-calendar">
        {rows.slice(0, 8).map((r) => (
          <button key={r.id} onClick={() => onSelect?.([r])}>
            <time>{r.due}</time>
            <strong>{r.title}</strong>
            <small>{r.status}</small>
          </button>
        ))}
      </div>
    );
  return (
    <RecordChart
      rows={rows}
      kind={
        type === "KPI"
          ? "KPI"
          : type === "Table"
            ? "Table"
            : type === "Gauge"
              ? "Gauge"
              : definition.visualization
      }
      metric={definition.metric}
      onSelect={onSelect}
    />
  );
}
