import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Your AI-native personal finance copilot`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "personal finance app",
    "AI finance copilot",
    "budgeting app",
    "transaction categorization",
    "cash flow forecast",
    "bank sync",
    "AI money coach",
  ],
  authors: [{ name: "Lokesh Kumar", url: "https://github.com/Lokeshkuma31" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Your AI-native personal finance copilot`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Your AI-native personal finance copilot`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
