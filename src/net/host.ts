// The host's side of a room: accepts players, relays their messages, and drops anyone who goes quiet.
import { Peer, type DataConnection } from 'peerjs';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { HEARTBEAT_MS, ROOM_PREFIX, TIMEOUT_MS, describeError, isMessage, randomRoomCode } from './common';

export interface HostHandlers {
  onData: (conn: DataConnection, msg: ClientMessage) => void;
  onClose: (conn: DataConnection) => void;
}

export class HostNet {
  private peer: Peer | null = null;
  private readonly conns = new Set<DataConnection>();
  private readonly lastSeen = new Map<DataConnection, number>();
  private heartbeatTimer = 0;

  constructor(private readonly handlers: HostHandlers) {}

  /** Registers a room on the broker and resolves with its 4-letter code. */
  open(tries = 5): Promise<string> {
    return new Promise((resolve, reject) => {
      const attempt = (left: number) => {
        const code = randomRoomCode();
        const peer = new Peer(ROOM_PREFIX + code);
        let opened = false;

        peer.on('open', () => {
          opened = true;
          this.peer = peer;
          this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
          resolve(code);
        });
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('disconnected', () => {
          if (!peer.destroyed) {
            peer.reconnect();
          }
        });
        peer.on('error', (err) => {
          if (opened) {
            console.warn('[host]', err);

            return;
          }

          peer.destroy();

          if (err.type === 'unavailable-id' && left > 0) {
            attempt(left - 1); // code taken: try another
          } else {
            reject(new Error(describeError(err)));
          }
        });
      };

      attempt(tries);
    });
  }

  send(conn: DataConnection | undefined, msg: HostMessage) {
    if (conn?.open) {
      conn.send(msg);
    }
  }

  broadcast(msg: HostMessage) {
    for (const c of this.conns) {
      if (c.open) {
        c.send(msg);
      }
    }
  }

  destroy() {
    clearInterval(this.heartbeatTimer);
    this.peer?.destroy();
    this.conns.clear();
    this.lastSeen.clear();
  }

  private accept(conn: DataConnection) {
    this.lastSeen.set(conn, Date.now());
    conn.on('open', () => this.conns.add(conn));
    conn.on('data', (msg) => {
      this.lastSeen.set(conn, Date.now());

      if (isMessage(msg) && msg.t !== 'ping') {
        this.handlers.onData(conn, msg as ClientMessage);
      }
    });
    conn.on('close', () => this.drop(conn));
    conn.on('error', (e) => console.warn('[host conn]', e));
  }

  private drop(conn: DataConnection) {
    this.lastSeen.delete(conn);

    if (!this.conns.delete(conn)) {
      return;
    }

    try {
      conn.close();
    } catch { /* already closed */ }

    this.handlers.onClose(conn);
  }

  private heartbeat() {
    const now = Date.now();

    for (const c of [...this.conns]) {
      if (now - (this.lastSeen.get(c) ?? 0) > TIMEOUT_MS) {
        this.drop(c);
      } else {
        this.send(c, { t: 'ping' });
      }
    }
  }
}
