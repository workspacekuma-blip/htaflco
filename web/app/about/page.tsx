import Link from 'next/link';

export const metadata = { title: 'About HTAFL' };

export default function About() {
  return (
    <>
      <section className="hero wrap">
        <h1>Don&apos;t just watch. Make something.</h1>
        <p className="lead">HTAFL is a movement for people who are done waiting for permission, or for the hard chapter to end, to start creating.</p>
      </section>
      <div className="wrap">
        <ul className="stack">
          <li>Hope is something we can create.</li>
          <li>Talent deserves somewhere to grow.</li>
          <li>Art is a language.</li>
          <li>Fashion is expression.</li>
          <li>Life is bigger than any one difficult chapter.</li>
        </ul>
      </div>
      <section className="marigold">
        <div className="wrap">
          <p className="big">Create. Overcome. Connect.</p>
          <p>Make something. Keep going. Don&apos;t do it alone.</p>
        </div>
      </section>
      <section className="band-section">
        <div className="wrap">
          <h2>We are The Creator Generation.</h2>
          <p>We were not created only to consume the world around us. We were created to imagine, build, express, solve, contribute, and leave something behind.</p>
          <p>You don&apos;t have to be ready, or talented yet, or okay. You only have to start.</p>
          <Link className="btn" href="/join">Join The Creator Generation</Link>{' '}
          <Link className="btn ghost" href="/">See the wall</Link>
        </div>
      </section>
    </>
  );
}
