import { IconButton } from "@lenso/ui/icon-button";
import * as stylex from "@stylexjs/stylex";
import { Paperclip, X, FileText } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { agentApiUrl, agentHeaders, type AgentTarget } from "./agent-runtime";

export type AgentAttachment = {
  name: string;
  media_type: string;
  data_base64?: string;
  handle?: string;
  digest?: string;
  size?: string;
};
const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_TEXT = 128 * 1024;
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function prepareAttachment(file: File): Promise<AgentAttachment> {
  if (!file.size || file.name.length > 256) {
    throw new Error(
      "Choose a non-empty file with a name under 256 characters."
    );
  }
  if (imageTypes.has(file.type)) {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("Choose an image smaller than 20 MiB.");
    }
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Image preview is unavailable.");
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob || blob.size > MAX_IMAGE) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", 0.85)
        );
      }
      if (!blob || blob.size > MAX_IMAGE) {
        throw new Error(
          "This image is still over 2 MiB after resizing. Choose a smaller image."
        );
      }
      return {
        name: file.name,
        media_type: blob.type,
        data_base64: await base64(blob),
      };
    } finally {
      bitmap.close();
    }
  }
  if (file.size > MAX_TEXT) {
    throw new Error("Text attachments must be at most 128 KiB.");
  }
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Only PNG, JPEG, WebP and UTF-8 text files are supported.");
  }
  if (
    text.includes("\0") ||
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/")
  ) {
    throw new Error("Only PNG, JPEG, WebP and UTF-8 text files are supported.");
  }
  return {
    name: file.name,
    media_type: "text/plain",
    data_base64: await base64(file),
  };
}
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => resolve(String(reader.result).split(",")[1] ?? ""),
      { once: true }
    );
    reader.addEventListener(
      "error",
      () => reject(new Error("Could not read attachment.")),
      { once: true }
    );
    reader.readAsDataURL(blob);
  });
}
export async function loadAttachment(
  item: AgentAttachment,
  sessionId: string | undefined,
  targetId: AgentTarget,
  signal?: AbortSignal
): Promise<AgentAttachment> {
  if (item.data_base64) {
    return item;
  }
  if (!sessionId || !item.digest) {
    throw new Error("Attachment is unavailable.");
  }
  const response = await fetch(
    agentApiUrl(
      targetId,
      `sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(item.digest.replace(/^sha256:/u, ""))}`
    ),
    {
      headers: agentHeaders("application/json", false),
      ...(signal ? { signal } : {}),
    }
  );
  if (!response.ok) {
    throw new Error("Attachment is missing, expired, or unavailable.");
  }
  const body = await response.json();
  if (typeof body.data_base64 !== "string") {
    throw new TypeError("Invalid attachment response.");
  }
  return { ...item, data_base64: body.data_base64 };
}
export function useAttachmentDraft(targetId: AgentTarget, sessionId?: string) {
  const [items, setItems] = useState<AgentAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string>();
  const generation = useRef(0);
  const processing = useRef(false);
  const clear = useCallback(() => {
    generation.current += 1;
    processing.current = false;
    setBusy(false);
    setItems([]);
    setAttachmentError(undefined);
  }, []);
  useEffect(() => {
    clear();
    return () => {
      generation.current += 1;
    };
  }, [targetId, clear]);
  const prepare = async (
    work: () => Promise<AgentAttachment[]>,
    replace = false
  ) => {
    if (processing.current) {
      return;
    }
    const token = generation.current;
    processing.current = true;
    setBusy(true);
    setAttachmentError(undefined);
    try {
      const added = await work();
      if (token === generation.current) {
        setItems((current) => (replace ? added : [...current, ...added]));
      }
    } catch (error) {
      if (token === generation.current) {
        setAttachmentError(
          error instanceof Error
            ? error.message
            : "Could not prepare attachment."
        );
      }
    } finally {
      if (token === generation.current) {
        processing.current = false;
        setBusy(false);
      }
    }
  };
  return {
    items,
    busy,
    error: attachmentError,
    clear,
    sessionId,
    targetId,
    add: (files: File[]) => {
      if (items.length + files.length > 4) {
        setAttachmentError("Attach up to four files per message.");
        return;
      }
      void prepare(() => Promise.all(files.map(prepareAttachment)));
    },
    restore: (files: AgentAttachment[]) => {
      clear();
      setItems(files);
      return prepare(
        () =>
          Promise.all(
            files.map((file) => loadAttachment(file, sessionId, targetId))
          ),
        true
      );
    },
    remove: (index: number) =>
      setItems((current) => current.filter((_, i) => i !== index)),
  };
}
export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>;
const Context = createContext<AttachmentDraft | null>(null);
export const AgentAttachmentProvider = Context.Provider;
export const useAgentAttachments = () => useContext(Context);
export function AttachmentButton() {
  const state = useAgentAttachments();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        aria-label="Choose attachments"
        accept="image/png,image/jpeg,image/webp,text/*,.md,.json,.yaml,.yml,.toml,.rs,.ts,.tsx,.js,.py,.log,.csv"
        hidden
        onChange={(event) => {
          state?.add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <IconButton
        aria-label="Attach images or text files"
        size="compact"
        variant="ghost"
        disabled={Boolean(state?.busy)}
        onClick={() => input.current?.click()}
      >
        <Paperclip size={14} />
      </IconButton>
    </>
  );
}
export function AttachmentDropZone({ children }: PropsWithChildren) {
  const state = useAgentAttachments();
  return (
    <div
      {...stylex.props(styles.drop)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          state?.add(Array.from(event.dataTransfer.files));
        }
      }}
      onPasteCapture={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          state?.add(files);
        }
      }}
    >
      {children}
    </div>
  );
}
export function DraftAttachments() {
  const state = useAgentAttachments();
  return (
    <>
      <div {...stylex.props(styles.list)}>
        {state?.items.map((item, index) => (
          <span key={`${index}-${item.name}`} {...stylex.props(styles.chip)}>
            {imageTypes.has(item.media_type) ? (
              <img
                {...stylex.props(styles.thumb)}
                src={`data:${item.media_type};base64,${item.data_base64}`}
                alt=""
              />
            ) : (
              <FileText size={14} />
            )}
            <span {...stylex.props(styles.name)}>{item.name}</span>
            <IconButton
              aria-label={`Remove ${item.name}`}
              size="compact"
              variant="ghost"
              onClick={() => state.remove(index)}
            >
              <X size={12} />
            </IconButton>
          </span>
        ))}
      </div>
      {state?.busy ? <output>Preparing attachments…</output> : null}
      {state?.error ? <small role="alert">{state.error}</small> : null}
    </>
  );
}
export function MessageAttachments({
  items,
}: {
  items?: AgentAttachment[] | undefined;
}) {
  return (
    <div {...stylex.props(styles.list)}>
      {items?.map((item, index) => (
        <StoredAttachment
          key={`${item.digest ?? index}-${item.name}`}
          item={item}
        />
      ))}
    </div>
  );
}
function StoredAttachment({ item }: { item: AgentAttachment }) {
  const state = useAgentAttachments();
  const [resolved, setResolved] = useState(item);
  const [attachmentError, setAttachmentError] = useState<string>();
  const sessionId = state?.sessionId;
  const targetId = state?.targetId;
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      if (targetId && imageTypes.has(item.media_type)) {
        try {
          const result = await loadAttachment(
            item,
            sessionId,
            targetId,
            controller.signal
          );
          if (!controller.signal.aborted) {
            setResolved(result);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setAttachmentError(
              error instanceof Error ? error.message : "Attachment unavailable"
            );
          }
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [item, sessionId, targetId]);
  return (
    <span {...stylex.props(styles.chip)} title={attachmentError ?? item.name}>
      {imageTypes.has(item.media_type) && resolved.data_base64 ? (
        <img
          {...stylex.props(styles.preview)}
          src={`data:${item.media_type};base64,${resolved.data_base64}`}
          alt={item.name}
        />
      ) : (
        <>
          <FileText size={14} />
          <span {...stylex.props(styles.name)}>{item.name}</span>
        </>
      )}
      {attachmentError ? <output>Unavailable</output> : null}
    </span>
  );
}
const styles = stylex.create({
  drop: { display: "contents" },
  list: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    maxWidth: "100%",
    ":empty": { display: "none" },
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    borderRadius: "10px",
    backgroundColor: "var(--color-surface-subtle)",
    color: "var(--color-content-secondary)",
    fontSize: "12px",
    maxWidth: "100%",
  },
  name: {
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  thumb: {
    width: "32px",
    height: "32px",
    objectFit: "cover",
    borderRadius: "5px",
  },
  preview: {
    maxWidth: "240px",
    maxHeight: "180px",
    objectFit: "contain",
    borderRadius: "6px",
  },
});
