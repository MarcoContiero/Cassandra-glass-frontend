import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import "@/components/ui/scanlines.css";


const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Cassandra',
  description: 'Cassandra Glass UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
