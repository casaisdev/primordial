import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Saira } from "next/font/google";
import "./globals.css";

// Signal — metrics, IDs, telemetry. Tabular figures, monospaced.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Chassis — labels, chrome, headings. A squared technical grotesque.
const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://primordial.martincasais.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Primordial",
    template: "%s | Primordial",
  },
  description:
    "A Darwinian artificial life simulation. Digital organisms are born, evolve, and die in real time — no script, no destination. Only genome, environment, and natural selection.",
  keywords: [
    "artificial life",
    "evolution",
    "simulation",
    "darwin",
    "alife",
    "digital organisms",
    "natural selection",
    "emergent behavior",
  ],
  openGraph: {
    title: "Primordial",
    description:
      "A Darwinian artificial life simulation. Digital organisms are born, evolve, and die in real time.",
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "Primordial",
  },
  twitter: {
    card: "summary_large_image",
    title: "Primordial",
    description:
      "A Darwinian artificial life simulation. Digital organisms are born, evolve, and die in real time.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  themeColor: "#050508",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${saira.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
