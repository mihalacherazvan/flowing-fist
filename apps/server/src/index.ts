import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_SERVER_PORT, DUEL_ROOM_NAME } from '@flowing-fist/protocol';
import { DuelRoom } from './rooms/DuelRoom';

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

const server = new Server({
    transport: new WebSocketTransport()
});

server.define(DUEL_ROOM_NAME, DuelRoom);

await server.listen(port);
console.log(`Flowing Fist server listening on ws://localhost:${port}`);
