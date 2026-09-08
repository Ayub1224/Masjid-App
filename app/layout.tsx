import type { Metadata } from 'next';
import { themeVariables, defaultTheme } from '@/config/themes';
import './globals.css';
import { AppProviders } from '@/components/app/providers';
export const metadata: Metadata = {
  title: 'Gausul wara masjid | Mosque-app',
  description:
    'Prayer times and community contributions for Gausul wara masjid, Durg. Frontend preview.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={themeVariables(defaultTheme) as React.CSSProperties}
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
