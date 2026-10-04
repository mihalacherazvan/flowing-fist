/**
 * Thrown anywhere below a route to answer the request with that status
 */
export class HttpError extends Error {
    constructor(public readonly status: number, message: string, public readonly details?: string[]) {
        super(message);
    }
}
