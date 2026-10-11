/** Secondes de jeu écoulées depuis « Lancer », gelées pendant les pauses. */
export function gameNow(g: { launched: boolean; paused: boolean; clock_gt: number; clock_wall: Date | string }, wall = new Date()): number {
  if (!g.launched) return 0;
  if (g.paused) return g.clock_gt;
  return g.clock_gt + (wall.getTime() - new Date(g.clock_wall).getTime()) / 1000;
}
