import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SwRegister from "./sw-register";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const basePath = process.env.NODE_ENV === "production" ? "/strip-html" : "";

export const metadata: Metadata = {
  title: "Clipboard → HTML",
  description: "Paste rich text and convert it to cleaned HTML, minified HTML, Markdown, and preview.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/icon.png`,
    apple: `${basePath}/apple-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-mono antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SwRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
