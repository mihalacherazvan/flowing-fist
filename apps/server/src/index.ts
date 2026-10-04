import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { API_PREFIX, DUEL_ROOM_NAME } from '@flowing-fist/protocol';
import { config } from './config';
import { openDatabase } from './db/database';
import { createApi } from './http/api';
import { DuelRoom } from './rooms/DuelRoom';

const { db } = await openDatabase(config.databaseUrl);
DuelRoom.db = db;

const server = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
        app.use(API_PREFIX, createApi(db));
    }
});

server.define(DUEL_ROOM_NAME, DuelRoom);

await server.listen(config.port);
console.log(`Flowing Fist server listening on ws://localhost:${config.port}`);
