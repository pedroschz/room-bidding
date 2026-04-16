"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import { solveRentDivision, AllocationResult } from "@/app/lib/algorithm";
import { NUM_ROOMS, TOTAL_RENT, ROOM_NAMES, ROOM_PHOTOS, DEFAULT_NAMES } from "@/app/lib/constants";

type Phase = "landing" | "choose" | "input" | "results";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function makeEmptyMatrix(): string[][] {
  return Array.from({ length: NUM_ROOMS }, () => Array.from({ length: NUM_ROOMS }, () => ""));
}

function columnSum(matrix: string[][], col: number): number {
  return matrix.reduce((sum, row) => {
    const v = parseFloat(row[col]);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <Image
          src={src}
          alt={label}
          width={1200}
          height={800}
          className="w-full h-full object-contain max-h-[80vh]"
          priority
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-white/60 text-xs font-mono">{label}</span>
          <button onClick={onClose} className="text-white/60 text-xs font-mono hover:text-white transition-colors">
            close [esc]
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function Landing({ onStart, syncStatus }: { onStart: () => void; syncStatus: "ok" | "syncing" | "offline" }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full space-y-10">
        <div className="space-y-3">
          <p className="text-xs font-mono text-gray-400 tracking-widest uppercase">
            Game Theory / Envy-Free Algorithm
          </p>
          <h1 className="text-6xl font-black text-black tracking-tighter leading-none">
            Fair Rent<br />Division
          </h1>
          <p className="text-gray-500 text-base leading-relaxed max-w-sm">
            10 roommates bid on 10 rooms within a $6,000/mo budget. Each person
            picks themselves and enters their bids privately. When everyone's done,
            the algorithm assigns rooms so nobody wants to swap.
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-black border border-black">
          {[
            { label: "Rooms", value: "10" },
            { label: "People", value: "10" },
            { label: "Budget", value: "$6k" },
          ].map(({ label, value }) => (
            <div key={label} className="p-4">
              <p className="text-3xl font-black text-black font-mono">{value}</p>
              <p className="text-gray-500 text-xs mt-1 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        <div className="border-l-2 border-black pl-4 space-y-2">
          {[
            "Pick your name from the list.",
            "Rate every room in dollars — your column must sum to $6,000.",
            "Submit your bids. See others fill in theirs in real time.",
            "Once everyone submits, run the algorithm.",
          ].map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="font-mono text-gray-300 text-sm select-none">{i + 1}.</span>
              <p className="text-gray-600 text-sm">{step}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onStart}
          className="w-full bg-black text-white font-bold py-4 text-base tracking-wide hover:bg-gray-900 transition-colors"
        >
          Start →
        </button>

        {syncStatus === "offline" && (
          <p className="text-center text-xs font-mono text-gray-400">
            Running offline — changes won&apos;t sync across devices.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Choose Screen ────────────────────────────────────────────────────────────

interface ChooseProps {
  names: string[];
  submitted: boolean[];
  colValid: boolean[];
  colSums: number[];
  syncStatus: "ok" | "syncing" | "offline";
  onPick: (person: number) => void;
  onRunAlgorithm: () => void;
}

function ChooseScreen({ names, submitted, colValid, colSums, syncStatus, onPick, onRunAlgorithm }: ChooseProps) {
  const allSubmitted = submitted.every(Boolean);
  const submittedCount = submitted.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full space-y-8">

        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">
              {submittedCount}/{NUM_ROOMS} submitted
            </p>
            <SyncDot status={syncStatus} />
          </div>
          <h2 className="text-3xl font-black text-black tracking-tight">Who are you?</h2>
          <p className="text-gray-500 text-sm mt-1">Pick your name to enter or edit your bids.</p>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-black transition-all duration-500"
            style={{ width: `${(submittedCount / NUM_ROOMS) * 100}%` }}
          />
        </div>

        {/* Person list */}
        <div className="space-y-1">
          {names.map((name, i) => {
            const isSubmitted = submitted[i];
            const hasStarted = colSums[i] > 0;
            const pct = Math.min(Math.round((colSums[i] / TOTAL_RENT) * 100), 100);

            return (
              <button
                key={i}
                onClick={() => onPick(i)}
                className="w-full flex items-center gap-4 px-4 py-3 border border-transparent hover:border-black transition-colors group text-left"
              >
                {/* Number */}
                <span className="font-mono text-gray-300 text-sm w-5 flex-shrink-0">{i + 1}</span>

                {/* Name */}
                <span className={`font-bold text-sm flex-1 ${isSubmitted ? "text-black" : "text-gray-500 group-hover:text-black"}`}>
                  {name}
                </span>

                {/* Progress / status */}
                {isSubmitted ? (
                  <span className="text-xs font-mono font-bold text-black bg-black text-white px-2 py-0.5">
                    submitted
                  </span>
                ) : hasStarted ? (
                  <span className="text-xs font-mono text-gray-400">{pct}%</span>
                ) : (
                  <span className="text-xs font-mono text-gray-200 group-hover:text-gray-400">—</span>
                )}

                <span className="text-gray-200 group-hover:text-black text-sm transition-colors">→</span>
              </button>
            );
          })}
        </div>

        {/* Run algorithm CTA */}
        <div className={`border-t pt-6 transition-opacity ${allSubmitted ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
          <p className="text-xs font-mono text-gray-400 mb-3">
            {allSubmitted ? "Everyone has submitted. Ready to run." : `Waiting for ${NUM_ROOMS - submittedCount} more...`}
          </p>
          <button
            onClick={onRunAlgorithm}
            disabled={!allSubmitted}
            className="w-full bg-black text-white font-bold py-4 text-base tracking-wide hover:bg-gray-900 transition-colors disabled:cursor-not-allowed"
          >
            Calculate Assignments →
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Input Screen ─────────────────────────────────────────────────────────────

interface InputScreenProps {
  person: number;
  names: string[];
  setName: (name: string) => void;
  matrix: string[][];
  setCell: (room: number, value: string) => void;
  submitted: boolean[];
  colSums: number[];
  colValid: boolean[];
  syncStatus: "ok" | "syncing" | "offline";
  onSubmit: () => void;
  onBack: () => void;
}

function InputScreen({
  person,
  names,
  setName,
  matrix,
  setCell,
  submitted,
  colSums,
  colValid,
  syncStatus,
  onSubmit,
  onBack,
}: InputScreenProps) {
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const mySum = colSums[person];
  const myValid = colValid[person];
  const isOver = mySum > TOTAL_RENT;
  const remaining = TOTAL_RENT - mySum;
  const isSubmitted = submitted[person];

  const autoFill = () => {
    const vals = matrix.map((row) => {
      const v = parseFloat(row[person]);
      return isNaN(v) ? null : v;
    });
    const filledSum = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
    const emptyCount = vals.filter((v) => v === null).length;
    if (emptyCount === 0) return;
    const each = Math.round(((TOTAL_RENT - filledSum) / emptyCount) * 100) / 100;
    vals.forEach((v, room) => { if (v === null) setCell(room, String(each)); });
  };

  const otherSubmittedCount = submitted.filter((s, i) => s && i !== person).length;

  return (
    <div className="min-h-screen bg-white">
      {lightbox && <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-black px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <button onClick={onBack} className="text-xs font-mono text-gray-400 hover:text-black transition-colors">
            ← back
          </button>
          <span className="font-black text-black text-sm flex items-center gap-1.5">
            {names[person] || `Person ${person + 1}`}
            <SyncDot status={syncStatus} />
          </span>
          <button
            onClick={onSubmit}
            disabled={!myValid}
            className={`px-4 py-2 text-xs font-bold border transition-colors ${
              myValid
                ? isSubmitted
                  ? "bg-black text-white border-black hover:bg-gray-900"
                  : "bg-black text-white border-black hover:bg-gray-900"
                : "bg-white text-gray-300 border-gray-200 cursor-not-allowed"
            }`}
          >
            {isSubmitted ? "✓ Re-submit" : "Submit bids →"}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-5">

        {/* Person header */}
        <div className="flex items-end justify-between border-b-2 border-black pb-3">
          <div>
            <p className="text-xs text-gray-400 font-mono uppercase tracking-widest mb-1">Your name</p>
            <input
              className="text-2xl font-black text-black bg-transparent outline-none border-b-2 border-transparent focus:border-black w-48 placeholder-gray-300"
              value={names[person]}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Person ${person + 1}`}
              maxLength={20}
            />
          </div>
          <div className="text-right">
            <p className={`text-2xl font-black font-mono ${myValid ? "text-black" : isOver ? "text-black" : "text-gray-400"}`}>
              {fmt(mySum)}
            </p>
            <p className="text-xs text-gray-400 font-mono">
              {myValid ? "✓ ready" : isOver ? `${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} left`}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-black transition-all duration-200"
            style={{ width: `${Math.min((mySum / TOTAL_RENT) * 100, 100)}%` }}
          />
        </div>

        {/* Room inputs */}
        <div className="space-y-1">
          {ROOM_NAMES.map((roomName, room) => {
            const val = matrix[room][person];
            const num = parseFloat(val);
            const hasVal = !isNaN(num) && val !== "";
            const photo = ROOM_PHOTOS[room];
            return (
              <div key={room} className={`flex items-center gap-3 border-b py-2 ${hasVal ? "border-black" : "border-gray-100"}`}>
                {/* Thumbnail */}
                <div className="w-12 h-9 flex-shrink-0 bg-gray-100 overflow-hidden">
                  {photo ? (
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: photo, label: roomName })}
                      className="w-full h-full block group relative"
                    >
                      <Image src={photo} alt={roomName} width={48} height={36} className="w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-mono">⤢</span>
                    </button>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-gray-300 text-xs font-mono">—</span>
                    </div>
                  )}
                </div>

                <span className="text-xs font-mono text-gray-400 w-12 flex-shrink-0">
                  {roomName.replace("Room ", "R")}
                </span>

                <div className="flex-1 relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={val}
                    onChange={(e) => setCell(room, e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent pl-4 text-black text-sm font-mono outline-none placeholder-gray-200"
                  />
                </div>

                {hasVal && (
                  <span className="text-xs font-mono text-gray-400 w-10 text-right flex-shrink-0">
                    {((num / TOTAL_RENT) * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={autoFill}
            className="flex-1 py-2.5 text-xs font-bold border border-black text-black hover:bg-black hover:text-white transition-colors"
          >
            Auto-fill remaining
          </button>
          <button
            onClick={() => ROOM_NAMES.forEach((_, room) => setCell(room, ""))}
            className="px-5 py-2.5 text-xs font-bold border border-gray-200 text-gray-400 hover:border-black hover:text-black transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Others' status */}
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowOthers(!showOthers)}
            className="w-full flex items-center justify-between text-xs font-mono text-gray-400 hover:text-black transition-colors"
          >
            <span>Others ({otherSubmittedCount}/{NUM_ROOMS - 1} submitted)</span>
            <span>{showOthers ? "▲" : "▼"}</span>
          </button>

          {showOthers && (
            <div className="mt-3 space-y-0.5">
              {names.map((name, i) => {
                if (i === person) return null;
                const pct = Math.min(Math.round((colSums[i] / TOTAL_RENT) * 100), 100);
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50">
                    <span className="font-mono text-gray-300 text-xs w-4">{i + 1}</span>
                    <span className="text-sm text-gray-600 flex-1">{name}</span>
                    {submitted[i] ? (
                      <span className="text-xs font-mono font-bold text-black">✓</span>
                    ) : (
                      <>
                        <div className="w-20 h-0.5 bg-gray-100">
                          <div className="h-full bg-gray-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-mono text-gray-300 w-8 text-right">{pct}%</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

interface ResultsScreenProps {
  result: AllocationResult;
  names: string[];
  valuations: number[][];
  syncStatus: "ok" | "syncing" | "offline";
  onReset: () => void;
}

function ResultsScreen({ result, names, valuations, syncStatus, onReset }: ResultsScreenProps) {
  const { assignment, prices, surpluses, totalRent, isEnvyFree } = result;
  const [showMatrix, setShowMatrix] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);

  const priceSum = Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100;

  const roomToPerson = useMemo(() => {
    const m = new Array(NUM_ROOMS).fill(-1);
    assignment.forEach((room, person) => (m[room] = person));
    return m;
  }, [assignment]);

  return (
    <div className="min-h-screen bg-white">
      {lightbox && <Lightbox src={lightbox.src} label={lightbox.label} onClose={() => setLightbox(null)} />}

      <header className="sticky top-0 z-20 bg-white border-b border-black px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-black text-black text-sm tracking-tight flex items-center gap-1.5">
            Results
            <SyncDot status={syncStatus} />
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowMatrix(!showMatrix)}
              className="px-3 py-1.5 text-xs font-bold border border-gray-200 text-gray-500 hover:border-black hover:text-black transition-colors"
            >
              {showMatrix ? "Hide" : "Show"} full matrix
            </button>
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs font-bold border border-black text-black hover:bg-black hover:text-white transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 pb-16 space-y-8">

        <div className={`border-l-4 ${isEnvyFree ? "border-black" : "border-gray-400"} pl-4 py-1`}>
          <p className="font-black text-black text-lg">{isEnvyFree ? "Envy-Free" : "Approximate"} Solution</p>
          <p className="text-gray-500 text-sm">
            {isEnvyFree
              ? "No roommate prefers anyone else's (room, price) pair."
              : "Rounding introduced differences under $0.01."}
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-black border border-black">
          <div className="p-4">
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Total rent</p>
            <p className="text-2xl font-black font-mono text-black">{fmt(totalRent)}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Prices sum</p>
            <p className={`text-2xl font-black font-mono ${Math.abs(priceSum - totalRent) < 0.02 ? "text-black" : "text-gray-400"}`}>
              {fmt(priceSum)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Balanced</p>
            <p className="text-2xl font-black text-black">{Math.abs(priceSum - totalRent) < 0.02 ? "Yes" : "No"}</p>
          </div>
        </div>

        {/* Assignment cards */}
        <div>
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-3">Assignments</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-black border border-black">
            {ROOM_NAMES.map((roomName, room) => {
              const person = roomToPerson[room];
              const price = prices[room];
              const val = valuations[person][room];
              const surplus = surpluses[person];
              const photo = ROOM_PHOTOS[room];
              return (
                <div key={room} className="bg-white">
                  {photo ? (
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: photo, label: roomName })}
                      className="relative w-full h-36 overflow-hidden block group"
                    >
                      <Image
                        src={photo} alt={roomName} fill
                        className="object-cover group-hover:opacity-80 transition-opacity"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-2xl">⤢</span>
                    </button>
                  ) : (
                    <div className="w-full h-20 bg-gray-50 flex items-center justify-center">
                      <span className="text-gray-200 text-xs font-mono">no photo</span>
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-mono text-gray-400">{roomName}</p>
                        <p className="font-black text-black text-lg leading-tight">{names[person]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black font-mono text-black">{fmt(price)}</p>
                        <p className="text-xs font-mono text-gray-400">/mo</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs font-mono text-gray-400 pt-1 border-t border-gray-100">
                      <span>valued {fmt(val)}</span>
                      <span className={surplus >= 0 ? "text-black" : "text-gray-400"}>
                        surplus {surplus >= 0 ? "+" : ""}{fmt(surplus)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Envy-freeness table */}
        <div>
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Envy-Freeness Check</p>
          <p className="text-xs text-gray-400 mb-3">
            Surplus = valuation − price. Filled cell = assigned room. Each person's assigned surplus is their maximum.
          </p>
          <div className="overflow-x-auto border border-black">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-black bg-black text-white">
                  <th className="text-left py-2 px-3 font-bold">Person</th>
                  {ROOM_NAMES.map((r) => (
                    <th key={r} className="py-2 px-2 text-center font-bold">{r.replace("Room ", "R")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: NUM_ROOMS }, (_, person) => {
                  const assignedRoom = assignment[person];
                  const maxSurplus = Math.max(
                    ...Array.from({ length: NUM_ROOMS }, (_, r) => valuations[person][r] - prices[r])
                  );
                  return (
                    <tr key={person} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-bold text-black whitespace-nowrap">{names[person]}</td>
                      {Array.from({ length: NUM_ROOMS }, (_, room) => {
                        const surplus = Math.round((valuations[person][room] - prices[room]) * 100) / 100;
                        const isAssigned = room === assignedRoom;
                        const isMax = !isAssigned && Math.abs(surplus - maxSurplus) < 0.02;
                        return (
                          <td
                            key={room}
                            className={`py-2 px-2 text-center ${
                              isAssigned ? "bg-black text-white font-bold" : isMax ? "text-black font-semibold" : "text-gray-300"
                            }`}
                          >
                            {fmt(surplus)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Full valuation matrix */}
        {showMatrix && (
          <div>
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-3">Original Valuations</p>
            <div className="overflow-x-auto border border-black">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-black bg-black text-white">
                    <th className="text-left py-2 px-3 font-bold">Room</th>
                    {names.map((name, i) => (
                      <th key={i} className="py-2 px-2 text-center font-bold">{name}</th>
                    ))}
                    <th className="py-2 px-2 text-center font-bold border-l border-white/20">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {ROOM_NAMES.map((roomName, room) => (
                    <tr key={room} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-bold text-black">{roomName}</td>
                      {Array.from({ length: NUM_ROOMS }, (_, person) => {
                        const isAssigned = assignment[person] === room;
                        return (
                          <td key={person} className={`py-2 px-2 text-center ${isAssigned ? "font-bold text-black" : "text-gray-300"}`}>
                            {fmt(valuations[person][room])}
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center font-bold text-black border-l border-gray-100">
                        {fmt(prices[room])}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-black bg-gray-50">
                    <td className="py-2 px-3 font-bold text-black">Total</td>
                    {Array.from({ length: NUM_ROOMS }, (_, person) => (
                      <td key={person} className="py-2 px-2 text-center font-bold text-black">
                        {fmt(valuations[person].reduce((a, b) => a + b, 0))}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-center font-bold text-black border-l border-gray-200">
                      {fmt(priceSum)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

import type { ServerState } from "@/app/api/state/route";

async function fetchRemoteState(): Promise<ServerState | null> {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function postPerson(person: number, name: string, values: string[], submitted: boolean): Promise<ServerState | null> {
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "person", person, name, values, submitted }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function postResult(result: AllocationResult): Promise<void> {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "result", result }),
    });
  } catch { /* ignore */ }
}

async function postStart(): Promise<ServerState | null> {
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "start" }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function deleteRemoteState(): Promise<void> {
  try { await fetch("/api/state", { method: "DELETE" }); } catch { /* ignore */ }
}

// ─── Sync status indicator ────────────────────────────────────────────────────

function SyncDot({ status }: { status: "ok" | "syncing" | "offline" }) {
  return (
    <span title={status === "ok" ? "Synced" : status === "syncing" ? "Syncing…" : "Offline — changes saved locally"}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
        status === "ok" ? "bg-black" : status === "syncing" ? "bg-gray-400 animate-pulse" : "bg-gray-300"
      }`} />
    </span>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RentDivider() {
  // ── Shared state (mirrors what's in Redis) ──
  const [names, setNames] = useState<string[]>([...DEFAULT_NAMES]);
  const [matrix, setMatrix] = useState<string[][]>(makeEmptyMatrix());
  const [submitted, setSubmitted] = useState<boolean[]>(Array(NUM_ROOMS).fill(false));
  const [result, setResult] = useState<AllocationResult | null>(null);

  // ── Local / ephemeral ──
  const [phase, setPhase] = useState<Phase>("landing");
  const [activePerson, setActivePerson] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<"ok" | "syncing" | "offline">("ok");

  // Ref so debounce callback always closes over the latest activePerson
  const activePersonRef = useRef<number | null>(null);
  activePersonRef.current = activePerson;

  // ── Merge remote state into local, skipping the active person's column ──
  const applyRemote = useCallback((remote: ServerState | null) => {
    if (!remote) return;
    const ap = activePersonRef.current;
    setNames((prev) => prev.map((n, i) => (i === ap ? n : remote.names[i])));
    setMatrix((prev) =>
      prev.map((row, room) =>
        row.map((cell, person) => (person === ap ? cell : remote.matrix[room][person]))
      )
    );
    setSubmitted(remote.submitted);
    if (remote.result) {
      setResult(remote.result);
      setPhase("results");
    }
  }, []);

  // ── Bootstrap: fetch once on mount ──
  useEffect(() => {
    fetchRemoteState().then((remote) => {
      if (remote) {
        applyRemote(remote);
        setPhase("choose");
      }
      // If null → stay on landing (no active session)
    });
  }, [applyRemote]);

  // ── Poll every 3 seconds ──
  useEffect(() => {
    const id = setInterval(async () => {
      const remote = await fetchRemoteState();
      applyRemote(remote);
    }, 3000);
    return () => clearInterval(id);
  }, [applyRemote]);

  // ── Debounced write of the active person's column ──
  // Fires 1 s after the last keystroke while in input phase.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePush = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const ap = activePersonRef.current;
      if (ap === null) return;
      setSyncStatus("syncing");
      setNames((currentNames) => {
        setMatrix((currentMatrix) => {
          const values = currentMatrix.map((row) => row[ap]);
          postPerson(ap, currentNames[ap], values, false).then((remote) => {
            applyRemote(remote);
            setSyncStatus(remote ? "ok" : "offline");
          });
          return currentMatrix;
        });
        return currentNames;
      });
    }, 1000);
  }, [applyRemote]);

  // ── Computed ──
  const colSums = useMemo(
    () => Array.from({ length: NUM_ROOMS }, (_, p) => columnSum(matrix, p)),
    [matrix]
  );
  const colValid = useMemo(
    () => colSums.map((s) => Math.abs(s - TOTAL_RENT) < 0.01),
    [colSums]
  );

  // ── Actions ──
  const handleStart = useCallback(async () => {
    setSyncStatus("syncing");
    const remote = await postStart();
    if (remote) {
      applyRemote(remote);
      setSyncStatus("ok");
    } else {
      setSyncStatus("offline");
    }
    setPhase("choose");
  }, [applyRemote]);

  const handlePick = useCallback((person: number) => {
    setActivePerson(person);
    setPhase("input");
  }, []);

  const setCell = useCallback((room: number, person: number, value: string) => {
    setMatrix((prev) => {
      const next = prev.map((row) => [...row]);
      next[room][person] = value;
      return next;
    });
    schedulePush();
  }, [schedulePush]);

  const handleSetName = useCallback((name: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[activePersonRef.current!] = name;
      return next;
    });
    schedulePush();
  }, [schedulePush]);

  const handleSubmit = useCallback(async () => {
    const ap = activePersonRef.current;
    if (ap === null) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSyncStatus("syncing");
    setSubmitted((prev) => {
      const next = [...prev];
      next[ap] = true;
      return next;
    });
    setNames((currentNames) => {
      setMatrix((currentMatrix) => {
        const values = currentMatrix.map((row) => row[ap]);
        postPerson(ap, currentNames[ap], values, true).then((remote) => {
          applyRemote(remote);
          setSyncStatus(remote ? "ok" : "offline");
        });
        return currentMatrix;
      });
      return currentNames;
    });
    setActivePerson(null);
    setPhase("choose");
  }, [applyRemote]);

  const handleBack = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setActivePerson(null);
    setPhase("choose");
  }, []);

  const handleRunAlgorithm = useCallback(async () => {
    const valuations = Array.from({ length: NUM_ROOMS }, (_, person) =>
      Array.from({ length: NUM_ROOMS }, (_, room) => parseFloat(matrix[room][person]) || 0)
    );
    const res = solveRentDivision(valuations, TOTAL_RENT);
    setResult(res);
    setPhase("results");
    setSyncStatus("syncing");
    await postResult(res);
    setSyncStatus("ok");
  }, [matrix]);

  const handleReset = useCallback(async () => {
    setSyncStatus("syncing");
    await deleteRemoteState();
    setMatrix(makeEmptyMatrix());
    setNames([...DEFAULT_NAMES]);
    setSubmitted(Array(NUM_ROOMS).fill(false));
    setActivePerson(null);
    setResult(null);
    setSyncStatus("ok");
    setPhase("landing");
  }, []);

  // ── Render ──
  if (phase === "landing") {
    return <Landing onStart={handleStart} syncStatus={syncStatus} />;
  }

  if (phase === "choose") {
    return (
      <ChooseScreen
        names={names}
        submitted={submitted}
        colValid={colValid}
        colSums={colSums}
        syncStatus={syncStatus}
        onPick={handlePick}
        onRunAlgorithm={handleRunAlgorithm}
      />
    );
  }

  if (phase === "input" && activePerson !== null) {
    return (
      <InputScreen
        person={activePerson}
        names={names}
        setName={handleSetName}
        matrix={matrix}
        setCell={(room, value) => setCell(room, activePerson, value)}
        submitted={submitted}
        colSums={colSums}
        colValid={colValid}
        syncStatus={syncStatus}
        onSubmit={handleSubmit}
        onBack={handleBack}
      />
    );
  }

  if (phase === "results" && result) {
    const valuations = Array.from({ length: NUM_ROOMS }, (_, person) =>
      Array.from({ length: NUM_ROOMS }, (_, room) => parseFloat(matrix[room][person]) || 0)
    );
    return (
      <ResultsScreen
        result={result}
        names={names}
        valuations={valuations}
        syncStatus={syncStatus}
        onReset={handleReset}
      />
    );
  }

  return null;
}
