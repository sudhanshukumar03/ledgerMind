import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { KeyboardNav } from '../components/layout/KeyboardNav';

export const metadata: Metadata = {
  title: 'LedgerMind — AI Finance Controller',
  description: 'Intelligent reconciliation and exception management for modern merchants.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <KeyboardNav>
            {children}
          </KeyboardNav>
        </Providers>
      </body>
    </html>
  );
}
