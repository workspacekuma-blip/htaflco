const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Only literal, same-storage, author-owned staging URLs are migration candidates. No URL fetching. */
export function legacyPictureKey(mediaUrl: string, authorId: string, publicBase: string): string | null {
  if (!new RegExp(`^${UUID}$`).test(authorId) || !publicBase) return null;
  const prefix = publicBase.replace(/\/$/, '') + '/';
  if (!mediaUrl.startsWith(prefix)) return null;
  const key = mediaUrl.slice(prefix.length);
  return new RegExp(`^uploads/${authorId}/${UUID}\\.(jpg|png|webp)$`).test(key) ? key : null;
}

/** Hashes cannot reveal the original password length or recover its truncated suffix. */
export function passwordHashKind(hash: string): 'bcrypt' | 'weak-bcrypt' | 'unsupported' {
  const match = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(hash);
  if (!match || Number(match[1]) < 4 || Number(match[1]) > 31) return 'unsupported';
  return Number(match[1]) < 12 ? 'weak-bcrypt' : 'bcrypt';
}
