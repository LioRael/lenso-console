import { useConsoleLocale } from "@lenso/console-package-api";
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
  { id: "waterfall", label: "Waterfall", icon: List },
  { id: "flame", label: "Flame", icon: Flame },
  { id: "heatmap", label: "Heatmap", icon: Grid3X3 },
];

export function StoryTabs({
  mode,
  onChange,
}: {
  mode: StoryViewMode;
  onChange: (mode: StoryViewMode) => void;
}) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  return (
    <div className="min-w-0 border-b border-(--line) bg-(--bg-panel-header)">
      <HorizontalTabScroll>
        <div className="lenso-ui-tabs__list h-full w-max min-w-full border-b-0 px-1">
          {labels.map(({ icon: Icon, id, label }) => (
            <button
              aria-selected={mode === id}
              className={cn(
                "lenso-ui-tabs__tab h-full min-h-0 shrink-0 text-[11px]",
                mode === id && "text-(--fg-primary)"
              )}
              key={id}
              onClick={() => onChange(id)}
              role="tab"
              type="button"
            >
              <Icon size={12} strokeWidth={1.75} />
              {zh ? storyTabZh[id] : label}
            </button>
          ))}
        </div>
      </HorizontalTabScroll>
    </div>
  );
}

const storyTabZh: Record<StoryViewMode, string> = {
  story: "故事",
  graph: "图谱",
  timeline: "时间线",
  waterfall: "瀑布图",
  flame: "火焰图",
  heatmap: "热力图",
};
