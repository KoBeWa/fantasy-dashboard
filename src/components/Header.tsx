'use client';
import React, { useState, useEffect } from 'react';
import Button from './Button';

export default function Header() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'dark' | 'light' | null;
    if (stored) setTheme(stored);
  }, []);

  return (
    <header style={{ padding: '14px 0', marginBottom: 18, background: 'transparent' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))' }} />
          <div>
            <div style={{ fontWeight: 700 }}>Fantasy Dashboard</div>
            <div className="text-muted" style={{ fontSize: 12 }}>Overview & management</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="secondary" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <Button>New</Button>
        </div>
      </div>
    </header>
  );
}
