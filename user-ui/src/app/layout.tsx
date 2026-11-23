import type { Metadata } from 'next';
// Inter is bundled with the site (OFL licence) and served from johnisah.com —
// visitors' browsers never contact Google (privacy), and the build doesn't either.
import '@fontsource-variable/inter';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { RumReporter } from '@/components/RumReporter';
import MaintenanceOverlay from '@/components/MaintenanceOverlay';
import CvRequestDialog from '@/components/CvRequestDialog';

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

type Theme = 'dark' | 'light';

// Default theme for first-time visitors, set in the admin dashboard
// (Profile → Site theme). Cached 60s; any failure falls back to purple —
// this runs on every page, including the k8s probe on GET /, so it must
// never slow a render down.
async function siteDefaultTheme(): Promise<Theme> {
  const base = process.env.INTERNAL_API_URL;
  if (!base) return 'dark';
  try {
    const res = await fetch(`${base}/api/profile/site-settings`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return 'dark';
    const j = await res.json();
    return j?.default_theme === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// Runs BEFORE first paint — zero flash of wrong theme.
// A visitor's own choice (sun/moon button, stored in localStorage) always
// wins; otherwise the site default chosen in the admin dashboard applies.
const themeScript = (fallback: Theme) => `
(function(){
  var d='${fallback}';
  try{
    var t=localStorage.getItem('portfolio-theme');
    document.documentElement.setAttribute('data-theme', t === 'light' || t === 'dark' ? t : d);
  }catch(e){
    document.documentElement.setAttribute('data-theme', d);
  }
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const defaultTheme = await siteDefaultTheme();
  return (
    // data-theme is replaced by the inline script before hydration when the
    // visitor picked a theme — hence suppressHydrationWarning (this element only).
    <html lang="en" className="scroll-smooth" data-theme={defaultTheme} suppressHydrationWarning>
      <head>
        {/* Theme script must be first — runs before CSS is applied */}
        <script dangerouslySetInnerHTML={{ __html: themeScript(defaultTheme) }} />
      </head>
      <body style={{ fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif" }}>
        <RumReporter />
        <MaintenanceOverlay />
        <ThemeProvider>
          {children}
          {/* "Get my CV" — emailed, not downloaded (opened by the Resume / CV buttons) */}
          <CvRequestDialog />
        </ThemeProvider>
      </body>
    </html>
  );
}
