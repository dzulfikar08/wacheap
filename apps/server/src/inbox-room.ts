import { DurableObject } from "cloudflare:workers";

/**
 * Live inbox for one workspace. Agents' tabs hold a hibernating WebSocket here; the webhook handler calls `publish`
 * when a message arrives or a conversation changes, and every open tab gets the event. Conversation state itself lives
 * in D1; this object only fans out notifications (WAB-9).
 */
export class InboxRoom extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Sends `event` to every connected tab; returns how many received it. */
  async publish(event: unknown): Promise<number> {
    const payload = JSON.stringify(event);
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
        delivered++;
      } catch {
        // The socket closed between getWebSockets() and send(); the runtime drops it from getWebSockets().
      }
    }
    return delivered;
  }

  override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") socket.send("pong");
  }

  // No webSocketClose: at the pinned compatibility date the runtime answers the close frame itself, and
  // echoing 1005/1006 (a dropped tab) back into close() throws.
}
