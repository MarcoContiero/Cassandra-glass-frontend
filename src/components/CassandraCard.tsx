'use client';

import React from 'react';

interface CassandraCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  corners?: boolean;
  style?: React.CSSProperties;
}

export function CassandraCard({
  title,
  children,
  className = '',
  corners = true,
  style,
}: CassandraCardProps) {
  return (
    <div
      className={`cassandra-card ${corners ? 'cassandra-card-corners' : ''} ${className}`}
      style={style}
    >
      {title && (
        <span className="cassandra-panel-header">{title}</span>
      )}
      {children}
    </div>
  );
}
