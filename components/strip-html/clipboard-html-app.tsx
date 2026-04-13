"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPreviewDocument,
  processHtml,
  sanitizePastedHtml,
  type StripHtmlResult,
} from "@/lib/strip-html";
import { cn } from "@/lib/utils";
import {
  Check,
  Clipboard,
  Eraser,
  Eye,
  FileCode2,
  Minimize2,
  ScanText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type TabValue = "html" | "minified" | "markdown" | "preview";

const EMPTY_RESULT: StripHtmlResult = {
  pretty: "",
  minified: "",
  markdown: "",
  status: "idle",
  charCount: 0,
  nodeCount: 0,
};

const TAB_LABELS: Record<TabValue, string> = {
  html: "HTML",
  minified: "Minified",
  markdown: "Markdown",
  preview: "Preview",
};

export function ClipboardHtmlApp() {
  const pasteBoxRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("html");
  const [rawHtml, setRawHtml] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const result = useMemo(() => {
    if (!mounted) {
      return EMPTY_RESULT;
    }
    return processHtml(rawHtml);
  }, [mounted, rawHtml]);

  const previewDocument = useMemo(
    () => buildPreviewDocument(result.pretty),
    [result.pretty],
  );
  const hasContent =
    rawHtml.replace(/<[^>]+>/g, "").trim().length > 0 ||
    result.pretty.length > 0;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const syncFromPasteBox = useCallback(() => {
    setRawHtml(pasteBoxRef.current?.innerHTML ?? "");
  }, []);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();

      const clipboard = event.clipboardData;
      const html = clipboard.getData("text/html");
      const text = clipboard.getData("text/plain");
      const incoming = html || text.replace(/\n/g, "<br>");
      const sanitized = sanitizePastedHtml(incoming);

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        if (pasteBoxRef.current) {
          pasteBoxRef.current.innerHTML += sanitized;
          syncFromPasteBox();
        }
        return;
      }

      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(sanitized);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);

      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      syncFromPasteBox();
    },
    [syncFromPasteBox],
  );

  const handleClear = useCallback(() => {
    if (pasteBoxRef.current) {
      pasteBoxRef.current.innerHTML = "";
      pasteBoxRef.current.focus();
    }
    setRawHtml("");
  }, []);

  const getCopyValue = useCallback(() => {
    switch (activeTab) {
      case "html":
        return result.pretty;
      case "minified":
        return result.minified;
      case "markdown":
        return result.markdown;
      case "preview":
        return result.pretty;
      default:
        return "";
    }
  }, [activeTab, result.markdown, result.minified, result.pretty]);

  const handleCopy = useCallback(async () => {
    const value = getCopyValue();
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${TAB_LABELS[activeTab]} copied`);
    } catch {
      toast.error("Failed to copy output");
    }
  }, [activeTab, getCopyValue]);

  return (
    <main className="h-screen overflow-hidden bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex h-full w-full flex-col gap-6">
        <header className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Clipboard → HTML
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Paste rich text on the left. Cleaned HTML, minified HTML,
              Markdown, and live preview appear on the right.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-2">
          <Card className="min-h-0 py-0">
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                    Input
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Paste rich text directly into the editor below.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleClear}>
                  <Eraser className="size-4" />
                  Clear
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-4">
              <div
                ref={pasteBoxRef}
                contentEditable
                suppressContentEditableWarning
                onInput={syncFromPasteBox}
                onPaste={handlePaste}
                className={cn(
                  "min-h-[22rem] flex-1 overflow-y-auto rounded-lg border bg-background px-4 py-3 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] lg:min-h-0",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "empty:text-muted-foreground before:pointer-events-none before:text-muted-foreground before:content-[attr(data-placeholder)]",
                )}
                data-placeholder="Paste rich text here…"
              />
            </CardContent>
          </Card>

          <Card className="min-h-0 py-0">
            <CardHeader className="border-b py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                    Output
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Switch between cleaned output formats and preview.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!hasContent}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex min-h-0 flex-1 flex-col p-4">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as TabValue)}
                className="flex min-h-0 flex-1 flex-col gap-4"
              >
                <TabsList className="grid h-auto grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="html">
                    <FileCode2 className="size-4" />
                    HTML
                  </TabsTrigger>
                  <TabsTrigger value="minified">
                    <Minimize2 className="size-4" />
                    Minified
                  </TabsTrigger>
                  <TabsTrigger value="markdown">
                    <ScanText className="size-4" />
                    Markdown
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="size-4" />
                    Preview
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="html" className="min-h-0 flex-1">
                  <Textarea
                    value={result.pretty}
                    readOnly
                    spellCheck={false}
                    className="h-full min-h-[22rem] resize-none font-mono text-sm leading-6 lg:min-h-0"
                  />
                </TabsContent>

                <TabsContent value="minified" className="min-h-0 flex-1">
                  <Textarea
                    value={result.minified}
                    readOnly
                    spellCheck={false}
                    className="h-full min-h-[22rem] resize-none font-mono text-sm leading-6 lg:min-h-0"
                  />
                </TabsContent>

                <TabsContent value="markdown" className="min-h-0 flex-1">
                  <Textarea
                    value={result.markdown}
                    readOnly
                    spellCheck={false}
                    className="h-full min-h-[22rem] resize-none font-mono text-sm leading-6 lg:min-h-0"
                  />
                </TabsContent>

                <TabsContent
                  value="preview"
                  className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background"
                >
                  <iframe
                    title="HTML preview"
                    sandbox="allow-same-origin"
                    srcDoc={previewDocument}
                    className="h-[22rem] w-full bg-white lg:h-full"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
