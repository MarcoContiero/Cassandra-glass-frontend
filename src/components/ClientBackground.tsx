'use client';
import dynamic from 'next/dynamic';
const CassandraBackground = dynamic(() => import('@/components/CassandraBackground'), { ssr: false });
export default function ClientBackground() {
  return <CassandraBackground />;
}
