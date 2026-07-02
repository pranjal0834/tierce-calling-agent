"use client";
import { PhoneCall, X } from "lucide-react";

export default function DialModal({ show, setShow, agents, dialForm, setDialForm, handleDial, dialTrapRef }: {
  show: boolean;
  setShow: (v: boolean) => void;
  agents: any[];
  dialForm: { agent_id: string; phone_number: string; name: string };
  setDialForm: React.Dispatch<React.SetStateAction<{ agent_id: string; phone_number: string; name: string }>>;
  handleDial: () => void;
  dialTrapRef: React.RefObject<HTMLDivElement>;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dial-modal-title">
      <div ref={dialTrapRef} className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-lg w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between">
          <h2 id="dial-modal-title" className="text-lg font-semibold text-neutral-900">Initiate Call</h2>
          <button onClick={() => setShow(false)} className="text-neutral-400 hover:text-neutral-900"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="dial-agent" className="text-sm text-neutral-700">Agent</label>
            <select
              id="dial-agent"
              className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
              value={dialForm.agent_id}
              onChange={e => setDialForm(f => ({ ...f, agent_id: e.target.value }))}
            >
              <option value="">Select agent...</option>
              {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dial-phone" className="text-sm text-neutral-700">Phone Number</label>
            <input
              id="dial-phone"
              type="tel"
              inputMode="tel"
              className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
              placeholder="+1234567890"
              value={dialForm.phone_number}
              onChange={e => setDialForm(f => ({ ...f, phone_number: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dial-name" className="text-sm text-neutral-700">Name <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input
              id="dial-name"
              className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
              placeholder="e.g. Ravi — fills [Customer Name] in the prompt"
              value={dialForm.name}
              onChange={e => setDialForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3">
          <button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button
            onClick={handleDial}
            className="px-5 py-2 bg-success-600 hover:bg-success-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <PhoneCall className="w-4 h-4" /> Call
          </button>
        </div>
      </div>
    </div>
  );
}
