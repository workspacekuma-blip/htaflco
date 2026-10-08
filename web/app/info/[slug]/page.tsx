import { notFound } from 'next/navigation';

// Placeholders. Have the Privacy and Accessibility pages written for how you actually handle
// people's information, and reviewed against the rules that apply to your members.
const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: { title: 'Privacy', body: ['This page is being written.'] },
  accessibility: { title: 'Accessibility', body: ['This page is being written.'] },
  credits: { title: 'Credits', body: ['This page is being written.'] },
  guidelines: {
    title: 'Community Guidelines',
    body: [
      'The Creator Generation is a place for people who are going through something and building anyway.',
      'Be kind. Post your own work. Respect other creators.',
      'Posts and comments that break these promises may be hidden or removed.',
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export default async function Info({ params }: { params: Promise<{ slug: string }> }) {
  const page = PAGES[(await params).slug];
  if (!page) notFound();
  return (
    <div className="wrap page narrow">
      <h1 className="h2">{page.title}</h1>
      {page.body.map((t) => <p key={t}>{t}</p>)}
    </div>
  );
}
