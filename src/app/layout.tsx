import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import "@/components/ui/scanlines.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500'],
});

export const metadata: Metadata = {
  title: 'Cassandra',
  description: 'Cassandra — Sistema di analisi algoritmica',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={jetbrainsMono.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@300;400;600&family=Cinzel+Decorative:wght@300;400&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
