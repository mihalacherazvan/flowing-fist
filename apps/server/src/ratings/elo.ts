/** How far one result can move a rating */
const K_FACTOR = 32;

/**
 * Elo ratings after one match
 *
 * @param scoreOfFirst 1 if the first player won, 0 if they lost, 0.5 for a draw
 * @returns the new ratings, in the order given
 */
export function updateRatings(ratingOfFirst: number, ratingOfSecond: number, scoreOfFirst: number): [number, number] {
    const expectedOfFirst = 1 / (1 + Math.pow(10, (ratingOfSecond - ratingOfFirst) / 400));
    const change = Math.round(K_FACTOR * (scoreOfFirst - expectedOfFirst));

    // What one player gains the other loses
    return [ratingOfFirst + change, ratingOfSecond - change];
}
