/**
 * Envy-Free Rent Division
 *
 * Mathematical foundation
 * ─────────────────────────────────────────────────────────────────
 * We solve the LP-dual of the maximum-weight bipartite assignment:
 *
 *   max  Σ val[i][j] · x[i][j]
 *   s.t. Σ_j x[i][j] = 1  ∀i   (dual variable: α[i] — person surplus)
 *        Σ_i x[i][j] = 1  ∀j   (dual variable: β[j] — room price)
 *        x[i][j] ≥ 0
 *
 * Dual complementary-slackness guarantees:
 *   α[i] + β[j] ≥ val[i][j]          for all (i,j)
 *   α[i] + β[j] = val[i][j]          for matched pairs
 *
 * → Person i's surplus at their room ≥ surplus at any other room.
 *   That is exactly the envy-free condition.
 *
 * We extract α and β from the Hungarian algorithm's row/column
 * potentials (which solve the negated min-cost problem), then shift
 * β uniformly so Σ β[j] = totalRent.
 *
 * References: Alkan, Demange & Gale (1991); Su (1999).
 */

export interface AllocationResult {
  /** assignment[person] = room index */
  assignment: number[];
  /** prices[room] — what each room costs (may include negatives for very bad rooms) */
  prices: number[];
  /** surpluses[person] = valuation − price they pay */
  surpluses: number[];
  totalRent: number;
  isEnvyFree: boolean;
}

// ─── Hungarian Algorithm (Jonker-Volgenant, O(n³)) ───────────────────────────
// Returns { assignment, u, v } where u[i] and v[j] are row/col potentials
// solving the MINIMISATION problem on cost matrix C.
// Complementary slackness: C[i][j] − u[i] − v[j] ≥ 0; = 0 for matched pairs.

interface HungarianResult {
  assignment: number[]; // 0-indexed: assignment[person] = room
  u: number[];          // row potentials (1-indexed, length n+1, u[0] unused)
  v: number[];          // col potentials (1-indexed, length n+1, v[0] = dummy col potential)
}

function hungarian(costMatrix: number[][]): HungarianResult {
  const n = costMatrix.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  // p[j] = row matched to column j (1-indexed); 0 = unmatched
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minVal[j]) {
            minVal[j] = cur;
            way[j] = j0;
          }
          if (minVal[j] < delta) {
            delta = minVal[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minVal[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // Convert to 0-indexed assignment
  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) assignment[p[j] - 1] = j - 1;
  }

  return { assignment, u, v };
}

// ─── Envy-Free Price Computation ─────────────────────────────────────────────

function computeEnvyFreePrices(
  valuations: number[][],
  totalRent: number
): { assignment: number[]; prices: number[]; surpluses: number[] } {
  const n = valuations.length;

  // Negate valuations → min-cost problem
  const C = valuations.map((row) => row.map((v) => -v));
  const { assignment, u, v } = hungarian(C);

  // Extract LP-dual variables from potentials:
  //   C[i][j] − u_mc[i+1] − v_mc[j+1] ≥ 0
  //   ⟹ −val[i][j] − u_mc[i+1] − v_mc[j+1] ≥ 0
  //   ⟹ val[i][j] ≤ −u_mc[i+1] − v_mc[j+1]
  //
  // Setting α[i] = −u[i+1]  and  β[j] = −v[j+1]
  //   α[i] + β[j] ≥ val[i][j]  ✓
  //   α[i] + β[j] = val[i][j]  for matched pairs ✓
  //
  // Room prices = β[j]; person surpluses = α[i].

  const beta: number[] = [];
  const alpha: number[] = [];
  for (let j = 0; j < n; j++) beta.push(-v[j + 1]);
  for (let i = 0; i < n; i++) alpha.push(-u[i + 1]);

  // Shift β uniformly so Σ β[j] = totalRent
  const betaSum = beta.reduce((a, b) => a + b, 0);
  const shift = (totalRent - betaSum) / n;
  const prices = beta.map((b) => b + shift);
  const surpluses = alpha.map((a) => a - shift);

  // Round to cents and correct any floating-point residual in the last price
  const roundedPrices = prices.map((p) => Math.round(p * 100) / 100);
  const priceSum = roundedPrices.reduce((a, b) => a + b, 0);
  const residual = Math.round((totalRent - priceSum) * 100) / 100;
  if (residual !== 0) {
    // Apply residual to the cheapest room (least likely to go negative)
    const maxIdx = roundedPrices.indexOf(Math.max(...roundedPrices));
    roundedPrices[maxIdx] = Math.round((roundedPrices[maxIdx] + residual) * 100) / 100;
  }

  // Re-derive surpluses from rounded prices for consistency
  const finalSurpluses = assignment.map(
    (room, person) => Math.round((valuations[person][room] - roundedPrices[room]) * 100) / 100
  );

  return { assignment, prices: roundedPrices, surpluses: finalSurpluses };
}

// ─── Envy-Free Validator ──────────────────────────────────────────────────────

export function validateEnvyFree(
  valuations: number[][],
  assignment: number[],
  prices: number[]
): boolean {
  const n = valuations.length;
  for (let i = 0; i < n; i++) {
    const myRoom = assignment[i];
    const mySurplus = valuations[i][myRoom] - prices[myRoom];
    for (let j = 0; j < n; j++) {
      if (j === myRoom) continue;
      const otherSurplus = valuations[i][j] - prices[j];
      if (otherSurplus > mySurplus + 0.01) return false; // 1¢ tolerance
    }
  }
  return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function solveRentDivision(
  valuations: number[][], // [person][room]
  totalRent: number
): AllocationResult {
  const { assignment, prices, surpluses } = computeEnvyFreePrices(valuations, totalRent);
  const isEnvyFree = validateEnvyFree(valuations, assignment, prices);
  return { assignment, prices, surpluses, totalRent, isEnvyFree };
}
