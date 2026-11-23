import type { Metadata } from 'next';
import './globals.css';
import { RumReporter } from '@/components/RumReporter';
import MaintenanceOverlay from '@/components/MaintenanceOverlay';
import DialogHost from '@/components/DialogHost';
import { themeBootScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Admin — Portfolio MCS',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the inline script before hydration (saved theme) —
    // suppressHydrationWarning covers this element's attributes only.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-gray-950 text-gray-100 antialiased">
        <RumReporter />
        <MaintenanceOverlay />
        {children}
        {/* App-styled confirm / alert dialogs (lib/dialog.ts) — replaces window.alert/confirm */}
        <DialogHost />
      </body>
    </html>
  );
}
