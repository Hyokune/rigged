// Shared networking bits. Rooms are PeerJS (WebRTC) peers: the host's browser is the server, and PeerJS's
// free public broker is only used to introduce players; game traffic goes browser-to-browser.

/** Prefix for room ids on the public broker, so our 4-letter codes don't collide with other apps. */
export const ROOM_PREFIX = 'rigged-clawjam-v1-';
export const HEARTBEAT_MS = 2000;
/** Drop a peer we haven't heard from in this long. */
export const TIMEOUT_MS = 9000;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export const randomRoomCode = () =>
  Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

const CANT_REACH_BROKER = 'Could not reach the matchmaking server. Check your connection.';

const ERROR_MESSAGES: Record<string, string> = {
  'browser-incompatible': 'This browser does not support WebRTC.',
  'network': CANT_REACH_BROKER,
  'server-error': CANT_REACH_BROKER,
  'socket-error': CANT_REACH_BROKER,
  'socket-closed': CANT_REACH_BROKER,
  'webrtc': 'Peer-to-peer connection failed (a firewall may be blocking WebRTC).',
};

/** A human-readable explanation of a PeerJS error. */
export const describeError = (err: { type?: string; message?: string }) =>
  ERROR_MESSAGES[err.type ?? ''] ?? `Network error (${err.type || err.message || 'unknown'}).`;

/** Anything arriving over the wire is untrusted: check it at least looks like a message. */
export const isMessage = (v: unknown): v is { t: string } =>
  typeof v === 'object' && v !== null && typeof (v as { t?: unknown }).t === 'string';
