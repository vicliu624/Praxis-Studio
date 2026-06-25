import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";

export interface CodeBlockPreviewProps {
  code: string;
  title?: string;
  meta?: string;
  language?: string;
  maxHeight?: number;
  wrap?: boolean;
  className?: string;
}

export interface CodeBlockPreviewPopoverProps extends CodeBlockPreviewProps {
  triggerLabel: string;
  pinLabel?: string;
  unpinLabel?: string;
}

export function CodeBlockPreview({
  code,
  title,
  meta,
  language,
  maxHeight,
  wrap = false,
  className
}: CodeBlockPreviewProps) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const style = maxHeight
    ? ({ "--code-block-preview-max-height": `${maxHeight}px` } as CSSProperties)
    : undefined;
  const classes = [
    "code-block-preview",
    wrap ? "code-block-preview-wrap" : "",
    className ?? ""
  ].filter(Boolean).join(" ");

  return (
    <figure className={classes} style={style}>
      {title || meta ? (
        <figcaption>
          {title ? <strong>{title}</strong> : <span />}
          {meta ? <span>{meta}</span> : null}
        </figcaption>
      ) : null}
      <pre><code className={language ? `language-${language}` : undefined}>{trimmed}</code></pre>
    </figure>
  );
}

export function CodeBlockPreviewPopover({
  triggerLabel,
  pinLabel = "Pin",
  unpinLabel = "Unpin",
  className,
  ...previewProps
}: CodeBlockPreviewPopoverProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const closeTimerRef = useRef<number | undefined>(undefined);
  const trimmed = previewProps.code.trim();
  const open = pinned || hovered;
  const classes = [
    "code-block-preview-popover",
    pinned ? "is-pinned" : "",
    open ? "is-open" : "",
    className ?? ""
  ].filter(Boolean).join(" ");

  function clearCloseTimer() {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }

  function openFloating() {
    clearCloseTimer();
    setHovered(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setHovered(false), 160);
  }

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    scheduleClose();
  }

  useEffect(() => () => clearCloseTimer(), []);

  if (!trimmed) return null;

  return (
    <span
      className={classes}
      onMouseEnter={openFloating}
      onMouseLeave={scheduleClose}
      onFocus={openFloating}
      onBlur={handleBlur}
    >
      <button
        className="code-block-preview-trigger"
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setPinned((current) => !current);
        }}
      >
        {triggerLabel}
      </button>
      <span className="code-block-preview-floating" role="tooltip">
        <span className="code-block-preview-floating-heading">
          <strong>{previewProps.title ?? triggerLabel}</strong>
          <button
            className="secondary-action compact-action"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPinned((current) => !current);
            }}
          >
            {pinned ? unpinLabel : pinLabel}
          </button>
        </span>
        <CodeBlockPreview {...previewProps} title={undefined} className="code-block-preview-in-popover" />
      </span>
    </span>
  );
}
