import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup presence",
  { seconds: 30 },
  internal.presence.cleanupPresence,
);

export default crons;
