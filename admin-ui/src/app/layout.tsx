import type { Metadata } from 'next';
import './globals.css';
import { RumReporter } from '@/components/RumReporter';
import MaintenanceOverlay from '@/components/MaintenanceOverlay';
import DialogHost from '@/components/DialogHost';

export const metadata: Metadata = {
  title: 'Admin — Portfolio MCS',
  robots: 'noindex, nofollow',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
