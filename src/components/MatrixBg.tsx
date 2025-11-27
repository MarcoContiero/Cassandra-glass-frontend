'use client';
import React from 'react';
import { motion } from 'framer-motion';

export default function MatrixBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0.25 }}
        animate={{ opacity: [0.25, 0.35, 0.25] }}
        transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
        style={{
          backgroundImage: 'radial-gradient(rgba(16,185,129,0.18) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          backgroundPosition: '0 0',
        }}
      />
      <motion.div
        className="absolute inset-0"
        initial={{ x: '-20%', opacity: 0.06 }}
        animate={{ x: ['-20%', '120%'], opacity: [0.03, 0.1, 0.03] }}
        transition={{ repeat: Infinity, duration: 9, ease: 'easeInOut' }}
        style={{
          background:
            'linear-gradient(120deg, transparent 0%, rgba(16,185,129,0.08) 35%, rgba(16,185,129,0.12) 50%, rgba(16,185,129,0.08) 65%, transparent 100%)',
        }}
      />
      <motion.div
        className="absolute inset-6 rounded-3xl"
        initial={{ boxShadow: '0 0 0 1px rgba(16,185,129,0.1) inset' }}
        animate={{
          boxShadow: [
            '0 0 0 1px rgba(16,185,129,0.10) inset',
            '0 0 0 1px rgba(16,185,129,0.25) inset',
            '0 0 0 1px rgba(16,185,129,0.10) inset',
          ],
        }}
        transition={{ repeat: Infinity, duration: 5.5, ease: 'easeInOut' }}
      />
    </div>
  );
}
