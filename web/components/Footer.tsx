import Link from 'next/link';

const ig = process.env.NEXT_PUBLIC_INSTAGRAM_URL || 'https://www.instagram.com/htaflco/';
const x = process.env.NEXT_PUBLIC_X_URL || 'https://x.com/htaflco';
const tt = process.env.NEXT_PUBLIC_TIKTOK_URL || 'https://www.tiktok.com/@htaflco';

export default function Footer() {
  return (
    <footer className="sf">
      <div className="fw">
        <p className="wm">HTAFL</p>
        <p className="tag">Hope. Talent. Art. Fashion. Life.</p>
        <ul className="soc">
          <li><a href="mailto:htafl@africamail.com" aria-label="Email HTAFL at htafl@africamail.com" title="Email htafl@africamail.com">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
          </a></li>
          {ig && (
            <li><a className="ig" href={ig} aria-label="HTAFL on Instagram (@htaflco)" title="Instagram @htaflco" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".6" fill="#fff" /></svg>
            </a></li>
          )}
          {x && (
            <li><a href={x} aria-label="HTAFL on X (Twitter) (@htaflco)" title="X (Twitter) @htaflco" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a></li>
          )}
          {tt && (
            <li><a href={tt} aria-label="HTAFL on TikTok (@htaflco)" title="TikTok @htaflco" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" /></svg>
            </a></li>
          )}
        </ul>
        <div className="base">
          <p>&copy; {new Date().getFullYear()} HTAFL. All rights reserved.</p>
          <ul>
            <li><Link href="/info/privacy">Privacy</Link></li>
            <li><Link href="/info/accessibility">Accessibility</Link></li>
            <li><Link href="/info/guidelines">Community Guidelines</Link></li>
            <li><Link href="/info/credits">Credits</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
