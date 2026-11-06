// YouTube's fixed video categories (the same ids the Data API uses), so category filtering works without an API key.

export const VIDEO_CATEGORIES: { id: string; title: string }[] = [
  { id: '1', title: 'Film & Animation' },
  { id: '2', title: 'Autos & Vehicles' },
  { id: '10', title: 'Music' },
  { id: '15', title: 'Pets & Animals' },
  { id: '17', title: 'Sports' },
  { id: '19', title: 'Travel & Events' },
  { id: '20', title: 'Gaming' },
  { id: '22', title: 'People & Blogs' },
  { id: '23', title: 'Comedy' },
  { id: '24', title: 'Entertainment' },
  { id: '25', title: 'News & Politics' },
  { id: '26', title: 'Howto & Style' },
  { id: '27', title: 'Education' },
  { id: '28', title: 'Science & Technology' },
  { id: '29', title: 'Nonprofits & Activism' },
];

const BY_NAME = new Map(VIDEO_CATEGORIES.map((c) => [c.title.toLowerCase(), c.id]));

/** "Music" -> "10". Unknown names give '' (treated as "no category"). */
export function categoryIdByName(name: string | undefined): string {
  return BY_NAME.get((name ?? '').trim().toLowerCase()) ?? '';
}
