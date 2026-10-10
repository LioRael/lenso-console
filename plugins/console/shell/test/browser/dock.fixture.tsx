import { Tooltip } from "@lenso/ui/tooltip";
import { Check, Copy, Folder, Rows3 } from "lucide-react";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import "../../src/styles.css";
import { ConsoleAppearanceProvider } from "../../src/app/console-appearance";
import {
  ConsoleDock,
  type Position,
} from "../../src/components/console/console-dock";

const items = [
  {
    id: "collection",
    label: "集合",
    icon: <Folder size={16} aria-hidden="true" />,
  },
  {
    id: "entries",
    label: "条目",
    icon: <Rows3 size={16} aria-hidden="true" />,
  },
];

function DockFixture() {
  const [activeId, setActiveId] = useState("collection");
  const [selected, setSelected] = useState<boolean[]>([false, false]);
  const [instant, setInstant] = useState(false);
  const [compact, setCompact] = useState(false);
  const [visible, setVisible] = useState(true);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState<Position>("bottom");
  const [invoked, setInvoked] = useState("");
  const dockRef = useRef<HTMLDivElement>(null);
  const selectionFocus = useRef<HTMLInputElement | null>(null);
  const count = selected.filter(Boolean).length;

  return (
    <div
      onPointerDownCapture={() => setInstant(false)}
      onKeyDownCapture={() => setInstant(true)}
    >
      {items.map((item) => (
        <button key={item.id} onClick={() => setActiveId(item.id)}>
          切换到{item.label}
        </button>
      ))}
      {selected.map((checked, index) => (
        <label key={index}>
          <input
            type="checkbox"
            checked={checked}
            onFocus={(event) => {
              selectionFocus.current = event.currentTarget;
            }}
            onChange={(event) => {
              const next = [...selected];
              next[index] = event.target.checked;
              setSelected(next);
            }}
          />
          选择条目{index + 1}
        </label>
      ))}
      <button onClick={() => setCompact(!compact)}>切换紧凑导航</button>
      <button onClick={() => setVisible(!visible)}>切换可见性</button>
      <button onClick={() => setRunning(!running)}>切换执行状态</button>
      <select
        aria-label="导航位置"
        value={position}
        onChange={(event) => setPosition(event.target.value as Position)}
      >
        {(["bottom", "top", "left", "right"] as const).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <output aria-label="执行结果">{invoked}</output>
      <ConsoleDock
        visible={visible}
        position={position}
        compact={compact}
        activeId={activeId}
        items={items}
        running={running}
        instant={instant}
        dockRef={dockRef}
        onNavigate={setActiveId}
        onExpand={() => setCompact(false)}
        onFocusDock={() => undefined}
        selection={
          count
            ? {
                count,
                scopeLabel: "所选条目",
                running,
                actions: [
                  {
                    id: "copy",
                    label: "复制",
                    tooltip: "复制所选条目",
                    icon: <Copy size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("复制"),
                  },
                  {
                    id: "check",
                    label: "检查",
                    icon: <Check size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("检查"),
                  },
                  {
                    id: "open",
                    label: "打开",
                    icon: <Folder size={16} aria-hidden="true" />,
                    onInvoke: () => setInvoked("打开"),
                  },
                ],
                onExit: () => {
                  setSelected([false, false]);
                  selectionFocus.current?.focus();
                },
              }
            : null
        }
      />
    </div>
  );
}

export function mountDock() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <ConsoleAppearanceProvider>
        <Tooltip.Provider delay={150}>
          <DockFixture />
        </Tooltip.Provider>
      </ConsoleAppearanceProvider>
    )
  );
}
