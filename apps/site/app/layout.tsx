import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Designesy',
  description: 'Design intelligence infrastructure for better worlds.'
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
