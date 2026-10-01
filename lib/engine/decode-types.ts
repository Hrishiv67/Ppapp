/** Where an impact sits in the rally grammar. */
export type Role = 'serve' | 'serveBounce' | 'serveCross' | 'hit' | 'bounce';

export interface DecodeInput {
  t: number;
  /** Probability this onset is one of your table's impacts (gate × loudness). */
  pAccept: number;
  /** Probability it is a paddle hit rather than a bounce; 0.5 when unknown. */
  pPaddle: number;
}

export interface DecodedEvent {
  t: number;
  kind: 'hit' | 'bounce';
  role: Role;
  /** True when the decoder filled in an impact it did not hear. */
  inferred: boolean;
  /** Index into the decoder input, or −1 for inferred events. */
  source: number;
}
