'use client';
import React from 'react';

type CardProps = React.PropsWithChildren<{
  title?: React.ReactNode;
  className?: string;
}>;

export default function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {title && <div style={{ marginBottom: 8, fontWeight: 600 }}>{title}</div>}
      <div>{children}</div>
    </div>
  );
}
