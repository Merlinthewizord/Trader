import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../types';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  connected: boolean;
}

export function ChatPanel({ messages, onSendMessage, connected }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && connected) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="terminal-prompt">agent@solana:~$</span>
        <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● ONLINE' : '○ OFFLINE'}
        </span>
      </div>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <span className="timestamp">[{formatTime(msg.timestamp)}]</span>
            <span className="role">{msg.role === 'user' ? 'YOU' : 'AGENT'}:</span>
            <span className="content">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-area" onSubmit={handleSubmit}>
        <span className="prompt">{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Type a message... (try 'analyze')" : 'Connecting...'}
          disabled={!connected}
          autoFocus
        />
      </form>
    </div>
  );
}
