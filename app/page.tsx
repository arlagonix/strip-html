import { ClipboardHtmlApp } from "@/components/strip-html/clipboard-html-app";
import { Toaster } from "@/components/ui/sonner";

export default function HomePage() {
  return (
    <>
      <ClipboardHtmlApp />
      <Toaster richColors position="top-right" />
    </>
  );
}
