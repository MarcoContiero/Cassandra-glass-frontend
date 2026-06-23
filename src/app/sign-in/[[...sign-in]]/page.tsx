import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-void)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        padding: '24px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-decorative, Cinzel Decorative, serif)',
          fontSize: '18px',
          fontWeight: 300,
          color: 'var(--color-gold, #c9a84c)',
          letterSpacing: '0.3em',
        }}
      >
        CASSANDRA
      </span>
      <SignIn />
    </div>
  );
}
