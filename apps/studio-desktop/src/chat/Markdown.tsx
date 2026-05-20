import { useMemo } from "react";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className="markdown-body"
      style={{ lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre style="background:#0d1117;border:1px solid #1a2332;border-radius:6px;padding:10px 14px;overflow-x:auto;font-size:12px;margin:8px 0"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Inline code (`)
  html = html.replace(/`([^`]+)`/g, '<code style="background:#1a2332;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>');

  // Bold (**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers (###)
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:10px 0 4px;color:#e8edf2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:600;margin:12px 0 4px;color:#e8edf2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:16px;font-weight:700;margin:14px 0 6px;color:#e8edf2">$1</h1>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li style="margin-left:16px">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:4px 0">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px">$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#58a6ff;text-decoration:none" target="_blank">$1</a>');

  // Line breaks
  html = html.replace(/\n\n/g, '<br/><br/>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
