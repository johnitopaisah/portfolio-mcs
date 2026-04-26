import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: { default: 'John Itopa ISAH — DevOps & Cloud Engineer', template: '%s | John Itopa ISAH' },
  description: 'Portfolio of John Itopa ISAH — DevOps, Cloud, and Kubernetes Engineer.',
  metadataBase: new URL('https://johnisah.com'),
  openGraph: {
    type: 'website', locale: 'en_US', url: 'https://johnisah.com',
    siteName: 'John Itopa ISAH',
  },
  twitter: { card: 'summary_large_image' },
};

// Runs BEFORE first paint — zero flash of wrong theme.
// Policy: dark is always the default for first-time visitors.
// Only switches to light if the user has explicitly chosen it before
// (stored in localStorage). OS preference is intentionally ignored
// because the portfolio's design and brand are optimised for dark.
const themeScript = `
(function(){
  try{
    var t=localStorage.getItem('portfolio-theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  }catch(e){
    document.documentElement.setAttribute('data-theme','dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {/* Theme script must be first — runs before CSS is applied */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
