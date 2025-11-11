'use client';
import React from 'react';
import cx from 'classnames';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export default function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  const classes = cx('btn', {
    'secondary': variant === 'secondary',
  }, className);

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
