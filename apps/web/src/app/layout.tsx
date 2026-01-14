import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'SalesSearchers - AI-Powered Sales Platform',
  description: 'The ultimate sales SaaS combining meeting intelligence, CRM, outreach, and AI coaching.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${inter.variable} bg-surface-950 font-body text-surface-100 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
