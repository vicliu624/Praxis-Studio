const INTERNAL_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/CodeGraph 工具/g, "仓库分析工具"],
  [/\bCode Fact Graph\b/g, "本地仓库证据"],
  [/\bCodeGraph\b/g, "仓库分析"],
  [/\bcodegraph\b/g, "本地仓库证据"],
  [/代码事实图/g, "本地仓库分析"],
];

export function normalizeInternalTermsForDisplay(value: string): string {
  return INTERNAL_TERM_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function normalizeInternalTermsInHtmlDocument(doc: Document): void {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) textNodes.push(node as Text);
  }
  for (const node of textNodes) {
    node.nodeValue = normalizeInternalTermsForDisplay(node.nodeValue ?? "");
  }
}
