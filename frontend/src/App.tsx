import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './components/Dashboard';
import { useWebSocket } from './hooks/useWebSocket';
import './App.css';

function App() {
  const { messages, thoughts, balance, trades, connected, sendMessage } = useWebSocket();

  return (
    <div className="app">
      <div className="container">
        <div className="left-panel">
          <ChatPanel
            messages={messages}
            onSendMessage={sendMessage}
            connected={connected}
          />
        </div>
        <div className="right-panel">
          <Dashboard balance={balance} thoughts={thoughts} trades={trades} />
        </div>
      </div>
    </div>
  );
}

export default App;
