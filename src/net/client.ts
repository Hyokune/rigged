// A player's side of a room: connects to the host by room code and notices if the host disappears.
import { Peer, type DataConnection } from 'peerjs';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { HEARTBEAT_MS, ROOM_PREFIX, TIMEOUT_MS, describeError, isMessage } from './common';

const CONNECT_TIMEOUT_MS = 12000;

export interface ClientHandlers {
  onData: (msg: HostMessage) => void;
  onClose: () => void;
}

export class ClientNet {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private closed = false;
  private lastSeen = 0;
  private heartbeatTimer = 0;

  constructor(private readonly handlers: ClientHandlers) {}

  /** Join room `code` as `name`. Rejects with a readable message if the room can't be reached. */
  connect(code: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = (this.peer = new Peer());
      let settled = false;

      const fail = (message: string) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        this.closed = true;
        peer.destroy();
        reject(new Error(message));
      };

      const timer = setTimeout(() => fail('Could not reach that room (timed out).'), CONNECT_TIMEOUT_MS);

      peer.on('error', (err) => {
        if (!settled) {
          fail(err.type === 'peer-unavailable' ? `No room found with code ${code}.` : describeError(err));
        } else {
          console.warn('[client]', err);
        }
      });
      peer.on('open', () => {
        const conn = (this.conn = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json' }));

        conn.on('open', () => {
          settled = true;
          clearTimeout(timer);
          this.lastSeen = Date.now();
          this.send({ t: 'hello', name });
          this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
          resolve();
        });
        conn.on('data', (msg) => {
          this.lastSeen = Date.now();

          if (isMessage(msg) && msg.t !== 'ping') {
            this.handlers.onData(msg as HostMessage);
          }
        });
        conn.on('close', () => this.lost());
      });
    });
  }

  send(msg: ClientMessage) {
    if (this.conn?.open) {
      this.conn.send(msg);
    }
  }

  destroy() {
    this.closed = true;
    clearInterval(this.heartbeatTimer);
    this.peer?.destroy();
  }

  private heartbeat() {
    this.send({ t: 'ping' });

    if (Date.now() - this.lastSeen > TIMEOUT_MS) {
      this.lost();
    }
  }

  private lost() {
    if (this.closed) {
      return;
    }

    this.destroy();
    this.handlers.onClose();
  }
}
