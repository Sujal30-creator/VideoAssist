import React, { useState } from 'react';
import { Search, Loader2, Play, Brain, Target, Combine, CheckCircle2, AlertTriangle, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { mockEvents, mockSegments } from '@/data/mockData';
import { Event } from '@/types';

const PRESET_QUESTIONS = [
  "When was the router restarted?",
  "What happened after the cable was reconnected?",
  "What error appeared before the router restart?",
  "When did the technician verify connectivity?",
  "Who is the technician?"
];

interface QueryInterpretation {
  intent: string;
  targetEvent?: string;
  anchorEvent?: string;
  relation?: string;
}

interface SimulatedRetrieval {
  coarseWindow: { start: number, end: number };
  groundedWindow: { start: number, end: number };
  scores: {
    visual: number;
    transcript: number;
    ocr: number;
    semantic: number;
    final: number;
  };
  matchingModalities: string[];
  relevantEvent: Event;
}

interface QAVerification {
  abstain: boolean;
  abstainReason?: string;
  answer?: string;
  confidence: number;
  verificationChecks: {
    visual: boolean;
    speech: boolean;
    ocr: boolean;
    temporal: boolean;
  };
  evidenceBundle?: {
    visual: string[];
    transcript: string[];
    ocr: string[];
    prevEvent?: string;
    nextEvent?: string;
  };
}

export default function SearchPanel({ onSeek }: { onSeek?: (ms: number) => void }) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [interpretation, setInterpretation] = useState<QueryInterpretation | null>(null);
  const [retrievalResult, setRetrievalResult] = useState<SimulatedRetrieval | null>(null);
  const [qaResult, setQaResult] = useState<QAVerification | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const simulateProcessing = (q: string) => {
    const lowerQ = q.toLowerCase();

    // --- 1. Query Understanding ---
    const interp: QueryInterpretation = { intent: "Event Retrieval", targetEvent: "Unknown" };
    let targetEventObj: Event | undefined;

    // Abstention Check
    let isAbstention = false;
    let abstainReason = "";
    if (lowerQ.includes("who is") || lowerQ.includes("person") || lowerQ.includes("technician")) {
      isAbstention = true;
      interp.intent = "Entity Identification";
      abstainReason = "The available evidence does not identify the person, and person identification is outside the system scope.";
    } else if (lowerQ.includes("exact network configuration") || lowerQ.includes("ip address")) {
      isAbstention = true;
      interp.intent = "Configuration Retrieval";
      abstainReason = "Insufficient evidence. The video frames and transcript do not capture the specific network configuration.";
    }

    if (!isAbstention) {
      if (lowerQ.includes("error") && lowerQ.includes("before") && (lowerQ.includes("restart") || lowerQ.includes("reboot"))) {
        // Query 3: What error appeared before the router restart?
        interp.intent = "Temporal Retrieval";
        interp.relation = "BEFORE";
        interp.anchorEvent = "Router Restart";
        targetEventObj = mockEvents.find(e => e.eventType === "ERROR_STATE");
      } else if (lowerQ.includes("after") || lowerQ.includes("before")) {
        interp.intent = "Temporal Retrieval";
        if (lowerQ.includes("after")) interp.relation = "AFTER";
        if (lowerQ.includes("before")) interp.relation = "BEFORE";

        if (lowerQ.includes("cable") || lowerQ.includes("reconnect")) {
          interp.anchorEvent = "Cable Reconnection";
          targetEventObj = mockEvents.find(e => e.eventType === "REBOOT");
        } else if (lowerQ.includes("error")) {
          interp.anchorEvent = "Error Detected";
          targetEventObj = mockEvents.find(e => e.eventType === "RECONNECTION");
        }
      } else {
        interp.intent = "Event Retrieval";
        if (lowerQ.includes("restart") || lowerQ.includes("reboot")) {
          interp.targetEvent = "Router Restart";
          targetEventObj = mockEvents.find(e => e.eventType === "REBOOT");
        } else if (lowerQ.includes("verify") || lowerQ.includes("connectivity")) {
          interp.targetEvent = "Connectivity Verification";
          targetEventObj = mockEvents.find(e => e.eventType === "VERIFICATION");
        } else if (lowerQ.includes("error") || lowerQ.includes("displayed")) {
          interp.targetEvent = "Error State";
          targetEventObj = mockEvents.find(e => e.eventType === "ERROR_STATE");
        }
      }
    }

    if (!targetEventObj && !isAbstention) {
      targetEventObj = mockEvents[0]; // fallback
    }

    // --- 2. Coarse Retrieval & Fine Grounding ---
    let result: SimulatedRetrieval | undefined;
    let qa: QAVerification;

    if (isAbstention) {
      qa = { abstain: true, abstainReason, confidence: 0, verificationChecks: { visual: false, speech: false, ocr: false, temporal: false } };
    } else {
      const seg = mockSegments.find(s => s.id === targetEventObj?.segmentId)!;

      const coarseWindow = {
        start: Math.max(0, seg.startTimeMs - 15000),
        end: Math.min(180000, seg.endTimeMs + 15000)
      };
      const groundedWindow = { start: seg.startTimeMs, end: seg.endTimeMs };

      const vScore = 0.85 + Math.random() * 0.1;
      const tScore = targetEventObj!.evidence.transcripts.length > 0 ? 0.9 + Math.random() * 0.08 : 0.4;
      const oScore = targetEventObj!.evidence.ocr.length > 0 ? 0.95 + Math.random() * 0.04 : 0.1;
      const sScore = 0.88 + Math.random() * 0.1;
      const fScore = (vScore * 0.35) + (tScore * 0.30) + (oScore * 0.20) + (sScore * 0.15);

      const modalities = ["Visual", "Semantic"];
      if (tScore > 0.5) modalities.push("Speech");
      if (oScore > 0.5) modalities.push("OCR");

      result = {
        coarseWindow, groundedWindow, matchingModalities: modalities, relevantEvent: targetEventObj!,
        scores: { visual: vScore, transcript: tScore, ocr: oScore, semantic: sScore, final: fScore }
      };

      // --- 3. Evidence Verification & Grounded QA ---
      const hasVis = targetEventObj!.evidence.visuals.length > 0;
      const hasSpeech = targetEventObj!.evidence.transcripts.length > 0;
      const hasOcr = targetEventObj!.evidence.ocr.length > 0;
      const hasTemporal = targetEventObj!.temporalRelations.length > 0;

      const verifiedConfidence = Math.min(0.99, fScore * (hasVis ? 1.05 : 0.9) * (hasTemporal ? 1.05 : 0.9));

      const eventIdx = mockEvents.findIndex(e => e.id === targetEventObj!.id);
      const prevEvent = eventIdx > 0 ? mockEvents[eventIdx - 1].description : undefined;
      const nextEvent = eventIdx < mockEvents.length - 1 ? mockEvents[eventIdx + 1].description : undefined;

      let generatedAnswer = `The ${targetEventObj!.description.toLowerCase()} occurred between ${formatTime(seg.startTimeMs)} and ${formatTime(seg.endTimeMs)}.`;
      if (prevEvent) generatedAnswer += ` This happened after the ${prevEvent.toLowerCase()}.`;

      qa = {
        abstain: false,
        answer: generatedAnswer,
        confidence: verifiedConfidence,
        verificationChecks: { visual: hasVis, speech: hasSpeech, ocr: hasOcr, temporal: hasTemporal },
        evidenceBundle: {
          visual: targetEventObj!.evidence.visuals.map(v => v.description),
          transcript: targetEventObj!.evidence.transcripts.map(t => t.text),
          ocr: targetEventObj!.evidence.ocr.map(o => o.text),
          prevEvent,
          nextEvent
        }
      };
    }

    return { interp, result, qa };
  };

  const runSearch = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setIsSearching(true);
    setInterpretation(null);
    setRetrievalResult(null);
    setQaResult(null);
    setShowEvidence(false);

    setTimeout(() => {
      const { interp, result, qa } = simulateProcessing(q);
      setInterpretation(interp);

      setTimeout(() => {
        if (result) setRetrievalResult(result);

        setTimeout(() => {
          setQaResult(qa);
          setIsSearching(false);
        }, 1000);

      }, 1000);

    }, 600);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const runGuidedDemo = () => {
    const demoQuery = "When was the router restarted?";
    let charIndex = 0;
    setQuery("");

    // Simulate typing
    const typingInterval = setInterval(() => {
      charIndex++;
      setQuery(demoQuery.slice(0, charIndex));
      if (charIndex >= demoQuery.length) {
        clearInterval(typingInterval);
        setTimeout(() => runSearch(demoQuery), 400);
      }
    }, 40);
  };

  return (
    <div className="bg-surface rounded-2xl p-8 border border-border shadow-xl mt-6 relative overflow-hidden transition-theme">
      {/* Guided Demo Ribbon */}
      <div className="absolute top-0 left-0 bg-success/10 text-success text-[10px] uppercase font-bold px-4 py-1.5 border-b border-r border-success/20 rounded-br-lg tracking-wider flex items-center gap-1.5">
        Demo Mode
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2 mt-4">
          <h2 className="text-2xl font-bold text-text-primary">Ask VideoAssist</h2>
          <button
            onClick={runGuidedDemo}
            disabled={isSearching}
            className="flex items-center gap-2 bg-success hover:bg-success/80 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" /> Run Guided Demo
          </button>
        </div>
        <p className="text-text-secondary mb-8">Natural language temporal and event retrieval across multimodal indexes.</p>

        <form onSubmit={handleSearch} className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., When was the router restarted?"
            className="w-full bg-background border border-border text-text-primary rounded-xl py-4 pl-14 pr-32 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-lg shadow-inner"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {PRESET_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => runSearch(q)}
              type="button"
              disabled={isSearching}
              className="text-xs bg-surface-elevated hover:bg-surface-secondary border border-border text-text-secondary px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Results Section */}
        <div className="space-y-6">

          {/* Step 1: Query Interpretation */}
          {interpretation && (
            <div className="bg-background rounded-xl p-5 border border-border animate-in fade-in slide-in-from-top-4 duration-500 transition-theme">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-4 border-b border-border pb-3">
                <Brain className="w-4 h-4 text-primary" /> Query Understanding
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-[10px] uppercase text-text-muted font-bold mb-1">Intent</div>
                  <div className="text-sm text-primary bg-primary-soft px-2 py-1 rounded inline-block border border-primary/20">{interpretation.intent}</div>
                </div>
                {interpretation.targetEvent && (
                  <div>
                    <div className="text-[10px] uppercase text-text-muted font-bold mb-1">Target Event</div>
                    <div className="text-sm text-text-primary">{interpretation.targetEvent}</div>
                  </div>
                )}
                {interpretation.anchorEvent && (
                  <div>
                    <div className="text-[10px] uppercase text-text-muted font-bold mb-1">Anchor Event</div>
                    <div className="text-sm text-text-primary">{interpretation.anchorEvent}</div>
                  </div>
                )}
                {interpretation.relation && (
                  <div>
                    <div className="text-[10px] uppercase text-text-muted font-bold mb-1">Relation</div>
                    <div className="text-sm text-info font-mono bg-info/10 px-2 py-1 inline-block rounded border border-info/20">{interpretation.relation}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Retrieval & Grounding */}
          {retrievalResult && !qaResult?.abstain && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-500">
              {/* Grounding Visualization */}
              <div className="bg-background rounded-xl p-6 border border-border relative overflow-hidden transition-theme">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-6">
                  <Target className="w-4 h-4 text-success" /> Temporal Grounding
                </h4>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-full text-center">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Coarse Retrieval</div>
                    <div className="bg-surface border border-border rounded-lg py-2 text-sm font-mono text-text-secondary w-full transition-theme">
                      {formatTime(retrievalResult.coarseWindow.start)} - {formatTime(retrievalResult.coarseWindow.end)}
                    </div>
                  </div>
                  <div className="text-text-muted">↓</div>
                  <div className="w-3/4 text-center">
                    <div className="text-[10px] text-success uppercase tracking-wider mb-1 font-bold">Fine Temporal Grounding</div>
                    <div className="bg-success/10 border border-success/20 rounded-lg py-3 text-lg font-mono text-success w-full shadow-sm">
                      {formatTime(retrievalResult.groundedWindow.start)} - {formatTime(retrievalResult.groundedWindow.end)}
                    </div>
                  </div>
                  <button
                    onClick={() => onSeek && onSeek(retrievalResult.groundedWindow.start)}
                    className="mt-4 flex items-center gap-2 text-primary hover:text-primary-hover text-xs font-medium bg-primary-soft px-4 py-2 rounded-full border border-primary/20 transition-colors"
                  >
                    <Play className="w-3 h-3" /> Play Grounded Segment
                  </button>
                </div>
              </div>

              {/* Multimodal Scores */}
              <div className="bg-background rounded-xl p-6 border border-border transition-theme">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                    <Combine className="w-4 h-4 text-accent" /> Multimodal Score
                  </h4>
                  <div className="text-lg font-bold text-text-primary">
                    {(retrievalResult.scores.final * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">Visual Similarity (0.35)</span>
                      <span className="text-text-primary font-mono">{(retrievalResult.scores.visual * 100).toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-elevated border border-border rounded-full overflow-hidden"><div className="h-full bg-[var(--color-chart-visual)]" style={{ width: `${retrievalResult.scores.visual * 100}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">Transcript Match (0.30)</span>
                      <span className="text-text-primary font-mono">{(retrievalResult.scores.transcript * 100).toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-elevated border border-border rounded-full overflow-hidden"><div className="h-full bg-[var(--color-chart-speech)]" style={{ width: `${retrievalResult.scores.transcript * 100}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">OCR Match (0.20)</span>
                      <span className="text-text-primary font-mono">{(retrievalResult.scores.ocr * 100).toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-elevated border border-border rounded-full overflow-hidden"><div className="h-full bg-[var(--color-chart-ocr)]" style={{ width: `${retrievalResult.scores.ocr * 100}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-secondary">Semantic Intent (0.15)</span>
                      <span className="text-text-primary font-mono">{(retrievalResult.scores.semantic * 100).toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-elevated border border-border rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${retrievalResult.scores.semantic * 100}%` }} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Evidence Verification & QA */}
          {qaResult && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              {qaResult.abstain ? (
                <div className="bg-error/10 border border-error/20 rounded-xl p-6 md:p-8 transition-theme">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-error/20 p-3 rounded-full">
                      <AlertTriangle className="w-6 h-6 text-error" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-text-primary">Unable to answer confidently.</h3>
                    </div>
                  </div>
                  <p className="text-text-secondary leading-relaxed border-l-2 border-error/50 pl-4 ml-3">
                    <span className="font-semibold text-error mr-2">Reason:</span>
                    {qaResult.abstainReason}
                  </p>
                </div>
              ) : (
                <div className="bg-background rounded-xl border border-primary/30 shadow-md relative overflow-hidden transition-theme">
                  {/* Verification Ribbon */}
                  <div className="absolute top-0 right-0 bg-primary-soft text-primary text-[10px] uppercase font-bold px-4 py-1.5 border-b border-l border-primary/20 rounded-bl-lg tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" /> Simulated Grounded QA
                  </div>

                  <div className="p-6 md:p-8">
                    <div className="mb-6 border-b border-border pb-6 pr-32">
                      <h4 className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">Final Answer</h4>
                      <p className="text-2xl text-text-primary font-medium leading-relaxed">
                        {qaResult.answer}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 mb-6">
                      <div>
                        <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Timestamp</div>
                        <div className="text-sm font-mono text-primary">{formatTime(retrievalResult!.groundedWindow.start)} - {formatTime(retrievalResult!.groundedWindow.end)}</div>
                      </div>

                      <div>
                        <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Evidence Confidence</div>
                        <div className="text-sm font-bold text-success">{(qaResult.confidence * 100).toFixed(0)}%</div>
                      </div>

                      <div>
                        <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Supporting Modalities</div>
                        <div className="flex gap-2">
                          {qaResult.verificationChecks.visual && <span className="bg-surface border border-border text-text-secondary text-xs px-2 py-0.5 rounded">Visual</span>}
                          {qaResult.verificationChecks.speech && <span className="bg-surface border border-border text-text-secondary text-xs px-2 py-0.5 rounded">Speech</span>}
                          {qaResult.verificationChecks.ocr && <span className="bg-surface border border-border text-text-secondary text-xs px-2 py-0.5 rounded">OCR</span>}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Evidence Section */}
                    <div className="mt-4">
                      <button
                        onClick={() => setShowEvidence(!showEvidence)}
                        className="flex items-center justify-between w-full bg-surface hover:bg-surface-secondary transition-colors border border-border rounded-lg px-4 py-3 text-sm font-medium text-text-secondary"
                      >
                        <span className="flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Why this answer? (Evidence Verification Log)</span>
                        {showEvidence ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                      </button>

                      {showEvidence && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 fade-in">
                          <div className="bg-surface/50 p-4 rounded-xl border border-border text-sm transition-theme">
                            <h5 className="font-semibold text-text-secondary mb-3 uppercase tracking-wider text-[10px]">Verification Checklist</h5>
                            <ul className="space-y-2">
                              <li className="flex items-center justify-between"><span className="text-text-primary">Visual support</span> {qaResult.verificationChecks.visual ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-text-muted">-</span>}</li>
                              <li className="flex items-center justify-between"><span className="text-text-primary">Speech support</span> {qaResult.verificationChecks.speech ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-text-muted">-</span>}</li>
                              <li className="flex items-center justify-between"><span className="text-text-primary">OCR support</span> {qaResult.verificationChecks.ocr ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-text-muted">-</span>}</li>
                              <li className="flex items-center justify-between"><span className="text-text-primary">Temporal consistency</span> {qaResult.verificationChecks.temporal ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-text-muted">-</span>}</li>
                            </ul>
                          </div>

                          <div className="bg-surface/50 p-4 rounded-xl border border-border text-sm transition-theme">
                            <h5 className="font-semibold text-text-secondary mb-3 uppercase tracking-wider text-[10px]">Compiled Evidence Bundle</h5>

                            <div className="space-y-3">
                              {qaResult.evidenceBundle?.visual.length ? (
                                <div><span className="text-xs font-bold text-[var(--color-chart-visual)]">Visual:</span> <span className="text-text-primary italic">{qaResult.evidenceBundle.visual.join(', ')}</span></div>
                              ) : null}
                              {qaResult.evidenceBundle?.transcript.length ? (
                                <div><span className="text-xs font-bold text-[var(--color-chart-speech)]">Transcript:</span> <span className="text-text-primary italic">{qaResult.evidenceBundle.transcript.join(' ')}</span></div>
                              ) : null}
                              {qaResult.evidenceBundle?.ocr.length ? (
                                <div><span className="text-xs font-bold text-[var(--color-chart-ocr)]">OCR:</span> <span className="text-text-primary font-mono">{qaResult.evidenceBundle.ocr.join(', ')}</span></div>
                              ) : null}
                              {qaResult.evidenceBundle?.prevEvent && (
                                <div><span className="text-xs font-bold text-text-muted">Previous Event:</span> <span className="text-text-primary">{qaResult.evidenceBundle.prevEvent}</span></div>
                              )}
                              {qaResult.evidenceBundle?.nextEvent && (
                                <div><span className="text-xs font-bold text-text-muted">Next Event:</span> <span className="text-text-primary">{qaResult.evidenceBundle.nextEvent}</span></div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
