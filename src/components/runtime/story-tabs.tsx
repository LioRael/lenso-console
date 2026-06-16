import { Flame, GitBranch, Grid3X3, List, Workflow } from "lucide-react";

import { cn } from "../../lib/cn";
import { HorizontalTabScroll } from "./horizontal-tab-scroll";

export type StoryViewMode =
  | "story"
  | "graph"
  | "timeline"
  | "waterfall"
  | "flame"
  | "heatmap";

const labels: Array<{
  id: StoryViewMode;
  label: string;
  icon: React.ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
  }>;
}> = [
  { id: "story", label: "Story", icon: Workflow },
  { id: "graph", label: "Graph", icon: GitBranch },
  { id: "timeline", label: "Timeline", icon: Workflow },
  { id: "heatmap", label: "Heatmap", icon: Grid3X3 },
  { id: "waterfall", label: "Waterfall", icon: List },
  { id: "flame", label: "Flame", icon: Flame },
];

export function StoryTabs({
  mode,
  onChange,
}: {
  mode: StoryViewMode;
  onChange: (mode: StoryViewMode) => void;
}) {
  return (
    <div className="min-w-0 border-b border-(--line) bg-(--bg-panel-header)">
      <HorizontalTabScroll>
        <div className="flex h-full w-max min-w-full items-center gap-1 px-2">
          {labels.map(({ icon: Icon, id, label }) => (
            <button
              className={cn(
                "relative flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] px-2 text-[11px] font-medium transition-colors",
                mode === id
                  ? "native-selection"
                  : "text-(--fg-tertiary) hover:bg-(--bg-row-hover) hover:text-(--fg-primary)"
              )}
              key={id}
              onClick={() => onChange(id)}
              type="button"
            >
              <Icon
                {...(mode === id ? { className: "text-(--accent)" } : {})}
                size={12}
                strokeWidth={1.75}
              />
              {label}
            </button>
          ))}
        </div>
      </HorizontalTabScroll>
    </div>
  );
}
