import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { itIT } from '@clerk/localizations';
import { PostHogProvider } from '@/components/PostHogProvider';
import './globals.css';
import '@/components/ui/scanlines.css';

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
    <ClerkProvider
      localization={itIT}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/app"
      afterSignUpUrl="/app"
      appearance={{
        variables: {
          colorPrimary: '#c9a84c',
          colorBackground: '#02020e',
          colorInputBackground: '#08081a',
          colorInputText: '#e8e0c8',
          colorText: '#e8e0c8',
          colorTextSecondary: '#8a8070',
          borderRadius: '0px',
          fontFamily: 'JetBrains Mono, monospace',
        },
        elements: {
          card: { border: '1px solid rgba(201,168,76,0.2)', boxShadow: 'none' },
          formButtonPrimary: { background: '#c9a84c', color: '#02020e', borderRadius: '0px' },
          footerActionLink: { color: '#c9a84c' },
          headerTitle: { color: '#c9a84c', fontFamily: 'var(--font-decorative, serif)', letterSpacing: '0.2em' },
        },
      }}
    >
      <html lang="it" className={jetbrainsMono.variable} suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('cassandra-theme');if(t==='light')document.documentElement.dataset.theme='light';}catch(e){}})();`,
            }}
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Cinzel:wght@300;400;600&family=Cinzel+Decorative:wght@300;400&family=JetBrains+Mono:wght@300;400;500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>
          <PostHogProvider>
            {children}
          </PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
