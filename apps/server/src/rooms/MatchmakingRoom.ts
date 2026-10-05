import { Room, ServerError, matchMaker } from '@colyseus/core';
import type { Client } from '@colyseus/core';
import { DUEL_ROOM_NAME, MessageType } from '@flowing-fist/protocol';
import type { MatchFoundMessage } from '@flowing-fist/protocol';
import { DuelRoom } from './DuelRoom';
import { issueMatchTicket, pairWaitingPlayers } from './matchmaking';
import type { WaitingPlayer } from './matchmaking';
import { authenticatePlayer } from './players';
import type { DuelPlayer } from './players';

const PAIRING_INTERVAL_MS = 1000;

interface QueuedClient extends WaitingPlayer {
    client: Client;
    player: DuelPlayer;
}

/**
 * The queue for ranked duels. Clients wait here; once a second the waiting
 * players are paired by rating, and each pair is handed places in a new
 * DuelRoom made for the two of them.
 */
export class MatchmakingRoom extends Room {
    private queue: QueuedClient[] = [];

    public static onAuth(token: string): Promise<DuelPlayer> {
        return authenticatePlayer(DuelRoom.db, token);
    }

    public onCreate(): void {
        // Nothing here is synchronised; clients only wait for one message
        this.setPatchRate(null);
        this.clock.setInterval(() => {
            this.pairPlayers().catch((error) => console.error(error));
        }, PAIRING_INTERVAL_MS);
    }

    public onJoin(client: Client): void {
        const player = client.auth as DuelPlayer;
        // Two tabs of one browser share an account, and an account cannot fight itself for rating
        if (this.queue.some((queued) => queued.userId === player.userId)) {
            throw new ServerError(409, 'This account is already looking for a match');
        }

        this.queue.push({ client, player, userId: player.userId, rating: player.rating, waitingSince: Date.now() });
    }

    public onLeave(client: Client): void {
        this.queue = this.queue.filter((queued) => queued.client !== client);
    }

    private async pairPlayers(): Promise<void> {
        const pairs = pairWaitingPlayers(this.queue, Date.now());

        // Taken off the queue before anything is awaited, so the next pass cannot pair them again
        const paired = new Set(pairs.flat());
        this.queue = this.queue.filter((queued) => !paired.has(queued));

        await Promise.all(pairs.map(async (pair) => {
            try {
                const ticket = issueMatchTicket(pair.map((queued) => queued.userId));
                const room = await matchMaker.createRoom(DUEL_ROOM_NAME, { ticket });

                for (const queued of pair) {
                    // The player is already known, so the duel room takes it as given and does not ask again
                    const reservation = await matchMaker.reserveSeatFor(room, {}, queued.player);
                    const message: MatchFoundMessage = { reservation };
                    queued.client.send(MessageType.MatchFound, message);
                }
            } catch (error) {
                console.error(error);
                pair.forEach((queued) => queued.client.leave());
            }
        }));
    }
}
