import { WalletBalance, AgentThought, Trade } from '../types';
import './Dashboard.css';

interface DashboardProps {
  balance: WalletBalance | null;
  thoughts: AgentThought[];
  trades: Trade[];
}

export function Dashboard({ balance, thoughts, trades }: DashboardProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getThoughtIcon = (type: AgentThought['type']) => {
    switch (type) {
      case 'analysis':
        return '🔍';
      case 'decision':
        return '🤔';
      case 'execution':
        return '⚡';
      case 'error':
        return '❌';
      default:
        return '💭';
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-section wallet-section">
        <div className="section-header">
          <span className="section-title">💰 WALLET</span>
        </div>
        <div className="section-content">
          {balance ? (
            <>
              <div className="balance-item main">
                <span className="label">SOL Balance:</span>
                <span className="value">{balance.sol.toFixed(4)} SOL</span>
              </div>
              {balance.tokens.length > 0 && (
                <div className="tokens">
                  <div className="label">Token Holdings:</div>
                  {balance.tokens.map((token) => (
                    <div key={token.mint} className="token-item">
                      <span className="token-symbol">{token.symbol}</span>
                      <span className="token-amount">{token.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="loading">Loading balance...</div>
          )}
        </div>
      </div>

      <div className="dashboard-section trades-section">
        <div className="section-header">
          <span className="section-title">📊 RECENT TRADES</span>
        </div>
        <div className="section-content">
          {trades.length > 0 ? (
            <div className="trades-list">
              {trades.map((trade) => (
                <div key={trade.id} className={`trade-item ${trade.type}`}>
                  <div className="trade-header">
                    <span className="trade-type">{trade.type.toUpperCase()}</span>
                    <span className="trade-token">{trade.token}</span>
                    <span className="trade-amount">{trade.amount.toFixed(4)} SOL</span>
                  </div>
                  <div className="trade-time">{formatTime(trade.timestamp)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No trades yet</div>
          )}
        </div>
      </div>

      <div className="dashboard-section thoughts-section">
        <div className="section-header">
          <span className="section-title">🧠 AGENT REASONING</span>
        </div>
        <div className="section-content thoughts-content">
          {thoughts.length > 0 ? (
            <div className="thoughts-list">
              {thoughts.map((thought) => (
                <div key={thought.id} className={`thought-item ${thought.type}`}>
                  <div className="thought-header">
                    <span className="thought-icon">{getThoughtIcon(thought.type)}</span>
                    <span className="thought-time">{formatTime(thought.timestamp)}</span>
                  </div>
                  <div className="thought-content">{thought.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Waiting for agent activity...</div>
          )}
        </div>
      </div>
    </div>
  );
}
