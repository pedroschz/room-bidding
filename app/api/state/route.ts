import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { AllocationResult } from "@/app/lib/algorithm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServerState {
  names: string[];       // [10]
  matrix: string[][];   // [room][person] — 10×10
  submitted: boolean[];  // [10]
  result: AllocationResult | null;
}

type PostBody =
  | { type: "start" }
  | { type: "person"; person: number; name: string; values: string[]; submitted: boolean }
  | { type: "result"; result: AllocationResult };

// ─── Redis ────────────────────────────────────────────────────────────────────

const KEY = "rent-division:state";

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function emptyState(): ServerState {
  return {
    names: ["Alex", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indigo", "Jules"],
    matrix: Array.from({ length: 10 }, () => Array(10).fill("")),
    submitted: Array(10).fill(false),
    result: null,
  };
}

async function readState(redis: Redis): Promise<ServerState | null> {
  const raw = await redis.get<ServerState>(KEY);
  return raw ?? null;
}

async function writeState(redis: Redis, state: ServerState): Promise<void> {
  // Keep the session for 48 hours — plenty for one evening
  await redis.set(KEY, state, { ex: 48 * 60 * 60 });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  const state = await readState(redis);
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }

  const body = (await req.json()) as PostBody;
  let state = (await readState(redis)) ?? emptyState();

  if (body.type === "start") {
    state = emptyState();
  } else if (body.type === "person") {
    const { person, name, values, submitted } = body;
    state.names[person] = name;
    state.submitted[person] = submitted;
    // values is the person's column — one value per room
    values.forEach((v, room) => {
      state.matrix[room][person] = v;
    });
  } else if (body.type === "result") {
    state.result = body.result;
  }

  await writeState(redis, state);
  return NextResponse.json(state);
}

export async function DELETE() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 503 });
  }
  await redis.del(KEY);
  return NextResponse.json({ ok: true });
}
