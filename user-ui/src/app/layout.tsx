import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'John Itopa ISAH — DevOps & Cloud Engineer', template: '%s | John Itopa ISAH' },
  description: 'Portfolio of John Itopa ISAH — DevOps, Cloud, and Kubernetes Engineer.',
  metadataBase: new URL('https://johnisah.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://johnisah.com',
    siteName: 'John Itopa ISAH',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-[#09090b] text-zinc-100 antialiased"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
