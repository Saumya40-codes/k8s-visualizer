type EventCallback = (...args: any[]) => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private listeners: Record<string, EventCallback[]> = {};
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = false;

  connect() {
    this.shouldReconnect = true;
    this.reconnectDelay = 1000;
    this.doConnect();
  }

  private doConnect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    const url = `${protocol}//${host}:8080/ws`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectDelay = 1000;
      this.emit("connect");
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit("message", data);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.socket.onclose = () => {
      this.emit("disconnect");
      if (this.shouldReconnect) {
        setTimeout(() => this.doConnect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  on(event: string, callback: EventCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string, callback: EventCallback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  private emit(event: string, ...args: any[]) {
    this.listeners[event]?.forEach(callback => callback(...args));
  }

  disconnect() {
    this.shouldReconnect = false;
    this.socket?.close();
  }
}

const socket = new WebSocketClient();

export default socket;