import WebSocket from 'ws';

const candidates = [
  'ws://localhost:3002',
  'ws://localhost:3002/ws',
  'ws://127.0.0.1:3002',
];

let connected = false;

async function tryConnect() {
  for (const url of candidates) {
    try {
      console.log('Trying', url);
      const ws = new WebSocket(url);

      ws.on('open', () => {
        connected = true;
        console.log('CONNECTED to', url);
      });

      ws.on('message', (msg) => {
        try {
          const text = msg.toString();
          console.log('RECEIVED:', text);
        } catch (err) {
          console.log('RECEIVED (binary)', msg);
        }
      });

      ws.on('close', () => {
        console.log('CLOSED', url);
      });

      ws.on('error', (err) => {
        console.error('ERROR', url, err.message || err);
      });

      // wait up to 3s for connection
      await new Promise((res) => setTimeout(res, 3000));
      if (connected) return;
    } catch (err) {
      console.error('connect err', err);
    }
  }

  if (!connected) {
    console.error('Could not connect to any candidate WS URL');
    process.exit(1);
  }
}

tryConnect();

// keep process alive
setTimeout(() => {
  console.log('Exiting after timeout');
  process.exit(0);
}, 60000);
