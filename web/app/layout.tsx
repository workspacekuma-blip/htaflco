import type { Metadata } from 'next';
import { Bricolage_Grotesque, Newsreader } from 'next/font/google';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '700'], variable: '--display', display: 'swap' });
const body = Newsreader({ subsets: ['latin'], weight: ['400', '500'], variable: '--body', display: 'swap' });

export const metadata: Metadata = {
  title: 'HTAFL: The Creator Generation',
  description: 'A community for people in a hard chapter who are still building. Hope, Talent, Art, Fashion, Life.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
