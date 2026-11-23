import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getJson, postJson } from '../api/worldApi';

interface Conversation { id: number; person: string; title: string; day: number; messages?: number }
interface Message { id: number; role: 'user' | 'npc'; text: string; provider: string | null; model: string | null; warnings: string[] }

/** Talk with one named person; they answer from their own record and remember what the traveller said. */
export function ChatPanel({ scenarioId, personId, name }: { scenarioId: string; personId: string; name: string }) {
  const people = `/api/scenarios/${encodeURIComponent(scenarioId)}/people/${encodeURIComponent(personId)}/conversations`;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getJson<Conversation[]>(people).then((b) => {
      setConversations(b.data);
      setCurrent(b.data[0]?.id ?? null);
    }).catch((e: Error) => setError(e.message));
  }, [people]);
  useEffect(() => {
    if (current == null) { setMessages([]); return; }
    getJson<{ messages: Message[] }>(`/api/scenarios/${encodeURIComponent(scenarioId)}/conversations/${current}`)
      .then((b) => setMessages(b.data.messages)).catch((e: Error) => setError(e.message));
  }, [scenarioId, current]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages]);

  const fresh = async () => {
    const created = await postJson<Conversation>(people, { title: `Talk with ${name}` });
    setConversations((c) => [created.data, ...c]);
    setCurrent(created.data.id);
    return created.data.id;
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = current ?? await fresh();
      const pair = await postJson<Message[]>(`/api/scenarios/${encodeURIComponent(scenarioId)}/conversations/${id}/messages`, { text });
      setMessages((m) => [...m, ...pair.data]);
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chat">
      <div className="inline-form">
        <select aria-label="Conversation" value={current ?? ''} onChange={(e) => setCurrent(e.target.value ? Number(e.target.value) : null)}>
          {conversations.length === 0 && <option value="">No conversation yet</option>}
          {conversations.map((c) => <option key={c.id} value={c.id}>{c.title} · day {c.day}</option>)}
        </select>
        <button type="button" className="btn btn-compact" onClick={() => void fresh()}>New conversation</button>
      </div>
      <div className="chat-log" role="log" aria-label={`Conversation with ${name}`}>
        {messages.length === 0 && <p className="muted small">Say something to {name}. They answer only from their own record.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-${m.role}`}>
            <b>{m.role === 'user' ? 'You' : name}</b>
            <p>{m.text}</p>
            {m.role === 'npc' && <span className="muted small">{m.provider === 'draft' ? 'draft writer, no model' : m.model}</span>}
            {m.warnings.length > 0 && <span className="status status-strained small"> {m.warnings.join('; ')}</span>}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => void send(e)}>
        <input aria-label={`Say something to ${name}`} value={text} maxLength={600} onChange={(e) => setText(e.target.value)}
          placeholder="Ask about their work, their family, the roads, the news…" disabled={busy} />
        <button type="submit" className="btn" disabled={busy || !text.trim()}>{busy ? 'Waiting…' : 'Say'}</button>
      </form>
      {error && <p className="status status-critical">{error}</p>}
    </div>
  );
}
