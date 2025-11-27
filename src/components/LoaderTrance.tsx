'use client';
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function TranceLoader({ open }: { open: boolean }) {
  const [canPlayVideo, setCanPlayVideo] = React.useState(false);

  React.useEffect(() => {
    const v = document.createElement('video');
    setCanPlayVideo(!!v.canPlayType && v.canPlayType('video/mp4') !== '');
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="relative w-[280px] h-[280px] rounded-full overflow-hidden border border-emerald-500/40 shadow-2xl"
            initial={{ scale: 0.9, rotate: -2 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 15 }}
          >
            {canPlayVideo ? (
              <video
                src="/videos/cassandra/cassandra_trance.mp4"
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                poster="/images/cassandra/cassandra_trance.png"
              />
            ) : (
              <img
                src="/images/cassandra/cassandra_trance.png"
                alt="Cassandra in trance"
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
            )}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
              style={{ background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.25), transparent 60%)' }}
            />
            <motion.div
              className="absolute -inset-6"
              initial={{ opacity: 0.25 }}
              animate={{ opacity: [0.25, 0.6, 0.25] }}
              transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
              style={{
                backgroundImage:
                  'radial-gradient(2px 2px at 20px 20px, rgba(16,185,129,0.5), transparent), radial-gradient(2px 2px at 80px 140px, rgba(16,185,129,0.5), transparent), radial-gradient(2px 2px at 180px 60px, rgba(16,185,129,0.5), transparent)',
              }}
            />
          </motion.div>

          <motion.div className="mt-8 text-center" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="text-emerald-400/90 tracking-wide uppercase text-sm">Cassandra sta entrando in trance…</div>
            <div className="text-white/80 mt-2 text-xs">vediamo cosa dicono indicatori, livelli e candele</div>
            <motion.div className="mx-auto mt-4 h-[2px] w-40 bg-emerald-500/30 overflow-hidden rounded">
              <motion.div className="h-full w-1/3 bg-emerald-400" animate={{ x: ['-30%', '100%'] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
