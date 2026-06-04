import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Designesy',
  description:
    'Public scaffold for Designesy design systems, review discipline, and artifact work.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
