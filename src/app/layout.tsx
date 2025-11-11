import './styles/globals.css';
import React from 'react';
import Header from '../components/Header';

export const metadata = {
  title: 'Fantasy Dashboard',
  description: 'Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Header />
        <main className="container" style={{ paddingBottom: 80 }}>
          {children}
        </main>
      </body>
    </html>
  );
}
