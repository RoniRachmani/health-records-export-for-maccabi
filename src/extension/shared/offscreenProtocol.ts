export type OffscreenRequest =
  | { type: 'purchaseTable'; html: string }
  | { type: 'phrGrid'; html: string }
  /** Zips every staged file under root/ and returns a blob: URL. */
  | { type: 'zip'; root: string }
  | { type: 'revoke'; url: string };

export type OffscreenReply =
  | { cols: number }
  | { ids: string[]; openArgs: string[] }
  | { url: string; bytes: number; files: number }
  | { ok: true };
