class WebSocketClient {
    private socket: WebSocket | null = null;
    private listeners: { [key: string]: Function[] } = {};
  
    connect() {
      this.socket = new WebSocket("ws://localhost:5000/ws");
  
      this.socket.onopen = () => {
        console.log("WebSocket connection established");
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
        console.log("WebSocket connection closed");
        this.emit("disconnect");
      };
  
      this.socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.emit("error", error);
      };
    }
  
    on(event: string, callback: Function) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      this.listeners[event].push(callback);
    }
  
    off(event: string, callback: Function) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
    }
  
    private emit(event: string, ...args: any[]) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(callback => callback(...args));
      }
    }
  
    send(data: any) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
      } else {
        console.error("WebSocket is not connected");
      }
    }
  
    disconnect() {
      if (this.socket) {
        this.socket.close();
      }
    }
  }
  
  const socket = new WebSocketClient();
  
  export default socket;