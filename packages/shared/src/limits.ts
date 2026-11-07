/** Field caps of an upload (spec §6: ~20 000 chars of text). Longer values are cut, never rejected: a rejected
 *  upload is a lost capture, and captures queued by an older extension may exceed them. */
export const UPLOAD_LIMITS = {
  title: 300,
  note: 5000,
  pageTitle: 500,
  tags: 50,
  selection: 20_000,
  headings: 20,
  heading: 300,
  alts: 50,
  alt: 300,
  metaValue: 1000,
  ogKeys: 20,
  /** All text fields together. */
  text: 25_000,
} as const;
