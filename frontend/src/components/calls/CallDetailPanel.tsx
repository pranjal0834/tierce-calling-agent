"use client";
import { useEffect, useRef, useState } from "react";
import {
  Phone, User, Globe, TrendingUp, DollarSign, Repeat, Calendar, X,
  MessageSquare, CheckCircle2, Zap, BarChart2, XCircle, Mic2, PhoneOff,
  ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { getRecordingUrl } from "@/lib/api";
import {
  toUTC, IST, fmtDate, fmtDuration, fmtDateTime, sentimentLabel,
  STATUS_MAP, INTEREST_COLOR, StatusBadge,
} from "./calls-utils";

function CallAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onLoaded() {
      if (!audio) return;
      if (!isFinite(audio.duration)) {
        audio.currentTime = 1e101;
      }
    }

    function onTimeUpdate() {
      if (!audio) return;
      if (isFinite(audio.duration) && audio.currentTime > 0) {
        audio.currentTime = 0;
        audio.removeEventListener("timeupdate", onTimeUpdate);
      }
    }

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [src]);

  return (
    <audio ref={audioRef} controls className="w-full mt-1" src={src} preload="auto">
      Your browser does not support audio.
    </audio>
  );
}

function StatChip({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-neutral-50 rounded-lg px-2.5 sm:px-3 py-2 min-w-0">
      <div className="flex items-center gap-1 text-neutral-500 mb-0.5 min-w-0">
        {icon}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className={`text-xs sm:text-sm font-semibold ${valueClass || "text-neutral-900"} break-words`}>{value}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {icon}
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide truncate">{title}</h3>
      </div>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] sm:text-[10px] text-neutral-500 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-xs sm:text-sm mt-0.5 ${mono ? "font-mono" : ""} ${valueClass || "text-neutral-700"} break-words`}>{value}</p>
    </div>
  );
}

export default function CallDetailPanel({ detailOpen, detail, detailLoading, closeDetail, activeTab, setActiveTab, handleHangup }: {
  detailOpen: boolean;
  detail: any | null;
  detailLoading: boolean;
  closeDetail: () => void;
  activeTab: "overview" | "data";
  setActiveTab: (tab: "overview" | "data") => void;
  handleHangup: (callId: string) => void;
}) {
  if (!detailOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[1px] animate-fade-in" onClick={closeDetail} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-neutral-200 shadow-modal flex flex-col max-h-[90vh] animate-scale-in overflow-hidden">
        <button
          onClick={closeDetail}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-800 bg-white/80 hover:bg-neutral-100 shadow-xs transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {detailLoading && (
          <div className="flex items-center justify-center flex-1 py-20">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!detailLoading && !detail && (
          <div className="flex flex-col items-center justify-center h-full p-12 text-center">
            <Phone className="w-12 h-12 text-neutral-300 mb-3" />
            <p className="text-neutral-500 text-sm">Select a call to view full details</p>
          </div>
        )}

        {!detailLoading && detail && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Header */}
            <div className="px-3 sm:px-5 py-4 border-b border-neutral-200 flex-shrink-0">
              <div className="flex flex-col gap-3 sm:gap-4">
                <div>
                  <div className="flex items-start gap-2 mb-2">
                    <User className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-900 text-lg break-words">
                        {detail.contact?.name || "Unknown Caller"}
                      </p>
                      {detail.contact?.company && (
                        <p className="text-sm text-neutral-500 mt-0.5 break-words">{detail.contact.company}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-2 flex-wrap">
                    <span className="text-sm text-neutral-500 font-mono break-all">{detail.call.phone_number}</span>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={detail.call.status} />
                      <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        detail.call.direction === "outbound"
                          ? "bg-brand-500/10 text-brand-400"
                          : "bg-success-500/10 text-success-400"
                      }`}>
                        {detail.call.direction === "outbound" ? "↑ Outbound" : "↓ Inbound"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <p className="text-xs text-neutral-500 mb-0.5">Start</p>
                      <p className="text-neutral-900 font-medium">{fmtDate(detail.call.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-500 mb-0.5">Duration</p>
                      <p className="text-neutral-900 font-medium">{fmtDuration(detail.call.duration_seconds)}</p>
                    </div>
                  </div>
                  {["initiated", "ringing", "in_progress"].includes(detail.call.status) && (
                    <button
                      onClick={() => handleHangup(detail.call.id)}
                      className="flex items-center justify-center sm:justify-start gap-1.5 bg-error-600 hover:bg-error-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                      <PhoneOff className="w-3.5 h-3.5" /> Hang Up
                    </button>
                  )}
                </div>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
                <StatChip
                  icon={<Globe className="w-3 h-3" />}
                  label="Language"
                  value={detail.call.extra_data?.language_used || detail.agent?.languages?.[0] || "English"}
                />
                <StatChip
                  icon={<TrendingUp className="w-3 h-3" />}
                  label="Sentiment"
                  value={detail.call.sentiment_score != null
                    ? `${sentimentLabel(detail.call.sentiment_score)} · ${(detail.call.sentiment_score * 10).toFixed(0)}%`
                    : "—"}
                  valueClass={
                    detail.call.sentiment_score == null ? "text-neutral-400" :
                    detail.call.sentiment_score >= 7 ? "text-success-400" :
                    detail.call.sentiment_score >= 4 ? "text-yellow-400" : "text-error-400"
                  }
                />
                <StatChip
                  icon={<DollarSign className="w-3 h-3" />}
                  label="Cost"
                  value={detail.call.cost_usd != null ? `$${detail.call.cost_usd.toFixed(4)}` : "—"}
                  valueClass={detail.call.cost_usd != null ? "text-warning-600" : "text-neutral-400"}
                />
                <StatChip
                  icon={<Repeat className="w-3 h-3" />}
                  label="Total Calls"
                  value={`${detail.contact?.total_calls ?? 1}×`}
                />
                <StatChip
                  icon={<Calendar className="w-3 h-3" />}
                  label="Appointment"
                  value={detail.call.extra_data?.appointment_booked ? "Booked" : "No"}
                  valueClass={detail.call.extra_data?.appointment_booked ? "text-success-600" : "text-neutral-400"}
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-200 flex-shrink-0 overflow-x-auto" role="tablist">
              {(["overview", "data"] as const).map(tab => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`tabpanel-${tab}`}
                  id={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? "border-brand-500 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {tab === "overview" ? "Overview" : "Extracted Data"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">

              {/* OVERVIEW TAB */}
              {activeTab === "overview" && (
                <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
                <div className="space-y-3 sm:space-y-4">
                  {detail.call.summary && (
                    <Section icon={<MessageSquare className="w-4 h-4 text-brand-400" />} title="Summary">
                      <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed break-words">{detail.call.summary}</p>
                    </Section>
                  )}

                  {detail.call.extra_data?.appointment_booked && (
                    <Section icon={<Calendar className="w-4 h-4 text-success-400" />} title="Appointment Booked">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-success-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs sm:text-sm text-neutral-900 font-medium break-words">
                          {detail.call.extra_data.appointment_datetime
                            ? fmtDateTime(detail.call.extra_data.appointment_datetime)
                            : "Appointment booked — time not specified"}
                        </p>
                      </div>
                    </Section>
                  )}

                  <Section icon={<Zap className="w-4 h-4 text-purple-400" />} title="Call Info">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                      <InfoRow label="Agent" value={detail.agent?.name || "—"} />
                      <InfoRow label="Pipeline" value={detail.call.pipeline_mode} />
                      <InfoRow label="Start time" value={fmtDate(detail.call.started_at)} />
                      <InfoRow label="End time" value={fmtDate(detail.call.ended_at)} />
                      <InfoRow label="Languages" value={(detail.agent?.languages || ["English"]).join(", ")} />
                      <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                      <InfoRow
                        label="Ended by"
                        value={detail.call.extra_data?.ended_by === "caller" ? "Caller" : detail.call.extra_data?.ended_by === "agent" ? "Agent" : "—"}
                        valueClass={detail.call.extra_data?.ended_by === "caller" ? "text-orange-600" : detail.call.extra_data?.ended_by === "agent" ? "text-info-600" : "text-neutral-400"}
                      />
                    </div>
                  </Section>

                  <Section icon={<User className="w-4 h-4 text-info-400" />} title="Caller Profile">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                      <InfoRow label="Name" value={detail.contact?.name || detail.call.extra_data?.caller_name || "—"} />
                      <InfoRow label="Phone" value={detail.contact?.phone_number || detail.call.phone_number} mono />
                      <InfoRow label="Email" value={detail.contact?.email || "—"} />
                      <InfoRow label="Company" value={detail.contact?.company || "—"} />
                      <InfoRow
                        label="Interest level"
                        value={detail.call.extra_data?.caller_interest || "—"}
                        valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-neutral-700"}
                      />
                      <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                    </div>
                  </Section>

                  {detail.call_history?.length > 0 && (
                    <Section icon={<Repeat className="w-4 h-4 text-orange-400" />} title={`Call History (${detail.contact?.total_calls} total)`}>
                      <div className="space-y-1.5 overflow-x-auto">
                        {detail.call_history.map((h: any) => (
                          <div key={h.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-neutral-50 rounded-lg px-2 sm:px-3 py-2 gap-2 min-w-[250px]">
                            <div className="flex items-center gap-2 min-w-0">
                              {h.direction === "outbound"
                                ? <ArrowUpRight className="w-3 h-3 text-brand-400 flex-shrink-0" />
                                : <ArrowDownLeft className="w-3 h-3 text-success-400 flex-shrink-0" />}
                              <span className="text-xs text-neutral-500 truncate">{fmtDate(h.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                              {h.duration_seconds && (
                                <span className="text-xs text-neutral-400">{fmtDuration(h.duration_seconds)}</span>
                              )}
                              <StatusBadge status={h.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
                </div>
              )}

              {/* EXTRACTED DATA TAB */}
              {activeTab === "data" && (
                <div role="tabpanel" id="tabpanel-data" aria-labelledby="tab-data" className="space-y-3 sm:space-y-4">
                  {Array.isArray(detail.call.extra_data?.key_points) && detail.call.extra_data.key_points.length > 0 && (
                    <Section icon={<BarChart2 className="w-4 h-4 text-brand-400" />} title="Key Points">
                      <ul className="space-y-1.5">
                        {detail.call.extra_data.key_points.map((pt: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-neutral-700">
                            <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                            <span className="break-words">{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section icon={<Calendar className="w-4 h-4 text-success-400" />} title="Appointment">
                    <div className="flex items-start gap-3">
                      {detail.call.extra_data?.appointment_booked
                        ? <CheckCircle2 className="w-5 h-5 text-success-400 flex-shrink-0" />
                        : <XCircle className="w-5 h-5 text-neutral-500 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 break-words">
                          {detail.call.extra_data?.appointment_booked ? "Appointment booked" : "No appointment booked"}
                        </p>
                        {detail.call.extra_data?.appointment_datetime && (
                          <p className="text-xs text-success-400 mt-0.5 break-words">
                            {fmtDateTime(detail.call.extra_data.appointment_datetime)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section icon={<User className="w-4 h-4 text-info-400" />} title="Extracted Caller Info">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                      <InfoRow label="Name" value={detail.call.extra_data?.caller_name || "—"} />
                      <InfoRow
                        label="Interest"
                        value={detail.call.extra_data?.caller_interest || "—"}
                        valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-neutral-700"}
                      />
                      <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                      <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                    </div>
                  </Section>

                  <Section icon={<TrendingUp className="w-4 h-4 text-pink-400" />} title="Sentiment & Emotions">
                    <div className="space-y-2 overflow-hidden">
                      {detail.call.sentiment_score != null && (() => {
                        const pct = Math.min(100, Math.round((detail.call.sentiment_score / 10) * 100));
                        return (
                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                              <span className="text-xs text-neutral-500">Overall positivity</span>
                              <span className={`text-sm font-bold ${
                                pct >= 70 ? "text-success-400" : pct >= 40 ? "text-yellow-400" : "text-error-400"
                              }`}>{sentimentLabel(detail.call.sentiment_score)} · {pct}%</span>
                            </div>
                            <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct >= 70 ? "bg-success-500" : pct >= 40 ? "bg-yellow-500" : "bg-error-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                      {typeof detail.call.emotion_profile === "object" &&
                        !Array.isArray(detail.call.emotion_profile) &&
                        Object.keys(detail.call.emotion_profile || {}).length > 0 && (() => {
                          const entries = Object.entries(detail.call.emotion_profile || {});
                          const isPerTurn = entries.some(([, v]) => v !== null && typeof v === "object");
                          if (isPerTurn) {
                            const turnCount = entries.length;
                            const emotions: string[] = Array.from(new Set(
                              entries.map(([, v]: any) => v?.emotion).filter(Boolean)
                            ));
                            const avgEngagement = entries.reduce((s, [, v]: any) => s + (v?.engagement ?? 0), 0) / turnCount;
                            return (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs text-neutral-400">{turnCount} turns analyzed</p>
                                <div className="flex flex-wrap gap-1">
                                  {emotions.map((e) => (
                                    <span key={e} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full capitalize whitespace-nowrap">{e}</span>
                                  ))}
                                  <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-1 rounded-full whitespace-nowrap">
                                    engagement {Math.round(avgEngagement * 100)}%
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {entries.map(([k, v]: any) => (
                                <span key={k} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full capitalize whitespace-nowrap">
                                  {k}: {typeof v === "number" ? `${Math.round(v * 100)}%` : String(v ?? "")}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                    </div>
                  </Section>

                  <Section icon={<Mic2 className="w-4 h-4 text-neutral-400" />} title="Recording">
                    {detail.call.has_recording ? (
                      <div className="overflow-x-auto">
                        <CallAudioPlayer src={getRecordingUrl(detail.call.id)} />
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-neutral-500 break-words">
                        {detail.call.status === "completed"
                          ? "Recording is being processed — check back in a moment."
                          : "No recording available for this call."}
                      </p>
                    )}
                  </Section>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
