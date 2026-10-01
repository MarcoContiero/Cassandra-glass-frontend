import { Fragment } from 'react';

// Text remains React-escaped; no HTML from the assistant is executed.
export default function PiziaMessage({ content }: { content: string }) {
  return <>{content.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} style={{ color: '#e8c96a', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>
  )}</>;
}
